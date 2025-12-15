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
import { LinkerSymbolTable, type ObjectFileSymbol } from "./LinkerSymbolTable";

export class ObjectFileParser {
  /**
   * Parse LLVM IR file and extract symbols
   */
  static parseLLVMIR(filePath: string): ObjectFileSymbol[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object file not found: ${filePath}`);
    }

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
    for (const match of globalMatches) {
      const name = match[1]!;
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
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object file not found: ${filePath}`);
    }

    // For now, we'll use the `nm` tool if available
    // This is a simplified approach - production use might leverage better tools
    const { spawnSync } = require("child_process");

    try {
      const result = spawnSync("nm", [filePath], {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });

      if (result.error) {
        console.warn(
          `Warning: Could not parse ELF object with nm: ${result.error.message}`,
        );
        return [];
      }

      const symbols: ObjectFileSymbol[] = [];
      const lines = result.stdout.split("\n");

      // Parse nm output: <address> <type> <name>
      // Types: T (text/function), D (data), B (BSS), U (undefined), etc.
      const nmRegex = /^[0-9a-fA-F]*\s+([TDBUW])\s+(.+)$/;

      for (const line of lines) {
        const match = nmRegex.exec(line);
        if (match) {
          const type = match[1];
          const name = match[2]!.trim();

          // Skip empty names and internal symbols
          if (!name || name.startsWith(".")) {
            continue;
          }

          // Determine if it's a function or variable
          let symbolType: "function" | "variable" | "undefined" = "variable";
          if (type === "T" || type === "W") {
            symbolType = "function";
          } else if (type === "U") {
            symbolType = "undefined";
          }

          // Determine if it's global (external/defined)
          const isGlobal = type !== "U";

          symbols.push({
            name,
            type: symbolType,
            isGlobal,
          });
        }
      }

      return symbols;
    } catch (e) {
      console.warn(`Warning: Could not use nm tool: ${e}`);
      return [];
    }
  }

  /**
   * Detect file type and parse accordingly
   */
  static parseObjectFile(filePath: string): ObjectFileSymbol[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".ll") {
      return this.parseLLVMIR(filePath);
    } else if (ext === ".o" || ext === ".obj" || ext === ".a") {
      return this.parseELFObject(filePath);
    } else {
      throw new Error(
        `Unsupported object file format: ${ext} (supported: .ll, .o, .obj, .a)`,
      );
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
      console.warn(`Warning: Could not register object file ${filePath}: ${e}`);
    }
  }
}
