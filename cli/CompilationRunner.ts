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
} from "../compiler";
import { diagnosticFormatter } from "./DiagnosticFormatter";
import { compileBinaryAndRun } from "./BinaryRunner";
import { getHostDefaults } from "./utils";
import type { CompileOptions } from "./types";

/**
 * Process a source file and compile it
 */
export function processFile(
  filePath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    processCodeInternal(content, filePath, options, programArgs);
  } catch (e) {
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
    console.error(`Error: ${e}`);
    if (e instanceof Error && e.stack && options.verbose) {
      console.error(e.stack);
    }
  }
  process.exit(1);
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
  // Check if file has imports - if so, use module resolution
  const hasImports = content.includes("import ");

  if (hasImports) {
    compileWithModules(content, filePath, options, programArgs);
  } else {
    compileSingleFile(content, filePath, options, programArgs);
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
  });

  const result = compiler.compile(content);

  if (!result.success) {
    if (result.errors) {
      console.error(diagnosticFormatter.formatErrors(result.errors));
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
      if (options.verbose) console.log(`Formatted ${filePath}`);
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
    const outputPath =
      options.output || filePath.replace(/\.[^/.]+$/, "") + ".ll";
    fs.writeFileSync(outputPath, result.output);

    if (options.verbose || (!options.run && options.emit === "llvm")) {
      console.log(`LLVM IR written to ${outputPath}`);
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
  if (options.verbose) console.time("Lexing");
  let tokens: any[] = [];
  try {
    tokens = lexWithGrammar(content, filePath);
  } catch {
    // Lexer might fail on new syntax not yet in grammar.bpl
  }
  if (options.verbose) console.timeEnd("Lexing");

  if (options.emit === "tokens") {
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  // 2. Parsing
  if (options.verbose) console.time("Parsing");
  const parser = new Parser(content, filePath, tokens);
  const ast = parser.parse(true);
  if (options.verbose) console.timeEnd("Parsing");

  if (options.emit === "ast") {
    console.log(JSON.stringify(ast, null, 2));
    return;
  }

  if (options.emit === "formatted") {
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    if (options.write) {
      fs.writeFileSync(filePath, formatted);
      if (options.verbose) console.log(`Formatted ${filePath}`);
    } else {
      console.log(formatted);
    }
    return;
  }

  // 3. Type Checking
  if (options.verbose) console.time("TypeChecking");
  const typeChecker = new TypeChecker({
    skipImportResolution: options.prelude === false,
  });
  typeChecker.checkProgram(ast);
  if (options.verbose) console.timeEnd("TypeChecking");

  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    console.error(diagnosticFormatter.formatErrors(typeErrors));
    process.exit(1);
  }

  if (options.verbose) {
    console.log("Semantic analysis completed successfully.");
  }

  // 4. Code Generation
  if (options.verbose) console.time("CodeGeneration");
  const hostDefaults = getHostDefaults();
  const generator = new CodeGenerator({
    target: options.target || hostDefaults.target,
    dwarf: options.dwarf,
  });
  const ir = generator.generate(ast, filePath);
  if (options.verbose) console.timeEnd("CodeGeneration");

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
    console.log(`LLVM IR written to ${irPath}`);
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
