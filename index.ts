import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { isAbsolute, resolve } from "path";

import { ErrorReporter } from "./errors";
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

// --- Configuration Defaults ---
let linkMode: "dynamic" | "static" = "dynamic";
let quiet = false;
let printAsm = false;
let shouldRun = false;
let shouldGdb = false;
let compileLib = false;
let cleanupAsm = true;
let cleanupO = true;
let optimizationLevel = 3;
let showDeps = false;
const extraLibs: string[] = [];

// --- Load Configuration File ---
const configPath = resolve("transpiler.config.json");
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.linkMode) linkMode = config.linkMode;
    if (config.quiet !== undefined) {
      quiet = config.quiet;
      Logger.setQuiet(quiet);
    }
    if (config.printAsm !== undefined) printAsm = config.printAsm;
    if (config.shouldRun !== undefined) shouldRun = config.shouldRun;
    if (config.shouldGdb !== undefined) shouldGdb = config.shouldGdb;
    if (config.compileLib !== undefined) compileLib = config.compileLib;
    if (config.cleanupAsm !== undefined) cleanupAsm = config.cleanupAsm;
    if (config.cleanupO !== undefined) cleanupO = config.cleanupO;
    if (config.optimizationLevel !== undefined)
      optimizationLevel = config.optimizationLevel;
    if (config.extraLibs && Array.isArray(config.extraLibs)) {
      extraLibs.push(...config.extraLibs);
    }
  } catch (e) {
    Logger.warn("Warning: Failed to parse transpiler.config.json");
  }
}

// --- Parse Command Line Arguments ---
const args = process.argv.slice(2);
let sourceFile: string | null = null;

for (const arg of args) {
  if (arg.startsWith("-")) {
    switch (arg) {
      case "-s":
      case "--static":
        linkMode = "static";
        break;
      case "-d":
      case "--dynamic":
        linkMode = "dynamic";
        break;
      case "-q":
      case "--quiet":
        quiet = true;
        Logger.setQuiet(true);
        break;
      case "-p":
      case "--print-asm":
        printAsm = true;
        cleanupAsm = false;
        break;
      case "-r":
      case "--run":
        shouldRun = true;
        break;
      case "-g":
      case "--gdb":
        shouldGdb = true;
        break;
      case "-l":
      case "--lib":
        compileLib = true;
        cleanupO = false;
        break;
      case "-O0":
        optimizationLevel = 0;
        break;
      case "-O1":
        optimizationLevel = 1;
        break;
      case "-O2":
        optimizationLevel = 2;
        break;
      case "-O3":
        optimizationLevel = 3;
        break;
      case "--deps":
      case "--graph":
        showDeps = true;
        break;
      default:
        Logger.warn(`Warning: Unknown option (ignored): ${arg}`);
        break;
    }
  } else {
    if (!sourceFile) {
      sourceFile = arg;
    } else {
      extraLibs.push(arg);
    }
  }
}

if (!sourceFile) {
  Logger.error("Error: No source file provided.");
  Logger.error(
    "Usage: bun index.ts [-s|-d] [-q] [-p] [-r] [-g] [-l] <source.x> [lib1.o ...]",
  );
  process.exit(1);
}

const fileName = sourceFile;

if (showDeps) {
  const dot = generateDependencyGraph(fileName);
  Logger.log(dot);
  process.exit(0);
}

// --- 1. Transpiling ---
Logger.info(`--- 1. Transpiling ${fileName} ---`);

let asmContent = "";
let asmFilePath = "";
let objectsToLink: Set<string> = new Set(extraLibs);

try {
  const tokens = getFileTokens(fileName);
  const ast = parseTokens(tokens);

  const scope = new Scope();

  // Initialize base types in scope
  HelperGenerator.generateBaseTypes(scope);

  // Handle imports
  const imports = parseImportExpressions(extractImportStatements(ast));
  if (imports.length) {
    const objectFiles = parseLibraryFile(fileName, scope);
    objectFiles.forEach((obj) => objectsToLink.add(obj));
  }

  const analyzer = new SemanticAnalyzer();
  const analyzedScope = analyzer.analyze(ast, scope, true);

  for (const warning of analyzer.warnings) {
    ErrorReporter.warn(warning);
  }

  const gen = new IRGenerator();
  ast.toIR(gen, analyzedScope);
  const builder = new LLVMTargetBuilder();
  asmContent = builder.build(gen.module);
  asmFilePath = getOutputFileName(fileName, ".ll");
  saveToFile(asmFilePath, asmContent);
} catch (e) {
  ErrorReporter.report(e);
  process.exit(1);
}

// --- 2. Print Assembly ---
if (printAsm) {
  Logger.info(`--- 2. Generated LLVM IR: ${asmFilePath} ---`);
  Logger.log(asmContent);
  Logger.info("-----------------------------------");
} else {
  Logger.info("--- 2. Skipping LLVM IR printout ---");
}

// --- 3. Assemble (Compile to Object) ---
Logger.info(`--- 3. Compiling ${asmFilePath} ---`);
const objFilePath = getOutputFileName(fileName, ".o");
try {
  execSync(
    `clang -Wno-override-module -O${optimizationLevel} -c -o ${objFilePath} ${asmFilePath}`,
    { stdio: "inherit" },
  );
} catch (e) {
  Logger.error("Compilation failed.");
  process.exit(1);
}

// --- 4. Link ---
if (compileLib) {
  Logger.info("--- 4. Skipping linking (Library Mode) ---");
  if (cleanupAsm && existsSync(asmFilePath)) unlinkSync(asmFilePath);
  process.exit(0);
}

Logger.info(`--- 4. Linking to create executable (Mode: ${linkMode}) ---`);

const outputExe = getOutputFileName(fileName, "");
const linkArgs = Array.from(objectsToLink).join(" ");
const staticFlag = linkMode === "static" ? "-static" : "";

try {
  execSync(
    `clang -Wno-override-module -O${optimizationLevel} ${staticFlag} -o ${outputExe} ${objFilePath} ${linkArgs} -lm`,
    { stdio: "inherit" },
  );
} catch (e) {
  Logger.error("Linking failed.");
  process.exit(1);
}

// --- 5. Cleanup ---
if (cleanupAsm && existsSync(asmFilePath)) {
  Logger.info("--- Cleaning up assembly file ---");
  unlinkSync(asmFilePath);
}
if (cleanupO && existsSync(objFilePath)) {
  Logger.info("--- Cleaning up object file ---");
  unlinkSync(objFilePath);
}

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
    }
  }
}
