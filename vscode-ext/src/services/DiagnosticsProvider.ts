import { fileURLToPath } from "url";
import * as path from "path";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver/node";
import * as AST from "../../../compiler/common/AST";
import { CompilerError } from "../../../compiler/common/CompilerError";
import { Parser } from "../../../compiler/frontend/Parser";
import { TypeChecker } from "../../../compiler/middleend/TypeChecker";
import { findWorkspaceLibDir } from "./utils";
import { SymbolIndex } from "./SymbolIndex";
import type { AnalysisResult, ServerSettings } from "./types";

export interface DiagnosticsResult {
  diagnostics: Diagnostic[];
  analysis?: AnalysisResult;
}

export class DiagnosticsProvider {
  constructor(
    private readonly symbolIndex: SymbolIndex,
    private readonly onIndexError?: (filePath: string, error: unknown) => void,
  ) {}

  validate(
    textDocument: TextDocument,
    settings: ServerSettings = { maxNumberOfProblems: 1000 },
  ): Diagnostic[] {
    return this.analyze(textDocument, settings).diagnostics;
  }

  analyze(
    textDocument: TextDocument,
    settings: ServerSettings = { maxNumberOfProblems: 1000 },
  ): DiagnosticsResult {
    const text = textDocument.getText();
    const filePath = fileURLToPath(textDocument.uri);
    const currentDir = path.dirname(filePath);

    if (settings.bplHome) {
      process.env.BPL_HOME = settings.bplHome;
      this.symbolIndex.setBplHome(settings.bplHome);
    } else {
      const libDir = findWorkspaceLibDir(currentDir);
      if (libDir) {
        process.env.BPL_HOME = path.dirname(libDir);
        this.symbolIndex.setBplHome(path.dirname(libDir));
      }
    }

    try {
      this.symbolIndex.indexFile(filePath, true);
    } catch (error) {
      this.onIndexError?.(filePath, error);
    }

    const diagnostics: Diagnostic[] = [];
    let analysis: AnalysisResult | undefined;

    try {
      const parser = new Parser(text, filePath);
      const program: AST.Program = parser.parse();
      const checker = new TypeChecker({
        skipImportResolution: false,
        collectAllErrors: true,
      });

      checker.checkProgram(program);
      analysis = { program, checker };

      for (const err of checker.getErrors()) {
        diagnostics.push(compilerErrorToDiagnostic(err, textDocument));
      }
    } catch (error: any) {
      if (error instanceof CompilerError) {
        diagnostics.push(compilerErrorToDiagnostic(error, textDocument));
      } else {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: Range.create(0, 0, 0, 1),
          message: String(error?.message || error),
          source: "bpl-lsp",
        });
      }
    }

    return {
      diagnostics: diagnostics.slice(0, settings.maxNumberOfProblems || 1000),
      analysis,
    };
  }
}

export function compilerErrorToDiagnostic(
  err: CompilerError,
  doc: TextDocument,
): Diagnostic {
  const start = clampDiagnosticPosition(
    doc,
    err.location.startLine,
    err.location.startColumn,
  );
  const end = clampDiagnosticPosition(
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

function clampDiagnosticPosition(
  doc: TextDocument,
  line: number,
  character: number,
) {
  const lines = doc.getText().split(/\r?\n/);
  const clampedLine = Math.max(0, Math.min(lines.length - 1, (line ?? 1) - 1));
  const maxChar = lines[clampedLine]?.length ?? 0;
  const clampedCharacter = Math.max(
    0,
    Math.min(maxChar, (character ?? 1) - 1),
  );

  return { line: clampedLine, character: clampedCharacter };
}
