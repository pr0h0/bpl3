/**
 * BPL3 Compiler Main Entry Point
 *
 * This file orchestrates the compilation pipeline:
 * 1. Frontend: Lexing and Parsing
 * 2. Middleend: Type Checking and Semantic Analysis
 * 3. Backend: Code Generation (LLVM IR)
 * 4. Linking: Link LLVM IR with object files
 */

import * as fs from "fs";
import * as path from "path";

import { resolveBplPath } from "./common/PathResolver";
import { CodeGenerator } from "./backend/CodeGenerator";
import { ASTPrinter } from "./common/ASTPrinter";
import { CompilerError } from "./common/CompilerError";
import { Formatter } from "./formatter/Formatter";
import { lexWithGrammar } from "./frontend/GrammarLexer";
import { Parser } from "./frontend/Parser";
import { Linker } from "./middleend/Linker";
import { ModuleCache } from "./middleend/ModuleCache";
import { ModuleResolver } from "./middleend/ModuleResolver";
import { TypeChecker } from "./middleend/TypeChecker";

import type * as AST from "./common/AST";

export interface CompilerOptions {
  filePath: string;
  outputPath?: string;
  emitType?: "llvm" | "ast" | "tokens" | "formatted";
  verbose?: boolean;
  resolveImports?: boolean; // New option for full module resolution
  useCache?: boolean; // Enable incremental compilation with caching
  objectFiles?: string[]; // Object files to link
  libraries?: string[]; // Libraries to link
  libraryPaths?: string[]; // Library search paths
  target?: string; // Target triple
  sysroot?: string; // Sysroot for cross-compilation
  clangFlags?: string[]; // Additional clang flags
  dwarf?: boolean; // Generate DWARF debug information
  collectAllErrors?: boolean; // Continue scanning and report all errors
}

export interface CompilationResult {
  success: boolean;
  output?: string;
  errors?: CompilerError[];
  ast?: AST.Program;
}

export class Compiler {
  private options: CompilerOptions;

  constructor(options: CompilerOptions) {
    this.options = options;
  }

  /**
   * Main compilation function
   */
  compile(sourceCode: string): CompilationResult {
    try {
      // Check if we should use cached compilation
      if (this.options.useCache) {
        return this.compileWithCache();
      }

      // Check if we should use full module resolution
      if (this.options.resolveImports) {
        return this.compileWithModuleResolution();
      }

      // 1. Frontend: Lexing
      if (this.options.verbose) {
        console.log("[Frontend] Lexical Analysis...");
      }
      const tokens = lexWithGrammar(sourceCode, this.options.filePath);

      if (this.options.emitType === "tokens") {
        return {
          success: true,
          output: JSON.stringify(tokens, null, 2),
        };
      }

      // 2. Frontend: Parsing
      if (this.options.verbose) {
        console.log("[Frontend] Syntax Analysis...");
      }
      const parser = new Parser(sourceCode, this.options.filePath, tokens);
      const ast = parser.parse(true, !this.options.collectAllErrors);

      // Check for parser errors
      if ((ast as any).errors && (ast as any).errors.length > 0) {
        const errors = (ast as any).errors as CompilerError[];
        if (this.options.collectAllErrors) {
          return {
            success: false,
            errors: errors,
            ast: ast,
          };
        } else {
          throw errors[0];
        }
      }

      if (this.options.emitType === "ast") {
        return {
          success: true,
          output: JSON.stringify(ast, null, 2),
          ast,
        };
      }

      if (this.options.emitType === "formatted") {
        const formatter = new Formatter();
        return {
          success: true,
          output: formatter.format(ast),
          ast,
        };
      }

      // 3. Middleend: Type Checking
      if (this.options.verbose) {
        console.log("[Middleend] Semantic Analysis...");
      }
      const typeChecker = new TypeChecker({
        collectAllErrors: this.options.collectAllErrors,
      });
      typeChecker.checkProgram(ast);
      const typeErrors = typeChecker.getErrors();
      if (typeErrors.length > 0) {
        return { success: false, errors: typeErrors, ast };
      }

      // 4. Backend: Code Generation
      if (this.options.verbose) {
        console.log("[Backend] Code Generation...");
      }
      const codeGenerator = new CodeGenerator({
        target: this.options.target,
        dwarf: this.options.dwarf,
      });
      const llvmIR = codeGenerator.generate(ast, this.options.filePath);

      // 5. Linking (if object files provided)
      if (
        this.options.objectFiles ||
        this.options.libraries ||
        this.options.libraryPaths
      ) {
        if (this.options.verbose) {
          console.log("[Linker] Linking with object files...");
        }

        const irFile = this.options.outputPath || "temp.ll";
        fs.writeFileSync(irFile, llvmIR);

        const linker = new Linker();
        const linkSuccess = linker.link({
          irFiles: [irFile],
          objectFiles: this.options.objectFiles,
          libraries: this.options.libraries,
          libraryPaths: this.options.libraryPaths,
          outputPath:
            this.options.outputPath?.replace(/\.ll$/, "") ||
            this.options.filePath.replace(/\.[^/.]+$/, ""),
          target: this.options.target,
          sysroot: this.options.sysroot,
          clangFlags: this.options.clangFlags,
          verbose: this.options.verbose,
        });

        if (!linkSuccess) {
          return {
            success: false,
            errors: [
              new CompilerError("Linking failed", "See error messages above", {
                file: this.options.filePath,
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
              }),
            ],
          };
        }
      }

      return {
        success: true,
        output: llvmIR,
        ast,
      };
    } catch (error) {
      if (error instanceof CompilerError) {
        return {
          success: false,
          errors: [error],
        };
      }
      throw error;
    }
  }

  /**
   * Compile with full module resolution (two-phase compilation)
   */
  private compileWithModuleResolution(): CompilationResult {
    try {
      if (this.options.verbose) {
        console.log("[Module Resolution] Resolving dependencies...");
      }

      // 1. Resolve all modules
      const resolver = new ModuleResolver();
      const modules = resolver.resolveModules(this.options.filePath);

      if (this.options.verbose) {
        console.log(`[Module Resolution] Found ${modules.length} modules`);
        for (const mod of modules) {
          console.log(`  - ${mod.path}`);
        }
      }

      // 2. Type check all modules in dependency order
      if (this.options.verbose) {
        console.log("[Middleend] Type checking modules...");
      }

      const typeChecker = new TypeChecker({
        skipImportResolution: true,
        collectAllErrors: this.options.collectAllErrors,
      });

      // Pre-register all modules with TypeChecker
      for (const module of modules) {
        typeChecker.registerModule(module.path, module.ast);
      }

      for (const module of modules) {
        if (this.options.verbose) {
          console.log(`  Checking: ${path.basename(module.path)}`);
        }
        typeChecker.setCurrentModulePath(module.path);
        typeChecker.checkProgram(module.ast, module.path);
        module.checked = true;

        // Inject primitives into global scope if we just checked primitives.bpl
        if (module.path.endsWith("primitives.bpl")) {
          typeChecker.injectPrimitivesFromModule(module.path);
        }
      }

      // Check for undefined symbols (linker verification)
      if (this.options.verbose) {
        console.log("[Linker] Verifying symbols...");
      }
      const linkerSymbolTable = typeChecker.getLinkerSymbolTable();
      const linkerErrors = linkerSymbolTable.verifySymbols();
      const typeErrors = typeChecker.getErrors();
      if (linkerErrors.length > 0 || typeErrors.length > 0) {
        return {
          success: false,
          errors: [...typeErrors, ...linkerErrors],
        };
      }

      // 3. Merge all module ASTs into a single program for code generation
      const entryModule = modules[modules.length - 1]; // Last in topo order is entry point

      if (!entryModule) {
        throw new CompilerError(
          "No entry module found",
          "Ensure the project has a valid entry point.",
          {
            file: this.options.filePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      // Create a combined AST with all declarations from all modules
      const combinedStatements: AST.Statement[] = [];
      const seenDeclarations = new Set<string>(); // Avoid duplicate declarations

      // Add declarations from all modules in dependency order
      for (const module of modules) {
        for (const stmt of module.ast.statements) {
          // Skip imports as they're already resolved
          if (stmt.kind === "Import") {
            continue;
          }

          // Skip exports
          if (stmt.kind === "Export") {
            continue;
          }

          // Generate a unique key for declarations to avoid duplicates
          let key: string | null = null;
          if (stmt.kind === "StructDecl") {
            key = `struct:${(stmt as AST.StructDecl).name}`;
          } else if (stmt.kind === "Extern") {
            key = `extern:${(stmt as AST.ExternDecl).name}`;
          } else if (stmt.kind === "TypeAlias") {
            key = `type:${(stmt as AST.TypeAliasDecl).name}`;
          } else if (stmt.kind === "VariableDecl") {
            key = `global:${(stmt as AST.VariableDecl).name}`;
          }
          // FunctionDecl is not deduplicated here to allow overloads.
          // CodeGenerator handles duplicate definitions if they occur.

          // Add statement if we haven't seen this declaration before
          if (!key || !seenDeclarations.has(key)) {
            if (key) seenDeclarations.add(key);
            combinedStatements.push(stmt);
          }
        }
      }

      const combinedAST: AST.Program = {
        kind: "Program",
        statements: combinedStatements,
        location: entryModule.ast.location, // Use entry module's location
      };

      if (this.options.verbose) {
        console.log("[Backend] Generating code...");
      }

      const stdLibPath = path.resolve(resolveBplPath("lib"));
      const isLinkingBpl = this.options.libraries?.includes("bpl");

      const codeGenerator = new CodeGenerator({
        stdLibPath,
        useLinkOnceOdrForStdLib: isLinkingBpl,
        target: this.options.target,
        dwarf: this.options.dwarf,
      });

      const llvmIR = codeGenerator.generate(combinedAST, this.options.filePath);

      return {
        success: true,
        output: llvmIR,
        ast: combinedAST,
      };
    } catch (error) {
      if (error instanceof CompilerError) {
        return {
          success: false,
          errors: [error],
        };
      }
      throw error;
    }
  }

  /**
   * Compile with module caching for incremental builds
   */
  private compileWithCache(): CompilationResult {
    try {
      const projectRoot = path.dirname(this.options.filePath);
      const cache = new ModuleCache(projectRoot);

      if (this.options.verbose) {
        console.log("[Module Cache] Resolving dependencies...");
      }

      // 1. Resolve all modules
      const resolver = new ModuleResolver();
      const modules = resolver.resolveModules(this.options.filePath);

      if (this.options.verbose) {
        console.log(`[Module Cache] Found ${modules.length} modules`);
      }

      // 2. Type check all modules in dependency order
      const typeChecker = new TypeChecker({
        collectAllErrors: this.options.collectAllErrors,
      });
      for (const module of modules) {
        typeChecker.checkProgram(module.ast);
        module.checked = true;
      }
      const typeErrors = typeChecker.getErrors();
      if (typeErrors.length > 0) {
        return { success: false, errors: typeErrors };
      }

      // 3. Generate combined LLVM IR (for now, until we implement proper per-module compilation)
      // Create a combined AST with all declarations from all modules
      const combinedStatements: AST.Statement[] = [];
      const seenDeclarations = new Set<string>();

      for (const module of modules) {
        for (const stmt of module.ast.statements) {
          if (stmt.kind === "Import") {
            continue;
          }

          let key: string | null = null;
          if (stmt.kind === "StructDecl") {
            key = `struct:${(stmt as AST.StructDecl).name}`;
          } else if (stmt.kind === "FunctionDecl") {
            key = `function:${(stmt as AST.FunctionDecl).name}`;
          } else if (stmt.kind === "Extern") {
            key = `extern:${(stmt as AST.ExternDecl).name}`;
          } else if (stmt.kind === "TypeAlias") {
            key = `type:${(stmt as AST.TypeAliasDecl).name}`;
          } else if (stmt.kind === "VariableDecl") {
            key = `global:${(stmt as AST.VariableDecl).name}`;
          }

          if (!key || !seenDeclarations.has(key)) {
            if (key) seenDeclarations.add(key);
            combinedStatements.push(stmt);
          }
        }
      }

      const combinedAST: AST.Program = {
        kind: "Program",
        statements: combinedStatements,
        location: modules[modules.length - 1]!.ast.location,
      };

      // Hash the combined content for caching
      const entryModule = modules[modules.length - 1]!;
      const allContent = modules
        .map((m) => fs.readFileSync(m.path, "utf-8"))
        .join("\n");

      if (this.options.verbose) {
        console.log("[Module Cache] Compiling modules...");
      }

      const codeGenerator = new CodeGenerator({
        target: this.options.target,
        dwarf: this.options.dwarf,
      });
      const llvmIR = codeGenerator.generate(combinedAST, entryModule.path);

      const objectFile = cache.compileModule(
        entryModule.path,
        allContent,
        llvmIR,
        this.options.verbose,
        this.options.target,
      );

      const objectFiles = [objectFile];

      // 4. Link all object files
      const outputPath =
        this.options.outputPath ||
        this.options.filePath.replace(/\.[^/.]+$/, "");

      if (this.options.verbose) {
        console.log("[Module Cache] Linking modules...");
      }

      cache.linkModules(
        objectFiles,
        outputPath,
        this.options.verbose,
        this.options.target,
      );

      if (this.options.verbose) {
        const stats = cache.getStats();
        console.log(
          `[Module Cache] Cache stats: ${stats.totalModules} modules, ${(
            stats.cacheSize / 1024
          ).toFixed(2)} KB`,
        );
      }

      return {
        success: true,
        output: `Executable created: ${outputPath}`,
      };
    } catch (error) {
      if (error instanceof CompilerError) {
        return {
          success: false,
          errors: [error],
        };
      }
      throw error;
    }
  }

  /**
   * Pretty print AST
   */
  printAST(ast: AST.Program): string {
    const printer = new ASTPrinter();
    return printer.print(ast);
  }
}

// Export all components for external use
export { Formatter } from "./formatter/Formatter";
export { lexWithGrammar } from "./frontend/GrammarLexer";
export { Parser } from "./frontend/Parser";
export { TypeChecker } from "./middleend/TypeChecker";
export { CodeGenerator } from "./backend/CodeGenerator";
export { CompilerError } from "./common/CompilerError";
export { ASTPrinter } from "./common/ASTPrinter";
export * as AST from "./common/AST";
export { Token } from "./frontend/Token";
export { TokenType } from "./frontend/TokenType";
export { SymbolTable } from "./middleend/SymbolTable";
