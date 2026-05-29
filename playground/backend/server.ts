import { exec, execFile, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { CodeGenerator } from "../../compiler/backend/CodeGenerator";
import * as AST from "../../compiler/common/AST";
import { CompilerError } from "../../compiler/common/CompilerError";
import { DiagnosticFormatter } from "../../compiler/common/DiagnosticFormatter";
import { getBplHome } from "../../compiler/common/PathResolver";
import { Formatter } from "../../compiler/formatter/Formatter";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";
import { Compiler } from "../../compiler/index";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

const execAsync = promisify(exec);
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

// Helper to stringify AST avoiding circular references
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }
        seen.add(value);
      }
      return value;
    },
    2,
  );
}

interface CompileRequest {
  code: string;
  input?: string;
  args?: string[];
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

interface WasmCompileResponse {
  success: boolean;
  error?: string;
  wasmBase64?: string;
  wasmBytes?: number;
  ir?: string;
  imports?: Array<{ module: string; name: string; kind: string }>;
  warnings?: string[];
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

  logger.info(`[${requestId}] Starting compilation`, {
    codeLength: req.code.length,
    hasInput: !!req.input,
    argsCount: req.args?.length || 0,
  });

  const tempDir = path.join("/tmp", `bpl-playground-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const sourceFile = path.join(tempDir, "main.bpl");
  const irFile = path.join(tempDir, "main.ll");
  const binFile = path.join(tempDir, "main");
  const inputFile = path.join(tempDir, "input.txt");

  try {
    // Write source file
    fs.writeFileSync(sourceFile, req.code, "utf-8");
    logger.debug(`[${requestId}] Source file written: ${sourceFile}`);

    // Write input file if provided
    if (req.input) {
      fs.writeFileSync(inputFile, req.input, "utf-8");
      logger.debug(`[${requestId}] Input file written: ${inputFile}`);
    }

    const warnings: string[] = [];
    let ast: AST.Program | undefined;
    let tokens: any[] = [];
    let ir = "";

    // Get tokens (always do this for visualization)
    try {
      const tokenStart = Date.now();
      tokens = lexWithGrammar(req.code, sourceFile);
      logger.debug(
        `[${requestId}] Lexical analysis completed in ${Date.now() - tokenStart}ms`,
        {
          tokenCount: tokens.length,
        },
      );
    } catch (e) {
      logger.warn(`[${requestId}] Lexical analysis failed, continuing...`, {
        error: String(e),
      });
    }

    // Compile using Compiler class
    try {
      const compileStart = Date.now();
      const compiler = new Compiler({
        filePath: sourceFile,
        outputPath: irFile,
        emitType: "llvm",
        resolveImports: true,
        verbose: false,
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
          tokens: JSON.stringify(tokens, null, 2),
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
        tokens: JSON.stringify(tokens, null, 2),
      };
    }

    // Compile IR to binary using clang with runtime library
    try {
      const clangStart = Date.now();
      const bplHome = getBplHome();

      // Build list of runtime files to link
      const runtimeFiles: string[] = [];

      // Add runtime.ll (core runtime functions)
      const runtimeLLPath = path.join(bplHome, "lib", "runtime.ll");
      if (fs.existsSync(runtimeLLPath)) {
        runtimeFiles.push(`"${runtimeLLPath}"`);
      }

      // Add runtime_support.o (C runtime support for stack traces, signals)
      const runtimeSupportPath = path.join(bplHome, "lib", "runtime_support.o");
      if (fs.existsSync(runtimeSupportPath)) {
        runtimeFiles.push(`"${runtimeSupportPath}"`);
      }

      const clangCmd = `clang -o "${binFile}" "${irFile}" ${runtimeFiles.join(" ")} -Wno-override-module -lm`;
      logger.debug(`[${requestId}] Running clang: ${clangCmd}`);

      await execAsync(clangCmd);
      logger.debug(
        `[${requestId}] LLVM compilation completed in ${Date.now() - clangStart}ms`,
      );
    } catch (e: any) {
      logger.error(`[${requestId}] LLVM compilation failed`, {
        stderr: e.stderr,
      });
      updateStats(false, Date.now() - startTime);

      return {
        success: false,
        error: `LLVM compilation failed: ${e.stderr || e.message}`,
        ir,
        ast: safeStringify(ast),
        tokens: JSON.stringify(tokens, null, 2),
      };
    }

    // Run the binary
    try {
      const execStart = Date.now();
      const args = req.args || [];
      const argsStr = args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(" ");
      const inputRedirect = req.input ? ` < "${inputFile}"` : "";
      const cmd = `"${binFile}" ${argsStr}${inputRedirect}`;

      logger.debug(`[${requestId}] Executing binary: ${cmd}`);

      const { stdout, stderr } = await execAsync(cmd, {
        timeout: 5000, // 5 second timeout
        maxBuffer: 1024 * 1024, // 1MB buffer
      });

      const execDuration = Date.now() - execStart;
      const totalDuration = Date.now() - startTime;

      logger.info(
        `[${requestId}] Execution succeeded in ${execDuration}ms (total: ${totalDuration}ms)`,
        {
          outputLength: stdout.length,
          hasStderr: !!stderr,
        },
      );

      updateStats(true, totalDuration);

      return {
        success: true,
        output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
        warnings,
        ir,
        ast: safeStringify(ast),
        tokens: JSON.stringify(tokens, null, 2),
      };
    } catch (e: any) {
      const totalDuration = Date.now() - startTime;

      if (e.killed) {
        logger.warn(
          `[${requestId}] Execution timeout after ${totalDuration}ms`,
        );
        updateStats(false, totalDuration);

        return {
          success: false,
          error: "Execution timeout (5 seconds)",
          ir,
          ast: safeStringify(ast),
          tokens: JSON.stringify(tokens, null, 2),
        };
      }

      logger.error(`[${requestId}] Runtime error after ${totalDuration}ms`, {
        stderr: e.stderr,
        stdout: e.stdout,
      });
      updateStats(false, totalDuration);

      return {
        success: false,
        error: `Runtime error: ${e.stderr || e.message}`,
        output: e.stdout || "",
        ir,
        ast: safeStringify(ast),
        tokens: JSON.stringify(tokens, null, 2),
      };
    }
  } finally {
    // Cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      logger.debug(`[${requestId}] Cleanup completed`);
    } catch (e) {
      logger.error(`[${requestId}] Cleanup failed`, { error: String(e) });
    }
  }
}

function findWasmLinker(): string | null {
  const candidates = [
    process.env.WASM_LD,
    "wasm-ld",
    "wasm-ld-18",
    "wasm-ld-17",
    "wasm-ld-16",
    "ld.lld",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return candidate;
    }
  }

  return null;
}

async function compileToWasm(req: CompileRequest): Promise<WasmCompileResponse> {
  const requestId = `wasm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  const linker = findWasmLinker();
  if (!linker) {
    return {
      success: false,
      error:
        "WebAssembly linker unavailable. Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
    };
  }

  const tempDir = path.join("/tmp", `bpl-playground-wasm-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

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
        env: {
          ...process.env,
          BPL_HOME: repoRoot,
          NO_COLOR: "1",
          WASM_LD: linker,
        },
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

    updateStats(true, Date.now() - startTime);
    return {
      success: true,
      wasmBase64: wasm.toString("base64"),
      wasmBytes: wasm.byteLength,
      ir,
      imports,
      warnings: [stdout, stderr].filter(Boolean),
    };
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
        const body = (await req.json()) as CompileRequest;
        const result = await compileAndRun(body);
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
        const body = (await req.json()) as CompileRequest;
        const result = await compileToWasm(body);
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
      const html = fs.readFileSync(
        path.join(__dirname, "../frontend/index.html"),
        "utf-8",
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/tutorial.html") {
      const html = fs.readFileSync(
        path.join(__dirname, "../frontend/tutorial.html"),
        "utf-8",
      );
      return new Response(html, {
        headers: { ...headers, "Content-Type": "text/html" },
      });
    }

    if (url.pathname === "/style.css") {
      const css = fs.readFileSync(
        path.join(__dirname, "../frontend/style.css"),
        "utf-8",
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/tutorial.css") {
      const css = fs.readFileSync(
        path.join(__dirname, "../frontend/tutorial.css"),
        "utf-8",
      );
      return new Response(css, {
        headers: { ...headers, "Content-Type": "text/css" },
      });
    }

    if (url.pathname === "/app.js") {
      const js = fs.readFileSync(
        path.join(__dirname, "../frontend/app.js"),
        "utf-8",
      );
      return new Response(js, {
        headers: { ...headers, "Content-Type": "application/javascript" },
      });
    }

    if (url.pathname === "/tutorial.js") {
      const js = fs.readFileSync(
        path.join(__dirname, "../frontend/tutorial.js"),
        "utf-8",
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
