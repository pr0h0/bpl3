/**
 * Compilation Runner
 * Orchestrates the compilation pipeline for BPL source code
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import {
  Compiler,
  Parser,
  TypeChecker,
  CodeGenerator,
  Formatter,
  CompilerError,
  lexWithGrammar,
  SourceManager,
  TokenType,
} from "../compiler";
import { getBplHome } from "../compiler/common/PathResolver";
import { diagnosticFormatter } from "./DiagnosticFormatter";
import { compileBinaryAndRun, isWasmTarget } from "./BinaryRunner";
import { getHostDefaults } from "./utils";
import type { CompileOptions } from "./types";
import { Logger, LogLevel, setLogLevel } from "../compiler/common/Logger";
import { updateConfig } from "../compiler/common/Config";

const log = new Logger("CompilationRunner");

type CliOptimizationLevel = "0" | "1" | "2" | "3";
type CliEmitType = NonNullable<CompileOptions["emit"]>;

/**
 * Apply CLI options to global configuration
 */
function applyOptions(options: CompileOptions): void {
  normalizeCompileOptions(options);

  // Handle quiet mode
  if (options.quiet) {
    setLogLevel(LogLevel.SILENT);
  } else if (options.verbose) {
    setLogLevel(LogLevel.DEBUG);
  }

  // Handle color override
  if (options.color !== undefined) {
    updateConfig({
      features: { colorize: options.color },
    });
  }

  // Handle debug flag (alias for dwarf)
  if (options.debug) {
    options.dwarf = true;
  }

  // Handle optimization level
  if (options.O) {
    updateConfig({
      defaults: { optimization: options.O as any },
    });
  }
}

/**
 * Process a source file and compile it
 */
export function processFile(
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  try {
    applyOptions(options);

    if (!fs.existsSync(filePath)) {
      log.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    processCodeInternal(content, filePath, options, programArgs);
  } catch (e) {
    // If in watch mode, don't exit on error - just log it
    if (options.watch) {
      if (e instanceof CompilerError) {
        console.error(diagnosticFormatter.formatError(e));
      } else {
        log.error(`${e}`);
        if (e instanceof Error && e.stack && options.verbose) {
          log.error(e.stack);
        }
      }
      throw e; // Re-throw for watch mode to handle
    }
    handleCompilationError(e, options);
  }
}

/**
 * Process a source file and compile it, using async compiler backends when requested.
 */
export async function processFileAsync(
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): Promise<void> {
  try {
    applyOptions(options);

    if (!fs.existsSync(filePath)) {
      log.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    await processCodeInternalAsync(content, filePath, options, programArgs);
  } catch (e) {
    if (options.watch) {
      if (e instanceof CompilerError) {
        console.error(diagnosticFormatter.formatError(e));
      } else {
        log.error(`${e}`);
        if (e instanceof Error && e.stack && options.verbose) {
          log.error(e.stack);
        }
      }
      throw e;
    }
    handleCompilationError(e, options);
  }
}

/**
 * Process code from a string (stdin or eval)
 */
export function processCode(
  code: string,
  sourceLabel: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  try {
    applyOptions(options);

    // Register source for error reporting
    SourceManager.setSource(sourceLabel, code);
    processCodeInternal(code, sourceLabel, options, programArgs);
  } catch (e) {
    handleCompilationError(e, options);
  }
}

/**
 * Handle compilation errors uniformly
 */
function handleCompilationError(e: unknown, options: CompileOptions): never {
  if (e instanceof CompilerError) {
    console.error(diagnosticFormatter.formatError(e));
  } else {
    log.error(`${e}`);
    if (e instanceof Error && e.stack && options.verbose) {
      log.error(e.stack);
    }
  }
  process.exit(1);
}

function normalizeCompileOptions(options: CompileOptions): void {
  options.O = parseOptimizationLevel(options.O);

  if (options.emit !== undefined) {
    options.emit = parseEmitType(String(options.emit));
  }

  if (options.wasmRuntime !== undefined) {
    options.wasmRuntime = parseWasmRuntime(String(options.wasmRuntime));
  }

  if (options.jobs !== undefined) {
    options.jobs = parseJobs(options.jobs);
  }
}

function parseOptimizationLevel(
  value: string | undefined,
): CliOptimizationLevel {
  const raw = value ?? "0";
  if (/^[0-3]$/.test(raw)) {
    return raw as CliOptimizationLevel;
  }

  throw new Error(
    `Invalid optimization level "${raw}". Use one of: 0, 1, 2, 3.`,
  );
}

function parseEmitType(value: string): CliEmitType {
  switch (value) {
    case "llvm":
    case "ast":
    case "tokens":
    case "formatted":
      return value;
    default:
      throw new Error(
        `Invalid emit type "${value}". Use one of: llvm, ast, tokens, formatted.`,
      );
  }
}

function parseWasmRuntime(
  value: string,
): NonNullable<CompileOptions["wasmRuntime"]> {
  switch (value) {
    case "freestanding":
    case "host":
      return value;
    default:
      throw new Error(
        `Invalid wasm runtime mode "${value}". Use one of: freestanding, host.`,
      );
  }
}

function parseJobs(value: string | number): number {
  const raw = String(value);
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(
      `Invalid jobs count "${raw}". Use a positive integer greater than zero.`,
    );
  }

  const jobs = Number(raw);
  if (!Number.isSafeInteger(jobs)) {
    throw new Error(`Invalid jobs count "${raw}". Use a safe positive integer.`);
  }

  return jobs;
}

/**
 * Internal compilation implementation
 */
function processCodeInternal(
  content: string,
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  injectRuntimeObjects(options);

  // Check if file has imports - if so, use module resolution
  const hasImports = sourceContainsImportDeclaration(content, filePath);

  if (hasImports) {
    compileWithModules(content, filePath, options, programArgs);
  } else {
    compileSingleFile(content, filePath, options, programArgs);
  }
}

/**
 * Internal async compilation implementation.
 */
async function processCodeInternalAsync(
  content: string,
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): Promise<void> {
  injectRuntimeObjects(options);

  const hasImports = sourceContainsImportDeclaration(content, filePath);

  if (hasImports) {
    await compileWithModulesAsync(content, filePath, options, programArgs);
  } else {
    compileSingleFile(content, filePath, options, programArgs);
  }
}

function injectRuntimeObjects(options: CompileOptions): void {
  // Inject runtime library unless skipped
  if (options.skipRuntime || isWasmTarget(options.target)) {
    return;
  }

  const bplHome = getBplHome();
  const objects = options.object
    ? Array.isArray(options.object)
      ? options.object
      : [options.object as string]
    : [];

  const addObject = (objectPath: string) => {
    if (fs.existsSync(objectPath) && !objects.includes(objectPath)) {
      objects.push(objectPath);
    }
  };

  // Add LLVM IR declarations (core exception handling)
  addObject(path.join(bplHome, "lib", "runtime.ll"));

  // Add C runtime support (signal handlers, stack traces)
  addObject(path.join(bplHome, "lib", "runtime_support.o"));

  options.object = objects;
}

function sourceContainsImportDeclaration(
  content: string,
  filePath: string,
): boolean {
  try {
    return lexWithGrammar(content, filePath).some(
      (token) => token.type === TokenType.Import,
    );
  } catch {
    // Preserve the old conservative route for lexically invalid code so parser
    // diagnostics still decide the final error.
    return content.includes("import ");
  }
}

/**
 * Compile with module resolution (for files with imports)
 */
function compileWithModules(
  content: string,
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  const compiler = new Compiler({
    filePath,
    outputPath: options.output,
    emitType: options.emit,
    verbose: options.verbose,
    resolveImports: !options.cache,
    useCache: options.cache,
    objectFiles: options.object ? normalizeArray(options.object) : undefined,
    libraries: options.lib ? normalizeArray(options.lib) : undefined,
    libraryPaths: options.libPath ? normalizeArray(options.libPath) : undefined,
    target: options.target,
    sysroot: options.sysroot,
    clangFlags: options.clangFlag
      ? normalizeArray(options.clangFlag)
      : undefined,
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
    jobs: options.jobs ? parseInt(String(options.jobs)) : undefined,
  });

  const result = compiler.compile(content);

  if (!result.success) {
    if (result.errors) {
      console.error(diagnosticFormatter.formatErrors(result.errors));
    }
    if (options.watch) {
      throw new Error("Compilation failed");
    }
    process.exit(1);
  }

  // Handle different emit types
  if (options.emit === "ast" && result.ast) {
    console.log(JSON.stringify(result.ast, null, 2));
    return;
  }

  if (options.emit === "formatted" && result.output) {
    if (options.write) {
      fs.writeFileSync(filePath, result.output);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(result.output);
    }
    return;
  }

  // For cached compilation, the executable is already created
  if (options.cache) {
    if (result.output) {
      console.log(result.output);
    }
    printCacheStatsIfRequested(result, options);

    if (options.run) {
      const execPathBase = options.output || filePath.replace(/\.[^/.]+$/, "");
      const execPath = path.isAbsolute(execPathBase)
        ? execPathBase
        : path.resolve(execPathBase);

      const runResult = spawnSync(execPath, programArgs || [], {
        stdio: "inherit",
      });

      if (runResult.status !== 0) {
        process.exit(runResult.status ?? 1);
      }
    }
    return;
  }

  // Write LLVM IR and optionally compile/run
  if (result.output) {
    const outputPath = getLlvmOutputPath(filePath, options);
    fs.writeFileSync(outputPath, result.output);

    if (options.verbose || (!options.run && options.emit === "llvm")) {
      log.info(`LLVM IR written to ${outputPath}`);
    }

    if (options.emit === "llvm" || options.run || !options.emit) {
      compileBinaryAndRun(outputPath, options, programArgs);
    }
  }
}

/**
 * Compile imports with module resolution using async backends when available.
 */
async function compileWithModulesAsync(
  content: string,
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): Promise<void> {
  const compiler = new Compiler({
    filePath,
    outputPath: options.output,
    emitType: options.emit,
    verbose: options.verbose,
    resolveImports: !options.cache,
    useCache: options.cache,
    objectFiles: options.object ? normalizeArray(options.object) : undefined,
    libraries: options.lib ? normalizeArray(options.lib) : undefined,
    libraryPaths: options.libPath ? normalizeArray(options.libPath) : undefined,
    target: options.target,
    sysroot: options.sysroot,
    clangFlags: options.clangFlag
      ? normalizeArray(options.clangFlag)
      : undefined,
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
    jobs: options.jobs ? parseInt(String(options.jobs)) : undefined,
  });

  const result = await compiler.compileAsync(content);

  if (!result.success) {
    if (result.errors) {
      console.error(diagnosticFormatter.formatErrors(result.errors));
    }
    if (options.watch) {
      throw new Error("Compilation failed");
    }
    process.exit(1);
  }

  // Handle different emit types
  if (options.emit === "ast" && result.ast) {
    console.log(JSON.stringify(result.ast, null, 2));
    return;
  }

  if (options.emit === "formatted" && result.output) {
    if (options.write) {
      fs.writeFileSync(filePath, result.output);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(result.output);
    }
    return;
  }

  // For cached compilation, the executable is already created
  if (options.cache) {
    if (result.output) {
      console.log(result.output);
    }
    printCacheStatsIfRequested(result, options);

    if (options.run) {
      const execPathBase = options.output || filePath.replace(/\.[^/.]+$/, "");
      const execPath = path.isAbsolute(execPathBase)
        ? execPathBase
        : path.resolve(execPathBase);

      const runResult = spawnSync(execPath, programArgs || [], {
        stdio: "inherit",
      });

      if (runResult.status !== 0) {
        process.exit(runResult.status ?? 1);
      }
    }
    return;
  }

  // Write LLVM IR and optionally compile/run
  if (result.output) {
    const outputPath = getLlvmOutputPath(filePath, options);
    fs.writeFileSync(outputPath, result.output);

    if (options.verbose || (!options.run && options.emit === "llvm")) {
      log.info(`LLVM IR written to ${outputPath}`);
    }

    if (options.emit === "llvm" || options.run || !options.emit) {
      compileBinaryAndRun(outputPath, options, programArgs);
    }
  }
}

/**
 * Single-file compilation (no imports)
 */
function compileSingleFile(
  content: string,
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  // 1. Lexing
  const endLexing = options.verbose ? log.time("Lexing") : () => {};
  let tokens: any[] = [];
  try {
    tokens = lexWithGrammar(content, filePath);
  } catch {
    // Lexer might fail on new syntax not yet in grammar.bpl
  }
  endLexing();

  if (options.emit === "tokens") {
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  // 2. Parsing
  const endParsing = options.verbose ? log.time("Parsing") : () => {};
  const parser = new Parser(content, filePath, tokens);
  const ast = parser.parse(true);
  endParsing();

  if (options.emit === "ast") {
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  if (options.emit === "formatted") {
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    if (options.write) {
      fs.writeFileSync(filePath, formatted);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(formatted);
    }
    return;
  }

  // 3. Type Checking
  const endTypeChecking = options.verbose ? log.time("TypeChecking") : () => {};
  const typeChecker = new TypeChecker({
    skipImportResolution: options.prelude === false,
  });
  // BUG-128: Check for main function in entry point files
  typeChecker.checkProgram(ast, undefined, { isEntryPoint: true });
  endTypeChecking();

  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    console.error(diagnosticFormatter.formatErrors(typeErrors));
    if (options.watch) {
      throw new Error("Type checking failed");
    }
    process.exit(1);
  }

  if (options.verbose) {
    log.info("Semantic analysis completed successfully.");
  }

  // 4. Code Generation
  const endCodeGeneration = options.verbose
    ? log.time("CodeGeneration")
    : () => {};
  const hostDefaults = getHostDefaults();
  const generator = new CodeGenerator({
    target: options.target || hostDefaults.target,
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
  });
  const ir = generator.generate(ast, filePath);
  endCodeGeneration();

  // Write LLVM IR
  let irPath: string;
  if (options.output) {
    irPath = options.output.endsWith(".ll")
      ? options.output
      : options.output + ".ll";
  } else {
    irPath = filePath.replace(/\.[^/.]+$/, "") + ".ll";
  }

  fs.writeFileSync(irPath, ir);

  if (options.verbose || (!options.run && options.emit === "llvm")) {
    log.info(`LLVM IR written to ${irPath}`);
  }

  // 5. Compile & Run
  if (options.emit === "llvm") {
    compileBinaryAndRun(irPath, options, programArgs);
  }
}

/**
 * Normalize string or string array to array
 */
function normalizeArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getLlvmOutputPath(filePath: string, options: CompileOptions): string {
  if (!options.output) {
    return filePath.replace(/\.[^/.]+$/, "") + ".ll";
  }

  return options.output.endsWith(".ll")
    ? options.output
    : `${options.output}.ll`;
}

function printCacheStatsIfRequested(
  result: { stats?: { cache?: CacheStatsForOutput } },
  options: CompileOptions,
): void {
  if (!options.cacheStats || !result.stats?.cache) {
    return;
  }

  const stats = result.stats.cache;
  console.log(
    [
      "Cache stats:",
      `modules=${stats.totalModules}`,
      `hits=${stats.hits}`,
      `misses=${stats.misses}`,
      `compiled=${stats.compiled}`,
      `reused=${stats.reused}`,
      `jobs=${stats.jobs}`,
      `sizeKb=${(stats.cacheSize / 1024).toFixed(2)}`,
    ].join(" "),
  );
}

interface CacheStatsForOutput {
  totalModules: number;
  cacheSize: number;
  hits: number;
  misses: number;
  compiled: number;
  reused: number;
  jobs: number;
}
