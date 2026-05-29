/**
 * AST-based Completion Handler
 * Provides autocomplete/intellisense using the compiler's parser
 */

import {
  CompletionItem,
  CompletionItemKind,
  type TextDocumentPositionParams,
  InsertTextFormat,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex, type SymbolInfo } from "./SymbolIndex";

export class ASTCompletionHandler {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Handle completion request using AST-based resolution
   */
  handle(
    params: TextDocumentPositionParams,
    document: TextDocument,
  ): CompletionItem[] {
    try {
      const filePath = fileURLToPath(params.textDocument.uri);
      const line = params.position.line + 1;
      const character = params.position.character;

      console.log(
        `[ASTCompletion] Completion at ${filePath}:${line}:${character + 1}`,
      );

      // Parse the document content (support unsaved documents)
      const content = document.getText();
      this.astResolver.parseDocumentContent(filePath, content);

      // Get the line text to detect context
      const lineText = document.getText({
        start: { line: params.position.line, character: 0 },
        end: { line: params.position.line + 1, character: 0 },
      });

      const beforeCursor = lineText.substring(0, character);

      // Check if we're after a dot (member access) with optional partial text
      // Match: obj. or Array<int>. or obj.getNa or obj.field1.field2. or obj.field.partial
      // Pattern matches: identifier, optional generics <...>, optional calls (...), then chained members, then dot
      // Note: This simple regex handles simple calls like foo(1) but might fail on nested calls foo(bar())
      const memberMatch = beforeCursor.match(
        /([a-zA-Z_][a-zA-Z0-9_]*(?:<[^>]+>)?(?:\([^)]*\))?(?:\.[a-zA-Z_][a-zA-Z0-9_]*(?:<[^>]+>)?(?:\([^)]*\))?)*)\.(\w*)$/,
      );

      if (memberMatch && memberMatch[1]) {
        this.symbolIndex.getImportedSymbolsFromContent(filePath, content);
        const objectPath = memberMatch[1];
        const partialMember = memberMatch[2] || "";
        console.log(
          `[ASTCompletion] Member access on: ${objectPath}, partial: "${partialMember}"`,
        );
        return this.handleMemberCompletion(
          objectPath,
          filePath,
          line,
          character,
          partialMember,
        );
      }

      // Otherwise, provide general completions
      console.log(`[ASTCompletion] General completion`);
      return this.handleGeneralCompletion(filePath, line, character, document);
    } catch (error) {
      console.error(`[ASTCompletion] Error:`, error);
      return [];
    }
  }

  /**
   * Handle member access completion (obj.??? or obj.field.??? or Array<int>.???)
   */
  private handleMemberCompletion(
    objectPath: string,
    filePath: string,
    line: number,
    character: number,
    partialText: string = "",
  ): CompletionItem[] {
    // Check if this is a generic type (e.g., Array<int>)
    const genericMatch = objectPath.match(/^([a-zA-Z_][a-zA-Z0-9_]*)<(.+)>$/);

    if (genericMatch) {
      // This is a generic type like Array<int>, not a variable
      // Return static methods/fields of the type
      const baseType = genericMatch[1];
      console.log(`[ASTCompletion] Generic type access: ${baseType}<...>`);

      const allCompletions = this.getCompletionsForType(objectPath);

      // Filter by partial text if provided
      if (partialText) {
        const filtered = allCompletions.filter((item) =>
          item.label.toLowerCase().startsWith(partialText.toLowerCase()),
        );
        console.log(
          `[ASTCompletion] Filtered ${filtered.length}/${allCompletions.length} completions for "${partialText}"`,
        );
        return filtered;
      }

      return allCompletions;
    }

    // Build synthetic AST node for chained access
    const parts = objectPath.split(".");
    let syntheticNode: AST.ASTNode | null = null;

    // Helper to create safe location
    const loc = {
      file: filePath,
      startLine: line,
      startColumn: character - objectPath.length - 1, // Approximate
      endLine: line,
      endColumn: character - 1,
    };

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      // Check for call pattern: name(...) or name<...>(...)
      const callMatch = part.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*)(?:<[^>]+>)?\s*\(.*\)$/,
      );

      let currentNode: AST.ASTNode;

      if (callMatch) {
        const name = callMatch[1];
        // Create base node (Identifier or Member)
        if (i === 0) {
          currentNode = {
            kind: "Identifier",
            name: name,
            location: loc,
          } as AST.IdentifierExpr;
        } else {
          currentNode = {
            kind: "Member",
            object: syntheticNode!,
            property: name,
            location: loc,
          } as AST.MemberExpr;
        }

        // Wrap in Call
        currentNode = {
          kind: "Call",
          callee: currentNode as AST.Expression,
          args: [], // Arguments not needed for simple return type resolution
          genericArgs: [],
          location: loc,
        } as AST.CallExpr;
      } else {
        // Not a call
        // Strip generics if present for the name property (though usually not present in var names access)
        const nameMatch = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
        const name = nameMatch ? nameMatch[1] : part;

        if (i === 0) {
          currentNode = {
            kind: "Identifier",
            name: name,
            location: loc,
          } as AST.IdentifierExpr;
        } else {
          currentNode = {
            kind: "Member",
            object: syntheticNode!,
            property: name,
            location: loc,
          } as AST.MemberExpr;
        }
      }

      syntheticNode = currentNode;
    }

    if (!syntheticNode) return [];

    const type = this.astResolver.resolveType(syntheticNode, filePath);
    console.log(`[ASTCompletion] Resolved type: ${type}`);

    if (!type) return [];

    const allCompletions = this.getCompletionsForType(type);

    // Filter by partial text if provided
    if (partialText) {
      const filtered = allCompletions.filter((item) =>
        item.label.toLowerCase().startsWith(partialText.toLowerCase()),
      );
      console.log(
        `[ASTCompletion] Filtered ${filtered.length}/${allCompletions.length} completions for "${partialText}"`,
      );
      return filtered;
    }

    return allCompletions;
  }

  /**
   * Get completions for a specific type
   */
  private getCompletionsForType(type: string): CompletionItem[] {
    const items: CompletionItem[] = [];

    // Extract base type (remove pointers, arrays, generics)
    const baseType = type
      .replace(/^\*+/, "")
      .replace(/\[\]$/, "")
      .replace(/<.*>/, "");

    // Look up in symbol index
    const symbols = this.symbolIndex.findSymbol(baseType);

    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return items;

      // Add enum variants
      if (symbol.kind === "enum" && symbol.variants) {
        for (const variant of symbol.variants) {
          items.push({
            label: variant.name,
            kind: CompletionItemKind.EnumMember,
            detail: variant.dataType
              ? `${symbol.name}.${variant.name}${variant.dataType}`
              : `${symbol.name}.${variant.name}`,
            documentation: `Enum variant of ${symbol.name}`,
          });
        }
      }

      // Add struct/spec methods
      if (symbol.methods) {
        for (const method of symbol.methods) {
          items.push({
            label: method.name,
            kind: CompletionItemKind.Method,
            detail: this.formatMethodSignature(method),
            documentation: method.documentation,
            insertText: this.createMethodSnippet(method),
            insertTextFormat: InsertTextFormat.Snippet,
          });
        }
      }

      // Add struct fields
      if (symbol.fields) {
        for (const field of symbol.fields) {
          items.push({
            label: field.name,
            kind: CompletionItemKind.Field,
            detail: `${field.name}: ${field.type}`,
            documentation: field.documentation,
          });
        }
      }
    }

    console.log(`[ASTCompletion] Returning ${items.length} member completions`);
    return items;
  }

  /**
   * Handle general completion (Ctrl+Space or after whitespace)
   */
  private handleGeneralCompletion(
    filePath: string,
    line: number,
    character: number,
    document: TextDocument,
  ): CompletionItem[] {
    const items: CompletionItem[] = [];
    const seen = new Set<string>();

    // Add symbols from current file
    const fileSymbols = this.symbolIndex.getFileSymbols(filePath);
    console.log(`[ASTCompletion] Found ${fileSymbols.length} file symbols`);
    for (const symbol of fileSymbols) {
      const key = `${symbol.kind}:${symbol.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(this.symbolToCompletionItem(symbol));
      }
    }

    // Add imported symbols (use document content to support unsaved files)
    const content = document.getText();
    const importedSymbols = this.symbolIndex.getImportedSymbolsFromContent(
      filePath,
      content,
    );
    console.log(
      `[ASTCompletion] Found ${importedSymbols.length} imported symbols`,
    );
    for (const symbol of importedSymbols) {
      const key = `${symbol.kind}:${symbol.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(this.symbolToCompletionItem(symbol));
      }
    }

    // Add local variables from current scope
    // Try to get the parsed AST (from cache, which includes document content)
    let ast = this.astResolver.getCachedAST(filePath);
    if (!ast) {
      // Fallback to reading from disk if not in cache
      ast = this.astResolver.getAST(filePath);
    }

    if (ast) {
      const locals = this.findLocalVariables(ast, line, character);
      for (const local of locals) {
        const key = `local:${local.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({
            label: local.name,
            kind: CompletionItemKind.Variable,
            detail: local.type || "inferred",
            documentation: "Local variable",
          });
        }
      }
    }

    // Sort alphabetically
    items.sort((a, b) => a.label.localeCompare(b.label));

    console.log(
      `[ASTCompletion] Returning ${items.length} unique general completions`,
    );
    return items;
  }

  /**
   * Convert symbol to completion item
   */
  private symbolToCompletionItem(symbol: SymbolInfo): CompletionItem {
    let kind: CompletionItemKind;
    let detail: string | undefined;

    switch (symbol.kind) {
      case "function":
        kind = CompletionItemKind.Function;
        detail = symbol.signature
          ? this.formatFunctionSignature(symbol.signature)
          : undefined;
        break;
      case "struct":
        kind = CompletionItemKind.Class;
        detail = `struct ${symbol.name}`;
        break;
      case "enum":
        kind = CompletionItemKind.Enum;
        detail = `enum ${symbol.name}`;
        break;
      case "spec":
        kind = CompletionItemKind.Interface;
        detail = `spec ${symbol.name}`;
        break;
      case "type-alias":
        kind = CompletionItemKind.TypeParameter;
        detail = `type ${symbol.name}`;
        break;
      default:
        kind = CompletionItemKind.Variable;
    }

    return {
      label: symbol.name,
      kind,
      detail,
      documentation: symbol.documentation,
    };
  }

  /**
   * Format function signature for display
   */
  private formatFunctionSignature(signature: any): string {
    if (!signature || !signature.parameters) {
      return `frame() ret unknown`;
    }
    const params = signature.parameters
      .map((p: any) => `${p.name}: ${p.type}`)
      .join(", ");
    return `frame(${params}) ret ${signature.returnType}`;
  }

  /**
   * Format method signature
   */
  private formatMethodSignature(method: any): string {
    if (!method || !method.signature || !method.signature.parameters) {
      return `frame ${method?.name || "unknown"}()`;
    }
    const params = method.signature.parameters
      .map((p: any) => `${p.name}: ${p.type}`)
      .join(", ");
    return `frame ${method.name}(${params}) ret ${method.signature.returnType}`;
  }

  /**
   * Create method call snippet
   */
  private createMethodSnippet(method: any): string {
    if (
      !method ||
      !method.signature ||
      !method.signature.parameters ||
      method.signature.parameters.length === 0
    ) {
      return `${method?.name || "method"}()`;
    }

    // Skip 'this' parameter for member methods
    const params = method.signature.parameters
      .filter((p: any) => p.name !== "this")
      .map((p: any, i: number) => `\${${i + 1}:${p.name}}`)
      .join(", ");
    return `${method.name}(${params})`;
  }

  /**
   * Find local variables in the current scope
   */
  private findLocalVariables(
    ast: AST.Program,
    line: number,
    character: number,
  ): Array<{ name: string; type?: string }> {
    const locals: Array<{ name: string; type?: string }> = [];
    const visited = new Set<string>();

    // Find the function/struct containing the cursor
    const currentFunction = this.findContainingFunction(ast, line);

    if (currentFunction) {
      // Add function parameters
      if (currentFunction.params) {
        for (const param of currentFunction.params) {
          if (!visited.has(param.name)) {
            visited.add(param.name);
            locals.push({
              name: param.name,
              type: param.type ? this.typeNodeToString(param.type) : undefined,
            });
          }
        }
      }

      // Traverse function body and collect variables in scope
      if (currentFunction.body) {
        this.collectVariablesInScope(
          currentFunction.body,
          line,
          character,
          locals,
          visited,
        );
      }
    } else {
      // Not inside a function - collect only module-level variables declared before cursor
      for (const stmt of ast.statements) {
        if (stmt.kind === "VariableDecl") {
          if (stmt.location && stmt.location.startLine <= line) {
            this.addVariableDeclToScope(stmt, locals, visited);
          }
        }
      }
    }

    return locals;
  }

  /**
   * Find the function containing the given line
   */
  private findContainingFunction(ast: AST.Program, line: number): any | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        if (
          stmt.location &&
          stmt.location.startLine <= line &&
          stmt.location.endLine >= line
        ) {
          return stmt;
        }
      } else if (stmt.kind === "StructDecl" && stmt.members) {
        for (const member of stmt.members) {
          if (member.kind === "FunctionDecl") {
            if (
              member.location &&
              member.location.startLine <= line &&
              member.location.endLine >= line
            ) {
              return member;
            }
          }
        }
      } else if (stmt.kind === "EnumDecl" && stmt.methods) {
        for (const method of stmt.methods) {
          if (
            method.location &&
            method.location.startLine <= line &&
            method.location.endLine >= line
          ) {
            return method;
          }
        }
      }
    }
    return null;
  }

  /**
   * Collect variables in scope at the given position
   */
  private collectVariablesInScope(
    block: any,
    line: number,
    character: number,
    locals: Array<{ name: string; type?: string }>,
    visited: Set<string>,
  ): void {
    if (!block || !block.statements) return;

    for (const stmt of block.statements) {
      // Stop collecting if we've passed the cursor position
      if (stmt.location && stmt.location.startLine > line) {
        break;
      }

      if (stmt.kind === "VariableDecl") {
        this.addVariableDeclToScope(stmt, locals, visited);
      }

      // Recursively check nested blocks (if, loop, etc.)
      // Only if the cursor is inside them
      if (stmt.kind === "Block") {
        if (
          stmt.location &&
          stmt.location.startLine <= line &&
          stmt.location.endLine >= line
        ) {
          this.collectVariablesInScope(stmt, line, character, locals, visited);
        }
      } else if (stmt.kind === "If") {
        if (stmt.thenBranch && stmt.thenBranch.kind === "Block") {
          if (
            stmt.thenBranch.location &&
            stmt.thenBranch.location.startLine <= line &&
            stmt.thenBranch.location.endLine >= line
          ) {
            this.collectVariablesInScope(
              stmt.thenBranch,
              line,
              character,
              locals,
              visited,
            );
          }
        }
        if (stmt.elseBranch) {
          if (stmt.elseBranch.kind === "Block") {
            if (
              stmt.elseBranch.location &&
              stmt.elseBranch.location.startLine <= line &&
              stmt.elseBranch.location.endLine >= line
            ) {
              this.collectVariablesInScope(
                stmt.elseBranch,
                line,
                character,
                locals,
                visited,
              );
            }
          } else if (stmt.elseBranch.kind === "If") {
            // else if - recurse into it as a statement
            this.collectVariablesInScope(
              { statements: [stmt.elseBranch] },
              line,
              character,
              locals,
              visited,
            );
          }
        }
      } else if (stmt.kind === "Loop") {
        if (stmt.body && stmt.body.kind === "Block") {
          if (
            stmt.body.location &&
            stmt.body.location.startLine <= line &&
            stmt.body.location.endLine >= line
          ) {
            if (stmt.init?.kind === "VariableDecl") {
              this.addVariableDeclToScope(stmt.init, locals, visited);
            }
            this.collectVariablesInScope(
              stmt.body,
              line,
              character,
              locals,
              visited,
            );
          }
        }
      } else if (stmt.kind === "MatchExpr") {
        // Check match arms
        if (stmt.arms) {
          for (const arm of stmt.arms) {
            if (arm.body && arm.body.kind === "Block") {
              if (
                arm.body.location &&
                arm.body.location.startLine <= line &&
                arm.body.location.endLine >= line
              ) {
                this.collectVariablesInScope(
                  arm.body,
                  line,
                  character,
                  locals,
                  visited,
                );
              }
            }
          }
        }
      }
    }
  }

  private addVariableDeclToScope(
    decl: AST.VariableDecl,
    locals: Array<{ name: string; type?: string }>,
    visited: Set<string>,
  ): void {
    // Handle both simple names and destructuring
    if (typeof decl.name === "string") {
      if (!visited.has(decl.name)) {
        visited.add(decl.name);

        // Try to get type from annotation or infer from initializer
        let varType: string | undefined;
        if (decl.typeAnnotation) {
          varType = this.typeNodeToString(decl.typeAnnotation);
        } else if (decl.initializer) {
          varType = this.inferTypeFromExpression(decl.initializer);
        }

        locals.push({
          name: decl.name,
          type: varType,
        });
      }
    } else if (Array.isArray(decl.name)) {
      // Destructuring
      for (const target of decl.name) {
        if (!visited.has(target.name)) {
          visited.add(target.name);
          locals.push({
            name: target.name,
            type: target.type ? this.typeNodeToString(target.type) : undefined,
          });
        }
      }
    }
  }

  /**
   * Convert TypeNode to string
   */
  private typeNodeToString(typeNode: AST.TypeNode): string {
    if (typeNode.kind === "BasicType") {
      let result = typeNode.name;
      if (typeNode.pointerDepth > 0) {
        result = "*".repeat(typeNode.pointerDepth) + result;
      }
      if (typeNode.arrayDimensions && typeNode.arrayDimensions.length > 0) {
        for (const dim of typeNode.arrayDimensions) {
          result += dim !== null ? `[${dim}]` : "[]";
        }
      }
      return result;
    }
    return "unknown";
  }

  /**
   * Try to infer type from an expression
   */
  private inferTypeFromExpression(expr: any): string | undefined {
    if (!expr) return undefined;

    switch (expr.kind) {
      case "IntLiteral":
        return "int";
      case "FloatLiteral":
        return "float";
      case "StringLiteral":
        return "string";
      case "BoolLiteral":
        return "bool";
      case "CharLiteral":
        return "char";
      case "NullLiteral":
        return "nullptr";
      case "Call":
        // Try to get return type from function
        if (expr.callee && expr.callee.kind === "Identifier") {
          const funcName = expr.callee.name;
          const symbols = this.symbolIndex.findSymbol(funcName);
          if (symbols.length > 0 && symbols[0] && symbols[0].signature) {
            return symbols[0].signature.returnType || undefined;
          }
        }
        return undefined;
      case "Member":
        // Try to resolve member access
        return undefined;
      case "Identifier":
        // Could look up the identifier's type
        return undefined;
      case "ArrayLiteral":
        // Array type - could infer element type
        if (expr.elements && expr.elements.length > 0) {
          const elemType = this.inferTypeFromExpression(expr.elements[0]);
          return elemType ? `${elemType}[]` : undefined;
        }
        return undefined;
      case "New":
        // new Type() - return the type
        if (expr.type && expr.type.kind === "BasicType") {
          return this.typeNodeToString(expr.type);
        }
        return undefined;
      default:
        return undefined;
    }
  }
}
