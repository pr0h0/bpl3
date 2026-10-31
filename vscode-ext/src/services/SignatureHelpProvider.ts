import {
  type SignatureHelpParams,
  type SignatureHelp,
  type Position,
  SignatureInformation,
  ParameterInformation,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";
import { typeNodeToString } from "./utils";
import type * as AST from "../../../compiler/common/AST";

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
    const filePath = fileURLToPath(document.uri);
    const content = document.getText();
    const position = params.position;

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    // Find the function call we're inside
    const callContext = this.findFunctionCallContext(document, position);
    if (!callContext) return null;

    // `Ns.fn(` where `import * as Ns` binds a module.
    const member = callContext.qualifier
      ? this.symbolIndex.findNamespaceMember(
          callContext.qualifier,
          callContext.functionName,
          filePath,
          ast,
        )
      : undefined;
    const memberSignature =
      member?.kind === "function"
        ? this.createSignatureFromSymbol(member)
        : null;

    // Get signature information
    let signatures: SignatureInformation[];
    if (memberSignature) {
      signatures = [memberSignature];
    } else if (callContext.qualifier) {
      signatures = this.getMethodSignatures(
        callContext,
        document,
        filePath,
        ast,
      );
    } else {
      signatures = this.getSignatures(callContext.functionName, filePath, ast);
    }
    if (signatures.length === 0) return null;

    return {
      signatures,
      activeSignature: 0,
      activeParameter: callContext.currentParam,
    };
  }

  /**
   * The call the cursor is inside: the innermost unclosed `(` before it, the
   * callee name (and `qualifier.` before it), and the argument index. Strings,
   * character literals and `#` comments are skipped, and `<` counts as a
   * generic bracket only when it touches the name before it, as in BPL.
   */
  private findFunctionCallContext(
    document: TextDocument,
    position: Position,
  ): {
    functionName: string;
    qualifier?: string;
    qualifierOffset?: number;
    currentParam: number;
  } | null {
    const text = document.getText({
      start: { line: 0, character: 0 },
      end: position,
    });

    const stack: { kind: string; offset: number; commas: number }[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === "/" && text[i + 1] === "#") {
        // Block comments end at the first `#/`; they do not nest.
        const end = text.indexOf("#/", i + 2);
        i = end < 0 ? text.length : end + 1;
      } else if (ch === "#") {
        while (i < text.length && text[i] !== "\n") i++;
      } else if (ch === "`") {
        // Interpolated strings stay on one line.
        for (i++; i < text.length && text[i] !== "`" && text[i] !== "\n"; i++) {
          if (text[i] === "\\") i++;
        }
      } else if (ch === '"' || ch === "'") {
        for (i++; i < text.length && text[i] !== ch; i++) {
          if (text[i] === "\\") i++;
        }
      } else if (ch === "(" || ch === "[" || ch === "{") {
        stack.push({ kind: ch, offset: i, commas: 0 });
      } else if (ch === "<" && i > 0 && /[A-Za-z0-9_]/.test(text[i - 1]!)) {
        stack.push({ kind: "<", offset: i, commas: 0 });
      } else if (ch === ">" && stack[stack.length - 1]?.kind === "<") {
        stack.pop();
      } else if (ch === ")" || ch === "]" || ch === "}") {
        const open = OPENING_BRACKET[ch]!;
        // Unbalanced generic brackets inside the group close with it.
        while (stack.length > 0 && stack[stack.length - 1]!.kind === "<") {
          stack.pop();
        }
        if (stack[stack.length - 1]?.kind === open) stack.pop();
      } else if (ch === "," && stack.length > 0) {
        stack[stack.length - 1]!.commas++;
      }
    }

    let call: { offset: number; commas: number } | undefined;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!.kind === "(") {
        call = stack[i];
        break;
      }
      // Inside a block or index rather than a call's arguments.
      if (stack[i]!.kind === "{") return null;
    }
    if (!call) return null;

    const beforeParen = text.substring(0, call.offset).trimEnd();
    const functionNameMatch = beforeParen.match(
      /(?:([a-zA-Z_][a-zA-Z0-9_]*)\s*\.\s*)?([a-zA-Z_][a-zA-Z0-9_]*)$/,
    );

    if (!functionNameMatch || !functionNameMatch[2]) return null;

    return {
      functionName: functionNameMatch[2],
      qualifier: functionNameMatch[1],
      qualifierOffset: functionNameMatch[1]
        ? beforeParen.length - functionNameMatch[0].length
        : undefined,
      currentParam: call.commas,
    };
  }

  /**
   * Signatures for `qualifier.name(`. When the qualifier is a value of a known
   * struct type only that struct's method is shown, and an instance method's
   * `this` is omitted because the receiver is not an argument.
   */
  private getMethodSignatures(
    context: {
      functionName: string;
      qualifier?: string;
      qualifierOffset?: number;
    },
    document: TextDocument,
    filePath: string,
    ast: AST.Program | null | undefined,
  ): SignatureInformation[] {
    const qualifier = context.qualifier!;
    let ownerName: string | null = null;
    const typeNamed = this.findStruct(qualifier, filePath, ast);
    if (typeNamed) {
      ownerName = qualifier;
    } else if (context.qualifierOffset !== undefined) {
      const at = document.positionAt(context.qualifierOffset);
      const node = this.astResolver.findNodeAtPosition(
        filePath,
        at.line,
        at.character,
      );
      const type =
        node?.kind === "Identifier"
          ? this.astResolver.resolveType(node, filePath)
          : null;
      ownerName = type ? baseTypeName(type) : null;
    }

    const signatures: SignatureInformation[] = [];
    const owner = ownerName ? this.findStruct(ownerName, filePath, ast) : null;
    if (owner) {
      for (const member of owner.members) {
        if (
          member.kind === "FunctionDecl" &&
          member.name === context.functionName
        ) {
          signatures.push(signatureFromDecl(member, true));
        }
      }
      // A known receiver without that method has no signature to show.
      return signatures;
    }
    if (ownerName) {
      // The index's copy of this file is stale next to the open buffer.
      const indexed = this.symbolIndex
        .findSymbolInFile(ownerName, filePath, ast)
        .filter((symbol) => symbol.filePath !== filePath);
      for (const symbol of indexed) {
        for (const method of symbol.methods ?? []) {
          if (method.name !== context.functionName) continue;
          const sig = this.createSignatureFromMethod(method, true);
          if (sig) signatures.push(sig);
        }
      }
      if (indexed.length > 0) return signatures;
    }
    // Unknown receiver: any method of that name, still without `this`.
    for (const sym of this.symbolIndex.getAllSymbols()) {
      for (const method of sym.methods ?? []) {
        if (method.name !== context.functionName) continue;
        const sig = this.createSignatureFromMethod(method, true);
        if (sig) signatures.push(sig);
      }
    }
    return signatures;
  }

  /** A struct declared in the open buffer, or else known to the index. */
  private findStruct(
    name: string,
    filePath: string,
    ast: AST.Program | null | undefined,
  ): AST.StructDecl | null {
    const local = ast?.statements.find(
      (statement): statement is AST.StructDecl =>
        statement.kind === "StructDecl" && statement.name === name,
    );
    if (local) return local;
    const indexed = this.symbolIndex
      .findSymbolInFile(name, filePath, ast)
      .find((symbol) => symbol.declaration.kind === "StructDecl");
    return indexed ? (indexed.declaration as AST.StructDecl) : null;
  }

  /**
   * Signatures for a free function. Declarations in the open buffer come
   * first, so unsaved edits show; the index covers imported modules.
   */
  private getSignatures(
    functionName: string,
    filePath: string,
    ast: AST.Program | null | undefined,
  ): SignatureInformation[] {
    const local = (ast?.statements ?? []).filter(
      (statement): statement is AST.FunctionDecl | AST.ExternDecl =>
        (statement.kind === "FunctionDecl" || statement.kind === "Extern") &&
        statement.name === functionName,
    );
    if (local.length > 0) {
      return local.map((decl) => signatureFromDecl(decl, false));
    }

    const signatures: SignatureInformation[] = [];
    // Follow an `import x as y` alias. The saved copy of this file is stale
    // next to the buffer, so its index entries are skipped.
    for (const symbol of this.symbolIndex.findSymbolInFile(
      functionName,
      filePath,
      ast,
    )) {
      if (symbol.kind !== "function" || symbol.filePath === filePath) continue;
      const sig = this.createSignatureFromSymbol(symbol);
      if (sig) signatures.push(sig);
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
  private createSignatureFromMethod(
    method: any,
    dropThis = false,
  ): SignatureInformation | null {
    // Methods store parameters directly in signature
    let params = method.signature?.parameters || method.params;
    if (!params || !Array.isArray(params)) return null;
    if (dropThis && params[0]?.name === "this") params = params.slice(1);

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

const OPENING_BRACKET: Record<string, string> = {
  ")": "(",
  "]": "[",
  "}": "{",
};

/** `*Box`, `Box<int>` or `Box[]` to `Box`. */
function baseTypeName(type: string): string {
  return type
    .replace(/^\*+/, "")
    .replace(/<.*$/, "")
    .replace(/\[.*$/, "")
    .trim();
}

/** A signature from a declaration, without `this` for a method call. */
function signatureFromDecl(
  decl: AST.FunctionDecl | AST.ExternDecl,
  dropThis: boolean,
): SignatureInformation {
  const params = decl.params.filter(
    (param, index) => !(dropThis && index === 0 && param.name === "this"),
  );
  const labels = params.map(
    (param) => `${param.name}: ${typeNodeToString(param.type)}`,
  );
  if (decl.kind === "Extern" && decl.isVariadic) labels.push("...");
  const returnType = decl.returnType
    ? typeNodeToString(decl.returnType)
    : "void";
  return SignatureInformation.create(
    `${decl.name}(${labels.join(", ")}) ret ${returnType}`,
    undefined,
    ...labels.map((label) => ParameterInformation.create(label)),
  );
}
