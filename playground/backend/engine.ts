import { execFile } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

import * as AST from "../../compiler/common/AST";
import { CompilerError } from "../../compiler/common/CompilerError";
import { DiagnosticFormatter } from "../../compiler/common/DiagnosticFormatter";
import { getBplHome } from "../../compiler/common/PathResolver";
import { Formatter } from "../../compiler/formatter/Formatter";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";
import { Compiler } from "../../compiler/index";
import { getHostDefaults } from "../../cli/utils";
import {
  createPlaygroundWasmBuildEnv,
  resolvePlaygroundWasmLinker,
} from "./wasmToolchain";
import { stringifyPlaygroundAstArtifact } from "./artifactStringify";
import { runPlaygroundNativeBinary } from "./nativeExecution";
import { formatProcessCommand } from "./processRunner";
import { resolvePlaygroundNativeRuntimeFiles } from "./runtimeFiles";
import {
  CompileOnlyResponseCache,
  getCompileOnlyResponseCacheKey,
} from "./compileResponseCache";
import {
  getHostedWasmCacheKey,
  HostedWasmResponseCache,
  type HostedWasmCompileResponse,
} from "./wasmResponseCache";

import { logger, updateStats } from "./telemetry";
import type { CompileRequest, CompileResponse } from "./protocol";
const execFileAsync = promisify(execFile);
// Create formatter with specific settings for playground
const diagnosticFormatter = new DiagnosticFormatter({
  colorize: false, // JSON API, don't use ANSI colors
  contextLines: 3,
  showCodeSnippets: true,
});

interface NativeBinaryCacheEntry {
  tempDir: string;
  binFile: string;
  createdAt: number;
  lastUsedAt: number;
}

type WasmCompileResponse = HostedWasmCompileResponse;

const NATIVE_BINARY_CACHE_MAX_ENTRIES = 16;
const NATIVE_BINARY_CACHE_TTL_MS = 10 * 60 * 1000;
const COMPILE_ONLY_RESPONSE_CACHE_MAX_ENTRIES = 16;
const COMPILE_ONLY_RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000;
const HOSTED_WASM_CACHE_MAX_ENTRIES = 16;
const HOSTED_WASM_CACHE_TTL_MS = 10 * 60 * 1000;
const nativeBinaryCache = new Map<string, NativeBinaryCacheEntry>();
const compileOnlyResponseCache = new CompileOnlyResponseCache({
  maxEntries: COMPILE_ONLY_RESPONSE_CACHE_MAX_ENTRIES,
  ttlMs: COMPILE_ONLY_RESPONSE_CACHE_TTL_MS,
});
const hostedWasmResponseCache = new HostedWasmResponseCache({
  maxEntries: HOSTED_WASM_CACHE_MAX_ENTRIES,
  ttlMs: HOSTED_WASM_CACHE_TTL_MS,
});

function maybeCompileArtifacts(
  includeArtifacts: boolean,
  ir: string,
  ast: AST.Program | undefined,
  tokens: any[],
  sourceFile?: string,
): Pick<CompileResponse, "ir" | "ast" | "tokens"> {
  if (!includeArtifacts) {
    return {};
  }

  return {
    ir,
    ast: stringifyPlaygroundAstArtifact(ast, { sourceFile }),
    tokens: JSON.stringify(tokens, null, 2),
  };
}

function getNativeBinaryCacheKey(code: string): string {
  return createHash("sha256")
    .update("bpl-playground-native-v1")
    .update("\0")
    .update(getBplHome())
    .update("\0")
    .update(code)
    .digest("hex");
}

function sourceMayUseBplImport(source: string): boolean {
  return /\bimport\b/.test(source);
}

function getCachedNativeBinary(
  key: string,
): NativeBinaryCacheEntry | undefined {
  const entry = nativeBinaryCache.get(key);
  if (entry === undefined) return undefined;

  const expired = Date.now() - entry.createdAt > NATIVE_BINARY_CACHE_TTL_MS;
  if (expired || !fs.existsSync(entry.binFile)) {
    nativeBinaryCache.delete(key);
    cleanupNativeBinaryCacheEntry(entry);
    return undefined;
  }

  entry.lastUsedAt = Date.now();
  return entry;
}

function rememberNativeBinary(
  key: string,
  tempDir: string,
  binFile: string,
): boolean {
  if (NATIVE_BINARY_CACHE_MAX_ENTRIES <= 0) return false;

  const existing = nativeBinaryCache.get(key);
  if (existing !== undefined) {
    cleanupNativeBinaryCacheEntry(existing);
  }

  const now = Date.now();
  nativeBinaryCache.set(key, {
    tempDir,
    binFile,
    createdAt: now,
    lastUsedAt: now,
  });
  evictNativeBinaryCacheEntries();
  return nativeBinaryCache.get(key)?.tempDir === tempDir;
}

function evictNativeBinaryCacheEntries(): void {
  while (nativeBinaryCache.size > NATIVE_BINARY_CACHE_MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestUsedAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of nativeBinaryCache) {
      if (entry.lastUsedAt < oldestUsedAt) {
        oldestKey = key;
        oldestUsedAt = entry.lastUsedAt;
      }
    }

    if (oldestKey === undefined) return;
    const oldest = nativeBinaryCache.get(oldestKey);
    nativeBinaryCache.delete(oldestKey);
    if (oldest !== undefined) {
      cleanupNativeBinaryCacheEntry(oldest);
    }
  }
}

function cleanupNativeBinaryCacheEntry(entry: NativeBinaryCacheEntry): void {
  try {
    fs.rmSync(entry.tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup. The cache entry has already been dropped.
  }
}

async function runCompiledNativeBinary(options: {
  requestId: string;
  startTime: number;
  binFile: string;
  req: CompileRequest;
  warnings: string[];
  includeArtifacts: boolean;
  ir: string;
  ast: AST.Program | undefined;
  tokens: any[];
  sourceFile?: string;
  cacheHit: boolean;
}): Promise<CompileResponse> {
  const execStart = Date.now();
  const args = options.req.args || [];

  logger.debug(
    `[${options.requestId}] Executing binary: ${formatProcessCommand(
      options.binFile,
      args,
    )}`,
    { cacheHit: options.cacheHit },
  );

  const execution = await runPlaygroundNativeBinary(options.binFile, {
    args,
    input: options.req.input,
    timeoutMs: 5000,
    maxBuffer: 1024 * 1024,
  });

  const execDuration = Date.now() - execStart;
  const totalDuration = Date.now() - options.startTime;

  if (!execution.success) {
    if (execution.error.startsWith("Execution timeout")) {
      logger.warn(
        `[${options.requestId}] Execution timeout after ${totalDuration}ms`,
      );
    } else {
      logger.error(
        `[${options.requestId}] Runtime error after ${totalDuration}ms`,
        {
          error: execution.error,
          output: execution.output,
          cacheHit: options.cacheHit,
        },
      );
    }
    updateStats(false, totalDuration);

    return {
      success: false,
      error: execution.error,
      output: execution.output,
      ...maybeCompileArtifacts(
        options.includeArtifacts,
        options.ir,
        options.ast,
        options.tokens,
        options.sourceFile,
      ),
    };
  }

  logger.info(
    `[${options.requestId}] Execution succeeded in ${execDuration}ms (total: ${totalDuration}ms)`,
    {
      outputLength: execution.output.length,
      hasStderr: execution.output.includes("\nSTDERR:\n"),
      cacheHit: options.cacheHit,
    },
  );

  updateStats(true, totalDuration);

  return {
    success: true,
    output: execution.output,
    warnings: options.warnings,
    ...maybeCompileArtifacts(
      options.includeArtifacts,
      options.ir,
      options.ast,
      options.tokens,
      options.sourceFile,
    ),
  };
}

// Compile and run BPL code
export async function compileAndRun(
  req: CompileRequest,
): Promise<CompileResponse> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const includeArtifacts = req.includeArtifacts === true;
  const execute = req.execute !== false;
  const treeShakeTopLevelFunctions = execute && !includeArtifacts;
  const resolveImports = includeArtifacts || sourceMayUseBplImport(req.code);
  const hostTarget = getHostDefaults().target;
  let bplHome: string | undefined;
  const getRequestBplHome = () => {
    bplHome ??= getBplHome();
    return bplHome;
  };

  logger.info(`[${requestId}] Starting compilation`, {
    codeLength: req.code.length,
    hasInput: !!req.input,
    argsCount: req.args?.length || 0,
    includeArtifacts,
    execute,
    resolveImports,
  });

  const compileOnlyResponseCacheKey = !execute
    ? getCompileOnlyResponseCacheKey({
        code: req.code,
        bplHome: getRequestBplHome(),
        includeArtifacts,
      })
    : undefined;
  const cachedCompileOnlyResponse =
    compileOnlyResponseCacheKey !== undefined
      ? compileOnlyResponseCache.get(compileOnlyResponseCacheKey)
      : undefined;
  if (cachedCompileOnlyResponse) {
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] Reusing cached compile-only response`, {
      includeArtifacts,
      duration,
    });
    updateStats(true, duration);
    return cachedCompileOnlyResponse;
  }

  const nativeBinaryCacheKey =
    execute && !includeArtifacts
      ? getNativeBinaryCacheKey(req.code)
      : undefined;
  const cachedNativeBinary =
    nativeBinaryCacheKey !== undefined
      ? getCachedNativeBinary(nativeBinaryCacheKey)
      : undefined;
  if (cachedNativeBinary) {
    logger.info(`[${requestId}] Reusing cached native binary`, {
      binFile: cachedNativeBinary.binFile,
    });
    return await runCompiledNativeBinary({
      requestId,
      startTime,
      binFile: cachedNativeBinary.binFile,
      req,
      warnings: [],
      includeArtifacts,
      ir: "",
      ast: undefined,
      tokens: [],
      cacheHit: true,
    });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-playground-"));
  let preserveTempDir = false;

  const sourceFile = path.join(tempDir, "main.bpl");
  const irFile = path.join(tempDir, "main.ll");
  const binFile = path.join(tempDir, "main");

  try {
    // Write source file
    fs.writeFileSync(sourceFile, req.code, "utf-8");
    logger.debug(`[${requestId}] Source file written: ${sourceFile}`);

    const warnings: string[] = [];
    let ast: AST.Program | undefined;
    let tokens: any[] = [];
    let ir = "";

    if (includeArtifacts) {
      try {
        const tokenStart = Date.now();
        tokens = lexWithGrammar(req.code, sourceFile);
        logger.debug(
          `[${requestId}] Artifact lexical analysis completed in ${Date.now() - tokenStart}ms`,
          {
            tokenCount: tokens.length,
          },
        );
      } catch (e) {
        logger.warn(`[${requestId}] Lexical analysis failed, continuing...`, {
          error: String(e),
        });
      }
    }

    // Compile using Compiler class
    try {
      const compileStart = Date.now();
      const compiler = new Compiler({
        filePath: sourceFile,
        outputPath: irFile,
        emitType: "llvm",
        resolveImports,
        verbose: false,
        treeShakeTopLevelFunctions,
        target: hostTarget,
      });

      const result = compiler.compile(req.code);
      const compileDuration = Date.now() - compileStart;

      if (!result.success) {
        const errorMsg = result.errors
          ? diagnosticFormatter.formatErrors(result.errors)
          : "Unknown compilation error";

        logger.error(
          `[${requestId}] Compilation failed in ${compileDuration}ms`,
          {
            errorCount: result.errors?.length || 0,
          },
        );

        updateStats(false, Date.now() - startTime);

        return {
          success: false,
          error: errorMsg,
          ...maybeCompileArtifacts(
            includeArtifacts,
            ir,
            ast,
            tokens,
            sourceFile,
          ),
        };
      }

      logger.info(
        `[${requestId}] Compilation succeeded in ${compileDuration}ms`,
      );
      ir = result.output || "";
      ast = result.ast;

      fs.writeFileSync(irFile, ir, "utf-8");
    } catch (e: any) {
      logger.error(`[${requestId}] Compilation exception`, {
        error: String(e),
      });
      updateStats(false, Date.now() - startTime);

      return {
        success: false,
        error: e instanceof CompilerError ? e.message : String(e),
        ...maybeCompileArtifacts(includeArtifacts, ir, ast, tokens, sourceFile),
      };
    }

    if (!execute) {
      const totalDuration = Date.now() - startTime;
      logger.info(
        `[${requestId}] Compilation artifacts produced in ${totalDuration}ms`,
        {
          irLength: ir.length,
          hasAst: Boolean(ast),
          tokenCount: tokens.length,
        },
      );
      updateStats(true, totalDuration);

      const response: CompileResponse = {
        success: true,
        warnings,
        ...maybeCompileArtifacts(includeArtifacts, ir, ast, tokens, sourceFile),
      };
      if (compileOnlyResponseCacheKey !== undefined) {
        compileOnlyResponseCache.remember(
          compileOnlyResponseCacheKey,
          response,
        );
      }
      return response;
    }

    // Compile IR to binary using clang with runtime library
    try {
      const clangStart = Date.now();
      const runtimeFiles = await resolvePlaygroundNativeRuntimeFiles({
        bplHome: getRequestBplHome(),
        target: hostTarget,
        warn: (message) => logger.warn(`[${requestId}] ${message}`),
      });

      const clangArgs = [
        "-target",
        hostTarget,
        "-o",
        binFile,
        irFile,
        ...runtimeFiles,
        "-Wno-override-module",
        "-lm",
      ];
      logger.debug(
        `[${requestId}] Running clang: ${formatProcessCommand("clang", clangArgs)}`,
      );

      await execFileAsync("clang", clangArgs);
      logger.debug(
        `[${requestId}] LLVM compilation completed in ${Date.now() - clangStart}ms`,
      );
      if (nativeBinaryCacheKey !== undefined) {
        preserveTempDir = rememberNativeBinary(
          nativeBinaryCacheKey,
          tempDir,
          binFile,
        );
        if (preserveTempDir) {
          logger.debug(`[${requestId}] Cached native binary`, { binFile });
        }
      }
    } catch (e: any) {
      logger.error(`[${requestId}] LLVM compilation failed`, {
        stderr: e.stderr,
      });
      updateStats(false, Date.now() - startTime);

      return {
        success: false,
        error: `LLVM compilation failed: ${e.stderr || e.message}`,
        ...maybeCompileArtifacts(includeArtifacts, ir, ast, tokens, sourceFile),
      };
    }

    return await runCompiledNativeBinary({
      requestId,
      startTime,
      binFile,
      req,
      warnings,
      includeArtifacts,
      ir,
      ast,
      tokens,
      sourceFile,
      cacheHit: false,
    });
  } finally {
    if (!preserveTempDir) {
      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        logger.debug(`[${requestId}] Cleanup completed`);
      } catch (e) {
        logger.error(`[${requestId}] Cleanup failed`, { error: String(e) });
      }
    }
  }
}

export async function compileToWasm(
  req: CompileRequest,
): Promise<WasmCompileResponse> {
  const requestId = `wasm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const linkerResult = resolvePlaygroundWasmLinker({
    warn: (message) => logger.warn(`[${requestId}] ${message}`),
  });
  if (!linkerResult.ok) {
    return {
      success: false,
      error: linkerResult.error,
    };
  }
  const linker = linkerResult.linker;
  const wasmCacheKey = getHostedWasmCacheKey({
    code: req.code,
    bplHome: getBplHome(),
    linker,
  });
  const cachedWasmResponse = hostedWasmResponseCache.get(wasmCacheKey);
  if (cachedWasmResponse !== undefined) {
    const duration = Date.now() - startTime;
    logger.info(`[${requestId}] Reusing cached hosted wasm response`, {
      wasmBytes: cachedWasmResponse.wasmBytes,
      importCount: cachedWasmResponse.imports?.length ?? 0,
      duration,
    });
    updateStats(true, duration);
    return cachedWasmResponse;
  }

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "bpl-playground-wasm-"),
  );

  const repoRoot = path.resolve(__dirname, "../..");
  const sourceFile = path.join(tempDir, "main.bpl");
  const wasmFile = path.join(tempDir, "main.wasm");
  const irFile = `${wasmFile}.ll`;

  try {
    fs.writeFileSync(sourceFile, req.code, "utf-8");
    logger.info(`[${requestId}] Compiling hosted wasm`, {
      codeLength: req.code.length,
      linker,
    });

    const { stdout, stderr } = await execFileAsync(
      "bun",
      [
        path.join(repoRoot, "index.ts"),
        "build",
        sourceFile,
        "--target",
        "wasm32-unknown-unknown",
        "--wasm-runtime",
        "host",
        "-o",
        wasmFile,
      ],
      {
        cwd: repoRoot,
        env: createPlaygroundWasmBuildEnv(process.env, linker, repoRoot),
        timeout: 10_000,
        maxBuffer: 1024 * 1024 * 16,
      },
    );

    if (!fs.existsSync(wasmFile)) {
      throw new Error("BPL build completed without producing a wasm artifact.");
    }

    const wasm = fs.readFileSync(wasmFile);
    const ir = fs.existsSync(irFile) ? fs.readFileSync(irFile, "utf-8") : "";
    const module = new WebAssembly.Module(wasm);
    const imports = WebAssembly.Module.imports(module).map((entry) => ({
      module: entry.module,
      name: entry.name,
      kind: entry.kind,
    }));

    const response: WasmCompileResponse = {
      success: true,
      wasmBase64: wasm.toString("base64"),
      wasmBytes: wasm.byteLength,
      ir,
      imports,
      warnings: [stdout, stderr].filter(Boolean),
    };
    hostedWasmResponseCache.remember(wasmCacheKey, response);
    updateStats(true, Date.now() - startTime);
    return response;
  } catch (e: any) {
    logger.error(`[${requestId}] Wasm compilation failed`, {
      stderr: e.stderr,
      stdout: e.stdout,
      message: e.message,
    });
    updateStats(false, Date.now() - startTime);

    return {
      success: false,
      error: [
        e.stderr || e.message || String(e),
        e.stdout ? `stdout:\n${e.stdout}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function formatCode(req: CompileRequest): {
  success: boolean;
  code?: string;
  error?: string;
} {
  try {
    const ast = new Parser(req.code, "temp.bpl").parse();
    return { success: true, code: new Formatter().format(ast) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
