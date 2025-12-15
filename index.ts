#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import { Compiler } from "./compiler";
import { PackageManager } from "./compiler/middleend/PackageManager";
import { lexWithGrammar } from "./compiler/frontend/GrammarLexer";
import { Parser } from "./compiler/frontend/Parser";
import { Formatter } from "./compiler/formatter/Formatter";
import { TypeChecker } from "./compiler/middleend/TypeChecker";
import { ASTPrinter } from "./compiler/common/ASTPrinter";
import { CodeGenerator } from "./compiler/backend/CodeGenerator";
import { CompilerError } from "./compiler/common/CompilerError";
import { spawnSync } from "child_process";

const program = new Command();

const packageJson = require("./package.json");

function getHostDefaults() {
  const platform = os.platform();
  const arch = os.arch();

  let target: string | undefined;

  if (platform === "linux") {
    if (arch === "x64") target = "x86_64-pc-linux-gnu";
    else if (arch === "arm64") target = "aarch64-unknown-linux-gnu";
  } else if (platform === "darwin") {
    if (arch === "arm64") target = "arm64-apple-darwin";
    else if (arch === "x64") target = "x86_64-apple-darwin";
  } else if (platform === "win32") {
    if (arch === "x64") target = "x86_64-pc-windows-gnu";
  }

  return { target };
}

program
  .name("bpl")
  .description(packageJson.description ?? "BPL3 Compiler")
  .version(packageJson.version);

program
  .argument("<files...>", "source file(s) to compile")
  .option("-o, --output <file>", "output file path")
  .option("--emit <type>", "emit type: llvm, ast, tokens, formatted", "llvm")
  .option(
    "--target <triple>",
    "target triple for clang (e.g. x86_64-pc-windows-gnu)",
  )
  .option("--sysroot <path>", "sysroot path for cross-compilation")
  .option("--cpu <cpu>", "target CPU for clang (e.g. znver4)")
  .option("--march <arch>", "target architecture for clang (e.g. arm64)")
  .option(
    "--clang-flag <flag...>",
    "additional flags forwarded directly to clang",
  )
  .option("-l, --lib <lib...>", "libraries to link with")
  .option("-L, --lib-path <path...>", "library search paths")
  .option("--object <file...>", "object files to link (.o, .ll, etc.)")
  .option("--run", "run the generated code")
  .option("-v, --verbose", "enable verbose output")
  .option("--cache", "enable incremental compilation with module caching")
  .option("--write", "write formatted output back to file (only for formatted)")
  .action((files, options) => {
    if (!Array.isArray(files)) {
      files = [files];
    }

    if (options.emit === "formatted") {
      let hasError = false;
      for (const filePath of files) {
        try {
          processFile(filePath, options);
        } catch (e) {
          console.error(`Error processing ${filePath}: ${e}`);
          hasError = true;
        }
      }
      if (hasError) process.exit(1);
      return;
    }

    if (files.length > 1) {
      console.error(
        "Error: Multiple input files are only supported for formatting.",
      );
      process.exit(1);
    }

    processFile(files[0], options);
  });

function processFile(filePath: string, options: any) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // Check if file has imports - if so, use module resolution
    const hasImports = content.includes("import ");

    if (hasImports) {
      // Use the new Compiler API with module resolution/caching
      const compiler = new Compiler({
        filePath,
        outputPath: options.output,
        emitType: options.emit,
        verbose: options.verbose,
        resolveImports: !options.cache, // Use module resolution if not caching
        useCache: options.cache, // Use caching if enabled
        objectFiles: options.object || undefined,
        libraries: options.lib || undefined,
        libraryPaths: options.libPath || undefined,
        target: options.target,
        sysroot: options.sysroot,
        clangFlags: options.clangFlag,
      });

      const result = compiler.compile(content);

      if (!result.success) {
        if (result.errors) {
          for (const error of result.errors) {
            console.error(error.toString());
          }
        }
        process.exit(1);
      }

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
          const execPath = options.output || filePath.replace(/\.[^/.]+$/, "");
          const runResult = spawnSync(execPath, [], {
            stdio: "inherit",
          });

          if (runResult.status !== 0) {
            process.exit(runResult.status ?? 1);
          }
        }
        return;
      }

      if (result.output) {
        const outputPath =
          options.output || filePath.replace(/\.[^/.]+$/, "") + ".ll";
        fs.writeFileSync(outputPath, result.output);

        if (options.verbose || (!options.run && options.emit === "llvm")) {
          console.log(`LLVM IR written to ${outputPath}`);
        }

        if (options.emit === "llvm") {
          compileBinaryAndRun(outputPath, options);
        }
      }

      return;
    }

    // Original single-file compilation path

    const tokens = lexWithGrammar(content, filePath);

    if (options.emit === "tokens") {
      console.log(JSON.stringify(tokens, null, 2));
      return;
    }

    // 2. Parsing
    const parser = new Parser(content, filePath, tokens);
    const ast = parser.parse();

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
    const typeChecker = new TypeChecker();
    typeChecker.checkProgram(ast);

    if (options.verbose) {
      console.log("Semantic analysis completed successfully.");
      const printer = new ASTPrinter();
      console.log(printer.print(ast));
    }

    // 4. Code Generation
    const generator = new CodeGenerator();
    const ir = generator.generate(ast);

    if (options.emit === "llvm" && !options.output && !options.run) {
      // If no output file and not running, maybe print to stdout?
      // Or default to file.
      // Current behavior was writing to file.
    }

    const outputPath =
      options.output || filePath.replace(/\.[^/.]+$/, "") + ".ll";
    fs.writeFileSync(outputPath, ir);

    if (options.verbose || (!options.run && options.emit === "llvm")) {
      console.log(`LLVM IR written to ${outputPath}`);
    }

    // 5. Compile & Run
    if (options.emit === "llvm") {
      compileBinaryAndRun(outputPath, options);
    }
  } catch (e) {
    if (e instanceof CompilerError) {
      console.error(e.toString());
    } else {
      console.error(`Error: ${e}`);
      if (e instanceof Error && e.stack && options.verbose) {
        console.error(e.stack);
      }
    }
    process.exit(1);
  }
}

function compileBinaryAndRun(outputPath: string, options: any) {
  const execPath = outputPath.replace(/\.ll$/, "");
  const hostDefaults = getHostDefaults();

  if (options.verbose) {
    console.log("---------------------------------------------");
    console.log(`Compiling LLVM IR to executable with clang...`);
    console.log("---------------------------------------------");
  }

  const clangArgs = ["-Wno-override-module"];

  const target = options.target ?? hostDefaults.target;
  if (target) {
    clangArgs.push("-target", target);
    if (options.verbose && !options.target) {
      console.log(`Using host default target: ${target}`);
    }
  }

  if (options.sysroot) {
    clangArgs.push("--sysroot", options.sysroot);
  }

  if (options.cpu) {
    clangArgs.push(`-mcpu=${options.cpu}`);
  }

  if (options.march) {
    clangArgs.push(`-march=${options.march}`);
  }

  const extraClangFlags = options.clangFlag
    ? Array.isArray(options.clangFlag)
      ? options.clangFlag
      : [options.clangFlag]
    : [];

  for (const flag of extraClangFlags) {
    clangArgs.push(flag);
  }

  clangArgs.push(outputPath, "-o", execPath);

  if (options.verbose) {
    console.log(`clang ${clangArgs.join(" ")}`);
  }

  const compileResult = spawnSync("clang", clangArgs, {
    stdio: options.verbose ? "inherit" : "pipe",
  });

  if (compileResult.status !== 0) {
    console.error("Failed to compile LLVM IR with clang");
    if (!options.verbose && compileResult.stderr) {
      console.error(compileResult.stderr.toString());
    }
    process.exit(compileResult.status ?? 1);
  }

  if (options.verbose) {
    console.log(`Executable created: ${execPath}`);
  }

  if (options.run) {
    if (options.verbose) {
      console.log("---------------------------------------------");
      console.log(`Running executable: ${execPath}`);
      console.log("---------------------------------------------");
    }

    const runResult = spawnSync(execPath, [], { stdio: "inherit" });

    // Note: We no longer delete the executable after running,
    // so it remains available (like standard compilers).

    if (runResult.status !== 0) {
      if (options.verbose) {
        console.log("---------------------------------------------");
        console.error(`Program exited with code ${runResult.status}`);
        console.log("---------------------------------------------");
      }
      process.exit(runResult.status ?? 1);
    } else if (options.verbose) {
      console.log("---------------------------------------------");
    }
  }
}

// Package management commands
program
  .command("format [files...]")
  .description("Format BPL source files")
  .option("-w, --write", "write formatted output back to file")
  .option("-v, --verbose", "enable verbose output")
  .action((files, options) => {
    if (!files || files.length === 0) {
      console.error("Error: No files specified.");
      process.exit(1);
    }

    let totalFiles = 0;
    let updatedFiles = 0;
    let hasError = false;

    for (const filePath of files) {
      totalFiles++;
      try {
        if (!fs.existsSync(filePath)) {
          console.error(`Error: File not found: ${filePath}`);
          hasError = true;
          continue;
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const tokens = lexWithGrammar(content, filePath);
        const parser = new Parser(content, filePath, tokens);
        const ast = parser.parse();
        const formatter = new Formatter();
        const formatted = formatter.format(ast);

        if (options.write) {
          if (content !== formatted) {
            fs.writeFileSync(filePath, formatted);
            updatedFiles++;
            console.log(`${filePath} \x1b[37m(changed)\x1b[0m`);
          } else {
            console.log(`${filePath} \x1b[90m(unchanged)\x1b[0m`);
          }
        } else {
          console.log(formatted);
        }
      } catch (e) {
        console.error(
          `Error processing ${filePath}: ${e instanceof Error ? e.message : e}`,
        );
        hasError = true;
      }
    }

    if (options.write) {
      console.log(`\nFormatted ${totalFiles} files, ${updatedFiles} updated`);
    }

    if (hasError) process.exit(1);
  });

program
  .command("pack [dir]")
  .description("Create a distributable package from a BPL project")
  .option("-o, --output <dir>", "output directory for the package")
  .action((dir, options) => {
    try {
      const packageDir = dir || process.cwd();
      const pm = new PackageManager();
      const tarball = pm.pack(packageDir, options.output);
      console.log(`\nPackage ready: ${tarball}`);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program
  .command("install [package]")
  .description("Install a BPL package")
  .option("-g, --global", "install package globally")
  .option("-v, --verbose", "verbose output")
  .action((pkg, options) => {
    try {
      const pm = new PackageManager();

      if (!pkg) {
        // Install dependencies from bpl.json in current directory
        if (!fs.existsSync("bpl.json")) {
          console.error("No bpl.json found in current directory");
          process.exit(1);
        }

        const manifest = pm.loadManifest(process.cwd());
        const deps = { ...manifest.dependencies, ...manifest.devDependencies };

        if (Object.keys(deps).length === 0) {
          console.log("No dependencies to install");
          return;
        }

        console.log(`Installing ${Object.keys(deps).length} dependencies...`);
        for (const [name, version] of Object.entries(deps)) {
          pm.install(`${name}-${version}.tgz`, options);
        }
      } else {
        pm.install(pkg, options);
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List installed packages")
  .option("-g, --global", "list global packages")
  .action((options) => {
    try {
      const pm = new PackageManager();
      const packages = pm.list(options);

      if (packages.length === 0) {
        console.log("No packages installed");
        return;
      }

      console.log(
        `\nInstalled packages (${options.global ? "global" : "local"}):\n`,
      );
      for (const pkg of packages) {
        console.log(`  ${pkg.manifest.name}@${pkg.manifest.version}`);
        if (pkg.manifest.description) {
          console.log(`    ${pkg.manifest.description}`);
        }
        if (pkg.path) {
          console.log(`    Location: ${pkg.path}`);
        }
      }
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program
  .command("init [name]")
  .description("Initialize a new BPL project")
  .action((name) => {
    try {
      const pm = new PackageManager();
      pm.init(process.cwd(), name);
      console.log("Initialized new BPL project");
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program
  .command("uninstall <package>")
  .alias("remove")
  .description("Uninstall a package")
  .option("-g, --global", "uninstall global package")
  .action((pkg, options) => {
    try {
      const pm = new PackageManager();
      pm.uninstall(pkg, options);
      console.log(`Uninstalled ${pkg}`);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
