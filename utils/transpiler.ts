import { resolve, dirname } from "path";
import AsmGenerator from "../transpiler/AsmGenerator";
import Scope from "../transpiler/Scope";
import HelperGenerator from "../transpiler/HelperGenerator";
import type ProgramExpr from "../parser/expression/programExpr";
import type ExportExpr from "../parser/expression/exportExpr";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import { ErrorReporter } from "../errors";
import {
  parseFile,
  extractImportStatements,
  extractExportStatements,
} from "./parser";
import { saveToFile } from "./file";
import { compileAsmFile } from "./compiler";

export function transpileProgram(
  program: ProgramExpr,
  gen?: AsmGenerator,
  scope?: Scope,
) {
  if (!gen) {
    gen = new AsmGenerator();
  }
  if (!scope) {
    scope = new Scope();
  }

  // Initialize base types in the global scope
  // Check if types are already defined (e.g. if scope was reused)
  if (!scope.resolveType("u8")) {
    HelperGenerator.generateBaseTypes(gen, scope);
  }

  // Run semantic analysis
  const analyzer = new SemanticAnalyzer();
  // We pass the scope so that imports defined in 'scope' are visible.
  // analyzer will create a child scope to avoid polluting 'scope'.
  analyzer.analyze(program, scope);

  for (const warning of analyzer.warnings) {
    ErrorReporter.warn(warning);
  }

  program.optimize();
  program.transpile(gen, scope);
  return gen.build();
}

export function transpileFile(filePath: string): string {
  const program = parseFile(filePath) as ProgramExpr;
  const gen = new AsmGenerator();
  gen.setSourceFile(filePath);
  return transpileProgram(program, gen);
}

export function parseLibraryFile(
  libFilePath: string,
  scope: Scope,
  visited: Set<string> = new Set(),
): string[] {
  const absoluteLibPath = resolve(libFilePath);
  if (visited.has(absoluteLibPath)) {
    return [];
  }
  visited.add(absoluteLibPath);

  const program = parseFile(libFilePath) as ProgramExpr;
  const imports = extractImportStatements(program);
  const objectFiles: string[] = [];

  for (const importExpr of imports) {
    let moduleName = importExpr.moduleName;
    let absolutePath = "";

    if (moduleName === "std") {
      absolutePath = resolve(__dirname, "../lib/std.x");
    } else if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
      const libDir = dirname(resolve(libFilePath));
      absolutePath = resolve(libDir, moduleName);
    } else {
      continue;
    }

    if (absolutePath.endsWith(".x")) {
      const importedScope = new Scope();
      // Recursive call to handle imports of the imported file
      const nestedLibs = parseLibraryFile(absolutePath, importedScope, visited);
      objectFiles.push(...nestedLibs);

      const importedProgram = parseFile(absolutePath);

      // Transpile the imported file as a library
      const gen = new AsmGenerator();
      gen.setSourceFile(absolutePath);
      const asmContent = transpileProgram(importedProgram, gen, importedScope);

      // Save ASM and compile to Object file
      const asmFile = absolutePath.replace(/\.x$/, ".asm");
      saveToFile(asmFile, asmContent);
      const objFile = compileAsmFile(asmFile);
      objectFiles.push(objFile);

      const importedExports = extractExportStatements(
        importedProgram,
      ) as ExportExpr[];

      // Verify imports match exports
      for (const imp of importExpr.importName) {
        const match = importedExports.find(
          (e) => e.exportName === imp.name && e.exportType === imp.type,
        );
        if (!match) {
          throw new Error(
            `Import ${imp.name} (${imp.type}) not found in ${absolutePath}`,
          );
        }
      }

      // Define types
      for (const imp of importExpr.importName) {
        if (imp.type === "type") {
          const typeInfo = importedScope.resolveType(imp.name);
          if (typeInfo) {
            scope.defineType(imp.name, typeInfo);
          } else {
            throw new Error(
              `Imported type ${imp.name} not found in ${absolutePath}`,
            );
          }
        }
      }

      // Define functions
      for (const imp of importExpr.importName) {
        if (imp.type === "function") {
          const funcInfo = importedScope.resolveFunction(imp.name);
          if (funcInfo) {
            scope.defineFunction(imp.name, {
              ...funcInfo,
              label: funcInfo.name,
              startLabel: funcInfo.name,
              endLabel: funcInfo.name,
              isExternal: true,
            });
          } else {
            throw new Error(
              `Imported function ${imp.name} not found in ${absolutePath}`,
            );
          }
        }
      }
    } else {
      // Object file
      objectFiles.push(absolutePath);
      for (const imp of importExpr.importName) {
        if (imp.type === "type") {
          throw new Error(
            `Cannot import type ${imp.name} from object file ${absolutePath}`,
          );
        }
        scope.defineFunction(imp.name, {
          name: imp.name,
          label: imp.name,
          args: [],
          returnType: null,
          startLabel: imp.name,
          endLabel: imp.name,
          isExternal: true,
          isVariadic: true,
        });
      }
    }
  }
  return objectFiles;
}
