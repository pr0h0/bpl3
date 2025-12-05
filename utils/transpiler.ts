import { resolve, dirname } from "path";
import Scope from "../transpiler/Scope";
import HelperGenerator from "../transpiler/HelperGenerator";
import type ProgramExpr from "../parser/expression/programExpr";
import type ExportExpr from "../parser/expression/exportExpr";
import { SemanticAnalyzer } from "../transpiler/analysis/SemanticAnalyzer";
import { MemorySafetyAnalyzer } from "../transpiler/analysis/MemorySafetyAnalyzer";
import { ErrorReporter } from "../errors";
import {
  parseFile,
  extractImportStatements,
  extractExportStatements,
} from "./parser";
import { saveToFile } from "./file";
import { compileLlvmIrToObject } from "./compiler";
import { IRGenerator } from "../transpiler/ir/IRGenerator";
import { LLVMTargetBuilder } from "../transpiler/target/LLVMTargetBuilder";

export function transpileProgram(program: ProgramExpr, scope?: Scope): string {
  if (!scope) {
    scope = new Scope();
  }

  if (!scope.resolveType("u8")) {
    HelperGenerator.generateBaseTypes(scope);
  }

  const analyzer = new SemanticAnalyzer();
  analyzer.analyze(program, scope, true);

  for (const warning of analyzer.warnings) {
    // ErrorReporter.warn(warning);
  }

  // Run memory safety analysis
  const memorySafety = new MemorySafetyAnalyzer();
  memorySafety.analyze(program, scope);

  for (const error of memorySafety.errors) {
    ErrorReporter.report(error);
  }

  for (const warning of memorySafety.warnings) {
    // ErrorReporter.warn(warning);
  }

  // Halt compilation if memory safety errors were found
  if (memorySafety.errors.length > 0) {
    throw new Error(
      `Compilation failed due to ${memorySafety.errors.length} memory safety error(s)`,
    );
  }

  program.optimize();

  const gen = new IRGenerator();
  program.toIR(gen, scope);

  const builder = new LLVMTargetBuilder();
  return builder.build(gen.module);
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
    } else if (
      moduleName.startsWith(".") ||
      moduleName.startsWith("/") ||
      moduleName.includes("/")
    ) {
      const libDir = dirname(resolve(libFilePath));
      absolutePath = resolve(libDir, moduleName);
    } else {
      continue;
    }

    if (absolutePath.endsWith(".x")) {
      const importedScope = new Scope();
      const nestedLibs = parseLibraryFile(absolutePath, importedScope, visited);
      objectFiles.push(...nestedLibs);

      const importedProgram = parseFile(absolutePath);

      const asmContent = transpileProgram(importedProgram, importedScope);

      const asmFile = absolutePath.replace(/\.x$/, ".ll");
      saveToFile(asmFile, asmContent);
      const objFile = compileLlvmIrToObject(asmFile);
      objectFiles.push(objFile);

      const importedExports = extractExportStatements(
        importedProgram,
      ) as ExportExpr[];

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

      for (const imp of importExpr.importName) {
        if (imp.type === "type") {
          const typeInfo = importedScope.resolveType(imp.name);
          if (typeInfo) {
            // Store the defining scope for generic types so their methods
            // can be instantiated in the correct context with access to imports
            const typeInfoWithScope = {
              ...typeInfo,
              definingScope: importedScope,
            };
            scope.defineType(imp.name, typeInfoWithScope);

            // Auto-import methods for the struct
            for (const [funcName, funcInfo] of importedScope.functions) {
              if (funcInfo.isMethod && funcInfo.receiverStruct === imp.name) {
                scope.defineFunction(funcName, {
                  ...funcInfo,
                  label: funcInfo.name,
                  startLabel: funcInfo.name,
                  endLabel: funcInfo.name,
                  isExternal: true,
                  llvmName: `@${funcInfo.name}`,
                  definitionScope: importedScope,
                });
              }
            }
          } else {
            throw new Error(
              `Imported type ${imp.name} not found in ${absolutePath}`,
            );
          }
        }
      }

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
              llvmName: `@${funcInfo.name}`,
            });
          } else {
            throw new Error(
              `Imported function ${imp.name} not found in ${absolutePath}`,
            );
          }
        }
      }
    } else {
      objectFiles.push(absolutePath);
      // ... handle object file imports ...
    }
  }
  return objectFiles;
}
