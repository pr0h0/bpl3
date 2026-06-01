import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
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
  type InitializeParams,
  type TextDocumentPositionParams,
  type InitializeResult,
} from "vscode-languageserver/node";

// Compiler integration
import * as AST from "../../compiler/common/AST";
import { Formatter } from "../../compiler/formatter/Formatter";
import { Parser } from "../../compiler/frontend/Parser";
import type { TypeChecker } from "../../compiler/middleend/TypeChecker";

// Symbol index and module resolution services
import { SymbolIndex, InlayHintProvider, debugLog } from "./services";
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
import { DiagnosticsProvider } from "./services/DiagnosticsProvider";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Global symbol index
const symbolIndex = new SymbolIndex();
const diagnosticsProvider = new DiagnosticsProvider(
  symbolIndex,
  (filePath, error) =>
    connection.console.error(`Failed to index ${filePath}: ${error}`),
);

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
const documentLinkProvider = new DocumentLinkProvider(
  astResolver,
  symbolIndex.getResolver(),
);

debugLog("[Server] BPL Language Server initializing...");
debugLog("[Server] AST-based handlers initialized:");
debugLog("[Server]   - ASTResolver");
debugLog("[Server]   - ASTHoverHandler");
debugLog("[Server]   - ASTDefinitionHandler");
debugLog("[Server]   - ASTCompletionHandler");
debugLog("[Server]   - ASTRenameHandler");
debugLog("[Server]   - SelectionRangeProvider");
debugLog("[Server]   - DocumentHighlightProvider");
debugLog("[Server]   - FoldingRangeProvider");
debugLog("[Server]   - SignatureHelpProvider");
debugLog("[Server]   - InlayHintProvider");
debugLog("[Server]   - SignatureHelpProvider");
debugLog("[Server]   - DocumentSymbolProvider");
debugLog("[Server]   - SemanticTokenProvider");
debugLog("[Server]   - CallHierarchyProvider");
debugLog("[Server]   - TypeHierarchyProvider");
debugLog("[Server]   - WorkspaceSymbolProvider");
debugLog("[Server]   - CodeLensProvider");
debugLog("[Server]   - DocumentLinkProvider");

interface AnalysisResult {
  program: AST.Program;
  checker: TypeChecker;
}

function _typeNodeToString(type: AST.TypeNode | undefined): string {
  if (!type) return "void";
  switch (type.kind) {
    case "BasicType":
      let name = type.name;
      if (type.genericArgs && type.genericArgs.length > 0) {
        name += `<${type.genericArgs.map(_typeNodeToString).join(", ")}>`;
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
      const params = type.paramTypes.map(_typeNodeToString).join(", ");
      const ret = _typeNodeToString(type.returnType);
      return `Func<${ret}>(${params})`;
    case "TupleType":
      return `(${type.types.map(_typeNodeToString).join(", ")})`;
    default:
      return "unknown";
  }
}
const documentAnalysis = new Map<string, AnalysisResult>();

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let _hasDiagnosticRelatedInformationCapability = false; // reserved for future use

connection.onInitialize((params: InitializeParams) => {
  debugLog("[Server] onInitialize called");
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
  debugLog(
    "[Server] Server capabilities initialized:",
    () => JSON.stringify(result.capabilities, null, 2),
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
      debugLog("Workspace folder change event received.");
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

  if (
    importPath === "std" ||
    importPath.startsWith("std/") ||
    importPath.startsWith("std\\")
  ) {
    const libDir =
      findWorkspaceLibDir(currentDir) || path.join(currentDir, "lib");
    let candidate =
      importPath === "std"
        ? path.join(libDir, "std.bpl")
        : path.join(libDir, importPath.replace(/^std[\/\\]/, ""));
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
      (importPath === "std" ||
        importPath.startsWith("std/") ||
        importPath.startsWith("std\\"))
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
  const result = diagnosticsProvider.analyze(textDocument, settings);
  if (result.analysis) {
    documentAnalysis.set(textDocument.uri, result.analysis);
  }
  connection.sendDiagnostics({
    uri: textDocument.uri,
    diagnostics: result.diagnostics,
  });
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
  debugLog("We received an file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    if (!document) return [];

    debugLog("[Server] Completion request - delegating to AST handler");
    return astCompletionHandler.handle(textDocumentPosition, document);
  },
);

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
  debugLog(`[SemanticTokens] Full tokens requested for ${filePath}`);

  const result = semanticTokenProvider.provideSemanticTokens(filePath);
  return result || { data: [] };
});

// Inlay hints provider for showing inferred types and parameter names
connection.languages.inlayHint.on((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }

  debugLog(`[InlayHint] Hints requested for ${document.uri}`);
  return inlayHintProvider.handle(params, document);
});

// Call hierarchy handlers
connection.languages.callHierarchy.onPrepare((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  debugLog(`[CallHierarchy] Prepare requested for ${document.uri}`);
  return callHierarchyProvider.prepare(params, document);
});

connection.languages.callHierarchy.onIncomingCalls((params) => {
  debugLog(`[CallHierarchy] Incoming calls requested`);
  return callHierarchyProvider.getIncomingCalls(params.item);
});

connection.languages.callHierarchy.onOutgoingCalls((params) => {
  debugLog(`[CallHierarchy] Outgoing calls requested`);
  return callHierarchyProvider.getOutgoingCalls(params.item);
});

// Type hierarchy handlers
connection.languages.typeHierarchy.onPrepare((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return null;
  }
  debugLog(`[TypeHierarchy] Prepare requested for ${document.uri}`);
  return typeHierarchyProvider.prepare(params, document);
});

connection.languages.typeHierarchy.onSupertypes((params) => {
  debugLog(`[TypeHierarchy] Supertypes requested`);
  return typeHierarchyProvider.getSupertypes(params.item);
});

connection.languages.typeHierarchy.onSubtypes((params) => {
  debugLog(`[TypeHierarchy] Subtypes requested`);
  return typeHierarchyProvider.getSubtypes(params.item);
});

// Workspace symbol handler for workspace-wide search
connection.onWorkspaceSymbol((params) => {
  debugLog(`[WorkspaceSymbol] Search requested: "${params.query}"`);
  return workspaceSymbolProvider.search(params);
});

// Code lens handler for showing references and complexity
connection.onCodeLens((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  debugLog(`[CodeLens] Lenses requested for ${document.uri}`);
  return codeLensProvider.provide(params, document);
});

// Document link handler for clickable imports
connection.onDocumentLinks((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    return [];
  }
  debugLog(`[DocumentLink] Links requested for ${document.uri}`);
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
  debugLog("[Rename] Prepare rename request");
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    debugLog("[Rename] Document not found");
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
  debugLog(
    `[Rename] Rename request at ${params.textDocument.uri} line ${params.position.line} to "${params.newName}"`,
  );
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    debugLog("[Rename] Document not found");
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
  debugLog("[References] Find all references request");
  const document = documents.get(params.textDocument.uri);
  if (!document) {
    debugLog("[References] Document not found");
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

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
