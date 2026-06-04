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
import {
  createPlaygroundWasmBuildEnv,
  resolvePlaygroundWasmLinker,
} from "./wasmToolchain";
import { stringifyPlaygroundAstArtifact } from "./artifactStringify";
import { runPlaygroundNativeBinary } from "./nativeExecution";
import { formatProcessCommand } from "./processRunner";
import { resolvePlaygroundNativeRuntimeFiles } from "./runtimeFiles";
import { StaticTextFileCache } from "./staticTextFileCache";
import {
  CompileOnlyResponseCache,
  getCompileOnlyResponseCacheKey,
} from "./compileResponseCache";
import {
  getHostedWasmCacheKey,
  HostedWasmResponseCache,
  type HostedWasmCompileResponse,
} from "./wasmResponseCache";

const execFileAsync = promisify(execFile);

// ============================================================================
// Logging Utilities
// ============================================================================

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  data?: any;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  log(level: LogEntry["level"], message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: this.formatTimestamp(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Trim logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output with colors
    const colors = {
      info: "\x1b[36m", // Cyan
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
      debug: "\x1b[90m", // Gray
    };
    const reset = "\x1b[0m";
    const prefix = `${colors[level]}[${level.toUpperCase()}]${reset}`;

    console.log(
      `${prefix} ${entry.timestamp} - ${message}`,
      data ? JSON.stringify(data, null, 2) : "",
    );
  }

  info(message: string, data?: any) {
    this.log("info", message, data);
  }

  warn(message: string, data?: any) {
    this.log("warn", message, data);
  }

  error(message: string, data?: any) {
    this.log("error", message, data);
  }

  debug(message: string, data?: any) {
    this.log("debug", message, data);
  }

  getLogs(limit = 100): LogEntry[] {
    return this.logs.slice(-limit);
  }

  clearLogs() {
    this.logs = [];
  }
}

const logger = new Logger();

// ============================================================================
// Statistics & Metrics
// ============================================================================

interface Statistics {
  totalRequests: number;
  successfulCompilations: number;
  failedCompilations: number;
  averageCompileTime: number;
  totalExamplesLoaded: number;
  uptime: number;
  startTime: number;
}

const stats: Statistics = {
  totalRequests: 0,
  successfulCompilations: 0,
  failedCompilations: 0,
  averageCompileTime: 0,
  totalExamplesLoaded: 0,
  uptime: 0,
  startTime: Date.now(),
};

function updateStats(success: boolean, duration: number) {
  stats.totalRequests++;
  if (success) {
    stats.successfulCompilations++;
  } else {
    stats.failedCompilations++;
  }

  // Update average compile time
  const totalCompilations =
    stats.successfulCompilations + stats.failedCompilations;
  stats.averageCompileTime =
    (stats.averageCompileTime * (totalCompilations - 1) + duration) /
    totalCompilations;
}

function getUptime(): number {
  return Math.floor((Date.now() - stats.startTime) / 1000);
}

// ============================================================================
// Helper Functions
// ============================================================================

// Create formatter with specific settings for playground
const diagnosticFormatter = new DiagnosticFormatter({
  colorize: false, // JSON API, don't use ANSI colors
  contextLines: 3,
  showCodeSnippets: true,
});

interface CompileRequest {
  code: string;
  input?: string;
  args?: string[];
  includeArtifacts?: boolean;
  execute?: boolean;
}

interface CompileResponse {
  success: boolean;
  output?: string;
  error?: string;
  warnings?: string[];
  ir?: string;
  ast?: string;
  tokens?: string;
}

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
const staticTextFileCache = new StaticTextFileCache();
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

function readStaticTextFile(filePath: string): string {
  return staticTextFileCache.read(filePath);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCompileRequestPayload(
  payload: unknown,
): { success: true; request: CompileRequest } | { success: false; error: string } {
  if (!isRecord(payload)) {
    return {
      success: false,
      error: "Invalid request: body must be a JSON object.",
    };
  }

  if (typeof payload.code !== "string") {
    return {
      success: false,
      error: "Invalid request: code must be a string.",
    };
  }

  if (payload.input !== undefined && typeof payload.input !== "string") {
    return {
      success: false,
      error: "Invalid request: input must be a string.",
    };
  }

  if (
    payload.args !== undefined &&
    (!Array.isArray(payload.args) ||
      payload.args.some((arg) => typeof arg !== "string"))
  ) {
    return {
      success: false,
      error: "Invalid request: args must be an array of strings.",
    };
  }

  if (
    payload.includeArtifacts !== undefined &&
    typeof payload.includeArtifacts !== "boolean"
  ) {
    return {
      success: false,
      error: "Invalid request: includeArtifacts must be a boolean.",
    };
  }

  if (payload.execute !== undefined && typeof payload.execute !== "boolean") {
    return {
      success: false,
      error: "Invalid request: execute must be a boolean.",
    };
  }

  return {
    success: true,
    request: {
      code: payload.code,
      input: payload.input,
      args: payload.args,
      includeArtifacts: payload.includeArtifacts,
      execute: payload.execute,
    },
  };
}

function invalidRequestResponse(
  error: string,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status: 400,
    headers,
  });
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

// Get examples
function getExamples() {
  const examplesDir = path.join(__dirname, "../examples");
  const examples: any[] = [];

  if (fs.existsSync(examplesDir)) {
    const files = fs
      .readdirSync(examplesDir)
      .filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(examplesDir, file), "utf-8");
        examples.push(JSON.parse(content));
      } catch (e) {
        console.error(`Failed to load example ${file}:`, e);
      }
    }
  }

  // Sort by order
  examples.sort((a, b) => (a.order || 0) - (b.order || 0));
  return examples;
}

// Get tutorials
function getTutorials() {
  const tutorialsDir = path.join(__dirname, "../tutorials");
  const tutorials: any[] = [];

  if (fs.existsSync(tutorialsDir)) {
    const files = fs
      .readdirSync(tutorialsDir)
      .filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tutorialsDir, file), "utf-8");
        tutorials.push(JSON.parse(content));
      } catch (e) {
        console.error(`Failed to load tutorial ${file}:`, e);
      }
    }
  }

  // Sort by order
  tutorials.sort((a, b) => (a.order || 0) - (b.order || 0));
  return tutorials;
}

// Compile and run BPL code
async function compileAndRun(req: CompileRequest): Promise<CompileResponse> {
  const startTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const includeArtifacts = req.includeArtifacts === true;
  const execute = req.execute !== false;
  const treeShakeTopLevelFunctions = execute && !includeArtifacts;
  const resolveImports = includeArtifacts || sourceMayUseBplImport(req.code);
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
    execute && !includeArtifacts ? getNativeBinaryCacheKey(req.code) : undefined;
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
          ...maybeCompileArtifacts(includeArtifacts, ir, ast, tokens, sourceFile),
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
        compileOnlyResponseCache.remember(compileOnlyResponseCacheKey, response);
      }
      return response;
    }

    // Compile IR to binary using clang with runtime library
    try {
      const clangStart = Date.now();
      const runtimeFiles = await resolvePlaygroundNativeRuntimeFiles({
        bplHome: getRequestBplHome(),
        warn: (message) => logger.warn(`[${requestId}] ${message}`),
      });

      const clangArgs = [
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

async function compileToWasm(req: CompileRequest): Promise<WasmCompileResponse> {
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

// Server
const port = Number.parseInt(process.env.PORT || "3001", 10);
const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const startTime = Date.now();

    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // Log all requests
    logger.debug(`${req.method} ${url.pathname}`, {
      ip: req.headers.get("x-forwarded-for") || "unknown",
    });

    // GET /health - Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      const uptime = getUptime();
      const healthData = {
        status: "ok",
        uptime,
        timestamp: new Date().toISOString(),
      };
      logger.debug("Health check", healthData);
      return new Response(JSON.stringify(healthData), { headers });
    }

    // GET /stats - Statistics endpoint
    if (url.pathname === "/stats" && req.method === "GET") {
      const statsData = {
        ...stats,
        uptime: getUptime(),
        successRate:
          stats.totalRequests > 0
            ? (
                (stats.successfulCompilations / stats.totalRequests) *
                100
              ).toFixed(2) + "%"
            : "N/A",
      };
      logger.debug("Stats requested", statsData);
      return new Response(JSON.stringify(statsData), { headers });
    }

    // GET /logs - Get recent logs
    if (url.pathname === "/logs" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const logs = logger.getLogs(limit);
      return new Response(JSON.stringify({ logs }), { headers });
    }

    // POST /logs/clear - Clear logs
    if (url.pathname === "/logs/clear" && req.method === "POST") {
      logger.clearLogs();
      logger.info("Logs cleared");
      return new Response(
        JSON.stringify({ success: true, message: "Logs cleared" }),
        { headers },
      );
    }

    // POST /format
    if (url.pathname === "/format" && req.method === "POST") {
      try {
        const body = (await req.json()) as { code: string };
        logger.info("Format request received", {
          codeLength: body.code.length,
        });

        // Parse code first
        const parser = new Parser(body.code, "temp.bpl");
        const ast = parser.parse();

        // Format the AST
        const formatter = new Formatter();
        const formatted = formatter.format(ast);

        const duration = Date.now() - startTime;
        logger.info(`Format completed in ${duration}ms`);

        return new Response(
          JSON.stringify({ success: true, code: formatted }),
          { headers },
        );
      } catch (e: any) {
        const duration = Date.now() - startTime;
        logger.error(`Format failed after ${duration}ms`, { error: e.message });
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          {
            status: 500,
            headers,
          },
        );
      }
    }

    // GET /examples
    if (url.pathname === "/examples" && req.method === "GET") {
      const examples = getExamples();
      stats.totalExamplesLoaded = examples.length;
      logger.info(`Examples loaded: ${examples.length}`);
      return new Response(JSON.stringify(examples), { headers });
    }

    // GET /tutorials
    if (url.pathname === "/tutorials" && req.method === "GET") {
      const tutorials = getTutorials();
      logger.info(`Tutorials loaded: ${tutorials.length}`);
      return new Response(JSON.stringify(tutorials), { headers });
    }

    // POST /compile
    if (url.pathname === "/compile" && req.method === "POST") {
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return invalidRequestResponse(
            "Invalid request: body must be valid JSON.",
            headers,
          );
        }

        const validation = validateCompileRequestPayload(body);
        if (!validation.success) {
          return invalidRequestResponse(validation.error, headers);
        }

        const result = await compileAndRun(validation.request);
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        logger.error("Compile endpoint error", { error: e.message });
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          {
            status: 500,
            headers,
          },
        );
      }
    }

    // POST /wasm
    if (url.pathname === "/wasm" && req.method === "POST") {
      try {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return invalidRequestResponse(
            "Invalid request: body must be valid JSON.",
            headers,
          );
        }

        const validation = validateCompileRequestPayload(body);
        if (!validation.success) {
          return invalidRequestResponse(validation.error, headers);
        }

        const result = await compileToWasm(validation.request);
        return new Response(JSON.stringify(result), { headers });
      } catch (e: any) {
        logger.error("Wasm endpoint error", { error: e.message });
        return new Response(
          JSON.stringify({ success: false, error: e.message }),
          {
            status: 500,
            headers,
          },
        );
      }
    }

    // Static files
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = readStaticTextFile(
        path.join(__dirname, "../frontend/index.html"),
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/tutorial.html") {
      const html = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.html"),
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/style.css") {
      const css = readStaticTextFile(
        path.join(__dirname, "../frontend/style.css"),
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/tutorial.css") {
      const css = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.css"),
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/app.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/app.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/wasmHostAdapter.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/wasmHostAdapter.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/browserWasmRuntime.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/browserWasmRuntime.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/tutorial.js") {
      const js = readStaticTextFile(
        path.join(__dirname, "../frontend/tutorial.js"),
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    return new Response("Not Found", { status: 404, headers });
  },
});

logger.info("=".repeat(60));
logger.info("🚀 BPL Playground Server Started");
logger.info("=".repeat(60));
logger.info(`Server running at http://localhost:${server.port}`);
logger.info(`Examples available at http://localhost:${server.port}/examples`);
logger.info(`Health check: http://localhost:${server.port}/health`);
logger.info(`Statistics: http://localhost:${server.port}/stats`);
logger.info(`Logs: http://localhost:${server.port}/logs`);
logger.info("=".repeat(60));

// Periodic stats logging
setInterval(() => {
  const uptime = getUptime();
  logger.info("Periodic stats update", {
    uptime: `${uptime}s`,
    totalRequests: stats.totalRequests,
    successRate:
      stats.totalRequests > 0
        ? `${((stats.successfulCompilations / stats.totalRequests) * 100).toFixed(2)}%`
        : "N/A",
    avgCompileTime: `${stats.averageCompileTime.toFixed(2)}ms`,
  });
}, 300000); // Every 5 minutes
