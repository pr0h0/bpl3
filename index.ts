import { execSync, spawnSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { dirname, resolve, isAbsolute, relative, basename } from "path";

import { parseCLI } from "./utils/CLI";
import { CompilerError, ErrorReporter } from "./errors";
import { SemanticAnalyzer } from "./transpiler/analysis/SemanticAnalyzer";
import HelperGenerator from "./transpiler/HelperGenerator";
import { IRGenerator } from "./transpiler/ir/IRGenerator";
import Scope from "./transpiler/Scope";
import { LLVMTargetBuilder } from "./transpiler/target/LLVMTargetBuilder";
import { generateDependencyGraph } from "./utils/DependencyGraph";
import { getOutputFileName, saveToFile } from "./utils/file";
import {
  extractImportStatements,
  getFileTokens,
  parseImportExpressions,
  parseTokens,
} from "./utils/parser";
import { parseLibraryFile } from "./utils/transpiler";
import { Logger } from "./utils/Logger";
import { TypePrinter } from "./utils/typePrinter";
import {
  setTarget,
  getTarget,
  getClangCompileFlags,
  getClangLinkFlags,
} from "./utils/target";

// --- Parse Command Line Arguments ---
const config = parseCLI();
const {
  linkMode,
  quiet,
  printAsm,
  printAst,
  printTypes,
  shouldRun,
  shouldGdb,
  compileLib,
  cleanupAsm,
  cleanupO,
  optimizationLevel,
  showDeps,
  extraLibs,
  sourceFile,
  isEval,
  enableStackTrace,
  target,
} = config;

// Initialize target configuration
if (target) {
  setTarget(target);
}
const targetConfig = getTarget();
Logger.info(`Target: ${targetConfig.triple} (${targetConfig.arch}-${targetConfig.os})`);

Logger.setQuiet(quiet);

const fileName = sourceFile!;
const outputExe = getOutputFileName(fileName, "");

if (showDeps) {
  const dot = generateDependencyGraph(fileName);
  Logger.log(dot);
  process.exit(0);
}

if (printTypes) {
  const printer = new TypePrinter();
  printer.printTypeTree(fileName);
  process.exit(0);
}

// --- 1. Transpiling ---
Logger.info(`--- 1. Transpiling ${fileName} ---`);

let asmContent = "";
let asmFilePath = "";
let objFilePath = "";
let objectsToLink: Set<string> = new Set(extraLibs);

function cleanup() {
  if (cleanupAsm && asmFilePath && existsSync(asmFilePath)) {
    Logger.info("--- Cleaning up assembly file ---");
    unlinkSync(asmFilePath);
  }
  if (cleanupO && objFilePath && existsSync(objFilePath)) {
    Logger.info("--- Cleaning up object file ---");
    unlinkSync(objFilePath);
  }
  if (isEval && sourceFile && existsSync(sourceFile)) {
    Logger.info(`--- Cleaning up eval file: ${sourceFile} ---`);
    unlinkSync(sourceFile);
    if (existsSync(outputExe)) {
      unlinkSync(outputExe);
    }
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(1));
process.on("SIGTERM", () => process.exit(1));

try {
  const entryDir = dirname(resolve(fileName));
  let displayPath = relative(entryDir, resolve(fileName));

  const tokens = getFileTokens(fileName, displayPath);
  const ast = parseTokens(tokens);

  if (printAst) {
    console.log(JSON.stringify(ast, null, 2));
    process.exit(0);
  }

  const scope = new Scope();

  // Initialize base types in scope
  HelperGenerator.generateBaseTypes(scope);

  // Handle imports
  const imports = parseImportExpressions(extractImportStatements(ast));
  if (imports.length) {
    const objectFiles = parseLibraryFile(
      fileName,
      scope,
      enableStackTrace,
      new Set(),
      new Map(),
      entryDir,
    );
    objectFiles.forEach((obj) => objectsToLink.add(obj));
  }

  const analyzer = new SemanticAnalyzer();
  const analyzedScope = analyzer.analyze(ast, scope, true);

  for (const warning of analyzer.warnings) {
    ErrorReporter.warn(warning);
  }

  const gen = new IRGenerator(enableStackTrace);
  ast.toIR(gen, analyzedScope);
  const builder = new LLVMTargetBuilder(enableStackTrace);
  asmContent = builder.build(gen.module);
  asmFilePath = getOutputFileName(fileName, ".ll");
  saveToFile(asmFilePath, asmContent);
} catch (e) {
  if (e instanceof CompilerError) {
    ErrorReporter.report(e);
  } else {
    Logger.error("An unexpected error occurred:");
    console.error(e);
  }
  process.exit(1);
}

// --- 2. Print Assembly ---
if (printAsm) {
  Logger.info(`--- 2. Generated LLVM IR: ${asmFilePath} ---`);
  console.log(asmContent);
  Logger.info("-----------------------------------");
} else {
  Logger.info("--- 2. Skipping LLVM IR printout ---");
}

// --- 3. Assemble (Compile to Object) ---
Logger.info(`--- 3. Compiling ${asmFilePath} ---`);
objFilePath = getOutputFileName(fileName, ".o");
try {
  const compileFlags = getClangCompileFlags(optimizationLevel);
  const compileCmd = `clang ${compileFlags.join(" ")} -o ${objFilePath} ${asmFilePath}`;
  Logger.info(`Compile command: ${compileCmd}`);
  execSync(compileCmd, { stdio: "inherit" });
} catch (e) {
  Logger.error("Compilation failed.");
  process.exit(1);
}

// --- 4. Link ---
if (compileLib) {
  Logger.info("--- 4. Skipping linking (Library Mode) ---");
  process.exit(0);
}

Logger.info(`--- 4. Linking to create executable (Mode: ${linkMode}) ---`);

const linkArgs = Array.from(objectsToLink).join(" ");
const isStatic = linkMode === "static";

try {
  const linkFlags = getClangLinkFlags(optimizationLevel, isStatic);
  const linkCmd = `clang ${linkFlags.join(" ")} -o ${outputExe} ${objFilePath} ${linkArgs}`;
  Logger.info(`Link command: ${linkCmd}`);
  execSync(linkCmd, { stdio: "inherit" });
} catch (e) {
  Logger.error("Linking failed.");
  process.exit(1);
}

// --- 5. Cleanup ---
// Cleanup is handled by process.on('exit')

// --- 6. Run ---
if (shouldRun || shouldGdb) {
  Logger.info(`--- 5. Running ${outputExe} ---`);

  const runPath = isAbsolute(outputExe) ? outputExe : `./${outputExe}`;

  if (shouldGdb) {
    spawnSync("gdb", ["-q", runPath], { stdio: "inherit" });
  } else {
    Logger.info("-----------------------------------");
    try {
      execSync(runPath, { stdio: "inherit" });
      Logger.info("-----------------------------------");
      Logger.info(`Program exited with code: 0`);
    } catch (e: any) {
      Logger.info("-----------------------------------");
      Logger.info(`Program exited with code: ${e.status}`);
      process.exit(e.status || 1);
    }
  }
}
