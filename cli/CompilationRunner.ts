/**
 * Compilation Runner
 * Orchestrates the compilation pipeline for BPL source code
 */

import * as fs from "fs";
import * as path from "path";
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
import { findSymlinkedParentPath } from "../compiler/common/PathSafety";
import { diagnosticFormatter } from "./DiagnosticFormatter";
import {
  compileBinaryAndRun,
  type CompileBinaryAndRunResult,
  getExecutableOutputPath,
  isWasmTarget,
  runExecutable,
} from "./BinaryRunner";
import {
  assertWritableFileOutputPath,
  assertWritableInputFilePath,
  getHostDefaults,
  writeFileAtomically,
} from "./utils";
import type { CompileOptions } from "./types";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../compiler/common/JsonContracts";
import { Logger, LogLevel, setLogLevel } from "../compiler/common/Logger";
import { updateConfig } from "../compiler/common/Config";

const log = new Logger("CompilationRunner");

type CliOptimizationLevel = "0" | "1" | "2" | "3";
type CliEmitType = NonNullable<CompileOptions["emit"]>;
type BuildJsonOutput = {
  llvm?: string;
  executable?: string;
};

class CompilationDiagnosticsError extends Error {
  constructor(public readonly errors: CompilerError[]) {
    super(diagnosticFormatter.formatErrors(errors));
    this.name = "CompilationDiagnosticsError";
  }
}

/**
 * Apply CLI options to global configuration
 */
function applyOptions(options: CompileOptions): void {
  normalizeCompileOptions(options);

  // Handle quiet mode
  if (options.json) {
    setLogLevel(LogLevel.SILENT);
  } else if (options.quiet) {
    setLogLevel(LogLevel.SILENT);
  } else if (options.verbose) {
    setLogLevel(LogLevel.DEBUG);
  }

  // Handle color override
  if (options.color !== undefined) {
    updateConfig({
      features: { colorize: options.color },
    });
    diagnosticFormatter.setConfig({ colorize: options.color });
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

    const content = readInputSourceFile(filePath);
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
    handleCompilationError(e, options, filePath);
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

    const content = readInputSourceFile(filePath);
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
    handleCompilationError(e, options, filePath);
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
    handleCompilationError(e, options, sourceLabel);
  }
}

/**
 * Handle compilation errors uniformly
 */
function handleCompilationError(
  e: unknown,
  options: CompileOptions,
  sourceLabel?: string,
): never {
  if (shouldEmitBuildJsonReport(options)) {
    const diagnostics = getCompilationDiagnostics(e);
    const payload = {
      ...(sourceLabel ? { file: sourceLabel } : {}),
      error: formatCompilationErrorMessage(e),
      ...(diagnostics
        ? { diagnostics: diagnosticFormatter.formatDiagnosticObjects(diagnostics) }
        : {}),
    };
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.build, false, payload),
        null,
        2,
      ),
    );
    process.exit(1);
  }

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

function getCompilationDiagnostics(error: unknown): CompilerError[] | undefined {
  if (error instanceof CompilerError) {
    return [error];
  }
  if (error instanceof CompilationDiagnosticsError) {
    return error.errors;
  }
  return undefined;
}

function readInputSourceFile(filePath: string): string {
  const inputStats = tryLstat(filePath);
  if (!inputStats) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (inputStats.isSymbolicLink()) {
    throw new Error(`Input path is a symbolic link: ${filePath}`);
  }

  if (!inputStats.isFile()) {
    throw new Error(`Input path is not a file: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf-8");
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
  const hasImports =
    shouldResolveImportsForCompilation(options) &&
    sourceContainsImportDeclaration(content, filePath);

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

  const hasImports =
    shouldResolveImportsForCompilation(options) &&
    sourceContainsImportDeclaration(content, filePath);

  if (hasImports) {
    await compileWithModulesAsync(content, filePath, options, programArgs);
  } else {
    compileSingleFile(content, filePath, options, programArgs);
  }
}

function injectRuntimeObjects(options: CompileOptions): void {
  // Inject runtime library unless skipped
  if (!needsNativeRuntimeObjects(options)) {
    return;
  }

  const bplHome = getBplHome();
  const objects = options.object
    ? Array.isArray(options.object)
      ? options.object
      : [options.object as string]
    : [];

  const addObject = (objectPath: string, label: string) => {
    assertReadableRuntimeObject(objectPath, label);
    if (!objects.includes(objectPath)) {
      objects.push(objectPath);
    }
  };

  // Add LLVM IR declarations (core exception handling)
  addObject(path.join(bplHome, "lib", "runtime.ll"), "Runtime IR");

  // Add C runtime support (signal handlers, stack traces)
  addObject(
    path.join(bplHome, "lib", "runtime_support.o"),
    "Runtime support object",
  );

  options.object = objects;
}

function needsNativeRuntimeObjects(options: CompileOptions): boolean {
  if (options.skipRuntime || isWasmTarget(options.target)) {
    return false;
  }

  return (
    options.emit !== "ast" &&
    options.emit !== "tokens" &&
    options.emit !== "formatted"
  );
}

function shouldResolveImportsForCompilation(options: CompileOptions): boolean {
  return (
    options.emit !== "ast" &&
    options.emit !== "tokens" &&
    options.emit !== "formatted"
  );
}

function assertReadableRuntimeObject(objectPath: string, label: string): void {
  const linkStats = tryLstat(objectPath);
  if (!linkStats) {
    throw new Error(
      `${label} not found: ${objectPath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(objectPath)) {
    throw new Error(
      `${label} is a broken symbolic link: ${objectPath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  const symlinkedParent = findSymlinkedParentPath(objectPath);
  if (symlinkedParent) {
    throw new Error(
      `${label} parent path contains a symbolic link: ${symlinkedParent}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (!fs.statSync(objectPath).isFile()) {
    throw new Error(
      `${label} is not a file: ${objectPath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
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
    clangFlags: getCompilerDriverFlags(options),
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
    jobs: options.jobs ? parseInt(String(options.jobs)) : undefined,
    requireEntryPoint: true,
  });

  const endCompilation = startPhaseTimer("Compilation", options);
  const result = compiler.compile(content);
  endCompilation();

  if (!result.success) {
    if (result.errors) {
      if (shouldEmitBuildJsonReport(options)) {
        throw new CompilationDiagnosticsError(result.errors);
      }
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
      assertWritableInputFilePath(filePath);
      writeFileAtomically(filePath, result.output);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(result.output);
    }
    return;
  }

  // For cached compilation, the executable is already created
  if (options.cache) {
    if (shouldEmitBuildJsonReport(options)) {
      emitBuildJsonSuccess(filePath, options, {
        executable: getCachedExecutablePath(filePath, options),
      });
      return;
    }

    if (result.output) {
      console.log(result.output);
    }
    printCacheStatsIfRequested(result, options);

    if (options.run) {
      runCachedExecutable(filePath, options, programArgs);
    }
    return;
  }

  // Write LLVM IR and optionally compile/run
  if (result.output) {
    writeLlvmOutputAndMaybeBuild(filePath, options, result.output, programArgs);
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
    clangFlags: getCompilerDriverFlags(options),
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
    jobs: options.jobs ? parseInt(String(options.jobs)) : undefined,
    requireEntryPoint: true,
  });

  const endCompilation = startPhaseTimer("Compilation", options);
  const result = await compiler.compileAsync(content);
  endCompilation();

  if (!result.success) {
    if (result.errors) {
      if (shouldEmitBuildJsonReport(options)) {
        throw new CompilationDiagnosticsError(result.errors);
      }
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
      assertWritableInputFilePath(filePath);
      writeFileAtomically(filePath, result.output);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(result.output);
    }
    return;
  }

  // For cached compilation, the executable is already created
  if (options.cache) {
    if (shouldEmitBuildJsonReport(options)) {
      emitBuildJsonSuccess(filePath, options, {
        executable: getCachedExecutablePath(filePath, options),
      });
      return;
    }

    if (result.output) {
      console.log(result.output);
    }
    printCacheStatsIfRequested(result, options);

    if (options.run) {
      runCachedExecutable(filePath, options, programArgs);
    }
    return;
  }

  // Write LLVM IR and optionally compile/run
  if (result.output) {
    writeLlvmOutputAndMaybeBuild(filePath, options, result.output, programArgs);
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
  const endLexing = startPhaseTimer("Lexing", options);
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
  const endParsing = startPhaseTimer("Parsing", options);
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
      assertWritableInputFilePath(filePath);
      writeFileAtomically(filePath, formatted);
      if (options.verbose) log.info(`Formatted ${filePath}`);
    } else {
      console.log(formatted);
    }
    return;
  }

  // 3. Type Checking
  const endTypeChecking = startPhaseTimer("TypeChecking", options);
  const typeChecker = new TypeChecker({
    skipImportResolution: options.prelude === false,
  });
  // BUG-128: Check for main function in entry point files
  typeChecker.checkProgram(ast, undefined, { isEntryPoint: true });
  endTypeChecking();

  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    if (shouldEmitBuildJsonReport(options)) {
      throw new CompilationDiagnosticsError(typeErrors);
    }
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
  const endCodeGeneration = startPhaseTimer("CodeGeneration", options);
  const hostDefaults = getHostDefaults();
  const generator = new CodeGenerator({
    target: options.target || hostDefaults.target,
    dwarf: options.dwarf,
    optimizationLevel: options.O ? parseInt(options.O) : 0,
  });
  const ir = generator.generate(ast, filePath);
  endCodeGeneration();

  writeLlvmOutputAndMaybeBuild(filePath, options, ir, programArgs);
}

/**
 * Normalize string or string array to array
 */
function normalizeArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getCompilerDriverFlags(options: CompileOptions): string[] | undefined {
  const flags = normalizeArray(options.clangFlag);
  if (options.cpu) {
    flags.push(`-mcpu=${options.cpu}`);
  }
  if (options.march) {
    flags.push(`-march=${options.march}`);
  }
  return flags.length > 0 ? flags : undefined;
}

function startPhaseTimer(
  label: string,
  options: CompileOptions,
): () => void {
  if (options.verbose) {
    return log.time(label);
  }
  if (!options.time) {
    return () => {};
  }

  const start = performance.now();
  return () => {
    log.info(`${label}: ${(performance.now() - start).toFixed(2)}ms`);
  };
}

function getLlvmOutputPath(filePath: string, options: CompileOptions): string {
  if (!options.output) {
    return filePath.replace(/\.[^/.]+$/, "") + ".ll";
  }

  return options.output.endsWith(".ll")
    ? options.output
    : `${options.output}.ll`;
}

function writeLlvmOutputAndMaybeBuild(
  filePath: string,
  options: CompileOptions,
  ir: string,
  programArgs?: string[],
): void {
  const outputPath = getLlvmOutputPath(filePath, options);
  assertWritableFileOutputPath(outputPath);

  if (shouldCompileExecutable(options)) {
    assertWritableFileOutputPath(getExecutableOutputPath(outputPath, options));
  }

  writeFileAtomically(outputPath, ir);

  if (
    !shouldEmitBuildJsonReport(options) &&
    (options.verbose || (!options.run && options.emit === "llvm"))
  ) {
    log.info(`LLVM IR written to ${outputPath}`);
  }

  let binaryResult: CompileBinaryAndRunResult | undefined;
  if (shouldCompileExecutable(options)) {
    binaryResult = compileBinaryAndRun(outputPath, options, programArgs);
  }

  if (shouldEmitBuildJsonReport(options)) {
    emitBuildJsonSuccess(filePath, options, {
      llvm: outputPath,
      executable: binaryResult?.compile.executablePath,
    });
  }
}

function runCachedExecutable(
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  const execPathBase = options.output || filePath.replace(/\.[^/.]+$/, "");
  const execPath = path.isAbsolute(execPathBase)
    ? execPathBase
    : path.resolve(execPathBase);

  const runResult = runExecutable(execPath, programArgs || [], options.verbose);

  if (!runResult.success) {
    if (runResult.error) {
      log.error(runResult.error);
    }
    process.exit(runResult.exitCode);
  }
}

function getCachedExecutablePath(
  filePath: string,
  options: CompileOptions,
): string {
  const execPathBase = options.output || filePath.replace(/\.[^/.]+$/, "");
  return path.isAbsolute(execPathBase) ? execPathBase : path.resolve(execPathBase);
}

function shouldEmitBuildJsonReport(options: CompileOptions): boolean {
  return (
    Boolean(options.json) &&
    options.emit !== "ast" &&
    options.emit !== "tokens" &&
    options.emit !== "formatted"
  );
}

function emitBuildJsonSuccess(
  filePath: string,
  options: CompileOptions,
  output: BuildJsonOutput,
): void {
  const hostDefaults = getHostDefaults();
  console.log(
    JSON.stringify(
      createJsonReport(CLI_JSON_CHECKS.build, true, {
        file: filePath,
        emit: options.emit ?? "binary",
        target: options.target || hostDefaults.target,
        cache: Boolean(options.cache),
        output,
      }),
      null,
      2,
    ),
  );
}

function formatCompilationErrorMessage(error: unknown): string {
  if (error instanceof CompilerError) {
    return diagnosticFormatter.formatError(error);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldCompileExecutable(options: CompileOptions): boolean {
  return options.emit === "llvm" || Boolean(options.run) || !options.emit;
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
