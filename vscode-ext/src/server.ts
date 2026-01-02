import * as fs from "fs";
import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Hover,
  Location,
  MarkupKind,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
  CodeAction,
  CodeActionKind,
  CodeLens,
  InsertTextFormat,
  type InitializeParams,
  type TextDocumentPositionParams,
  type InitializeResult,
} from "vscode-languageserver/node";

import { DocParser } from "../../compiler/common/DocParser";

// Compiler integration
import * as AST from "../../compiler/common/AST";
import { CompilerError } from "../../compiler/common/CompilerError";
import { Formatter } from "../../compiler/formatter/Formatter";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

interface AnalysisResult {
  program: AST.Program;
  checker: TypeChecker;
}

function typeNodeToString(type: AST.TypeNode | undefined): string {
  if (!type) return "void";
  switch (type.kind) {
    case "BasicType":
      let name = type.name;
      if (type.genericArgs && type.genericArgs.length > 0) {
        name += `<${type.genericArgs.map(typeNodeToString).join(", ")}>`;
      }
      if (type.arrayDimensions) {
        for (const dim of type.arrayDimensions) {
          name += `[${dim !== null ? dim : ""}]`;
        }
      }
      if (type.pointerDepth) {
        name = "*".repeat(type.pointerDepth) + name;
      }
      return name;
    case "FunctionType":
      const params = type.paramTypes.map(typeNodeToString).join(", ");
      const ret = typeNodeToString(type.returnType);
      return `Func<${ret}>(${params})`;
    case "TupleType":
      return `(${type.types.map(typeNodeToString).join(", ")})`;
    default:
      return "unknown";
  }
}
const documentAnalysis = new Map<string, AnalysisResult>();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let _hasDiagnosticRelatedInformationCapability = false; // reserved for future use

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
  _hasDiagnosticRelatedInformationCapability = !!(
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
      definitionProvider: true,
      hoverProvider: true,
      documentFormattingProvider: true,
      renameProvider: true,
      referencesProvider: true,
      implementationProvider: true,
      codeActionProvider: true,
      codeLensProvider: {
        resolveProvider: false,
      },
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

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
  bplHome?: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Promise<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = (change.settings.bplLanguageServer ||
      defaultSettings) as ExampleSettings;
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Promise<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "bplLanguageServer",
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

function getTextForUri(
  uri: string,
  openDocuments: TextDocuments<TextDocument>,
): string | null {
  const doc = openDocuments.get(uri);
  if (doc) return doc.getText();
  try {
    const fsPath = fileURLToPath(uri);
    return fs.readFileSync(fsPath, "utf-8");
  } catch {
    return null;
  }
}

// Resolve workspace lib directory (for std/* imports)
function findWorkspaceLibDir(startDir: string): string | null {
  // Check BPL_HOME environment variable first
  if (process.env.BPL_HOME) {
    const bplHomeLib = path.join(process.env.BPL_HOME, "lib");
    if (fs.existsSync(bplHomeLib)) {
      return bplHomeLib;
    }
    // Also check if BPL_HOME itself is the lib dir (some users might set it that way)
    if (fs.existsSync(path.join(process.env.BPL_HOME, "string.bpl"))) {
      return process.env.BPL_HOME;
    }
  }

  let dir = startDir;
  const maxUp = 10;
  for (let i = 0; i < maxUp; i++) {
    const libDir = path.join(dir, "lib");
    if (
      fs.existsSync(libDir) &&
      fs.existsSync(path.join(libDir, "string.bpl"))
    ) {
      return libDir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveImportToFile(
  importPath: string | undefined,
  currentDir: string,
): string | null {
  if (!importPath) return null;

  if (importPath.startsWith("std/") || importPath.startsWith("std\\")) {
    const libDir =
      findWorkspaceLibDir(currentDir) || path.join(currentDir, "lib");
    let candidate = path.join(libDir, importPath.replace(/^std[\/]/, ""));
    if (!candidate.endsWith(".bpl")) candidate += ".bpl";
    return fs.existsSync(candidate) ? candidate : null;
  }

  let resolvedPath = path.resolve(currentDir, importPath || "");
  if (!fs.existsSync(resolvedPath) && fs.existsSync(resolvedPath + ".bpl")) {
    resolvedPath += ".bpl";
  }
  return fs.existsSync(resolvedPath) ? resolvedPath : null;
}

// Import cache: stores parsed modules to avoid re-parsing on every validation
interface CacheEntry {
  program: AST.Program;
  timestamp: number;
  filePath: string;
}

const importCache = new Map<string, CacheEntry>();
const fileWatchers = new Map<string, NodeJS.Timeout>();

// Invalidate cache entry when a file changes
function invalidateCacheEntry(filePath: string): void {
  importCache.delete(filePath);
  // Also invalidate any files that imported this module
  for (const [key] of importCache) {
    importCache.delete(key);
  }
}

// Watch a file for changes and invalidate cache
function watchFileForChanges(filePath: string): void {
  if (fileWatchers.has(filePath)) {
    return; // Already watching
  }

  try {
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === "change") {
        invalidateCacheEntry(filePath);
      }
    });
    fileWatchers.set(filePath, watcher as any);
  } catch {
    // File watch might fail on some systems, that's okay
  }
}

// Load and parse an imported module with caching
function _loadImportedModuleWithCache(
  importPath: string,
  currentDir: string,
): { text: string; program: AST.Program } | null {
  const resolvedPath = resolveImportToFile(importPath, currentDir);
  if (!resolvedPath) return null;

  // Check cache first
  const cached = importCache.get(resolvedPath);
  if (cached) {
    const stat = fs.statSync(resolvedPath);
    if (stat.mtimeMs === cached.timestamp) {
      return { text: "", program: cached.program }; // Timestamp matches, cache is valid
    }
  }

  // Parse fresh
  try {
    const moduleText = fs.readFileSync(resolvedPath, "utf-8");
    const parser = new Parser(moduleText, resolvedPath);
    const program = parser.parse();

    // Store in cache with timestamp
    const stat = fs.statSync(resolvedPath);
    importCache.set(resolvedPath, {
      program,
      timestamp: stat.mtimeMs,
      filePath: resolvedPath,
    });

    // Watch for future changes
    watchFileForChanges(resolvedPath);

    return { text: moduleText, program };
  } catch {
    return null;
  }
}

// Check if an import error should be suppressed (only for valid std/* imports)
function _shouldSuppressImportError(
  errorMessage: string,
  documentText: string,
  documentUri: string,
): boolean {
  // Only check import-related errors
  if (!/module not found|cannot resolve import/i.test(errorMessage)) {
    return false;
  }

  const currentDir = path.dirname(fileURLToPath(documentUri));
  const importRegex = /import\s+.+?\s+from\s+["'](.+?)["']/g;
  let match;

  while ((match = importRegex.exec(documentText)) !== null) {
    const importPath = match[1];
    // Suppress for valid std/* imports
    if (
      importPath &&
      (importPath.startsWith("std/") || importPath.startsWith("std\\"))
    ) {
      const resolvedStd = resolveImportToFile(importPath, currentDir);
      if (resolvedStd && fs.existsSync(resolvedStd)) {
        return true;
      }
    }
    // Also suppress for valid relative imports that resolve on disk
    if (
      importPath &&
      (importPath.startsWith("./") ||
        importPath.startsWith("../") ||
        importPath.startsWith("/"))
    ) {
      const resolvedRel = resolveImportToFile(importPath, currentDir);
      if (resolvedRel && fs.existsSync(resolvedRel)) {
        return true;
      }
    }
  }

  // No valid std/* imports found, don't suppress
  return false;
}

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  const settings = await getDocumentSettings(textDocument.uri);
  const maxNumberOfProblems = settings?.maxNumberOfProblems || 1000;

  const text = textDocument.getText();
  const filePath = fileURLToPath(textDocument.uri);
  const currentDir = path.dirname(filePath);

  if (settings?.bplHome) {
    process.env.BPL_HOME = settings.bplHome;
  } else {
    // Auto-detect BPL_HOME if not set
    const libDir = findWorkspaceLibDir(currentDir);
    if (libDir) {
      process.env.BPL_HOME = path.dirname(libDir);
    }
  }

  const diagnostics: Diagnostic[] = [];
  try {
    // Parse to AST
    const parser = new Parser(text, filePath);
    const program: AST.Program = parser.parse();

    // Type check with full import resolution for accuracy matching CLI compiler
    // TypeChecker now collects all errors instead of throwing
    const checker = new TypeChecker({
      skipImportResolution: false,
      collectAllErrors: true,
    });

    checker.checkProgram(program);

    // Store analysis result
    documentAnalysis.set(textDocument.uri, { program, checker });

    // Collect all errors from the type checker - report them as-is
    // No filtering: with import resolution enabled, errors are accurate
    const errors = checker.getErrors();
    for (const err of errors) {
      diagnostics.push(compilerErrorToDiagnostic(err, textDocument));
    }
  } catch (e: any) {
    // Handle parse errors or unexpected errors
    if (e && e instanceof CompilerError) {
      diagnostics.push(compilerErrorToDiagnostic(e, textDocument));
    } else {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: Range.create(0, 0, 0, 1),
        message: String(e?.message || e),
        source: "bpl-lsp",
      });
    }
  }

  // Cap diagnostics if needed
  const limited = diagnostics.slice(0, maxNumberOfProblems);
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: limited });
}

function compilerErrorToDiagnostic(
  err: CompilerError,
  doc: TextDocument,
): Diagnostic {
  const start = clampPosition(
    doc,
    err.location.startLine,
    err.location.startColumn,
  );
  const end = clampPosition(
    doc,
    err.location.endLine ?? err.location.startLine,
    err.location.endColumn ?? err.location.startColumn + 1,
  );
  return {
    severity: DiagnosticSeverity.Error,
    range: Range.create(start, end),
    message: `${err.message}${err.hint ? `\nHint: ${err.hint}` : ""}`,
    source: "bpl-lsp",
  };
}

function clampPosition(doc: TextDocument, line: number, character: number) {
  const text = doc.getText();
  const lines = text.split(/\r?\n/);
  const l = Math.max(0, Math.min(lines.length - 1, (line ?? 1) - 1));
  const maxChar = lines[l]?.length ?? 0;
  const c = Math.max(0, Math.min(maxChar, (character ?? 1) - 1));
  return { line: l, character: c };
}

// Formatting: full document only; no on-type formatting
connection.onDocumentFormatting(async (params) => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  const text = doc.getText();
  const filePath = fileURLToPath(doc.uri);
  try {
    const parser = new Parser(text, filePath);
    const program: AST.Program = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(program);
    const fullRange = Range.create(0, 0, doc.lineCount, 0);
    return [
      {
        range: fullRange,
        newText: formatted,
      },
    ];
  } catch (e: any) {
    // If formatting fails, return no edits
    connection.console.error(`Formatting failed: ${e?.message || e}`);
    return [];
  }
});

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

    const text = document.getText();
    const _offset = document.offsetAt(textDocumentPosition.position);
    const lineText = text.split("\n")[textDocumentPosition.position.line] || "";
    const charBefore = lineText[textDocumentPosition.position.character - 1];

    // 1. Member Access Completion (User.)
    if (charBefore === ".") {
      // Find the expression before the dot
      // Handle generics and arrays: Array<int>. or arr[0].
      let i = textDocumentPosition.position.character - 2;
      let depth = 0;

      while (i >= 0) {
        const char = lineText[i];
        if (char === ">") depth++;
        else if (char === "<") depth--;
        else if (char === "]") depth++;
        else if (char === "[") depth--;
        else if (char === ")") depth++;
        else if (char === "(") depth--;

        if (depth === 0 && !/[a-zA-Z0-9_]/.test(char || "")) break;
        i--;
      }

      const varName = lineText
        .substring(i + 1, textDocumentPosition.position.character - 1)
        .trim();

      if (varName) {
        let typeName = varName;
        let isStaticAccess = true; // Default to static access (Type.member)

        const analysis = documentAnalysis.get(
          textDocumentPosition.textDocument.uri,
        );
        if (analysis) {
          // Check if varName is a variable in scope
          const line = textDocumentPosition.position.line + 1;
          const col = textDocumentPosition.position.character - 1;
          const nodePath = findNodeAtPosition(analysis.program, line, col);
          const node =
            nodePath.length > 0 ? nodePath[nodePath.length - 1] : null;

          if (node) {
            if (node.kind === "Identifier") {
              const ident = node as AST.IdentifierExpr;
              if (ident.resolvedType) {
                typeName = analysis.checker.typeToString(ident.resolvedType);
                isStaticAccess = false; // Variable access (instance.member)
              }
            } else if (node.kind === "Index") {
              const access = node as AST.IndexExpr;
              if (access.resolvedType) {
                typeName = analysis.checker.typeToString(access.resolvedType);
                isStaticAccess = false;
              }
            } else if (node.kind === "Call") {
              const call = node as AST.CallExpr;
              if (call.resolvedType) {
                typeName = analysis.checker.typeToString(call.resolvedType);
                isStaticAccess = false;
              }
            } else if (node.kind === "Member") {
              const access = node as AST.MemberExpr;
              // If we are at the dot, we want the type of the object
              if (access.object && access.object.resolvedType) {
                typeName = analysis.checker.typeToString(
                  access.object.resolvedType,
                );
                isStaticAccess = false;
              }
            }
          }
        }

        // Fallback: If AST analysis failed (e.g. due to syntax errors), try to find type via regex
        if (typeName === varName && isStaticAccess) {
          // Check for 'this'
          if (varName === "this") {
            const structName = findEnclosingStruct(
              text,
              textDocumentPosition.position.line,
            );
            if (structName) {
              typeName = structName;
              isStaticAccess = false;
            }
          } else {
            // Check for local/arg variable
            const inferredType = findVariableType(
              text,
              varName,
              textDocumentPosition.position.line,
            );
            if (inferredType) {
              typeName = inferredType;
              isStaticAccess = false;
            }
          }
        }

        // Normalize type name for lookup (handle generics and arrays)
        let baseTypeName = typeName;
        if (typeName.endsWith("[]")) {
          baseTypeName = "Array";
        } else if (typeName.includes("<")) {
          baseTypeName = typeName.split("<")[0] || typeName;
        }

        // Find definition of baseTypeName
        const typeDef = findSymbolDefinition(document, baseTypeName);
        if (typeDef) {
          // If the definition is in the current file, use the cached program if available
          // to avoid parsing errors due to incomplete code
          if (typeDef.uri === document.uri) {
            const cachedAnalysis = documentAnalysis.get(document.uri);
            if (cachedAnalysis && cachedAnalysis.program) {
              const decl = cachedAnalysis.program.statements.find(
                (s) =>
                  (s.kind === "StructDecl" || s.kind === "EnumDecl") &&
                  (s as any).name === baseTypeName,
              );
              if (decl) {
                return getCompletionItemsFromDecl(
                  decl,
                  baseTypeName,
                  isStaticAccess,
                );
              }
            }
          }

          const fullText = getTextForUri(typeDef.uri, documents);
          if (fullText) {
            try {
              // Parse the file to get AST
              const parser = new Parser(fullText, fileURLToPath(typeDef.uri));
              const program = parser.parse();

              // Find the struct/enum declaration
              const decl = program.statements.find(
                (s) =>
                  (s.kind === "StructDecl" || s.kind === "EnumDecl") &&
                  (s as any).name === baseTypeName,
              );

              if (decl) {
                return getCompletionItemsFromDecl(
                  decl,
                  baseTypeName,
                  isStaticAccess,
                );
              }
            } catch (e) {
              connection.console.error(`Failed to parse definition file: ${e}`);
            }
          }
        }
      }
      return [];
    }

    const keywords = [
      "global",
      "local",
      "const",
      "type",
      "frame",
      "ret",
      "struct",
      "enum",
      "import",
      "from",
      "export",
      "extern",
      "asm",
      "loop",
      "if",
      "else",
      "break",
      "continue",
      "try",
      "catch",
      "return",
      "throw",
      "switch",
      "case",
      "default",
      "cast",
      "sizeof",
      "match",
      "null",
      "nullptr",
      "true",
      "false",
      "new",
      "func",
      "class",
      "extends",
      "implements",
      "spec",
    ];
    const types = [
      "int",
      "uint",
      "u8",
      "u16",
      "u32",
      "u64",
      "float",
      "bool",
      "char",
      "void",
      "any",
      "Func",
      "string",
      "Self",
      "Option",
      "Result",
    ];

    const items: CompletionItem[] = [];

    keywords.forEach((kw, index) => {
      items.push({
        label: kw,
        kind: CompletionItemKind.Keyword,
        data: index,
      });
    });

    types.forEach((t, index) => {
      items.push({
        label: t,
        kind: CompletionItemKind.Class,
        data: keywords.length + index,
      });
    });

    // Add local variables from AST analysis
    const analysis = documentAnalysis.get(
      textDocumentPosition.textDocument.uri,
    );
    if (analysis) {
      // Traverse AST to find locals in scope at current position
      // This is a simplified traversal.
      // We can look at the checker's scope if we had position info in scopes.
      // Instead, let's just collect all locals in the current function.
      const line = textDocumentPosition.position.line + 1;
      const currentFunc = findFunctionAtLine(analysis.program, line);
      if (currentFunc) {
        // Add params
        currentFunc.params.forEach((p) => {
          items.push({
            label: p.name,
            kind: CompletionItemKind.Variable,
            detail: analysis.checker.typeToString(p.type),
          });
        });
        // Add locals from body
        // We need to traverse the body statements
        traverseLocals(currentFunc.body.statements, (name, type) => {
          items.push({
            label: name,
            kind: CompletionItemKind.Variable,
            detail: type ? analysis.checker.typeToString(type) : "unknown",
          });
        });
      }
    }

    return items;
  },
);

function findFunctionAtLine(
  program: AST.Program,
  line: number,
): AST.FunctionDecl | null {
  for (const decl of program.statements) {
    if (decl.kind === "FunctionDecl") {
      const func = decl as AST.FunctionDecl;
      if (
        func.location &&
        line >= func.location.startLine &&
        line <= func.location.endLine
      ) {
        return func;
      }
    } else if (decl.kind === "StructDecl") {
      const struct = decl as AST.StructDecl;
      for (const member of struct.members) {
        if (member.kind === "FunctionDecl") {
          const method = member as AST.FunctionDecl;
          if (
            method.location &&
            line >= method.location.startLine &&
            line <= method.location.endLine
          ) {
            return method;
          }
        }
      }
    }
  }
  return null;
}

function traverseLocals(
  stmts: AST.Statement[],
  cb: (name: string, type?: AST.TypeNode) => void,
) {
  for (const stmt of stmts) {
    if (stmt.kind === "VariableDecl") {
      const varDecl = stmt as AST.VariableDecl;
      if (typeof varDecl.name === "string") {
        cb(varDecl.name, varDecl.typeAnnotation);
      } else {
        // Destructuring
        for (const item of varDecl.name) {
          cb(item.name, item.type);
        }
      }
    } else if (stmt.kind === "Block") {
      traverseLocals((stmt as AST.BlockStmt).statements, cb);
    } else if (stmt.kind === "If") {
      const ifStmt = stmt as AST.IfStmt;
      if (ifStmt.thenBranch.kind === "Block") {
        traverseLocals((ifStmt.thenBranch as AST.BlockStmt).statements, cb);
      }
      if (ifStmt.elseBranch) {
        if (ifStmt.elseBranch.kind === "Block") {
          traverseLocals((ifStmt.elseBranch as AST.BlockStmt).statements, cb);
        } else if (ifStmt.elseBranch.kind === "If") {
          // else if - recursive check on the single statement
          traverseLocals([ifStmt.elseBranch], cb);
        }
      }
    } else if (stmt.kind === "Loop") {
      const loopStmt = stmt as AST.LoopStmt;
      if (loopStmt.body.kind === "Block") {
        traverseLocals((loopStmt.body as AST.BlockStmt).statements, cb);
      }
    }
  }
}

function getCompletionItemsFromDecl(
  decl: AST.Statement,
  typeName: string,
  isStaticAccess: boolean,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  if (decl.kind === "StructDecl") {
    const structDecl = decl as AST.StructDecl;

    // Fields (only for instance access)
    if (!isStaticAccess) {
      for (const member of structDecl.members) {
        if (member.kind === "StructField") {
          const field = member as AST.StructField;
          const typeStr = typeNodeToString(field.type);
          items.push({
            label: field.name,
            kind: CompletionItemKind.Field,
            detail: `${field.name}: ${typeStr}`,
            documentation: `Field of ${typeName}`,
          });
        }
      }
    }

    // Methods
    for (const member of structDecl.members) {
      if (member.kind === "FunctionDecl") {
        const method = member as AST.FunctionDecl;

        // Filter static vs instance methods
        // Static methods (like new) usually don't have 'this' as first param
        // Instance methods have 'this'
        const isInstanceMethod =
          method.params.length > 0 && method.params[0]?.name === "this";

        if (
          (isStaticAccess && !isInstanceMethod) ||
          (!isStaticAccess && isInstanceMethod)
        ) {
          const paramsStr = method.params
            .map((p) => `${p.name}: ${typeNodeToString(p.type)}`)
            .join(", ");
          const retTypeStr = typeNodeToString(method.returnType);
          const signature = `frame ${method.name}(${paramsStr}) ret ${retTypeStr}`;

          items.push({
            label: method.name,
            kind: CompletionItemKind.Method,
            detail: signature,
            documentation: `Method of ${typeName}`,
            insertText: method.name + "($0)",
            insertTextFormat: InsertTextFormat.Snippet,
          });
        }
      }
    }
  } else if (decl.kind === "EnumDecl") {
    const enumDecl = decl as AST.EnumDecl;

    // Variants (Static access only)
    if (isStaticAccess) {
      for (const variant of enumDecl.variants) {
        let detail = variant.name;
        if (variant.dataType) {
          // Add data type info if available
          if (variant.dataType.kind === "EnumVariantTuple") {
            const types = variant.dataType.types
              .map((t) => typeNodeToString(t))
              .join(", ");
            detail += `(${types})`;
          } else if (variant.dataType.kind === "EnumVariantStruct") {
            const fields = variant.dataType.fields
              .map((f) => `${f.name}: ${typeNodeToString(f.type)}`)
              .join(", ");
            detail += `{ ${fields} }`;
          }
        }

        items.push({
          label: variant.name,
          kind: CompletionItemKind.EnumMember,
          detail: detail,
          documentation: `Variant of ${typeName}`,
        });
      }
    }

    // Methods
    for (const method of enumDecl.methods) {
      const isInstanceMethod =
        method.params.length > 0 && method.params[0]?.name === "this";

      if (
        (isStaticAccess && !isInstanceMethod) ||
        (!isStaticAccess && isInstanceMethod)
      ) {
        const paramsStr = method.params
          .map((p) => `${p.name}: ${typeNodeToString(p.type)}`)
          .join(", ");
        const retTypeStr = typeNodeToString(method.returnType);
        const signature = `frame ${method.name}(${paramsStr}) ret ${retTypeStr}`;

        items.push({
          label: method.name,
          kind: CompletionItemKind.Method,
          detail: signature,
          documentation: `Method of ${typeName}`,
          insertText: method.name + "($0)",
          insertTextFormat: InsertTextFormat.Snippet,
        });
      }
    }
  }

  return items;
}

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.kind === CompletionItemKind.Keyword) {
    item.detail = "Keyword";
    item.documentation = `BPL keyword: ${item.label}`;
  } else if (item.kind === CompletionItemKind.Class) {
    item.detail = "Type";
    item.documentation = `BPL built-in type: ${item.label}`;
  }
  return item;
});

function findSymbolDefinition(
  document: TextDocument,
  word: string,
): { uri: string; range: Range; lineContent: string } | null {
  const text = document.getText();

  // 1. Search in current file
  const definitionRegex = new RegExp(
    `\\b(frame|struct|enum|local|global|type|extern|spec)\\s+${word}\\b`,
    "g",
  );
  const match = definitionRegex.exec(text);
  if (match) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);

    const matchType = match[1];
    let lineContent = "";
    const lines = text.split(/\r?\n/);
    const currentLineIdx = startPos.line;

    // Special handling for 'frame': Always show just the signature, never the body
    if (matchType === "frame") {
      const collectedLines: string[] = [];
      const maxLines = 10;

      for (let i = 0; i < maxLines; i++) {
        if (currentLineIdx + i >= lines.length) break;
        let lineStr = lines[currentLineIdx + i] ?? "";

        const braceIdx = lineStr.indexOf("{");
        if (braceIdx !== -1) {
          lineStr = lineStr.substring(0, braceIdx).trim();
          collectedLines.push(lineStr);
          break;
        } else {
          collectedLines.push(lineStr);
        }
      }
      lineContent = collectedLines.join(" ").trim();

      return {
        uri: document.uri,
        range: Range.create(startPos, endPos),
        lineContent: lineContent,
      };
    }

    if (
      matchType === "struct" ||
      matchType === "enum" ||
      matchType === "class" ||
      matchType === "spec"
    ) {
      let braceCount = 0;
      let foundStartBrace = false;
      const collectedLines: string[] = [];
      const maxLines = 100;
      let inMethod = false;
      let methodBraceCount = 0;

      for (let i = 0; i < maxLines; i++) {
        if (currentLineIdx + i >= lines.length) break;
        const lineStr = lines[currentLineIdx + i] ?? "";
        const trimmed = lineStr.trim();

        // If we're inside a method body, track braces and skip (CHECK THIS FIRST!)
        if (inMethod) {
          for (const char of lineStr) {
            if (char === "{") methodBraceCount++;
            else if (char === "}") methodBraceCount--;
          }
          if (methodBraceCount === 0) {
            inMethod = false;
          }
          continue;
        }

        // Check if we're entering a method (frame keyword followed by {)
        if (trimmed.startsWith("frame ") && lineStr.includes("{")) {
          // Add only the signature (up to the first {)
          const signatureEnd = lineStr.indexOf("{");
          const signature = lineStr.substring(0, signatureEnd).trim();
          collectedLines.push("    " + signature + ";");

          // Count braces on this line to handle single-line methods: frame foo() { }
          inMethod = true;
          methodBraceCount = 0;
          for (const char of lineStr) {
            if (char === "{") methodBraceCount++;
            else if (char === "}") methodBraceCount--;
          }

          // If braces are balanced on this line, we're not in a method anymore
          if (methodBraceCount === 0) {
            inMethod = false;
          }
          continue;
        } else if (trimmed.startsWith("frame ")) {
          // Method signature without opening brace on same line (like in specs)
          // Add with proper indentation
          collectedLines.push("    " + trimmed);
          continue;
        }

        // Skip comments
        if (trimmed.startsWith("#") || trimmed.length === 0) {
          continue;
        }

        // For the first line (struct/spec/enum declaration) or field declarations or closing brace
        if (i === 0 || trimmed.includes(":") || trimmed === "}") {
          collectedLines.push(lineStr);
        }

        // Track braces for struct/spec/enum boundaries
        for (const char of lineStr) {
          if (char === "{") {
            braceCount++;
            foundStartBrace = true;
          } else if (char === "}") {
            braceCount--;
          }
        }

        if (foundStartBrace && braceCount === 0) {
          break;
        }
      }
      lineContent = collectedLines.join("\n");
    } else {
      lineContent = (lines[currentLineIdx] ?? "").trim();
    }

    return {
      uri: document.uri,
      range: Range.create(startPos, endPos),
      lineContent: lineContent,
    };
  }

  // 2. Search in imports
  const importRegex = /import\s+(.+?)\s+from\s+["'](.+?)["']/g;
  let impMatch;
  while ((impMatch = importRegex.exec(text)) !== null) {
    const importedSymbols = impMatch[1] || "";
    const importPath = impMatch[2] || "";
    // Clean up brackets and check if word is imported
    const cleanSymbols = importedSymbols
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s) => s.trim());
    if (cleanSymbols.includes(word)) {
      const currentDir = path.dirname(fileURLToPath(document.uri));
      const resolvedPath = resolveImportToFile(importPath, currentDir);
      if (resolvedPath) {
        const importedText = fs.readFileSync(resolvedPath, "utf-8");
        const importedDoc = TextDocument.create(
          pathToFileURL(resolvedPath).toString(),
          "bpl",
          1,
          importedText,
        );

        const defRegex = new RegExp(
          `\\b(frame|struct|enum|local|global|type|func|class|extern|spec)\\s+${word}\\b`,
          "g",
        );
        const defMatch = defRegex.exec(importedText);
        if (defMatch) {
          const startPos = importedDoc.positionAt(defMatch.index);
          const endPos = importedDoc.positionAt(
            defMatch.index + defMatch[0].length,
          );

          const matchType = defMatch[1];
          let lineContent = "";
          const lines = importedText.split(/\r?\n/);
          const currentLineIdx = startPos.line;

          // Special handling for 'frame': Always show just the signature, never the body
          if (matchType === "frame") {
            const collectedLines: string[] = [];
            const maxLines = 10;

            for (let i = 0; i < maxLines; i++) {
              if (currentLineIdx + i >= lines.length) break;
              let lineStr = lines[currentLineIdx + i] ?? "";

              const braceIdx = lineStr.indexOf("{");
              if (braceIdx !== -1) {
                lineStr = lineStr.substring(0, braceIdx).trim();
                collectedLines.push(lineStr);
                break;
              } else {
                collectedLines.push(lineStr);
              }
            }
            lineContent = collectedLines.join(" ").trim();

            return {
              uri: pathToFileURL(resolvedPath).toString(),
              range: Range.create(startPos, endPos),
              lineContent: lineContent,
            };
          }

          if (
            matchType === "struct" ||
            matchType === "enum" ||
            matchType === "spec"
          ) {
            let braceCount = 0;
            let foundStartBrace = false;
            const collectedLines: string[] = [];
            const maxLines = 100;
            let inMethod = false;
            let methodBraceCount = 0;

            for (let i = 0; i < maxLines; i++) {
              if (currentLineIdx + i >= lines.length) break;
              const lineStr = lines[currentLineIdx + i] ?? "";
              const trimmed = lineStr.trim();

              // If we're inside a method body, track braces and skip (CHECK THIS FIRST!)
              if (inMethod) {
                for (const char of lineStr) {
                  if (char === "{") methodBraceCount++;
                  else if (char === "}") methodBraceCount--;
                }
                if (methodBraceCount === 0) {
                  inMethod = false;
                }
                continue;
              }

              // Check if we're entering a method (frame keyword followed by {)
              if (trimmed.startsWith("frame ") && lineStr.includes("{")) {
                // Add only the signature (up to the first {)
                const signatureEnd = lineStr.indexOf("{");
                const signature = lineStr.substring(0, signatureEnd).trim();
                collectedLines.push("    " + signature + ";");

                // Count braces on this line to handle single-line methods: frame foo() { }
                inMethod = true;
                methodBraceCount = 0;
                for (const char of lineStr) {
                  if (char === "{") methodBraceCount++;
                  else if (char === "}") methodBraceCount--;
                }

                // If braces are balanced on this line, we're not in a method anymore
                if (methodBraceCount === 0) {
                  inMethod = false;
                }
                continue;
              } else if (trimmed.startsWith("frame ")) {
                // Method signature without opening brace on same line (like in specs)
                // Add with proper indentation
                collectedLines.push("    " + trimmed);
                continue;
              }

              // Skip comments
              if (trimmed.startsWith("#") || trimmed.length === 0) {
                continue;
              }

              // For the first line (struct/spec/enum declaration) or field declarations or closing brace
              if (i === 0 || trimmed.includes(":") || trimmed === "}") {
                collectedLines.push(lineStr);
              }

              // Track braces for struct/spec/enum boundaries
              for (const char of lineStr) {
                if (char === "{") {
                  braceCount++;
                  foundStartBrace = true;
                } else if (char === "}") {
                  braceCount--;
                }
              }

              if (foundStartBrace && braceCount === 0) {
                break;
              }
            }
            lineContent = collectedLines.join("\n");
          } else {
            lineContent = (lines[currentLineIdx] ?? "").trim();
          }

          return {
            uri: pathToFileURL(resolvedPath).toString(),
            range: Range.create(startPos, endPos),
            lineContent: lineContent,
          };
        }
      }
    }
  }
  return null;
}

connection.onDefinition(
  (params: TextDocumentPositionParams): Location | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Check if we are on an import string
    const lines = text.split("\n");
    const line = lines[params.position.line] ?? "";
    // Matches:
    // import A, [B] from "path"
    // import [A], [B] from "path"
    // import A from "path"
    const importMatch =
      /import\s+(?:(?:\w+|\[\s*\w+\s*\])(?:\s*,\s*(?:\w+|\[\s*\w+\s*\]))*\s+from\s+)["'](.+?)["']/.exec(
        line,
      );
    if (importMatch) {
      const importPath = importMatch[1] ?? "";
      const startCol = line.indexOf(importPath || "");
      const endCol = startCol + (importPath?.length ?? 0);

      if (
        params.position.character >= startCol &&
        params.position.character <= endCol
      ) {
        // Resolve path (supports std/* alias)
        const currentDir = path.dirname(fileURLToPath(document.uri));
        const resolvedPath = resolveImportToFile(importPath, currentDir);
        if (resolvedPath) {
          return Location.create(
            pathToFileURL(resolvedPath).toString(),
            Range.create(0, 0, 0, 0),
          );
        }
      }
    }

    // Simple word extraction
    const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    let word = "";
    while ((match = wordRegex.exec(text)) !== null) {
      if (offset >= match.index && offset <= match.index + match[0].length) {
        word = match[0];
        break;
      }
    }

    if (!word) {
      return null;
    }

    // Support navigating to struct method definitions `TypeName.method`
    const lineText = lines[params.position.line] ?? "";
    const dotIdx = lineText.lastIndexOf(".", params.position.character);
    if (dotIdx > -1) {
      // Extract type name left of dot
      let j = dotIdx - 1;
      while (j >= 0 && /[a-zA-Z0-9_]/.test(lineText[j] || "")) j--;
      const typeName = lineText.substring(j + 1, dotIdx);
      const structDef = findSymbolDefinition(document, typeName || "");
      if (structDef) {
        const structText = getTextForUri(structDef.uri, documents);
        if (structText) {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const methodRegex = new RegExp(
            `\\bframe\\s+${escapedWord}\\s*\\(`,
            "m",
          );
          const m = methodRegex.exec(structText);
          if (m) {
            const structDoc = TextDocument.create(
              structDef.uri,
              "bpl",
              1,
              structText,
            );
            const startPos = structDoc.positionAt(m.index);
            const endPos = structDoc.positionAt(m.index + m[0].length);
            return Location.create(
              structDef.uri,
              Range.create(startPos, endPos),
            );
          }
        }
      }
    }

    const def = findSymbolDefinition(document, word);
    if (def) {
      return Location.create(def.uri, def.range);
    }

    return null;
  },
);

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  // Try AST-based hover first
  const analysis = documentAnalysis.get(params.textDocument.uri);
  if (analysis) {
    const line = params.position.line + 1;
    const column = params.position.character + 1;
    const nodePath = findNodeAtPosition(analysis.program, line, column);
    const node = nodePath.length > 0 ? nodePath[nodePath.length - 1] : null;

    if (node) {
      // 1. Check if hovering a parameter definition in FunctionDecl
      if (node.kind === "FunctionDecl") {
        const func = node as AST.FunctionDecl;
        if (func.documentation) {
          // Check if position is within a param
          for (const param of func.params) {
            if (
              line >= param.location.startLine &&
              line <= param.location.endLine &&
              column >= param.location.startColumn &&
              column <= param.location.endColumn
            ) {
              // Hovering this param
              const parsed = DocParser.parse(func.documentation);
              const argDoc = DocParser.getArgumentDoc(parsed, param.name);
              if (argDoc) {
                return {
                  contents: {
                    kind: MarkupKind.Markdown,
                    value: `**Parameter** \`${param.name}: ${analysis.checker.typeToString(param.type)}\`\n\n${argDoc}`,
                  },
                };
              }
            }
          }
        }
      }

      // 2. Check if hovering an argument in a CallExpr
      if (nodePath.length >= 2) {
        const parent = nodePath[nodePath.length - 2];
        if (parent && parent.kind === "Call") {
          const call = parent as AST.CallExpr;
          // Find which arg index
          const argIndex = call.args.indexOf(node as AST.Expression);
          if (argIndex !== -1 && call.resolvedDeclaration) {
            const funcDecl = call.resolvedDeclaration;
            if (funcDecl.documentation && argIndex < funcDecl.params.length) {
              const param = funcDecl.params[argIndex];
              if (param) {
                const paramName = param.name;
                const parsed = DocParser.parse(funcDecl.documentation);
                const argDoc = DocParser.getArgumentDoc(parsed, paramName);
                if (argDoc) {
                  return {
                    contents: {
                      kind: MarkupKind.Markdown,
                      value: `**Argument** \`${paramName}\`\n\n${argDoc}`,
                    },
                  };
                }
              }
            }
          }
        }
      }

      // 3. General Documentation (Function, Struct, Enum, etc.)
      if (node.documentation) {
        const parsed = DocParser.parse(node.documentation);
        let md = `**${(node as any).name || node.kind}**\n\n${parsed.description}`;
        for (const section of parsed.sections) {
          md += `\n\n## ${section.title}\n${section.content}`;
        }
        return { contents: { kind: MarkupKind.Markdown, value: md } };
      }

      // 4. Identifier resolving to documented declaration
      if (node.kind === "Identifier") {
        const ident = node as AST.IdentifierExpr;
        if (
          ident.resolvedDeclaration &&
          ident.resolvedDeclaration.documentation
        ) {
          const parsed = DocParser.parse(
            ident.resolvedDeclaration.documentation,
          );
          let md = `**${ident.name}**\n\n${parsed.description}`;
          for (const section of parsed.sections) {
            md += `\n\n## ${section.title}\n${section.content}`;
          }
          return { contents: { kind: MarkupKind.Markdown, value: md } };
        }
      }

      if (node.kind === "LambdaExpression") {
        const lambda = node as AST.LambdaExpr;
        const typeStr = lambda.resolvedType
          ? analysis.checker.typeToString(lambda.resolvedType)
          : "unknown";
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**Lambda Expression**\n\nType: \`${typeStr}\``,
          },
        };
      } else if (node.kind === "Identifier") {
        const ident = node as AST.IdentifierExpr;
        if (ident.resolvedType) {
          const typeStr = analysis.checker.typeToString(ident.resolvedType);
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `**${ident.name}**\n\nType: \`${typeStr}\``,
            },
          };
        }
      }
    }
  }

  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  const text = document.getText();
  const offset = document.offsetAt(params.position);

  const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match;
  let foundMatch: RegExpExecArray | null = null;
  let word = "";
  while ((match = wordRegex.exec(text)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) {
      word = match[0];
      foundMatch = match;
      break;
    }
  }

  if (!word || !foundMatch) {
    return null;
  }

  const keywords = [
    "global",
    "local",
    "const",
    "type",
    "frame",
    "ret",
    "struct",
    "enum",
    "spec",
    "import",
    "from",
    "export",
    "extern",
    "asm",
    "loop",
    "if",
    "else",
    "break",
    "continue",
    "try",
    "catch",
    "return",
    "throw",
    "switch",
    "case",
    "default",
    "cast",
    "sizeof",
    "match",
    "null",
    "nullptr",
    "true",
    "false",
    "new",
    "func",
    "class",
    "extends",
    "implements",
  ];
  const types = [
    "int",
    "uint",
    "u8",
    "u16",
    "u32",
    "u64",
    "float",
    "bool",
    "char",
    "void",
    "any",
    "Func",
    "string",
    "Self",
    "Option",
    "Result",
  ];

  if (keywords.includes(word)) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Keyword**: \`${word}\`\n\nStandard BPL keyword.`,
      },
    };
  }

  if (types.includes(word)) {
    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Type**: \`${word}\`\n\nBuilt-in BPL type.`,
      },
    };
  }

  const def = findSymbolDefinition(document, word);
  if (def) {
    // Check if this is a spec definition to add special formatting
    const displayValue = def.lineContent;
    let additionalInfo = `Defined in: \`${path.basename(fileURLToPath(def.uri))}\``;

    if (def.lineContent.trimStart().startsWith("spec")) {
      // Parse spec to show method signatures
      const lines = def.lineContent.split("\n");
      const methods: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        // Match method signatures: frame methodName(params) ret Type;
        if (trimmed.startsWith("frame ")) {
          methods.push(trimmed);
        }
      }

      if (methods.length > 0) {
        additionalInfo =
          `(interface) with ${methods.length} method${methods.length > 1 ? "s" : ""}\n\n` +
          `Defined in: \`${path.basename(fileURLToPath(def.uri))}\``;
      } else {
        additionalInfo = `(interface)\n\nDefined in: \`${path.basename(fileURLToPath(def.uri))}\``;
      }
    } else if (def.lineContent.includes("enum")) {
      additionalInfo = `(enum)\n\nDefined in: \`${path.basename(fileURLToPath(def.uri))}\``;
    } else if (def.lineContent.includes("struct")) {
      additionalInfo = `(struct)\n\nDefined in: \`${path.basename(fileURLToPath(def.uri))}\``;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: ["```bpl", displayValue, "```", additionalInfo].join("\n"),
      },
    };
  }

  // Check for property access (obj.prop), enum variant (Enum.Variant), or this.field
  if (foundMatch.index > 0 && text[foundMatch.index - 1] === ".") {
    // Find the object/enum name (scan backwards)
    let i = foundMatch.index - 2;
    while (i >= 0 && /[a-zA-Z0-9_]/.test(text[i] || "")) {
      i--;
    }
    const objName = text.substring(i + 1, foundMatch.index - 1);

    if (objName) {
      // Special handling for 'this' keyword
      if (objName === "this") {
        // Find the enclosing struct/class
        const lines = text.split(/\r?\n/);
        const currentLine = document.positionAt(offset).line;

        // Search backwards for struct/class definition
        let structName = "";
        for (let lineIdx = currentLine; lineIdx >= 0; lineIdx--) {
          const line = lines[lineIdx] || "";
          const structMatch = /struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(line);
          if (structMatch) {
            structName = structMatch[1] || "";
            break;
          }
        }

        if (structName) {
          const structDef = findSymbolDefinition(document, structName);
          if (structDef) {
            // Find the field in struct definition
            const memberRegex = new RegExp(
              `\\b${word}\\s*:\\s*([a-zA-Z0-9_*]+)`,
            );
            const memberMatch = memberRegex.exec(structDef.lineContent);

            if (memberMatch) {
              const memberType = memberMatch[1];
              return {
                contents: {
                  kind: MarkupKind.Markdown,
                  value: `(property) \`${structName}.${word}\`: \`${memberType}\``,
                },
              };
            }
          }
        }
      }

      // First, check if objName is an enum
      const enumDef = findSymbolDefinition(document, objName);
      if (enumDef && enumDef.lineContent.includes("enum")) {
        // This is an enum variant access (e.g., Color.Red)
        const variantName = word;

        // Parse the enum definition to find the variant
        const enumText = enumDef.lineContent;
        const lines = enumText.split("\n");

        for (const line of lines) {
          const trimmedLine = line.trim();

          // Match variant with tuple payload: VariantName(Type1, Type2, ...)
          const tupleVariantMatch = new RegExp(
            `^${variantName}\\s*\\(([^)]*)\\)`,
          ).exec(trimmedLine);

          if (tupleVariantMatch) {
            const payload = tupleVariantMatch[1]?.trim() || "";
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: [
                  "```bpl",
                  `${objName}.${variantName}(${payload})`,
                  "```",
                  `(enum variant) Tuple variant with payload`,
                ].join("\n"),
              },
            };
          }

          // Match variant with struct payload: VariantName { field1: Type1, field2: Type2, ... }
          const structVariantMatch = new RegExp(
            `^${variantName}\\s*\\{([^}]*)\\}`,
          ).exec(trimmedLine);

          if (structVariantMatch) {
            const fields = structVariantMatch[1]?.trim() || "";
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: [
                  "```bpl",
                  `${objName}.${variantName} { ${fields} }`,
                  "```",
                  `(enum variant) Struct variant with fields`,
                ].join("\n"),
              },
            };
          }

          // Match unit variant (no payload): VariantName, or VariantName,
          const unitVariantMatch = new RegExp(
            `^${variantName}\\s*,?\\s*(?:#|$)`,
          ).exec(trimmedLine);

          if (unitVariantMatch) {
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: [
                  "```bpl",
                  `${objName}.${variantName}`,
                  "```",
                  `(enum variant) Unit variant`,
                ].join("\n"),
              },
            };
          }
        }

        // Variant found in enum but couldn't parse details
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `(enum variant) \`${objName}.${variantName}\``,
          },
        };
      }

      // Not an enum, check for regular property access
      // 1. Find definition of the object
      const objDef = findSymbolDefinition(document, objName);
      if (objDef) {
        // 2. Extract type from definition
        // Matches: local name : Type, global name : Type, name : Type (in args)
        const typeMatch = /:\s*([a-zA-Z0-9_]+)/.exec(objDef.lineContent);
        if (typeMatch) {
          const typeName = typeMatch[1];

          // 3. Find definition of the type (struct)
          const structDef = findSymbolDefinition(document, typeName || "");
          if (structDef) {
            // 4. Find member in struct definition
            // Matches: member : Type
            const memberRegex = new RegExp(
              `\\b${word}\\s*:\\s*([a-zA-Z0-9_]+)`,
            );
            const memberMatch = memberRegex.exec(structDef.lineContent);

            if (memberMatch) {
              const memberType = memberMatch[1];
              return {
                contents: {
                  kind: MarkupKind.Markdown,
                  value: `(property) \`${typeName}.${word}\`: \`${memberType}\``,
                },
              };
            }

            // 5. Also detect methods declared inside struct blocks using full file content for accuracy
            const structText = getTextForUri(structDef.uri, documents);
            if (structText) {
              const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const methodRegex = new RegExp(
                `^\\s*frame\\s+${escapedWord}\\s*\\([^)]*\\)`,
                "m",
              );
              const methodMatch = methodRegex.exec(structText);
              if (methodMatch) {
                const signatureLine = methodMatch[0]?.trim() || `${word}()`;

                // Check if this struct implements any specs
                let specInfo = "";
                const structDefLine =
                  structDef.lineContent.split("\n")[0] || "";
                const specMatch = /struct\s+\w+\s*:\s*([^{]+)/.exec(
                  structDefLine,
                );

                if (specMatch) {
                  const implementsList = specMatch[1]?.trim() || "";
                  const specs = implementsList.split(",").map((s) => s.trim());

                  // Check if any of these specs define this method
                  for (const specName of specs) {
                    const specDef = findSymbolDefinition(document, specName);
                    if (
                      specDef &&
                      specDef.lineContent.includes(`frame ${word}`)
                    ) {
                      specInfo = `\n\n*Implements: \`${specName}.${word}\`*`;
                      break;
                    }
                  }
                }

                return {
                  contents: {
                    kind: MarkupKind.Markdown,
                    value: [
                      "```bpl",
                      signatureLine,
                      "```",
                      `(method) \`${typeName}.${word}\`${specInfo}`,
                    ].join("\n"),
                  },
                };
              }
            }
          }
        }
      }
    }
  }

  return null;
});

function getWordAtPosition(
  document: TextDocument,
  position: any,
): string | null {
  const text = document.getText();
  const offset = document.offsetAt(position);
  const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
  let match;
  while ((match = wordRegex.exec(text)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return match[0];
    }
  }
  return null;
}

function findAllReferences(
  word: string,
  docs: TextDocuments<TextDocument>,
): Location[] {
  const locations: Location[] = [];
  docs.all().forEach((doc) => {
    const text = doc.getText();
    const regex = new RegExp(`\\b${word}\\b`, "g");
    let match;
    while ((match = regex.exec(text)) !== null) {
      locations.push(
        Location.create(
          doc.uri,
          Range.create(
            doc.positionAt(match.index),
            doc.positionAt(match.index + match[0].length),
          ),
        ),
      );
    }
  });
  return locations;
}

connection.onRenameRequest((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const word = getWordAtPosition(document, params.position);
  if (!word) return null;

  const locations = findAllReferences(word, documents);
  const changes: { [uri: string]: TextEdit[] } = {};

  locations.forEach((loc) => {
    if (!changes[loc.uri]) changes[loc.uri] = [];
    changes[loc.uri]!.push(TextEdit.replace(loc.range, params.newName));
  });

  return { changes };
});

connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const word = getWordAtPosition(document, params.position);
  if (!word) return null;

  return findAllReferences(word, documents);
});

connection.onImplementation((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const word = getWordAtPosition(document, params.position);
  if (!word) return null;

  // Find structs that implement this spec/interface
  const locations: Location[] = [];
  documents.all().forEach((doc) => {
    const text = doc.getText();
    // Regex for inheritance: struct Name : Parent or struct Name implements Parent
    const regex = new RegExp(
      `\\bstruct\\s+([a-zA-Z0-9_]+)\\s*(?::|implements)\\s*${word}\\b`,
      "g",
    );
    let match;
    while ((match = regex.exec(text)) !== null) {
      locations.push(
        Location.create(
          doc.uri,
          Range.create(
            doc.positionAt(match.index),
            doc.positionAt(match.index + match[0].length),
          ),
        ),
      );
    }
  });
  return locations;
});

connection.onCodeAction((params) => {
  const actions: CodeAction[] = [];
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const currentDir = path.dirname(fileURLToPath(document.uri));

  for (const diagnostic of params.context.diagnostics) {
    // Example: "Unknown type 'Result'" -> Import Result from std
    const unknownTypeMatch = /Unknown type '(\w+)'/.exec(diagnostic.message);
    if (unknownTypeMatch) {
      const typeName = unknownTypeMatch[1];

      // 1. Check Standard Library
      if (
        typeName &&
        [
          "Result",
          "Option",
          "List",
          "Map",
          "Set",
          "Vec2",
          "Vec3",
          "Stack",
          "Queue",
        ].includes(typeName)
      ) {
        actions.push({
          title: `Import ${typeName} from std`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.insert(
                  { line: 0, character: 0 },
                  `import [${typeName}] from "std";\n`,
                ),
              ],
            },
          },
        });
      }

      // 2. Scan nearby files for exports
      try {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          if (
            file.endsWith(".bpl") &&
            file !== path.basename(fileURLToPath(document.uri))
          ) {
            const content = fs.readFileSync(
              path.join(currentDir, file),
              "utf-8",
            );
            // Check for export [TypeName]
            if (
              new RegExp(`export\\s+\\[\\s*${typeName}\\s*\\]`).test(content)
            ) {
              actions.push({
                title: `Import ${typeName} from ./${file}`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                  changes: {
                    [params.textDocument.uri]: [
                      TextEdit.insert(
                        { line: 0, character: 0 },
                        `import [${typeName}] from "./${file}";\n`,
                      ),
                    ],
                  },
                },
              });
            }
          }
        }
      } catch (_e) {
        // Ignore fs errors
      }
    }

    // Check for unknown function/variable
    const unknownSymbolMatch = /Unknown symbol '(\w+)'/.exec(
      diagnostic.message,
    );
    if (unknownSymbolMatch) {
      const symbolName = unknownSymbolMatch[1];
      // Scan nearby files for export symbolName
      try {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          if (
            file.endsWith(".bpl") &&
            file !== path.basename(fileURLToPath(document.uri))
          ) {
            const content = fs.readFileSync(
              path.join(currentDir, file),
              "utf-8",
            );
            // Check for export symbolName
            if (new RegExp(`export\\s+${symbolName}\\b`).test(content)) {
              actions.push({
                title: `Import ${symbolName} from ./${file}`,
                kind: CodeActionKind.QuickFix,
                diagnostics: [diagnostic],
                edit: {
                  changes: {
                    [params.textDocument.uri]: [
                      TextEdit.insert(
                        { line: 0, character: 0 },
                        `import ${symbolName} from "./${file}";\n`,
                      ),
                    ],
                  },
                },
              });
            }
          }
        }
      } catch (_e) {
        // Ignore fs errors
      }
    }
  }
  return actions;
});

connection.onCodeLens((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const lenses: CodeLens[] = [];

  // Find main function: frame main()
  const mainRegex = /frame\s+main\s*\(/g;
  let match;
  while ((match = mainRegex.exec(text)) !== null) {
    const startPos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);

    lenses.push({
      range: Range.create(startPos, endPos),
      command: {
        title: "Run File",
        command: "bpl.runFile",
        arguments: [fileURLToPath(document.uri)],
      },
    });
  }

  return lenses;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

function findNodeAtPosition(
  node: AST.ASTNode,
  line: number,
  column: number,
): AST.ASTNode[] {
  if (!node || !node.location) return [];

  // Check bounds
  if (line < node.location.startLine || line > node.location.endLine) return [];
  if (line === node.location.startLine && column < node.location.startColumn)
    return [];
  if (line === node.location.endLine && column > node.location.endColumn)
    return [];

  // Try to find a child that contains the position
  for (const key in node) {
    if (
      key === "location" ||
      key === "resolvedType" ||
      key === "resolvedDeclaration" ||
      key === "documentation"
    )
      continue;
    const child = (node as any)[key];

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.kind) {
          const childPath = findNodeAtPosition(item, line, column);
          if (childPath.length > 0) {
            return [node, ...childPath];
          }
        }
      }
    } else if (child && typeof child === "object" && child.kind) {
      const childPath = findNodeAtPosition(child, line, column);
      if (childPath.length > 0) {
        return [node, ...childPath];
      }
    }
  }

  // If no child contains the position, then 'node' is the most specific one
  return [node];
}

function findEnclosingStruct(text: string, line: number): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";
    const match = /struct\s+([a-zA-Z0-9_]+)/.exec(l);
    if (match) return match[1] || null;
  }
  return null;
}

function findVariableType(
  text: string,
  varName: string,
  line: number,
): string | null {
  const lines = text.split(/\r?\n/);
  // 1. Search backwards for local declaration or function arg
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";

    // Check for function definition (end of scope search)
    if (l.trim().startsWith("frame ")) {
      // Check if it's an argument in this frame
      const argMatch = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z0-9_]+)`).exec(
        l,
      );
      if (argMatch) return argMatch[1] || null;
      return null; // Stop searching if we hit the function boundary
    }

    // Check for local declaration: local varName : Type
    // or local (varName : Type)
    // We just look for "varName : Type" which is common to both
    // But we must ensure it's not a struct field or something else.
    // Inside a function, "varName : Type" is likely a declaration.
    const declMatch = new RegExp(`\\b${varName}\\s*:\\s*([a-zA-Z0-9_]+)`).exec(
      l,
    );
    if (declMatch) {
      return declMatch[1] || null;
    }
  }

  // 2. Search for global declaration
  const globalMatch = new RegExp(
    `\\bglobal\\s+${varName}\\s*:\\s*([a-zA-Z0-9_]+)`,
  ).exec(text);
  if (globalMatch) return globalMatch[1] || null;

  return null;
}
