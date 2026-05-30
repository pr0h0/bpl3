/**
 * Object File Parser
 *
 * Parses LLVM IR (.ll) and potentially ELF/object files to extract symbol information
 * for linking purposes.
 *
 * Supports:
 * - LLVM IR (.ll) files with function and global variable declarations
 * - Reading symbol tables from compiled objects
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import { LinkerSymbolTable, type ObjectFileSymbol } from "./LinkerSymbolTable";

export function getObjectSymbolTool(): string {
  return process.env.BPL_NM || process.env.NM || "nm";
}

export class ObjectFileParser {
  /**
   * Parse LLVM IR file and extract symbols
   */
  static parseLLVMIR(filePath: string): ObjectFileSymbol[] {
    this.validateObjectInputFile(
      filePath,
      "Check that the file exists and the path is correct.",
    );

    const content = fs.readFileSync(filePath, "utf-8");
    const symbols: ObjectFileSymbol[] = [];

    // Parse function declarations and definitions
    // Match: declare <type> @<name>(...) or define <type> @<name>(...)
    const functionRegex =
      /(?:declare|define)\s+[^@]*@([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1]!;
      symbols.push({
        name,
        type: "function",
        isGlobal: true,
      });
    }

    // Parse global variable declarations
    // Match: @<name> = [internal|external|weak] <type> [constant] [value]
    const globalRegex =
      /^@([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:internal|external|weak|global|private)?\s*/gm;

    const globalMatches = content.matchAll(globalRegex);
    for (const globalMatch of globalMatches) {
      const name = globalMatch[1]!;
      // Don't add if already in symbols (avoid duplicates)
      if (!symbols.find((s) => s.name === name)) {
        symbols.push({
          name,
          type: "variable",
          isGlobal: true,
        });
      }
    }

    return symbols;
  }

  /**
   * Parse ELF object file and extract symbols (basic implementation)
   * More sophisticated parsing would require readelf or nm tools
   */
  static parseELFObject(filePath: string): ObjectFileSymbol[] {
    this.validateObjectInputFile(
      filePath,
      "Check that the file exists and the path is correct.",
    );

    const symbolTool = getObjectSymbolTool();

    try {
      const result = spawnSync(symbolTool, [filePath], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (result.error) {
        compilerLog.warn(
          `Could not parse object file with ${symbolTool}: ${result.error.message}`,
        );
        return [];
      }

      if (result.status !== 0) {
        const detail =
          result.stderr?.trim() ||
          result.stdout?.trim() ||
          `exited with status ${result.status}`;
        compilerLog.warn(
          `Could not parse object file with ${symbolTool}: ${detail}`,
        );
        return [];
      }

      return this.parseNmOutput(result.stdout);
    } catch (e) {
      compilerLog.warn(`Could not use object symbol tool ${symbolTool}: ${e}`);
      return [];
    }
  }

  static parseNmOutput(output: string): ObjectFileSymbol[] {
    const symbols: ObjectFileSymbol[] = [];
    const lines = output.split("\n");

    // Parse nm output: <address> <type> <name>
    // Types: T (text/function), D (data), B (BSS), U (undefined), etc.
    const nmRegex = /^[0-9a-fA-F]*\s+([TDBUW])\s+(.+)$/;

    for (const line of lines) {
      const match = nmRegex.exec(line);
      if (!match) continue;

      const type = match[1]!;
      const name = match[2]!.trim();

      // Skip empty names and internal symbols.
      if (!name || name.startsWith(".")) {
        continue;
      }

      let symbolType: "function" | "variable" | "undefined" = "variable";
      if (type === "T" || type === "W") {
        symbolType = "function";
      } else if (type === "U") {
        symbolType = "undefined";
      }

      symbols.push({
        name,
        type: symbolType,
        isGlobal: type !== "U",
      });
    }

    return symbols;
  }

  /**
   * Detect file type and parse accordingly
   */
  static parseObjectFile(filePath: string): ObjectFileSymbol[] {
    this.validateObjectInputFile(filePath, "Check if the file exists.");

    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".ll") {
      return this.parseLLVMIR(filePath);
    } else if (ext === ".o" || ext === ".obj" || ext === ".a") {
      return this.parseELFObject(filePath);
    }
    throw new CompilerError(
      `Unsupported object file format: ${ext} (supported: .ll, .o, .obj, .a)`,
      "Use a supported file format.",
      {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      },
    );
  }

  private static validateObjectInputFile(filePath: string, hint: string): void {
    if (!fs.existsSync(filePath)) {
      throw new CompilerError(`Object file not found: ${filePath}`, hint, {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      });
    }

    if (!fs.statSync(filePath).isFile()) {
      throw new CompilerError(`Object path is not a file: ${filePath}`, hint, {
        file: filePath,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 1,
      });
    }
  }

  /**
   * Register an object file with the linker symbol table
   */
  static registerObjectFile(
    filePath: string,
    linkerSymbolTable: LinkerSymbolTable,
  ): void {
    try {
      const symbols = this.parseObjectFile(filePath);
      linkerSymbolTable.registerObjectFile(filePath, symbols);
    } catch (e) {
      compilerLog.warn(`Could not register object file ${filePath}: ${e}`);
    }
  }
}
