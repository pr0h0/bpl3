#!/usr/bin/env node
import { spawnSync } from "child_process";
import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Compiler } from "./compiler";
import { CodeGenerator } from "./compiler/backend/CodeGenerator";
import { CompilerError } from "./compiler/common/CompilerError";
import { DiagnosticFormatter } from "./compiler/common/DiagnosticFormatter";
import { resolveBplPath } from "./compiler/common/PathResolver";
import { SourceManager } from "./compiler/common/SourceManager";
import { Formatter } from "./compiler/formatter/Formatter";
import { lexWithGrammar } from "./compiler/frontend/GrammarLexer";
import { Parser } from "./compiler/frontend/Parser";
import { PackageManager } from "./compiler/middleend/PackageManager";
import { TypeChecker } from "./compiler/middleend/TypeChecker";
import { Linter } from "./compiler/linter/Linter";
import { DocumentationGenerator } from "./compiler/docs/DocumentationGenerator";

const program = new Command();

// Create diagnostic formatter for CLI output
const diagnosticFormatter = new DiagnosticFormatter({
  colorize: process.env.NO_COLOR !== "1",
  contextLines: 3,
  showCodeSnippets: true,
});

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

// Embedded completion scripts for when running as compiled binary
function getBashCompletion(): string {
  // Try to load from file first using BPL_HOME
  const completionPath = resolveBplPath("completions", "bpl-completion.bash");
  if (fs.existsSync(completionPath)) {
    return fs.readFileSync(completionPath, "utf-8");
  }

  // Fallback: embedded script
  return `#!/usr/bin/env bash
# Bash completion script for bpl CLI
# Installation:
#   1. Copy this file to /etc/bash_completion.d/bpl or ~/.local/share/bash-completion/completions/bpl
#   2. Or source it in your ~/.bashrc: source /path/to/bpl-completion.bash
#   3. Reload your shell or run: source ~/.bashrc

_bpl_completion() {
    local cur prev opts base
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # Main commands
    local commands="format init pack install list uninstall completion help lint"
    
    # Global options (work with file arguments and commands)
    local global_opts="-e --eval --stdin -o --output --emit --target --sysroot --cpu --march --clang-flag -l --lib -L --lib-path --object --run -v --verbose --cache --write -h --help -V --version --dwarf"
    
    # Emit types
    local emit_types="llvm ast tokens formatted"

    # If current word starts with ./ or ../ or /, always complete files
    if [[ "$cur" == ./* ]] || [[ "$cur" == ../* ]] || [[ "$cur" == /* ]]; then
        COMPREPLY=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
        return 0
    fi

    # Check if we're after a specific option that needs a value
    case "\${prev}" in
        -o|--output)
            COMPREPLY=( $(compgen -f -- "\${cur}") )
            return 0
            ;;
        --emit)
            COMPREPLY=( $(compgen -W "\${emit_types}" -- "\${cur}") )
            return 0
            ;;
        --target)
            local targets="x86_64-pc-linux-gnu aarch64-unknown-linux-gnu arm64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu"
            COMPREPLY=( $(compgen -W "\${targets}" -- "\${cur}") )
            return 0
            ;;
        --sysroot|--lib-path|-L)
            COMPREPLY=( $(compgen -d -- "\${cur}") )
            return 0
            ;;
        --object)
            COMPREPLY=( $(compgen -f -X '!*.@(o|ll|bc)' -- "\${cur}") )
            return 0
            ;;
        -l|--lib|--cpu|--march|--clang-flag|-e|--eval)
            return 0
            ;;
    esac

    # Determine which command we're in (if any)
    local command=""
    local i
    for ((i=1; i<COMP_CWORD; i++)); do
        local word="\${COMP_WORDS[i]}"
        if [[ " $commands " =~ " $word " ]]; then
            command="$word"
            break
        fi
    done

    # If we have a command, complete based on that command
    if [[ -n "$command" ]]; then
        case "$command" in
            format)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "-w --write -v --verbose" -- "\${cur}") )
                else
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
                fi
                return 0
                ;;
                lint)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "-v --verbose" -- "\${cur}") )
                else
                    COMPREPLY=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
                fi
                return 0
                ;;            init|pack|list)
                COMPREPLY=( $(compgen -W "-v --verbose" -- "\${cur}") )
                return 0
                ;;
            install)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "-v --verbose" -- "\${cur}") )
                else
                    COMPREPLY=( $(compgen -f -- "\${cur}") )
                fi
                return 0
                ;;
            uninstall)
                if [[ "$cur" == -* ]]; then
                    COMPREPLY=( $(compgen -W "-v --verbose" -- "\${cur}") )
                fi
                return 0
                ;;
            completion)
                COMPREPLY=( $(compgen -W "bash zsh" -- "\${cur}") )
                return 0
                ;;
            help)
                COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
                return 0
                ;;
        esac
    fi

    # No command yet, complete with commands or options or files
    if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "\${global_opts}" -- "\${cur}") )
    else
        # Complete with both commands and .bpl files
        COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
        COMPREPLY+=( $(compgen -f -X '!*.bpl' -- "\${cur}") )
        # Also add directories for navigation
        COMPREPLY+=( $(compgen -d -- "\${cur}") )
    fi

    return 0
}

complete -F _bpl_completion bpl
`;
}

function getZshCompletion(): string {
  // Try to load from file first using BPL_HOME
  const completionPath = resolveBplPath("completions", "_bpl");
  if (fs.existsSync(completionPath)) {
    return fs.readFileSync(completionPath, "utf-8");
  }

  // Fallback: embedded script
  return `#compdef bpl
# Zsh completion script for bpl CLI

_bpl() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    local -a commands
    commands=(
        'format:Format BPL source files'
        'lint:Lint BPL source files'
        'init:Initialize a new BPL package'
        'pack:Package a BPL project'
        'install:Install a BPL package'
        'list:List installed BPL packages'
        'uninstall:Uninstall a BPL package'
        'completion:Generate shell completion scripts'
        'help:Display help information'
    )

    local -a global_options
    global_options=(
        '-e[Evaluate BPL code]:code'
        '--eval[Evaluate BPL code]:code'
        '--stdin[Read BPL code from stdin]'
        '-o[Output file]:file:_files'
        '--output[Output file]:file:_files'
        '--emit[Emit type]:type:(llvm ast tokens formatted)'
        '--dwarf[Generate DWARF debug information]'
        '--target[Target triple]:triple:(x86_64-pc-linux-gnu aarch64-unknown-linux-gnu arm64-apple-darwin x86_64-apple-darwin x86_64-pc-windows-gnu)'
        '--sysroot[Sysroot path]:path:_directories'
        '--cpu[Target CPU]:cpu'
        '--march[Target arch]:arch'
        '--clang-flag[Clang flags]:flag'
        '-l[Libraries]:library'
        '--lib[Libraries]:library'
        '-L[Library paths]:path:_directories'
        '--lib-path[Library paths]:path:_directories'
        '--object[Object files]:file:_files -g "*.{o,ll,bc}"'
        '--run[Run the code]'
        '-v[Verbose output]'
        '--verbose[Verbose output]'
        '--cache[Enable caching]'
        '--write[Write to file]'
        '-h[Help]'
        '--help[Help]'
        '-V[Version]'
        '--version[Version]'
    )

    _arguments -C \\
        '1: :->command' \\
        '*::arg:->args' \\
        $global_options

    case $state in
        command)
            _alternative \\
                'commands:command:_describe "command" commands' \\
                'files:BPL file:_files -g "*.bpl"'
            ;;
        args)
            case $words[1] in
                format)
                    _arguments \\
                        '-w[Write to file]' \\
                        '--write[Write to file]' \\
                        '-v[Verbose]' \\
                        '--verbose[Verbose]' \\
                        '*:file:_files -g "*.bpl"'
                    ;;
                lint)
                    _arguments \\
                        '-v[Verbose]' \\
                        '--verbose[Verbose]' \\
                        '*:file:_files -g "*.bpl"'
                    ;;
                init|pack|list)
                    _arguments \\
                        '-v[Verbose]' \\
                        '--verbose[Verbose]'
                    ;;
                install)
                    _arguments \\
                        '-v[Verbose]' \\
                        '--verbose[Verbose]' \\
                        '1:package:_files'
                    ;;
                uninstall)
                    _arguments \\
                        '-v[Verbose]' \\
                        '--verbose[Verbose]' \\
                        '1:package:'
                    ;;
                completion)
                    _arguments \\
                        '1:shell:(bash zsh)'
                    ;;
                help)
                    _describe 'command' commands
                    ;;
                *)
                    _files -g "*.bpl"
                    ;;
            esac
            ;;
    esac
}

_bpl "$@"
`;
}

program
  .name("bpl")
  .description(packageJson.description ?? "BPL3 Compiler")
  .version(packageJson.version);

program
  .argument("[files...]", "source file(s) to compile")
  .option("-e, --eval <code>", "evaluate BPL code passed as string")
  .option("--stdin", "read BPL code from stdin")
  .option("-o, --output <file>", "output file path")
  .option("--emit <type>", "emit type: llvm, ast, tokens, formatted", "llvm")
  .option("-g, --dwarf", "generate DWARF debug information")
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
  .option("--no-prelude", "do not load implicit primitives")
  .action((files, options) => {
    // Handle --eval option
    if (options.eval) {
      processCode(options.eval, "eval-42069", options);
      return;
    }

    // Handle --stdin option
    if (options.stdin) {
      let stdinData = "";
      process.stdin.setEncoding("utf-8");

      process.stdin.on("data", (chunk) => {
        stdinData += chunk;
      });

      process.stdin.on("end", () => {
        processCode(stdinData, "stdin-42069", options);
      });

      return;
    }

    // Handle regular file arguments
    if (!files || files.length === 0) {
      console.error("Error: No input files specified");
      process.exit(1);
    }

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
      if (options.emit === "formatted") {
        console.error(
          "Error: Multiple input files are only supported for formatting.",
        );
        process.exit(1);
      }
      // If not formatting, treat extra files as arguments for the program
      const programArgs = files.slice(1);
      processFile(files[0], options, programArgs);
      return;
    }

    processFile(files[0], options);
  });

function processFile(filePath: string, options: any, programArgs?: string[]) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    processCodeInternal(content, filePath, options, programArgs);
  } catch (e) {
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
}

function processCode(
  code: string,
  sourceLabel: string,
  options: any,
  programArgs?: string[],
) {
  try {
    // Register source for error reporting
    SourceManager.setSource(sourceLabel, code);
    processCodeInternal(code, sourceLabel, options, programArgs);
  } catch (e) {
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
}

function processCodeInternal(
  content: string,
  filePath: string,
  options: any,
  programArgs?: string[],
) {
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
      dwarf: options.dwarf,
    });

    const result = compiler.compile(content);

    if (!result.success) {
      if (result.errors) {
        console.error(diagnosticFormatter.formatErrors(result.errors));
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
        const execPathBase =
          options.output || filePath.replace(/\.[^/.]+$/, "");
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

    if (result.output) {
      const outputPath =
        options.output || filePath.replace(/\.[^/.]+$/, "") + ".ll";
      fs.writeFileSync(outputPath, result.output);

      if (options.verbose || (!options.run && options.emit === "llvm")) {
        console.log(`LLVM IR written to ${outputPath}`);
      }

      if (
        options.emit === "llvm" ||
        options.run ||
        options.emit === "binary" ||
        !options.emit
      ) {
        compileBinaryAndRun(outputPath, options, programArgs);
      }
    }

    return;
  }

  // Original single-file compilation path

  if (options.verbose) {
    console.time("Lexing");
  }
  let tokens: any[] = [];
  try {
    tokens = lexWithGrammar(content, filePath);
  } catch (e) {
    // Lexer might fail on new syntax not yet in grammar.bpl
    // Proceed with parser only (comments will be missing)
  }
  if (options.verbose) {
    console.timeEnd("Lexing");
  }

  if (options.emit === "tokens") {
    console.log(JSON.stringify(tokens, null, 2));
    return;
  }

  // 2. Parsing
  if (options.verbose) {
    console.time("Parsing");
  }
  const parser = new Parser(content, filePath, tokens);
  const ast = parser.parse(true);
  if (options.verbose) {
    console.timeEnd("Parsing");
  }

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
  if (options.verbose) {
    console.time("TypeChecking");
  }
  const typeChecker = new TypeChecker({
    skipImportResolution: options.prelude === false,
  });
  typeChecker.checkProgram(ast);
  if (options.verbose) {
    console.timeEnd("TypeChecking");
  }

  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    console.error(diagnosticFormatter.formatErrors(typeErrors));
    process.exit(1);
  }

  if (options.verbose) {
    console.log("Semantic analysis completed successfully.");
  }

  // 4. Code Generation
  if (options.verbose) {
    console.time("CodeGeneration");
  }
  const hostDefaults = getHostDefaults();
  const generator = new CodeGenerator({
    target: options.target || hostDefaults.target,
    dwarf: options.dwarf,
  });
  const ir = generator.generate(ast, filePath);
  if (options.verbose) {
    console.timeEnd("CodeGeneration");
  }

  // Determine output path for LLVM IR
  // If output is specified, use it as base but ensure .ll extension for IR
  // This prevents overwriting the executable if the user specified the executable name
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

function compileBinaryAndRun(
  outputPath: string,
  options: any,
  programArgs?: string[],
) {
  const execPathBase = outputPath.replace(/\.ll$/, "");
  const execPath = path.isAbsolute(execPathBase)
    ? execPathBase
    : path.resolve(execPathBase);
  const hostDefaults = getHostDefaults();

  if (options.verbose) {
    console.log("---------------------------------------------");
    console.log(`Compiling LLVM IR to executable with clang...`);
    console.log("---------------------------------------------");
  }

  const clangArgs = ["-Wno-override-module"];

  if (options.dwarf) {
    clangArgs.push("-g");
  }

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

  if (options.libPath) {
    const paths = Array.isArray(options.libPath)
      ? options.libPath
      : [options.libPath];
    for (const p of paths) {
      clangArgs.push(`-L${p}`);
    }
  }

  if (options.lib) {
    const libs = Array.isArray(options.lib) ? options.lib : [options.lib];
    for (const l of libs) {
      clangArgs.push(`-l${l}`);
    }
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

    const runResult = spawnSync(execPath, programArgs || [], {
      stdio: "inherit",
    });

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

// Lint command
program
  .command("lint [files...]")
  .description("Lint BPL source files")
  .option("-v, --verbose", "enable verbose output")
  .action((files, options) => {
    if (!files || files.length === 0) {
      console.error("Error: No files specified.");
      process.exit(1);
    }

    const linter = new Linter();
    let hasErrors = false;

    for (const file of files) {
      try {
        if (!fs.existsSync(file)) {
          console.error(`Error: File not found: ${file}`);
          hasErrors = true;
          continue;
        }

        const content = fs.readFileSync(file, "utf-8");
        const tokens = lexWithGrammar(content, file);
        const parser = new Parser(content, file, tokens);
        const ast = parser.parse(true);

        const errors = linter.lint(ast);
        if (errors.length > 0) {
          hasErrors = true;
          console.error(diagnosticFormatter.formatErrors(errors));
        }
      } catch (e) {
        hasErrors = true;
        if (e instanceof CompilerError) {
          console.error(diagnosticFormatter.formatError(e));
        } else {
          console.error(`Error processing ${file}: ${e}`);
        }
      }
    }

    if (hasErrors) {
      process.exit(1);
    }
  });

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
        const ast = parser.parse(false);
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

program
  .command("completion [shell]")
  .description("Generate shell completion script (bash or zsh)")
  .action((shell) => {
    try {
      // Default to bash if no shell specified
      const targetShell = shell || "bash";

      if (targetShell !== "bash" && targetShell !== "zsh") {
        console.error("Error: Unsupported shell. Use 'bash' or 'zsh'.");
        process.exit(1);
      }

      // Try to read from file first using BPL_HOME
      const completionFile =
        targetShell === "bash"
          ? resolveBplPath("completions", "bpl-completion.bash")
          : resolveBplPath("completions", "_bpl");

      let content: string;

      if (fs.existsSync(completionFile)) {
        content = fs.readFileSync(completionFile, "utf-8");
      } else {
        // Use embedded completion scripts for compiled binary
        content =
          targetShell === "bash" ? getBashCompletion() : getZshCompletion();
      }

      console.log(content);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  });

program
  .command("docs")
  .argument("<file>", "Input BPL file")
  .description("Generate Markdown documentation for a BPL file and its imports")
  .option("-o, --output <file>", "Output file path (default: docs.md)")
  .action((file, options, command) => {
    try {
      const generator = new DocumentationGenerator();
      const markdown = generator.generate(file);

      const globalOpts = command.parent?.opts() || {};
      const outputPath = options.output || globalOpts.output || "docs.md";

      fs.writeFileSync(outputPath, markdown);
      console.log(`Documentation generated at ${outputPath}`);
    } catch (error: any) {
      console.error("Error generating documentation:", error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
