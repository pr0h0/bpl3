import AsmGenerator from "./transpiler/AsmGenerator";
import Scope from "./transpiler/Scope";
import {
  getFileTokens,
  parseTokens,
  parseImportExpressions,
  extractImportStatements,
} from "./utils/parser";
import { transpileProgram, parseLibraryFile } from "./utils/transpiler";
import { getOutputFileName, saveToFile } from "./utils/file";
import { compileAsmFile, linkObjectFile } from "./utils/compiler";
import { execSync, spawnSync } from "child_process";
import { existsSync, unlinkSync, readFileSync } from "fs";
import { resolve, isAbsolute } from "path";
import { ErrorReporter } from "./errors";
import { generateDependencyGraph } from "./utils/DependencyGraph";

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

function debug(...args: any[]) {
  if (quiet) return;
  console.log(...args);
}

// --- Load Configuration File ---
const configPath = resolve("transpiler.config.json");
if (existsSync(configPath)) {
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    if (config.linkMode) linkMode = config.linkMode;
    if (config.quiet !== undefined) quiet = config.quiet;
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
    console.warn("Warning: Failed to parse transpiler.config.json");
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
        console.warn(`Warning: Unknown option (ignored): ${arg}`);
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
  console.error("Error: No source file provided.");
  console.error(
    "Usage: bun index.ts [-s|-d] [-q] [-p] [-r] [-g] [-l] <source.x> [lib1.o ...]",
  );
  process.exit(1);
}

const fileName = sourceFile;

if (showDeps) {
  const dot = generateDependencyGraph(fileName);
  console.log(dot);
  process.exit(0);
}

// --- 1. Transpiling ---
debug(`--- 1. Transpiling ${fileName} ---`);

let asmContent = "";
let asmFilePath = "";
let objectsToLink: Set<string> = new Set(extraLibs);

try {
  const tokens = getFileTokens(fileName);
  const ast = parseTokens(tokens);

  const gen = new AsmGenerator(optimizationLevel);
  gen.setSourceFile(fileName);
  const scope = new Scope();

  const imports = parseImportExpressions(extractImportStatements(ast));
  if (imports.length) {
    // We rely on parseLibraryFile to handle recursive compilation and return object files
    const objectFiles = parseLibraryFile(fileName, scope);
    objectFiles.forEach((obj) => objectsToLink.add(obj));
  }

  asmContent = transpileProgram(ast, gen, scope);
  asmFilePath = getOutputFileName(fileName, ".asm");
  saveToFile(asmFilePath, asmContent);
} catch (e) {
  ErrorReporter.report(e);
}

// --- 2. Print Assembly ---

// --- 2. Print Assembly ---
if (printAsm) {
  debug(`--- 2. Generated Assembly: ${asmFilePath} ---`);
  console.log(asmContent);
  debug("-----------------------------------");
} else {
  debug("--- 2. Skipping assembly printout ---");
}

// --- 3. Assemble ---
debug(`--- 3. Assembling ${asmFilePath} ---`);
let objFilePath: string;
try {
  objFilePath = compileAsmFile(asmFilePath);
} catch (e) {
  console.error("Assembly failed.");
  process.exit(1);
}

// --- 4. Link ---
if (compileLib) {
  debug("--- 4. Skipping linking (Library Mode) ---");
  if (cleanupAsm && existsSync(asmFilePath)) unlinkSync(asmFilePath);
  process.exit(0);
}

debug(`--- 4. Linking to create executable (Mode: ${linkMode}) ---`);

const outputExe = getOutputFileName(fileName, "");
const linkArgs = Array.from(objectsToLink);
if (linkMode === "static") {
  linkArgs.push("-static");
}

try {
  linkObjectFile(objFilePath, linkArgs, outputExe);
} catch (e) {
  console.error("Linking failed.");
  process.exit(1);
}

// --- 5. Cleanup ---
if (cleanupAsm && existsSync(asmFilePath)) {
  debug("--- Cleaning up assembly file ---");
  unlinkSync(asmFilePath);
}
if (cleanupO && existsSync(objFilePath)) {
  debug("--- Cleaning up object file ---");
  unlinkSync(objFilePath);
}

// --- 6. Run ---
if (shouldRun || shouldGdb) {
  debug(`--- 5. Running ${outputExe} ---`);

  const runPath = isAbsolute(outputExe) ? outputExe : `./${outputExe}`;

  if (shouldGdb) {
    spawnSync("gdb", ["-q", runPath], { stdio: "inherit" });
  } else {
    debug("-----------------------------------");
    try {
      execSync(runPath, { stdio: "inherit" });
      debug("-----------------------------------");
      debug(`Program exited with code: 0`);
    } catch (e: any) {
      debug("-----------------------------------");
      debug(`Program exited with code: ${e.status}`);
    }
  }
}
