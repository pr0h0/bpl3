/**
 * Linker for BPL3
 *
 * Manages the linking phase:
 * - Combines LLVM IR from multiple modules
 * - Links with pre-compiled object files
 * - Verifies symbol availability
 * - Manages compiler invocation for final executable generation
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { LinkerSymbolTable } from "./LinkerSymbolTable";
import { ObjectFileParser } from "./ObjectFileParser";
import { CompilerError } from "../common/CompilerError";

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

  /** Additional clang flags */
  clangFlags?: string[];

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
        console.log("[Linker] Starting linking process...");
      }

      // Merge all LLVM IR files
      const mergedIR = this.mergeIRFiles(options.irFiles, options.verbose);

      // Register symbols from object files
      if (options.objectFiles && options.objectFiles.length > 0) {
        if (options.verbose) {
          console.log(
            `[Linker] Registering ${options.objectFiles.length} object file(s)...`,
          );
        }

        for (const objFile of options.objectFiles) {
          try {
            ObjectFileParser.registerObjectFile(
              objFile,
              this.linkerSymbolTable,
            );
            if (options.verbose) {
              console.log(`  Registered: ${objFile}`);
            }
          } catch (e) {
            if (options.verbose) {
              console.warn(`  Warning: Could not register ${objFile}: ${e}`);
            }
          }
        }
      }

      // Verify all symbols are available
      if (options.verbose) {
        console.log("[Linker] Verifying symbols...");
      }

      const errors = this.linkerSymbolTable.verifySymbols();
      if (errors.length > 0) {
        console.error("Linker errors:");
        for (const error of errors) {
          console.error(`  ${error.message}`);
        }
        return false;
      }

      // Compile with clang
      if (options.verbose) {
        console.log("[Linker] Compiling to executable with clang...");
      }

      return this.compileWithClang(mergedIR, options);
    } catch (e) {
      console.error(`Linker error: ${e}`);
      return false;
    }
  }

  /**
   * Merge multiple LLVM IR files into one
   */
  private mergeIRFiles(irFiles: string[], verbose?: boolean): string {
    if (irFiles.length === 0) {
      throw new Error("No IR files provided for linking");
    }

    if (irFiles.length === 1 && fs.existsSync(irFiles[0]!)) {
      // Single file, just return its content
      return fs.readFileSync(irFiles[0]!, "utf-8");
    }

    // Multiple files: concatenate with module linking
    const modules: string[] = [];

    for (const irFile of irFiles) {
      if (!fs.existsSync(irFile)) {
        console.warn(`Warning: IR file not found: ${irFile}`);
        continue;
      }

      const content = fs.readFileSync(irFile, "utf-8");
      modules.push(content);
    }

    if (modules.length === 0) {
      throw new Error("No valid IR files found");
    }

    if (verbose) {
      console.log(`[Linker] Merging ${modules.length} LLVM IR file(s)...`);
    }

    // Simple merge: combine all declarations and definitions
    // In production, would use llvm-link tool for proper merging
    return modules.join("\n\n");
  }

  /**
   * Compile merged IR to executable with clang
   */
  private compileWithClang(mergedIR: string, options: LinkOptions): boolean {
    // Write merged IR to temporary file
    const tmpIRFile = options.outputPath + ".ll";

    try {
      fs.writeFileSync(tmpIRFile, mergedIR);

      if (options.verbose) {
        console.log(`[Linker] Merged IR written to: ${tmpIRFile}`);
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

      // Add output
      clangArgs.push("-o");
      clangArgs.push(options.outputPath);

      // Add custom clang flags
      if (options.clangFlags && options.clangFlags.length > 0) {
        clangArgs.push(...options.clangFlags);
      }

      if (options.verbose) {
        console.log("[Linker] Running: clang " + clangArgs.join(" "));
      }

      // Run clang
      const result = spawnSync("clang", clangArgs, {
        stdio: options.verbose ? "inherit" : "pipe",
      });

      if (result.status !== 0) {
        if (!options.verbose && result.stderr) {
          console.error(result.stderr.toString());
        }
        return false;
      }

      if (options.verbose) {
        console.log(`[Linker] Successfully created: ${options.outputPath}`);
      }

      return true;
    } finally {
      // Clean up temporary IR file
      if (fs.existsSync(tmpIRFile)) {
        try {
          fs.unlinkSync(tmpIRFile);
        } catch (e) {
          if (options.verbose) {
            console.warn(`Could not clean up temporary file: ${tmpIRFile}`);
          }
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
