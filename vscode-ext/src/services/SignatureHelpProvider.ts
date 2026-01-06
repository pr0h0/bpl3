import {
  type SignatureHelpParams,
  type SignatureHelp,
  SignatureInformation,
  ParameterInformation,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Provides signature help - shows parameter info while typing function calls.
 */
export class SignatureHelpProvider {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Handle signature help request
   */
  handle(
    params: SignatureHelpParams,
    document: TextDocument,
  ): SignatureHelp | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();
    const position = params.position;

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const line = position.line + 1; // AST uses 1-based
    const char = position.character + 1;

    // Find the function call we're inside
    const callContext = this.findFunctionCallContext(
      ast,
      line,
      char,
      document,
      position,
    );
    if (!callContext) return null;

    // Get signature information
    const signatures = this.getSignatures(callContext.functionName, filePath);
    if (signatures.length === 0) return null;

    return {
      signatures,
      activeSignature: 0,
      activeParameter: callContext.currentParam,
    };
  }

  /**
   * Find function call context at cursor position
   */
  private findFunctionCallContext(
    ast: AST.Program,
    line: number,
    char: number,
    document: TextDocument,
    position: any,
  ): { functionName: string; currentParam: number } | null {
    // Get line text and find unclosed parenthesis
    const lineText = document.getText({
      start: { line: position.line, character: 0 },
      end: { line: position.line + 1, character: 0 },
    });

    const beforeCursor = lineText.substring(0, position.character);

    // Find the last unclosed '('
    let parenDepth = 0;
    let lastOpenParen = -1;
    let _commaCount = 0;

    for (let i = beforeCursor.length - 1; i >= 0; i--) {
      const ch = beforeCursor[i];
      if (ch === ")") {
        parenDepth++;
      } else if (ch === "(") {
        if (parenDepth === 0) {
          lastOpenParen = i;
          break;
        }
        parenDepth--;
      } else if (ch === "," && parenDepth === 0) {
        _commaCount++;
      }
    }

    if (lastOpenParen === -1) return null;

    // Count commas between open paren and cursor to determine current parameter
    const withinParens = beforeCursor.substring(lastOpenParen + 1);
    const currentParam = this.countCommas(withinParens);

    // Extract function name before the '('
    const beforeParen = beforeCursor.substring(0, lastOpenParen).trim();
    const functionNameMatch = beforeParen.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);

    if (!functionNameMatch || !functionNameMatch[1]) return null;

    return {
      functionName: functionNameMatch[1],
      currentParam,
    };
  }

  /**
   * Count commas at depth 0 (not inside nested calls or generics)
   */
  private countCommas(text: string): number {
    let count = 0;
    let parenDepth = 0;
    let angleDepth = 0;

    for (const ch of text) {
      if (ch === "(") parenDepth++;
      else if (ch === ")") parenDepth--;
      else if (ch === "<") angleDepth++;
      else if (ch === ">") angleDepth--;
      else if (ch === "," && parenDepth === 0 && angleDepth === 0) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get signatures for a function
   */
  private getSignatures(
    functionName: string,
    _filePath: string,
  ): SignatureInformation[] {
    const signatures: SignatureInformation[] = [];

    // Look up function in symbol index
    const symbols = this.symbolIndex.findSymbol(functionName);

    if (Array.isArray(symbols)) {
      for (const symbol of symbols) {
        if (symbol && symbol.kind === "function") {
          const sig = this.createSignatureFromSymbol(symbol);
          if (sig) signatures.push(sig);
        }
      }
    }

    // Also check for methods (could be called via explicit self)
    const structSymbols = this.symbolIndex.getAllSymbols();
    for (const sym of structSymbols) {
      if (sym.kind === "struct" && sym.methods) {
        for (const method of sym.methods) {
          if (method.name === functionName) {
            const sig = this.createSignatureFromMethod(method);
            if (sig) signatures.push(sig);
          }
        }
      }
    }

    return signatures;
  }

  /**
   * Create signature information from function symbol
   */
  private createSignatureFromSymbol(symbol: any): SignatureInformation | null {
    // Check if symbol has signature with parameters
    const params = symbol.signature?.parameters || symbol.params;
    if (!params || !Array.isArray(params)) return null;

    const paramInfos: ParameterInformation[] = params.map(
      (p: { name: string; type: string }) => {
        return ParameterInformation.create(
          `${p.name}: ${p.type}`,
          `Parameter ${p.name}`,
        );
      },
    );

    const paramLabels = params
      .map((p: { name: string; type: string }) => `${p.name}: ${p.type}`)
      .join(", ");
    const returnType =
      symbol.signature?.returnType || symbol.returnType || "void";
    const label = `${symbol.name}(${paramLabels}) ret ${returnType}`;

    return SignatureInformation.create(
      label,
      symbol.documentation || symbol.doc,
      ...paramInfos,
    );
  }

  /**
   * Create signature information from method
   */
  private createSignatureFromMethod(method: any): SignatureInformation | null {
    // Methods store parameters directly in signature
    const params = method.signature?.parameters || method.params;
    if (!params || !Array.isArray(params)) return null;

    const paramInfos: ParameterInformation[] = params.map(
      (p: { name: string; type: string }) => {
        return ParameterInformation.create(
          `${p.name}: ${p.type}`,
          `Parameter ${p.name}`,
        );
      },
    );

    const paramLabels = params
      .map((p: { name: string; type: string }) => `${p.name}: ${p.type}`)
      .join(", ");
    const returnType =
      method.signature?.returnType || method.returnType || "void";
    const label = `${method.name}(${paramLabels}) ret ${returnType}`;

    return SignatureInformation.create(
      label,
      method.documentation,
      ...paramInfos,
    );
  }
}
