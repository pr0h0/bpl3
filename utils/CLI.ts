import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { Command } from "commander";
import { Logger } from "./Logger";
import { formatFiles } from "./formatter";
import { generateDependencyGraph } from "./DependencyGraph";

const packageJson = require("../package.json");

export interface CompilerConfig {
  linkMode: "dynamic" | "static";
  quiet: boolean;
  printAsm: boolean;
  printAst: boolean;
  printTypes: boolean;
  shouldRun: boolean;
  shouldGdb: boolean;
  compileLib: boolean;
  cleanupAsm: boolean;
  cleanupO: boolean;
  optimizationLevel: number;
  showDeps: boolean;
  extraLibs: string[];
  sourceFile: string | null;
  sourceCode: string | null;
  isEval: boolean;
  enableStackTrace: boolean;
  /** Target triple for cross-compilation (e.g., "x86_64-linux", "arm64-darwin") */
  target: string | null;
}

export const defaultConfig: CompilerConfig = {
  linkMode: "dynamic",
  quiet: false,
  printAsm: false,
  printAst: false,
  printTypes: false,
  shouldRun: false,
  shouldGdb: false,
  compileLib: false,
  cleanupAsm: true,
  cleanupO: true,
  optimizationLevel: 3,
  showDeps: false,
  extraLibs: [],
  sourceFile: null,
  sourceCode: null,
  isEval: false,
  enableStackTrace: false,
  target: null,
};

export function parseCLI(): CompilerConfig {
  const config: CompilerConfig = { ...defaultConfig };

  // --- Load Configuration File ---
  const configPath = resolve("transpiler.config.json");
  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      if (fileConfig.linkMode) config.linkMode = fileConfig.linkMode;
      if (fileConfig.quiet !== undefined) {
        config.quiet = fileConfig.quiet;
        Logger.setQuiet(config.quiet);
      }
      if (fileConfig.printAsm !== undefined)
        config.printAsm = fileConfig.printAsm;
      if (fileConfig.shouldRun !== undefined)
        config.shouldRun = fileConfig.shouldRun;
      if (fileConfig.shouldGdb !== undefined)
        config.shouldGdb = fileConfig.shouldGdb;
      if (fileConfig.compileLib !== undefined)
        config.compileLib = fileConfig.compileLib;
      if (fileConfig.cleanupAsm !== undefined)
        config.cleanupAsm = fileConfig.cleanupAsm;
      if (fileConfig.cleanupO !== undefined)
        config.cleanupO = fileConfig.cleanupO;
      if (fileConfig.optimizationLevel !== undefined)
        config.optimizationLevel = fileConfig.optimizationLevel;
      if (fileConfig.extraLibs && Array.isArray(fileConfig.extraLibs)) {
        config.extraLibs.push(...fileConfig.extraLibs);
      }
    } catch (e) {
      Logger.warn("Warning: Failed to parse transpiler.config.json");
    }
  }

  const program = new Command();

  program
    .name(Object.keys(packageJson.bin)?.[0] || packageJson.name)
    .description(packageJson.description)
    .version(packageJson.version);

  // Format command
  program
    .command("format")
    .description("Format BPL source files")
    .option("--write", "Write changes to file")
    .option("-u", "Ignore unknown files")
    .argument("<files...>", "Files to format")
    .action((files, options) => {
      formatFiles(files, options.write || false, options.u || false);
      process.exit(0);
    });

  // Dependency Graph command
  program
    .command("deps-graph")
    .description("Generate dependency graph image")
    .argument("<file>", "Entry file")
    .argument("[output]", "Output image file", "deps.png")
    .action((file, output) => {
      const dot = generateDependencyGraph(file);
      try {
        const result = spawnSync("dot", ["-Tpng", "-o", output], {
          input: dot,
          stdio: ["pipe", "inherit", "inherit"],
        });
        if (result.error) {
          throw result.error;
        }
        Logger.info(`Dependency graph saved to ${output}`);
      } catch (e) {
        Logger.error(
          "Failed to generate dependency graph. Is 'dot' (Graphviz) installed?",
        );
        process.exit(1);
      }
      process.exit(0);
    });

  // Main compilation options
  program
    .option("-r, --run", "Run the executable")
    .option("-q, --quiet", "Suppress output")
    .option("-p, --print-asm", "Print assembly")
    .option("--print-ast", "Print AST")
    .option("--print-types", "Print type information for each expression")
    .option("-s, --static", "Static linking")
    .option("-d, --dynamic", "Dynamic linking")
    .option("-g, --gdb", "Run with GDB")
    .option("-l, --lib", "Compile as library (don't link)")
    .option("--no-cleanup", "Don't cleanup temporary files")
    .option("-O, --optimization <level>", "Optimization level", parseInt)
    .option("--deps", "Show dependency graph")
    .option("--graph", "Show dependency graph (alias)")
    .option("--stack-trace", "Enable runtime stack traces")
    .option("-e, --eval <code>", "Evaluate code")
    .option(
      "-t, --target <triple>",
      "Target triple (e.g., x86_64-linux, arm64-darwin)",
    )
    .argument("[file]", "Source file")
    .argument("[libs...]", "Extra object files to link")
    .action(() => {});

  program.parse(process.argv);

  const options = program.opts();
  const args = program.args;

  if (options.run) config.shouldRun = true;
  if (options.quiet) {
    config.quiet = true;
    Logger.setQuiet(true);
  }
  if (options.printAsm) {
    config.printAsm = true;
    config.cleanupAsm = false;
  }
  if (options.printAst) config.printAst = true;
  if (options.printTypes) config.printTypes = true;
  if (options.static) config.linkMode = "static";
  if (options.dynamic) config.linkMode = "dynamic";
  if (options.gdb) config.shouldGdb = true;
  if (options.lib) {
    config.compileLib = true;
    config.cleanupO = false;
  }
  if (options.cleanup === false) {
    config.cleanupAsm = false;
    config.cleanupO = false;
  }
  if (options.optimization !== undefined && !isNaN(options.optimization)) {
    config.optimizationLevel = options.optimization;
  }
  if (options.deps || options.graph) config.showDeps = true;
  if (options.stackTrace) config.enableStackTrace = true;
  if (options.target) config.target = options.target;

  if (options.eval) {
    config.isEval = true;
    config.sourceCode = options.eval;
    config.sourceFile = `eval_${Date.now()}_${Math.floor(Math.random() * 10000)}.x`;
    writeFileSync(config.sourceFile, config.sourceCode ?? "");
    if (args.length > 0) {
      config.extraLibs.push(...args);
    }
  } else {
    if (args.length > 0) {
      config.sourceFile = args[0] ?? null;
      if (args.length > 1) {
        config.extraLibs.push(...args.slice(1));
      }
    }
  }

  if (!config.sourceFile) {
    program.help();
  }

  return config;
}
