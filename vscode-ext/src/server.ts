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

// Compiler integration
import * as AST from "../../compiler/common/AST";
import { CompilerError } from "../../compiler/common/CompilerError";
import { Formatter } from "../../compiler/formatter/Formatter";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

// Symbol index and module resolution services
import { SymbolIndex, InlayHintProvider } from "./services";
import { ASTResolver } from "./services/ASTResolver";
import { ASTHoverHandler } from "./services/ASTHoverHandler";
import { ASTDefinitionHandler } from "./services/ASTDefinitionHandler";
import { ASTCompletionHandler } from "./services/ASTCompletionHandler";
import { ASTRenameHandler } from "./services/ASTRenameHandler";
import { SelectionRangeProvider } from "./services/SelectionRangeProvider";
import { DocumentHighlightProvider } from "./services/DocumentHighlightProvider";
import { FoldingRangeProvider } from "./services/FoldingRangeProvider";
import { SignatureHelpProvider } from "./services/SignatureHelpProvider";
import { DocumentSymbolProvider } from "./services/DocumentSymbolProvider";
import {
  SemanticTokenProvider,
  semanticTokensLegend,
} from "./services/SemanticTokenProvider";
import { CallHierarchyProvider } from "./services/CallHierarchyProvider";
import { TypeHierarchyProvider } from "./services/TypeHierarchyProvider";
import { WorkspaceSymbolProvider } from "./services/WorkspaceSymbolProvider";
import { CodeLensProvider } from "./services/CodeLensProvider";
import { DocumentLinkProvider } from "./services/DocumentLinkProvider";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Global symbol index
const symbolIndex = new SymbolIndex();

// AST-based resolver (uses compiler's parser)
const astResolver = new ASTResolver(symbolIndex);

// AST-based hover handler
const astHoverHandler = new ASTHoverHandler(astResolver, symbolIndex);

// AST-based definition handler
const astDefinitionHandler = new ASTDefinitionHandler(astResolver, symbolIndex);

// AST-based completion handler
const astCompletionHandler = new ASTCompletionHandler(astResolver, symbolIndex);

// AST-based rename handler
const astRenameHandler = new ASTRenameHandler(astResolver, symbolIndex);

// Selection range provider for smart expand/shrink selection
const selectionRangeProvider = new SelectionRangeProvider(astResolver);

// Document highlight provider for highlighting symbol occurrences
const documentHighlightProvider = new DocumentHighlightProvider(astResolver);

// Folding range provider for smart code folding
const foldingRangeProvider = new FoldingRangeProvider(astResolver);

// Signature help provider for parameter hints
const signatureHelpProvider = new SignatureHelpProvider(
  astResolver,
  symbolIndex,
);

// Document symbol provider for outline view
const documentSymbolProvider = new DocumentSymbolProvider(astResolver);

// Semantic token provider for dynamic syntax highlighting
const semanticTokenProvider = new SemanticTokenProvider(astResolver);

// Inlay hint provider for showing inferred types and parameter names
const inlayHintProvider = new InlayHintProvider(astResolver, symbolIndex);

// Call hierarchy provider for incoming/outgoing calls
const callHierarchyProvider = new CallHierarchyProvider(
  astResolver,
  symbolIndex,
);

// Type hierarchy provider for struct inheritance
const typeHierarchyProvider = new TypeHierarchyProvider(
  astResolver,
  symbolIndex,
);

// Workspace symbol provider for workspace-wide search
const workspaceSymbolProvider = new WorkspaceSymbolProvider(
  astResolver,
  symbolIndex,
);

// Code lens provider for showing references and complexity
const codeLensProvider = new CodeLensProvider(astResolver);

// Document link provider for clickable imports
const documentLinkProvider = new DocumentLinkProvider(astResolver);

console.log("[Server] BPL Language Server initializing...");
console.log("[Server] AST-based handlers initialized:");
console.log("[Server]   - ASTResolver");
console.log("[Server]   - ASTHoverHandler");
console.log("[Server]   - ASTDefinitionHandler");
console.log("[Server]   - ASTCompletionHandler");
console.log("[Server]   - ASTRenameHandler");
console.log("[Server]   - SelectionRangeProvider");
console.log("[Server]   - DocumentHighlightProvider");
console.log("[Server]   - FoldingRangeProvider");
console.log("[Server]   - SignatureHelpProvider");
console.log("[Server]   - InlayHintProvider");
console.log("[Server]   - SignatureHelpProvider");
console.log("[Server]   - DocumentSymbolProvider");
console.log("[Server]   - SemanticTokenProvider");
console.log("[Server]   - CallHierarchyProvider");
console.log("[Server]   - TypeHierarchyProvider");
console.log("[Server]   - WorkspaceSymbolProvider");
console.log("[Server]   - CodeLensProvider");
console.log("[Server]   - DocumentLinkProvider");

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
  console.log("[Server] onInitialize called");
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
      renameProvider: {
        prepareProvider: true,
      },
      referencesProvider: true,
      implementationProvider: true,
      codeActionProvider: true,
      codeLensProvider: {
        resolveProvider: false,
      },
      selectionRangeProvider: true,
      documentHighlightProvider: true,
      foldingRangeProvider: true,
      signatureHelpProvider: {
        triggerCharacters: ["(", ","],
        retriggerCharacters: [","],
      },
      documentSymbolProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        full: true,
        range: false,
      },
      inlayHintProvider: true,
      callHierarchyProvider: true,
      typeHierarchyProvider: true,
      workspaceSymbolProvider: true,
      documentLinkProvider: {
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
  console.log(
    "[Server] Server capabilities initialized:",
    JSON.stringify(result.capabilities, null, 2),
  );
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

    // Update symbol index with BPL_HOME
    if (globalSettings.bplHome) {
      symbolIndex.setBplHome(globalSettings.bplHome);
    }
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

function _getTextForUri(
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
    symbolIndex.setBplHome(settings.bplHome);
  } else {
    // Auto-detect BPL_HOME if not set
    const libDir = findWorkspaceLibDir(currentDir);
    if (libDir) {
      process.env.BPL_HOME = path.dirname(libDir);
      symbolIndex.setBplHome(path.dirname(libDir));
    }
  }

  // Index symbols from this file and its imports
  try {
    symbolIndex.indexFile(filePath, true);
  } catch (e) {
    // Silently fail on indexing errors
    connection.console.error(`Failed to index ${filePath}: ${e}`);
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

    console.log("[Server] Completion request - delegating to AST handler");
    return astCompletionHandler.handle(textDocumentPosition, document);
  },
);

function _findFunctionAtLine(
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function _getCompletionItemsFromDecl(
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

function _findSymbolDefinition(
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

// AST-based definition handler (replaces old regex-based implementation)
connection.onDefinition(
  (params: TextDocumentPositionParams): Location | null => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
      return null;
    }

    // Use AST-based definition handler
    return astDefinitionHandler.handle(params, document);
  },
);

// Semantic tokens provider for dynamic syntax highlighting
connection.languages.semanticTokens.on((params) => {
  const filePath = fileURLToPath(params.textDocument.uri);
  console.log(`[SemanticTokens] Full tokens requested for ${filePath}`);

  const result = semanticTokenProvider.provideSemanticTokens(filePath);
  return result || { data: [] };
});

// Inlay hints provider for showing inferred types and parameter names
connection.languages.inlayHint.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  console.log(`[InlayHint] Hints requested for ${document.uri}`);
  return inlayHintProvider.handle(params, document);
});

// Call hierarchy handlers
connection.languages.callHierarchy.onPrepare((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  console.log(`[CallHierarchy] Prepare requested for ${document.uri}`);
  return callHierarchyProvider.prepare(params, document);
});

connection.languages.callHierarchy.onIncomingCalls((params) => {
  console.log(`[CallHierarchy] Incoming calls requested`);
  return callHierarchyProvider.getIncomingCalls(params.item);
});

connection.languages.callHierarchy.onOutgoingCalls((params) => {
  console.log(`[CallHierarchy] Outgoing calls requested`);
  return callHierarchyProvider.getOutgoingCalls(params.item);
});

// Type hierarchy handlers
connection.languages.typeHierarchy.onPrepare((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  console.log(`[TypeHierarchy] Prepare requested for ${document.uri}`);
  return typeHierarchyProvider.prepare(params, document);
});

connection.languages.typeHierarchy.onSupertypes((params) => {
  console.log(`[TypeHierarchy] Supertypes requested`);
  return typeHierarchyProvider.getSupertypes(params.item);
});

connection.languages.typeHierarchy.onSubtypes((params) => {
  console.log(`[TypeHierarchy] Subtypes requested`);
  return typeHierarchyProvider.getSubtypes(params.item);
});

// Workspace symbol handler for workspace-wide search
connection.onWorkspaceSymbol((params) => {
  console.log(`[WorkspaceSymbol] Search requested: "${params.query}"`);
  return workspaceSymbolProvider.search(params);
});

// Code lens handler for showing references and complexity
connection.onCodeLens((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  console.log(`[CodeLens] Lenses requested for ${document.uri}`);
  return codeLensProvider.provide(params, document);
});

// Document link handler for clickable imports
connection.onDocumentLinks((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  console.log(`[DocumentLink] Links requested for ${document.uri}`);
  return documentLinkProvider.provide(params, document);
});

// AST-based hover handler (replaces old regex-based implementation)
connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }

  // Use AST-based hover handler
  return astHoverHandler.handle(params, document);
});

// Selection range handler for smart expand/shrink selection
connection.onSelectionRanges((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return selectionRangeProvider.handle(params, document);
});

// Document highlight handler for highlighting symbol occurrences
connection.onDocumentHighlight((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return documentHighlightProvider.handle(params, document);
});

// Folding range handler for smart code folding
connection.onFoldingRanges((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return foldingRangeProvider.handle(params, document);
});

// Signature help handler for parameter hints
connection.onSignatureHelp((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return signatureHelpProvider.handle(params, document);
});

// Document symbols handler for outline view
connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  return documentSymbolProvider.handle(params, document);
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

function _findAllReferences(
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

connection.onPrepareRename((params) => {
  console.log("[Rename] Prepare rename request");
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    console.log("[Rename] Document not found");
    return null;
  }

  try {
    return astRenameHandler.prepareRename(params, document);
  } catch (error) {
    console.error("[Rename] Error in prepareRename:", error);
    return null;
  }
});

connection.onRenameRequest((params) => {
  console.log(
    `[Rename] Rename request at ${params.textDocument.uri} line ${params.position.line} to "${params.newName}"`,
  );
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    console.log("[Rename] Document not found");
    return null;
  }

  try {
    return astRenameHandler.rename(params, document);
  } catch (error) {
    console.error("[Rename] Error in rename:", error);
    return null;
  }
});

connection.onReferences((params) => {
  console.log("[References] Find all references request");
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    console.log("[References] Document not found");
    return null;
  }

  try {
    // Use the scope-aware reference finder from ASTRenameHandler
    return astRenameHandler.findAllReferences(params.position, document);
  } catch (error) {
    console.error("[References] Error finding references:", error);
    return null;
  }
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
  const text = document.getText();

  for (const diagnostic of params.context.diagnostics) {
    // 1. Unknown type suggestions
    const unknownTypeMatch = /Unknown type '(\w+)'/.exec(diagnostic.message);
    if (unknownTypeMatch) {
      const typeName = unknownTypeMatch[1];

      // Standard Library types
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

      // Scan nearby files for exports
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
            // Check for export struct TypeName or export [TypeName]
            const exportRegex = new RegExp(
              `export\\s+(struct\\s+${typeName}\\b|\\[\\s*${typeName}\\s*\\])`,
            );
            if (exportRegex.test(content)) {
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

    // 2. Undefined symbol (function/variable) suggestions
    const unknownSymbolMatch = /Undefined symbol '(\w+)'/.exec(
      diagnostic.message,
    );
    if (unknownSymbolMatch) {
      const symbolName = unknownSymbolMatch[1];

      if (!symbolName) continue;

      // Check if it's a common typo or similar name
      const similarSymbols = findSimilarSymbols(symbolName, text);
      for (const similar of similarSymbols) {
        actions.push({
          title: `Change to '${similar}'`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.replace(diagnostic.range, similar),
              ],
            },
          },
        });
      }

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
            // Check for export frame symbolName or export symbolName
            const exportRegex = new RegExp(
              `export\\s+(frame\\s+${symbolName}\\b|${symbolName}\\b)`,
            );
            if (exportRegex.test(content)) {
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

    // 3. Type mismatch suggestions
    const typeMismatchMatch =
      /Type mismatch.*expected '(\w+)'.*got '(\w+)'/.exec(diagnostic.message);
    if (typeMismatchMatch) {
      const expectedType = typeMismatchMatch[1];
      const gotType = typeMismatchMatch[2];

      // Suggest casting
      if (expectedType && gotType) {
        const _line = document.getText(
          Range.create(
            { line: diagnostic.range.start.line, character: 0 },
            {
              line: diagnostic.range.start.line,
              character: Number.MAX_SAFE_INTEGER,
            },
          ),
        );
        const errorText = document.getText(diagnostic.range);

        actions.push({
          title: `Cast to ${expectedType}`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.replace(
                  diagnostic.range,
                  `cast<${expectedType}>(${errorText})`,
                ),
              ],
            },
          },
        });
      }
    }

    // 4. Missing return statement
    if (diagnostic.message.includes("Missing return statement")) {
      actions.push({
        title: "Add return statement",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.insert(
                diagnostic.range.start,
                "    return; // TODO: Add return value\n",
              ),
            ],
          },
        },
      });
    }

    // 5. Unused variable
    if (diagnostic.message.includes("unused")) {
      const unusedVarMatch = /'(\w+)'/.exec(diagnostic.message);
      if (unusedVarMatch) {
        const varName = unusedVarMatch[1];
        actions.push({
          title: `Prefix with '_' to mark as intentionally unused`,
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [params.textDocument.uri]: [
                TextEdit.replace(diagnostic.range, `_${varName}`),
              ],
            },
          },
        });
      }
    }

    // 6. Missing semicolon
    if (
      diagnostic.message.includes("Expected ';'") ||
      diagnostic.message.includes("Missing semicolon")
    ) {
      actions.push({
        title: "Add semicolon",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.insert(diagnostic.range.end, ";"),
            ],
          },
        },
      });
    }

    // 7. Suggest null check
    if (
      diagnostic.message.includes("possibly null") ||
      diagnostic.message.includes("may be null")
    ) {
      const errorText = document.getText(diagnostic.range);
      actions.push({
        title: "Add null check",
        kind: CodeActionKind.QuickFix,
        diagnostics: [diagnostic],
        edit: {
          changes: {
            [params.textDocument.uri]: [
              TextEdit.replace(
                diagnostic.range,
                `if (${errorText} != nullptr) {\n        // TODO: Handle non-null case\n    }`,
              ),
            ],
          },
        },
      });
    }
  }
  return actions;
});

/**
 * Find similar symbol names using Levenshtein distance
 */
function findSimilarSymbols(target: string, text: string): string[] {
  const symbols = new Set<string>();
  const symbolRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
  let match;

  while ((match = symbolRegex.exec(text)) !== null) {
    symbols.add(match[0]);
  }

  const similar: Array<{ name: string; distance: number }> = [];
  for (const symbol of symbols) {
    if (symbol === target) continue;
    const distance = levenshteinDistance(target, symbol);
    if (distance <= 2 && distance > 0) {
      // Max 2 character difference
      similar.push({ name: symbol, distance });
    }
  }

  // Sort by distance and return top 3
  similar.sort((a, b) => a.distance - b.distance);
  return similar.slice(0, 3).map((s) => s.name);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        const substitution = matrix[i - 1]![j - 1]! + 1;
        const insertion = matrix[i]![j - 1]! + 1;
        const deletion = matrix[i - 1]![j]! + 1;
        matrix[i]![j] = Math.min(substitution, insertion, deletion);
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function _findEnclosingStruct(text: string, line: number): string | null {
  const lines = text.split(/\r?\n/);
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";
    const match = /struct\s+([a-zA-Z0-9_]+)/.exec(l);
    if (match) return match[1] || null;
  }
  return null;
}

/**
 * Resolve a chained expression to its type
 * e.g., "todos.rows.get(i)" -> resolve todos -> Table -> rows field -> Array<Row> -> get method -> Row
 */
function resolveChainType(
  expression: string,
  text: string,
  currentLine: number,
  symbolIndexLocal: SymbolIndex,
  depth = 0,
): string | null {
  // Prevent infinite recursion
  if (depth > 5) {
    console.log(`[resolveChainType] Max recursion depth reached`);
    return null;
  }

  // Parse the expression to extract the chain
  // Handle method calls by removing parentheses and arguments
  const chain = expression;

  // Split by dots, but respect parentheses
  const parts: string[] = [];
  let currentPart = "";
  let parenDepth = 0;

  for (let i = 0; i < chain.length; i++) {
    const char = chain[i];
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;

    if (char === "." && parenDepth === 0) {
      if (currentPart) parts.push(currentPart.trim());
      currentPart = "";
    } else {
      currentPart += char;
    }
  }
  if (currentPart) parts.push(currentPart.trim());

  if (parts.length === 0) return null;

  console.log(`[resolveChainType] Parsing chain: ${parts.join(" -> ")}`);

  // Start with the base variable
  const baseVar = parts[0];
  if (!baseVar) return null;

  let currentType = findVariableType(text, baseVar, currentLine, depth + 1);
  if (!currentType) {
    console.log(`[resolveChainType] Base variable "${baseVar}" not found`);
    return null;
  }

  console.log(`[resolveChainType] Base: ${baseVar} -> ${currentType}`);

  // Resolve each part in the chain
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    // Check if it's a method call (has parentheses)
    const isMethodCall = part.includes("(");
    const memberName = isMethodCall
      ? part.substring(0, part.indexOf("("))
      : part;

    // Extract generic arguments before stripping (e.g., "Array<Row>" -> ["Row"])
    const genericArgsMatch = currentType.match(/<(.+)>/);
    const genericArgs =
      genericArgsMatch && genericArgsMatch[1]
        ? genericArgsMatch[1].split(",").map((a) => a.trim())
        : [];

    // Strip pointer, array, and generic markers to get base type name
    const baseType = currentType
      .replace(/^\*+/, "")
      .replace(/\[\]$/, "")
      .replace(/<.*>/, "");

    const typeSymbols = symbolIndexLocal.findSymbol(baseType);
    if (typeSymbols.length === 0) {
      console.log(`[resolveChainType] Type "${baseType}" not found`);
      return null;
    }

    if (isMethodCall) {
      // Look for method
      const method = typeSymbols[0]?.methods?.find(
        (m) => m.name === memberName,
      );
      if (method) {
        let returnType = method.signature.returnType;

        // Substitute generic parameters (T, U, etc.) with actual types
        // For single generic like Array<Row>, T becomes Row
        if (genericArgs.length > 0 && genericArgs[0]) {
          // Check if return type is a generic parameter (single uppercase letter)
          if (/^[A-Z]$/.test(returnType)) {
            // For now, assume first generic arg replaces T
            returnType = genericArgs[0];
            console.log(
              `[resolveChainType] Substituted generic parameter ${method.signature.returnType} with ${returnType}`,
            );
          }
        }

        currentType = returnType;
        console.log(
          `[resolveChainType] Method ${memberName}() -> ${currentType}`,
        );
      } else {
        console.log(
          `[resolveChainType] Method "${memberName}" not found in "${baseType}"`,
        );
        return null;
      }
    } else {
      // Look for field
      const field = typeSymbols[0]?.fields?.find((f) => f.name === memberName);
      if (field) {
        currentType = field.type;
        console.log(`[resolveChainType] Field ${memberName} -> ${currentType}`);
      } else {
        console.log(
          `[resolveChainType] Field "${memberName}" not found in "${baseType}"`,
        );
        return null;
      }
    }
  }

  return currentType;
}

function findVariableType(
  text: string,
  varName: string,
  line: number,
  depth = 0,
): string | null {
  // Prevent infinite recursion
  if (depth > 5) {
    console.log(`[findVariableType] Max recursion depth reached`);
    return null;
  }

  console.log(
    `[findVariableType] Looking for variable "${varName}" at line ${line}`,
  );

  // Escape special regex characters in varName to prevent regex errors
  const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const lines = text.split(/\r?\n/);
  // 1. Search backwards for local declaration or function arg
  for (let i = line; i >= 0; i--) {
    const l = lines[i] || "";

    // Check for function definition (end of scope search)
    if (l.trim().startsWith("frame ")) {
      // Check if it's an argument in this frame
      const argMatch = new RegExp(
        `\\b${escapedVarName}\\s*:\\s*\\*?([a-zA-Z0-9_]+)`,
      ).exec(l);
      if (argMatch) {
        console.log(
          `[findVariableType] Found as function argument: ${argMatch[1]}`,
        );
        return argMatch[1] || null;
      }
      console.log(
        `[findVariableType] Hit function boundary, stopping local search`,
      );
      break; // Stop local search, only check globals now
    }

    // Check for explicit type annotation: local varName : Type or local varName : *Type
    const declMatch = new RegExp(
      `\\b${escapedVarName}\\s*:\\s*\\*?([a-zA-Z0-9_]+)`,
    ).exec(l);
    if (declMatch) {
      console.log(
        `[findVariableType] Found with explicit type: ${declMatch[1]}`,
      );
      return declMatch[1] || null;
    }

    // Check for type inference from constructor: local varName = Type.new()
    const constructorMatch = new RegExp(
      `\\b${escapedVarName}\\s*=\\s*([a-zA-Z0-9_]+)\\.new\\(`,
    ).exec(l);
    if (constructorMatch) {
      console.log(
        `[findVariableType] Found with constructor inference: ${constructorMatch[1]}`,
      );
      return constructorMatch[1] || null;
    }

    // Check for chained method call: local varName = obj.method() or obj.field.method()
    const chainMatch = new RegExp(
      `\\b${escapedVarName}\\s*=\\s*([a-zA-Z0-9_.()]+)`,
    ).exec(l);
    if (chainMatch && chainMatch[1] && chainMatch[1].includes(".")) {
      const expression = chainMatch[1];
      console.log(
        `[findVariableType] Found assignment from expression: ${expression}`,
      );
      // Resolve the chain to get its return type
      const resolvedType = resolveChainType(
        expression,
        text,
        i,
        symbolIndex,
        depth + 1,
      );
      if (resolvedType) {
        console.log(
          `[findVariableType] Resolved chain expression to type: ${resolvedType}`,
        );
        return resolvedType;
      }
    }
  }

  // 2. Search for global declaration
  console.log(`[findVariableType] Searching for global declaration`);
  const globalMatch = new RegExp(
    `\\bglobal\\s+${escapedVarName}\\s*:\\s*\\*?([a-zA-Z0-9_]+)`,
  ).exec(text);
  if (globalMatch) {
    console.log(`[findVariableType] Found as global: ${globalMatch[1]}`);
    return globalMatch[1] || null;
  }

  console.log(`[findVariableType] Variable "${varName}" not found`);
  return null;
}
