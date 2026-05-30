/**
 * Linker for BPL3
 *
 * Manages the linking phase:
 * - Combines LLVM IR from multiple modules
 * - Links with pre-compiled object files
 * - Verifies symbol availability
 * - Manages compiler invocation for final executable generation
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { getCompilerDriver } from "../common/CompilerDriver";
import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import { getNativeLinkerFlags } from "../common/NativeLinkerFlags";
import { LinkerSymbolTable } from "./LinkerSymbolTable";
import { ObjectFileParser } from "./ObjectFileParser";

export interface LinkOptions {
  /** LLVM IR files to link */
  irFiles: string[];

  /** Object files to link (.o, .a, .ll) */
  objectFiles?: string[];

  /** Libraries to link (-l<lib>) */
  libraries?: string[];

  /** Library search paths (-L<path>) */
  libraryPaths?: string[];

  /** Output executable path */
  outputPath: string;

  /** Target triple (e.g., x86_64-pc-linux-gnu) */
  target?: string;

  /** Sysroot for cross-compilation */
  sysroot?: string;

  /** Additional flags passed to the selected compiler driver */
  clangFlags?: string[];

  /** Optimization level (0-3) forwarded to the compiler driver */
  optimizationLevel?: number;

  /** Enable verbose output */
  verbose?: boolean;
}

export class Linker {
  private linkerSymbolTable: LinkerSymbolTable;

  constructor() {
    this.linkerSymbolTable = new LinkerSymbolTable();
  }

  /**
   * Link multiple LLVM IR files with object files
   */
  link(options: LinkOptions): boolean {
    try {
      if (options.verbose) {
        compilerLog.info("Starting linking process...");
      }

      this.validateOutputPath(options.outputPath);
      this.validateObjectFiles(options.objectFiles || []);

      // Merge all LLVM IR files
      const mergedIR = this.mergeIRFiles(options.irFiles, options.verbose);

      // Register symbols from object files
      if (options.objectFiles && options.objectFiles.length > 0) {
        if (options.verbose) {
          compilerLog.info(
            `Registering ${options.objectFiles.length} object file(s)...`,
          );
        }

        for (const objFile of options.objectFiles) {
          try {
            ObjectFileParser.registerObjectFile(
              objFile,
              this.linkerSymbolTable,
            );
            if (options.verbose) {
              compilerLog.info(`  Registered: ${objFile}`);
            }
          } catch (e) {
            if (options.verbose) {
              compilerLog.warn(`Could not register ${objFile}: ${e}`);
            }
          }
        }
      }

      // Verify all symbols are available
      if (options.verbose) {
        compilerLog.info("Verifying symbols...");
      }

      const errors = this.linkerSymbolTable.verifySymbols();
      if (errors.length > 0) {
        compilerLog.error("Linker errors:");
        for (const error of errors) {
          compilerLog.error(`  ${error.message}`);
        }
        return false;
      }

      // Compile with the selected LLVM-capable compiler driver
      if (options.verbose) {
        compilerLog.info("Compiling to executable with compiler driver...");
      }

      return this.compileWithClang(mergedIR, options);
    } catch (e) {
      compilerLog.error(`Linker error: ${e}`);
      return false;
    }
  }

  private validateObjectFiles(objectFiles: string[]): void {
    const supportedExtensions = new Set([".ll", ".o", ".obj", ".a"]);

    for (const objectFile of objectFiles) {
      if (!fs.existsSync(objectFile)) {
        throw new CompilerError(
          `Object file not found: ${objectFile}`,
          "Check the --object path or remove it from the build command.",
          {
            file: objectFile,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      if (!fs.statSync(objectFile).isFile()) {
        throw new CompilerError(
          `Object path is not a file: ${objectFile}`,
          "Pass a regular object, archive, or LLVM IR file to --object.",
          {
            file: objectFile,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }

      const ext = path.extname(objectFile).toLowerCase();
      if (!supportedExtensions.has(ext)) {
        throw new CompilerError(
          `Unsupported object file format: ${ext || "(none)"}`,
          "Use a supported object input: .ll, .o, .obj, or .a.",
          {
            file: objectFile,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 1,
          },
        );
      }
    }
  }

  private validateOutputPath(outputPath: string): void {
    const location = {
      file: outputPath,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    const existingOutput = this.tryLstat(outputPath);
    if (existingOutput?.isSymbolicLink()) {
      throw new CompilerError(
        `Output path is a symbolic link: ${outputPath}`,
        "Choose a regular file path for the linked executable.",
        location,
      );
    }

    if (existingOutput?.isDirectory()) {
      throw new CompilerError(
        `Output path is a directory: ${outputPath}`,
        "Choose a file path for the linked executable.",
        location,
      );
    }

    if (existingOutput && !existingOutput.isFile()) {
      throw new CompilerError(
        `Output path is not a regular file: ${outputPath}`,
        "Choose a regular file path for the linked executable.",
        location,
      );
    }

    const outputDir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(outputDir)) {
      throw new CompilerError(
        `Output directory not found: ${outputDir}`,
        "Create the output directory or choose an existing parent directory.",
        location,
      );
    }
    if (!fs.statSync(outputDir).isDirectory()) {
      throw new CompilerError(
        `Output parent path is not a directory: ${outputDir}`,
        "Choose an output path whose parent is a directory.",
        location,
      );
    }
  }

  private tryLstat(filePath: string): fs.Stats | null {
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

  /**
   * Merge multiple LLVM IR files into one
   */
  private mergeIRFiles(irFiles: string[], verbose?: boolean): string {
    if (irFiles.length === 0) {
      throw new CompilerError(
        "No IR files provided for linking",
        "Internal compiler error: Linker called without input files.",
        {
          file: "linker",
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    for (const irFile of irFiles) {
      this.validateLinkInputFile(
        irFile,
        "IR file not found",
        "IR path is not a file",
        "Check that every compiler-generated LLVM IR file exists before linking.",
      );
    }

    if (irFiles.length === 1) {
      // Single file, just return its content
      return fs.readFileSync(irFiles[0]!, "utf-8");
    }

    // Multiple files: concatenate with module linking
    const modules: string[] = [];

    for (const irFile of irFiles) {
      const content = fs.readFileSync(irFile, "utf-8");
      modules.push(content);
    }

    if (modules.length === 0) {
      throw new CompilerError(
        "No valid IR files found",
        "Check that the input files exist and are readable.",
        {
          file: "linker",
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (verbose) {
      compilerLog.info(`Merging ${modules.length} LLVM IR file(s)...`);
    }

    // Simple merge: combine all declarations and definitions
    // In production, would use llvm-link tool for proper merging
    return modules.join("\n\n");
  }

  private validateLinkInputFile(
    filePath: string,
    missingMessage: string,
    notFileMessage: string,
    hint: string,
  ): void {
    if (!fs.existsSync(filePath)) {
      throw new CompilerError(`${missingMessage}: ${filePath}`, hint, {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      });
    }

    if (!fs.statSync(filePath).isFile()) {
      throw new CompilerError(`${notFileMessage}: ${filePath}`, hint, {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      });
    }
  }

  /**
   * Compile merged IR to executable with the selected compiler driver.
   */
  private compileWithClang(mergedIR: string, options: LinkOptions): boolean {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-link-"));
    const tmpIRFile = path.join(tempDir, "merged.ll");

    try {
      fs.writeFileSync(tmpIRFile, mergedIR);

      if (options.verbose) {
        compilerLog.info(`Merged IR written to: ${tmpIRFile}`);
      }

      // Build clang command
      const clangArgs: string[] = [];

      // Add target if specified
      if (options.target) {
        clangArgs.push(`--target=${options.target}`);
      }

      // Add sysroot if specified
      if (options.sysroot) {
        clangArgs.push(`--sysroot=${options.sysroot}`);
      }

      if (options.optimizationLevel !== undefined) {
        clangArgs.push(`-O${options.optimizationLevel}`);
      }

      // Add library search paths
      if (options.libraryPaths && options.libraryPaths.length > 0) {
        for (const libPath of options.libraryPaths) {
          clangArgs.push(`-L${libPath}`);
        }
      }

      // Add IR file
      clangArgs.push(tmpIRFile);

      // Add object files
      if (options.objectFiles && options.objectFiles.length > 0) {
        for (const objFile of options.objectFiles) {
          if (fs.existsSync(objFile)) {
            clangArgs.push(objFile);
          }
        }
      }

      // Add libraries
      if (options.libraries && options.libraries.length > 0) {
        for (const lib of options.libraries) {
          clangArgs.push(`-l${lib}`);
        }
      }

      clangArgs.push(...getNativeLinkerFlags());

      // Add output
      clangArgs.push("-o");
      clangArgs.push(options.outputPath);

      // Add custom clang flags
      if (options.clangFlags && options.clangFlags.length > 0) {
        clangArgs.push(...options.clangFlags);
      }

      const compilerCommand = getCompilerDriver(options.target);

      if (options.verbose) {
        compilerLog.info(`Running: ${compilerCommand} ${clangArgs.join(" ")}`);
      }

      const result = spawnSync(compilerCommand, clangArgs, {
        stdio: options.verbose ? "inherit" : "pipe",
      });

      if (result.status !== 0) {
        const detail =
          result.stderr?.toString() ||
          result.error?.message ||
          "Unknown compiler driver error";
        if (!options.verbose) {
          compilerLog.error(detail);
        }
        return false;
      }

      if (options.verbose) {
        compilerLog.info(`Successfully created: ${options.outputPath}`);
      }

      return true;
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        if (options.verbose) {
          compilerLog.warn(`Could not clean up temporary directory: ${tempDir}`);
        }
      }
    }
  }

  /**
   * Get the linker symbol table
   */
  getLinkerSymbolTable(): LinkerSymbolTable {
    return this.linkerSymbolTable;
  }
}
