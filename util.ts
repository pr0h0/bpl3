import { existsSync, readFileSync, writeFileSync } from "fs";
import { normalize, resolve, dirname } from "path";
import type Token from "./lexer/token";
import type Expression from "./parser/expression/expr";
import { Parser } from "./parser/parser";
import Lexer from "./lexer/lexer";
import type ProgramExpr from "./parser/expression/programExpr";
import type ImportExpr from "./parser/expression/importExpr";
import ExpressionType from "./parser/expressionType";
import type ExportExpr from "./parser/expression/exportExpr";
import AsmGenerator from "./transpiler/AsmGenerator";
import Scope from "./transpiler/Scope";
import { execSync } from "child_process";

export function readFile(path: string): string {
  const normalizedPath = normalize(path);
  if (!existsSync(normalizedPath)) {
    throw new Error(`File not found: ${normalizedPath}`);
  }

  return readFileSync(normalizedPath, { encoding: "utf-8" });
}

export function generateTokens(code: string): Token[] {
  const lexer = new Lexer(code);
  return lexer.tokenize();
}

export function getFileTokens(filePath: string): Token[] {
  const content = readFile(filePath);
  return generateTokens(content);
}

export function parseTokens(tokens: Token[]): ProgramExpr {
  const parser = new Parser(tokens);
  return parser.parse();
}

export function parseFile(filePath: string): ProgramExpr {
  const tokens = getFileTokens(filePath);
  return parseTokens(tokens);
}

export function extractImportStatements(expression: ProgramExpr): ImportExpr[] {
  return expression.expressions.filter(
    (expr): expr is ImportExpr => expr.type === ExpressionType.ImportExpression,
  );
}

export function extractExportStatements(expression: ProgramExpr): Expression[] {
  return expression.expressions.filter(
    (expr) => expr.type === ExpressionType.ExportExpression,
  );
}

export function parseImportExpression(importExpr: ImportExpr) {
  const importPath = importExpr.moduleName;
  const importedFunctions = importExpr.importName
    .filter((name) => name.type === "function")
    .map((name) => name.name);
  const importedTypes = importExpr.importName
    .filter((name) => name.type === "type")
    .map((name) => name.name);
  return {
    types: importedTypes,
    functions: importedFunctions,
    path: importPath,
  };
}

export function parseImportExpressions(exprs: ImportExpr[]) {
  const imports = [];
  for (const expr of exprs) {
    imports.push(parseImportExpression(expr));
  }
  return imports;
}

export function parseExportExpression(exportExpr: ExportExpr) {
  return {
    name: exportExpr.exportName,
    type: exportExpr.exportType,
  };
}

export function parseExportExpressions(exprs: ExportExpr[]) {
  const exports = [];
  for (const expr of exprs) {
    exports.push(parseExportExpression(expr));
  }
  return exports;
}

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

  program.optimize();
  program.transpile(gen, scope);
  return gen.build();
}

export function transpileFile(filePath: string): string {
  const program = parseFile(filePath) as ProgramExpr;
  return transpileProgram(program);
}

export function saveToFile(filePath: string, content: string): void {
  const normalizedPath = normalize(filePath);
  const lastSlash = normalizedPath.lastIndexOf("/");
  if (lastSlash !== -1) {
    const dir = normalizedPath.substring(0, lastSlash);
    if (!existsSync(dir)) {
      throw new Error(`Directory does not exist: ${dir}`);
    }
  }
  writeFileSync(normalizedPath, content, { encoding: "utf-8" });
}

export function compileAsmFile(inputFilePath: string): string {
  const outputFilePath = inputFilePath.replace(/\.[^/.]+$/, "") + ".o";
  execSync(`nasm -f elf64 "${inputFilePath}" -o "${outputFilePath}"`);
  return outputFilePath;
}

export function linkObjectFile(
  objectFilePath: string,
  libsPath: string[],
  outputFilePath: string,
): void {
  const libs = libsPath.map((lib) => `"${lib}"`).join(" ");
  execSync(`gcc "${objectFilePath}" ${libs} -o "${outputFilePath}"`);
}

export function getOutputFileName(
  inputFilePath: string,
  newExtension: string,
): string {
  return inputFilePath.replace(/\.[^/.]+$/, "") + newExtension;
}

export function parseLibraryFile(libFilePath: string, scope: Scope): string[] {
  const program = parseFile(libFilePath) as ProgramExpr;
  const imports = extractImportStatements(program);
  const objectFiles: string[] = [];

  for (const importExpr of imports) {
    let moduleName = importExpr.moduleName;
    let absolutePath = "";

    if (moduleName === "std") {
      absolutePath = resolve(__dirname, "lib/std.x");
    } else if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
      const libDir = dirname(resolve(libFilePath));
      absolutePath = resolve(libDir, moduleName);
    } else {
      continue;
    }

    if (absolutePath.endsWith(".x")) {
      const importedScope = new Scope();
      // Recursive call to handle imports of the imported file
      const nestedLibs = parseLibraryFile(absolutePath, importedScope);
      objectFiles.push(...nestedLibs);

      const importedProgram = parseFile(absolutePath);

      // Transpile the imported file as a library
      const gen = new AsmGenerator();
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
        });
      }
    }
  }
  return objectFiles;
}
