/**
 * LSP Server Types
 * Shared types and interfaces for the language server
 */

import type { TextDocument } from "vscode-languageserver-textdocument";
import type { TextDocuments } from "vscode-languageserver/node";
import type * as AST from "../../../compiler/common/AST";
import type { TypeChecker } from "../../../compiler/middleend/TypeChecker";

/**
 * Result of analyzing a document
 */
export interface AnalysisResult {
  program: AST.Program;
  checker: TypeChecker;
}

/**
 * Server settings from VS Code configuration
 */
export interface ServerSettings {
  maxNumberOfProblems: number;
  bplHome?: string;
}

/**
 * Default server settings
 */
export const DEFAULT_SETTINGS: ServerSettings = {
  maxNumberOfProblems: 1000,
};

/**
 * Context passed to service handlers
 */
export interface ServiceContext {
  documents: TextDocuments<TextDocument>;
  documentAnalysis: Map<string, AnalysisResult>;
  getDocumentSettings: (uri: string) => Promise<ServerSettings>;
}
