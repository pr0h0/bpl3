import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  Diagnostic,
  DiagnosticSeverity,
  DefinitionParams,
  Location,
  Range,
  HoverParams,
  Hover,
  MarkupKind,
  TextEdit,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

// Relative imports to transpiler code
// Note: These paths depend on the tsconfig.json setup
import Lexer from "../../../lexer/lexer";
import { Parser } from "../../../parser/parser";
import Scope, { TypeInfo } from "../../../transpiler/Scope";
import AsmGenerator from "../../../transpiler/AsmGenerator";
import HelperGenerator from "../../../transpiler/HelperGenerator";
import { CompilerError } from "../../../errors";
import { Formatter } from "../../../transpiler/formatter/Formatter";

import ProgramExpr from "../../../parser/expression/programExpr";
import BlockExpr from "../../../parser/expression/blockExpr";
import FunctionDeclarationExpr from "../../../parser/expression/functionDeclaration";
import IfExpr from "../../../parser/expression/ifExpr";
import LoopExpr from "../../../parser/expression/loopExpr";
import BinaryExpr from "../../../parser/expression/binaryExpr";
import UnaryExpr from "../../../parser/expression/unaryExpr";
import FunctionCallExpr from "../../../parser/expression/functionCallExpr";
import VariableDeclarationExpr, {
  VariableType,
} from "../../../parser/expression/variableDeclarationExpr";
import IdentifierExpr from "../../../parser/expression/identifierExpr";
import MemberAccessExpr from "../../../parser/expression/memberAccessExpr";
import ReturnExpr from "../../../parser/expression/returnExpr";
import ArrayLiteralExpr from "../../../parser/expression/arrayLiteralExpr";
import ExportExpr from "../../../parser/expression/exportExpr";
import ImportExpr from "../../../parser/expression/importExpr";
import StructDeclarationExpr from "../../../parser/expression/structDeclarationExpr";
import ExternDeclarationExpr from "../../../parser/expression/externDeclarationExpr";
import Expression from "../../../parser/expression/expr";
import Token from "../../../lexer/token";
import TokenType from "../../../lexer/tokenType";

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      // Tell the client that this server supports go to definition.
      definitionProvider: true,
      // Tell the client that this server supports hover.
      hoverProvider: true,
      // Tell the client that this server supports formatting.
      documentFormattingProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined,
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

// Cache the latest valid scope for each document to use in completion/definition
const documentScopes = new Map<string, Scope>();
const documentASTs = new Map<string, ProgramExpr>();
const importedScopes = new Map<string, Scope>();

function processImport(filePath: string): Scope | null {
  if (importedScopes.has(filePath)) {
    return importedScopes.get(filePath)!;
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const lexer = new Lexer(text);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    const gen = new AsmGenerator(0);
    const scope = new Scope();

    try {
      HelperGenerator.generateBaseTypes(gen, scope);
    } catch (e) {
      // Ignore
    }

    // Process imports recursively?
    // For now, let's just process declarations in this file
    for (const expr of program.expressions) {
      try {
        expr.transpile(gen, scope);
      } catch (e) {
        // Ignore errors in imported files
      }
    }

    importedScopes.set(filePath, scope);

    // Tag symbols with source file
    for (const func of scope.functions.values()) {
      func.sourceFile = filePath;
    }
    for (const type of scope.types.values()) {
      type.sourceFile = filePath;
    }
    for (const variable of scope.vars.values()) {
      variable.sourceFile = filePath;
    }

    return scope;
  } catch (e) {
    return null;
  }
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const text = textDocument.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    const lexer = new Lexer(text);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const program = parser.parse();

    // Store AST for other features
    documentASTs.set(textDocument.uri, program);

    // Run transpilation (without emitting) to check for semantic errors and build scope
    const gen = new AsmGenerator(0);
    const scope = new Scope();
    documentScopes.set(textDocument.uri, scope);

    try {
      HelperGenerator.generateBaseTypes(gen, scope);
    } catch (e) {
      // Ignore base type generation errors
    }

    // Pre-process imports
    const currentFilePath = fileURLToPath(textDocument.uri);
    const currentDir = path.dirname(currentFilePath);

    // Tag local symbols with source file
    for (const func of scope.functions.values()) {
      if (!func.sourceFile) func.sourceFile = currentFilePath;
    }
    for (const type of scope.types.values()) {
      if (!type.sourceFile) type.sourceFile = currentFilePath;
    }
    for (const variable of scope.vars.values()) {
      if (!variable.sourceFile) variable.sourceFile = currentFilePath;
    }

    for (const expr of program.expressions) {
      if (expr instanceof ImportExpr) {
        if (expr.moduleName.endsWith(".x")) {
          const importPath = path.resolve(currentDir, expr.moduleName);
          const importScope = processImport(importPath);

          if (importScope) {
            for (const importItem of expr.importName) {
              if (importItem.type === "function") {
                const func = importScope.resolveFunction(importItem.name);
                if (func) {
                  // Define as external in current scope, but with full signature
                  try {
                    scope.defineFunction(importItem.name, {
                      ...func,
                      isExternal: true,
                      // Keep declaration from imported file? Or maybe not, to avoid jumping to other file (unless we support it)
                      // If we keep declaration, Go to Definition might work if we handle URIs correctly
                      // But func.declaration has token from other file.
                      // We need to map it to the other file URI.
                      // For now, let's just keep it.
                    });
                  } catch (e) {
                    // Ignore re-definition
                  }
                }
              } else if (importItem.type === "type") {
                const typeInfo = importScope.resolveType(importItem.name);
                if (typeInfo) {
                  try {
                    scope.defineType(importItem.name, typeInfo);
                  } catch (e) {
                    // Ignore
                  }
                }
              }
            }
          }
        }
      }
    }

    // We need to handle imports to populate scope correctly
    // But imports require file system access which might be tricky in LSP if files are not saved
    // For now, we'll try to run transpile and catch errors
    for (const expr of program.expressions) {
      try {
        expr.transpile(gen, scope);
      } catch (e: any) {
        // Semantic error
        const diagnostic: Diagnostic = {
          severity: DiagnosticSeverity.Error,
          range: {
            start: { line: (e.line || 1) - 1, character: 0 },
            end: { line: (e.line || 1) - 1, character: Number.MAX_VALUE },
          },
          message: e.message,
          source: "bpl",
        };
        diagnostics.push(diagnostic);
      }
    }
  } catch (e: any) {
    // Syntax error
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Error,
      range: {
        start: { line: (e.line || 1) - 1, character: 0 },
        end: { line: (e.line || 1) - 1, character: Number.MAX_VALUE },
      },
      message: e.message,
      source: "bpl",
    };
    diagnostics.push(diagnostic);
  }

  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

connection.onDocumentFormatting((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  const text = document.getText();
  try {
    const lexer = new Lexer(text);
    const allTokens = lexer.tokenize(true);
    const comments = allTokens.filter((t) => t.type === TokenType.COMMENT);
    // Parser expects tokens without comments
    const parserTokens = allTokens.filter((t) => t.type !== TokenType.COMMENT);
    
    const parser = new Parser(parserTokens);
    const program = parser.parse();

    // Use 4 spaces or params.options.tabSize
    const indentString = " ".repeat(params.options.tabSize || 4);
    const formatter = new Formatter(indentString, comments, text);
    const formatted = formatter.format(program);

    return [
      TextEdit.replace(
        Range.create(document.positionAt(0), document.positionAt(text.length)),
        formatted,
      ),
    ];
  } catch (e: any) {
    connection.console.error(`Formatting error: ${e.message}`);
    return [];
  }
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const scope = documentScopes.get(_textDocumentPosition.textDocument.uri);
    const items: CompletionItem[] = [];

    // Add keywords
    const keywords = [
      "frame",
      "local",
      "return",
      "if",
      "else",
      "loop",
      "break",
      "continue",
      "struct",
      "import",
      "export",
      "extern",
      "asm",
      "call",
    ];

    for (const kw of keywords) {
      items.push({
        label: kw,
        kind: CompletionItemKind.Keyword,
        data: kw,
      });
    }

    // Add variables and functions from scope
    if (scope) {
      // We need to access private members of Scope or add a public getter
      // Since we can't easily modify Scope.ts right now to add getters without breaking things,
      // we will try to access them if they were public, or cast to any.
      // Note: In the provided Scope.ts, vars and functions are private.
      // We should probably modify Scope.ts to expose them or add a method `getAllSymbols()`.

      // For now, let's assume we can modify Scope.ts or use 'any' cast
      const s = scope as any;
      if (s.vars) {
        for (const [name, info] of s.vars.entries()) {
          items.push({
            label: name,
            kind: CompletionItemKind.Variable,
            detail: formatType(info.varType),
          });
        }
      }
      if (s.functions) {
        for (const [name, info] of s.functions.entries()) {
          items.push({
            label: name,
            kind: CompletionItemKind.Function,
            detail: `(${info.args.map((a: any) => a.name + ": " + formatType(a.type)).join(", ")}) -> ${info.returnType ? formatType(info.returnType) : "void"}`,
          });
        }
      }
    }

    return items;
  },
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

connection.onDefinition((params: DefinitionParams): Location | null => {
  const ast = documentASTs.get(params.textDocument.uri);
  if (!ast) return null;

  const line = params.position.line + 1;
  const column = params.position.character + 1;

  const node = findNodeAt(ast, line, column);

  if (!node) return null;

  if (node instanceof IdentifierExpr) {
    if (node.contextScope) {
      const symbol = node.contextScope.resolve(node.name);
      if (symbol && symbol.declaration) {
        return {
          uri: params.textDocument.uri,
          range: {
            start: {
              line: symbol.declaration.line - 1,
              character: symbol.declaration.column - 1,
            },
            end: {
              line: symbol.declaration.line - 1,
              character:
                symbol.declaration.column - 1 + symbol.declaration.value.length,
            },
          },
        };
      }
    }
  } else if (node instanceof FunctionCallExpr) {
    if (node.contextScope) {
      const func = node.contextScope.resolveFunction(node.functionName);
      if (func && func.declaration) {
        return {
          uri: params.textDocument.uri,
          range: {
            start: {
              line: func.declaration.line - 1,
              character: func.declaration.column - 1,
            },
            end: {
              line: func.declaration.line - 1,
              character:
                func.declaration.column - 1 + func.declaration.value.length,
            },
          },
        };
      }
    }
  } else if (node instanceof ImportExpr) {
    const currentFilePath = fileURLToPath(params.textDocument.uri);
    const currentDir = path.dirname(currentFilePath);

    // Check if clicked on module path
    if (node.moduleNameToken && isTokenAt(node.moduleNameToken, line, column)) {
      const moduleName = node.moduleName;
      // Filter: "if file doesnt start with ./ or / and ends with .x then dont provide that option"
      if (moduleName.endsWith(".x")) {
        if (!moduleName.startsWith("./") && !moduleName.startsWith("/")) {
          return null;
        }
      }

      const targetPath = path.resolve(currentDir, moduleName);
      if (fs.existsSync(targetPath)) {
        return Location.create(
          pathToFileURL(targetPath).toString(),
          Range.create(0, 0, 0, 0),
        );
      }
    }

    // Check if clicked on import name
    for (const importItem of node.importName) {
      if (importItem.token && isTokenAt(importItem.token, line, column)) {
        const moduleName = node.moduleName;

        if (moduleName.endsWith(".x")) {
          if (!moduleName.startsWith("./") && !moduleName.startsWith("/")) {
            return null;
          }
        }

        const targetPath = path.resolve(currentDir, moduleName);

        if (!fs.existsSync(targetPath)) return null;

        const scope = processImport(targetPath);
        if (scope) {
          if (importItem.type === "function") {
            const func = scope.resolveFunction(importItem.name);
            if (func && func.declaration) {
              return Location.create(
                pathToFileURL(targetPath).toString(),
                Range.create(
                  func.declaration.line - 1,
                  func.declaration.column - 1,
                  func.declaration.line - 1,
                  func.declaration.column - 1 + func.declaration.value.length,
                ),
              );
            }
          } else {
            const typeInfo = scope.resolveType(importItem.name);
            if (typeInfo && typeInfo.declaration) {
              return Location.create(
                pathToFileURL(targetPath).toString(),
                Range.create(
                  typeInfo.declaration.line - 1,
                  typeInfo.declaration.column - 1,
                  typeInfo.declaration.line - 1,
                  typeInfo.declaration.column -
                    1 +
                    typeInfo.declaration.value.length,
                ),
              );
            }
          }
        }
        // Fallback to just opening the file
        return Location.create(
          pathToFileURL(targetPath).toString(),
          Range.create(0, 0, 0, 0),
        );
      }
    }
  }

  return null;
});

function isTokenAt(
  token: Token | undefined,
  line: number,
  column: number,
): boolean {
  if (!token) return false;
  return (
    line === token.line &&
    column >= token.column &&
    column < token.column + token.value.length
  );
}

// Find node at specific position in AST
function findNodeAt(
  node: Expression,
  line: number,
  column: number,
): Expression | null {
  // Special case for ProgramExpr or nodes without tokens (though most should have them)
  if (node instanceof ProgramExpr) {
    for (const expr of node.expressions) {
      const found = findNodeAt(expr, line, column);
      if (found) return found;
    }
    return null;
  }

  if (!node.startToken || !node.endToken) return null;

  // Check if position is within node's range
  if (line < node.startToken.line || line > node.endToken.line) return null;

  // If single line
  if (node.startToken.line === node.endToken.line) {
    if (column < node.startToken.column) return null;
    if (column >= node.endToken.column + node.endToken.value.length)
      return null;
  } else {
    // Multi-line
    if (line === node.startToken.line && column < node.startToken.column)
      return null;
    if (
      line === node.endToken.line &&
      column >= node.endToken.column + node.endToken.value.length
    )
      return null;
  }

  // Check children
  if (node instanceof ProgramExpr) {
    for (const expr of node.expressions) {
      const found = findNodeAt(expr, line, column);
      if (found) return found;
    }
  } else if (node instanceof BlockExpr) {
    for (const expr of node.expressions) {
      const found = findNodeAt(expr, line, column);
      if (found) return found;
    }
  } else if (node instanceof FunctionDeclarationExpr) {
    if (isTokenAt(node.nameToken, line, column)) return node;
    if (node.returnType && findTypeNodeAt(node.returnType, line, column))
      return node;
    for (const arg of node.args) {
      if (findTypeNodeAt(arg.type, line, column)) return node;
    }
    const found = findNodeAt(node.body, line, column);
    if (found) return found;
  } else if (node instanceof IfExpr) {
    let found = findNodeAt(node.condition, line, column);
    if (found) return found;
    found = findNodeAt(node.thenBranch, line, column);
    if (found) return found;
    if (node.elseBranch) {
      found = findNodeAt(node.elseBranch, line, column);
      if (found) return found;
    }
  } else if (node instanceof LoopExpr) {
    const found = findNodeAt(node.body, line, column);
    if (found) return found;
  } else if (node instanceof BinaryExpr) {
    let found = findNodeAt(node.left, line, column);
    if (found) return found;
    found = findNodeAt(node.right, line, column);
    if (found) return found;
  } else if (node instanceof UnaryExpr) {
    const found = findNodeAt(node.right, line, column);
    if (found) return found;
  } else if (node instanceof FunctionCallExpr) {
    for (const arg of node.args) {
      const found = findNodeAt(arg, line, column);
      if (found) return found;
    }
    return node;
  } else if (node instanceof VariableDeclarationExpr) {
    if (isTokenAt(node.nameToken, line, column)) return node;
    if (findTypeNodeAt(node.varType, line, column)) return node;
    if (node.value) {
      const found = findNodeAt(node.value, line, column);
      if (found) return found;
    }
    // return node; // Don't return node aggressively
  } else if (node instanceof IdentifierExpr) {
    return node;
  } else if (node instanceof MemberAccessExpr) {
    let found = findNodeAt(node.object, line, column);
    if (found) return found;
    if (node.property instanceof Expression) {
      found = findNodeAt(node.property, line, column);
      if (found) return found;
    }
  } else if (node instanceof ReturnExpr) {
    if (node.value) {
      const found = findNodeAt(node.value, line, column);
      if (found) return found;
    }
  } else if (node instanceof ArrayLiteralExpr) {
    for (const el of node.elements) {
      const found = findNodeAt(el, line, column);
      if (found) return found;
    }
  } else if (node instanceof ExportExpr) {
    if (isTokenAt(node.nameToken, line, column)) return node;
  } else if (node instanceof ImportExpr) {
    if (node.moduleNameToken && isTokenAt(node.moduleNameToken, line, column))
      return node;
    for (const imp of node.importName) {
      if (isTokenAt(imp.token, line, column)) return node;
    }
  } else if (node instanceof StructDeclarationExpr) {
    for (const field of node.fields) {
      if (isTokenAt(field.type.token, line, column)) return node;
    }
  } else if (node instanceof ExternDeclarationExpr) {
    if (node.returnType && isTokenAt(node.returnType.token, line, column))
      return node;
    for (const arg of node.args) {
      if (isTokenAt(arg.type.token, line, column)) return node;
    }
  }

  if (node instanceof IdentifierExpr || node instanceof FunctionCallExpr) {
    return node;
  }

  return null;
}

function findTypeNodeAt(
  typeNode: VariableType,
  line: number,
  column: number,
): VariableType | null {
  // Check if the cursor is on the main type token
  if (isTokenAt(typeNode.token, line, column)) {
    return typeNode;
  }
  // Check generic arguments recursively
  if (typeNode.genericArgs) {
    for (const arg of typeNode.genericArgs) {
      const found = findTypeNodeAt(arg, line, column);
      if (found) return found;
    }
  }
  return null;
}

function formatType(type: VariableType): string {
  let s = type.name;
  if (type.genericArgs && type.genericArgs.length > 0) {
    s += `<${type.genericArgs.map((arg) => formatType(arg)).join(", ")}>`;
  }
  for (let i = 0; i < type.isPointer; i++) {
    s = "*" + s;
  }
  for (const dim of type.isArray) {
    s += `[${dim}]`;
  }
  return s;
}

function getLocationString(
  symbol: { sourceFile?: string; declaration?: Token },
  currentFile: string,
): string {
  if (!symbol.declaration) return "";

  if (symbol.sourceFile && symbol.sourceFile !== currentFile) {
    return `\n\n*Imported from ${path.basename(symbol.sourceFile)} (Line ${symbol.declaration.line})*`;
  } else {
    return `\n\n*Defined at Line ${symbol.declaration.line}*`;
  }
}

function resolveTypeFromNode(
  scope: Scope,
  typeNode: VariableType,
): TypeInfo | null {
  if (typeNode.genericArgs && typeNode.genericArgs.length > 0) {
    return scope.resolveGenericType(typeNode.name, typeNode.genericArgs);
  }
  return scope.resolveType(typeNode.name);
}

function formatTypeInfo(typeInfo: TypeInfo, currentFile: string): string {
  let output = "";
  if (typeInfo.info.description) {
    output += `${typeInfo.info.description}\n\n`;
  }

  output += "```bpl\n";
  if (typeInfo.isPrimitive) {
    output += `// Primitive Type: ${typeInfo.name}\n`;
    if (typeInfo.info.range) {
      output += `// Range: [${typeInfo.info.range[0]}, ${typeInfo.info.range[1]}]\n`;
    }
  } else {
    let name = typeInfo.name;
    if (typeInfo.genericParams && typeInfo.genericParams.length > 0) {
      name += `<${typeInfo.genericParams.join(", ")}>`;
    }
    output += `struct ${name} {\n`;
    if (typeInfo.members.size > 0) {
      for (const [name, member] of typeInfo.members) {
        let memberTypeStr = member.name;
        for (let i = 0; i < member.isPointer; i++) {
          memberTypeStr = "*" + memberTypeStr;
        }
        for (const dim of member.isArray) {
          memberTypeStr += `[${dim}]`;
        }
        output += `  ${name}: ${memberTypeStr}; // offset: ${member.offset}\n`;
      }
    } else if (typeInfo.genericFields && typeInfo.genericFields.length > 0) {
      for (const field of typeInfo.genericFields) {
        output += `  ${field.name}: ${formatType(field.type)};\n`;
      }
    }
    output += `}\n`;
    output += `// Size: ${typeInfo.size} bytes, Alignment: ${typeInfo.alignment}\n`;
  }
  output += "```";
  output += getLocationString(typeInfo, currentFile);
  return output;
}

connection.onHover((params: HoverParams): Hover | null => {
  const ast = documentASTs.get(params.textDocument.uri);
  const scope = documentScopes.get(params.textDocument.uri);
  if (!ast || !scope) return null;

  const currentFilePath = fileURLToPath(params.textDocument.uri);
  const line = params.position.line + 1;
  const column = params.position.character + 1;

  const node = findNodeAt(ast, line, column);
  connection.console.log(
    `Hover at ${line}:${column} found node: ${node ? node.constructor.name : "null"}`,
  );
  if (!node) return null;

  if (node instanceof IdentifierExpr) {
    if (node.contextScope) {
      const symbol = node.contextScope.resolve(node.name);
      if (symbol) {
        let typeStr = symbol.type === "local" ? "local" : "global";
        if (symbol.isParameter) {
          typeStr = "argument";
        }
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `\`\`\`bpl\n${typeStr} ${node.name}: ${formatType(symbol.varType)}\n\`\`\`${getLocationString(symbol, currentFilePath)}`,
          },
        };
      }
    }
  } else if (node instanceof FunctionCallExpr) {
    if (node.contextScope) {
      const func = node.contextScope.resolveFunction(node.functionName);
      if (func) {
        const args = func.args
          .map((a) => `${a.name}: ${formatType(a.type)}`)
          .join(", ");
        const ret = func.returnType ? formatType(func.returnType) : "void";
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `\`\`\`bpl\nfunction ${node.functionName}(${args}): ${ret}\n\`\`\`${getLocationString(func, currentFilePath)}`,
          },
        };
      }
    }
  } else if (node instanceof VariableDeclarationExpr) {
    if (isTokenAt(node.nameToken, line, column)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `\`\`\`bpl\n${node.scope} ${node.name}: ${formatType(node.varType)}\n\`\`\`\n\n*Defined at Line ${node.nameToken!.line}*`,
        },
      };
    }
    // Try to find the specific type node being hovered
    const typeNode = findTypeNodeAt(node.varType, line, column);
    if (typeNode) {
      const resolutionScope = node.contextScope || scope;
      const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
      if (typeInfo) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: formatTypeInfo(typeInfo, currentFilePath),
          },
        };
      }
    }
  } else if (node instanceof FunctionDeclarationExpr) {
    if (isTokenAt(node.nameToken, line, column)) {
      const args = node.args
        .map((a) => `${a.name}: ${formatType(a.type)}`)
        .join(", ");
      const ret = node.returnType ? formatType(node.returnType) : "void";
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `\`\`\`bpl\nfunction ${node.name}(${args}): ${ret}\n\`\`\`\n\n*Defined at Line ${node.nameToken!.line}*`,
        },
      };
    }
    if (node.returnType) {
      const typeNode = findTypeNodeAt(node.returnType, line, column);
      if (typeNode) {
        const resolutionScope = node.contextScope || scope;
        const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
    }
    for (const arg of node.args) {
      const typeNode = findTypeNodeAt(arg.type, line, column);
      if (typeNode) {
        const resolutionScope = node.contextScope || scope;
        const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
    }
  } else if (node instanceof ExportExpr) {
    if (isTokenAt(node.nameToken, line, column)) {
      if (node.exportType === "function") {
        const func = scope.resolveFunction(node.exportName);
        if (func) {
          const args = func.args
            .map((a) => `${a.name}: ${formatType(a.type)}`)
            .join(", ");
          const ret = func.returnType ? formatType(func.returnType) : "void";
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `\`\`\`bpl\nexport function ${node.exportName}(${args}): ${ret}\n\`\`\`${getLocationString(func, currentFilePath)}`,
            },
          };
        }
      } else {
        const typeInfo = scope.resolveType(node.exportName);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `\`\`\`bpl\nexport ${node.exportType} ${node.exportName}\n\`\`\``,
        },
      };
    }
  } else if (node instanceof ImportExpr) {
    for (const imp of node.importName) {
      if (isTokenAt(imp.token, line, column)) {
        if (imp.type === "type") {
          const typeInfo = scope.resolveType(imp.name);
          if (typeInfo) {
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: formatTypeInfo(typeInfo, currentFilePath),
              },
            };
          }
        } else {
          const func = scope.resolveFunction(imp.name);
          if (func) {
            const args = func.args
              .map((a) => `${a.name}: ${formatType(a.type)}`)
              .join(", ");
            const ret = func.returnType ? formatType(func.returnType) : "void";
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: `\`\`\`bpl\nimport function ${imp.name}(${args}): ${ret}\n\`\`\`${getLocationString(func, currentFilePath)}`,
              },
            };
          }
        }
      }
    }
  } else if (node instanceof StructDeclarationExpr) {
    for (const field of node.fields) {
      const typeNode = findTypeNodeAt(field.type, line, column);
      if (typeNode) {
        const resolutionScope = node.contextScope || scope;
        const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
    }
  } else if (node instanceof ExternDeclarationExpr) {
    if (node.returnType) {
      const typeNode = findTypeNodeAt(node.returnType, line, column);
      if (typeNode) {
        const resolutionScope = node.contextScope || scope;
        const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
    }
    for (const arg of node.args) {
      const typeNode = findTypeNodeAt(arg.type, line, column);
      if (typeNode) {
        const resolutionScope = node.contextScope || scope;
        const typeInfo = resolveTypeFromNode(resolutionScope, typeNode);
        if (typeInfo) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: formatTypeInfo(typeInfo, currentFilePath),
            },
          };
        }
      }
    }
  }

  return null;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
