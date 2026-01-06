import * as fs from "fs";
import { Parser } from "../../../compiler/frontend/Parser";
import { lexWithGrammar } from "../../../compiler/frontend/GrammarLexer";
import * as AST from "../../../compiler/common/AST";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Convert a TypeNode to a string representation
 */
function typeNodeToString(type: AST.TypeNode | null | undefined): string {
  if (!type) return "void";

  switch (type.kind) {
    case "BasicType": {
      const basic = type as AST.BasicTypeNode;
      let result = basic.name;

      // Add generic arguments
      if (basic.genericArgs && basic.genericArgs.length > 0) {
        result +=
          "<" + basic.genericArgs.map(typeNodeToString).join(", ") + ">";
      }

      // Add pointer depth
      if (basic.pointerDepth > 0) {
        result = "*".repeat(basic.pointerDepth) + result;
      }

      // Add array dimensions
      if (basic.arrayDimensions && basic.arrayDimensions.length > 0) {
        for (const dim of basic.arrayDimensions) {
          result += dim !== null ? `[${dim}]` : "[]";
        }
      }

      return result;
    }

    case "TupleType": {
      const tuple = type as AST.TupleTypeNode;
      return "(" + tuple.types.map(typeNodeToString).join(", ") + ")";
    }

    case "FunctionType": {
      const func = type as AST.FunctionTypeNode;
      const params = func.paramTypes.map(typeNodeToString).join(", ");
      const ret = typeNodeToString(func.returnType);
      return `Func<${ret}>(${params})`;
    }

    case "LambdaType": {
      const lambda = type as AST.LambdaTypeNode;
      const params = lambda.paramTypes.map(typeNodeToString).join(", ");
      const ret = typeNodeToString(lambda.returnType);
      return `Lambda<${ret}>(${params})`;
    }

    default:
      return "unknown";
  }
}

interface ASTCache {
  ast: AST.Program;
  mtime: number;
  source: string;
}

/**
 * ASTResolver uses the actual compiler's parser to provide accurate
 * type resolution, hover information, and go-to-definition support.
 * This eliminates regex-based parsing and ensures consistency with the compiler.
 */
export class ASTResolver {
  private astCache: Map<string, ASTCache> = new Map();
  private symbolIndex: SymbolIndex;

  constructor(symbolIndex: SymbolIndex) {
    this.symbolIndex = symbolIndex;
  }

  /**
   * Get or parse the AST for a file, with caching
   */
  getAST(filePath: string): AST.Program | null {
    try {
      const stat = fs.statSync(filePath);
      const key = filePath;
      const cached = this.astCache.get(key);

      // Return cached AST if it's up to date
      if (cached && cached.mtime === stat.mtimeMs) {
        return cached.ast;
      }

      // Parse the file
      const source = fs.readFileSync(filePath, "utf-8");
      const tokens = lexWithGrammar(source, filePath);
      const parser = new Parser(source, filePath, tokens);
      const ast = parser.parse();

      // Cache it
      this.astCache.set(key, { ast, mtime: stat.mtimeMs, source });

      console.log(`[ASTResolver] Parsed and cached AST for ${filePath}`);
      return ast;
    } catch (error) {
      console.error(`[ASTResolver] Failed to parse ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Parse and cache AST from document content (for unsaved documents)
   */
  parseDocumentContent(filePath: string, content: string): AST.Program | null {
    try {
      const tokens = lexWithGrammar(content, filePath);
      const parser = new Parser(content, filePath, tokens);
      const ast = parser.parse();

      // Cache it (use current time as mtime since it's in-memory)
      this.astCache.set(filePath, { ast, mtime: Date.now(), source: content });

      console.log(`[ASTResolver] Parsed document content for ${filePath}`);
      return ast;
    } catch (error) {
      console.error(`[ASTResolver] Failed to parse document content:`, error);
      return null;
    }
  }

  /**
   * Get the source code for a file from cache
   */
  getSource(filePath: string): string | null {
    // Ensure AST is parsed and cached
    this.getAST(filePath);
    const cached = this.astCache.get(filePath);
    return cached ? cached.source : null;
  }

  /**
   * Get cached AST without trying to parse from disk
   * Useful when the file doesn't exist on disk (e.g., in-memory test documents)
   */
  getCachedAST(filePath: string): AST.Program | null {
    const cached = this.astCache.get(filePath);
    return cached ? cached.ast : null;
  }

  /**
   * Get all cached file paths
   */
  getAllCachedFiles(): string[] {
    return Array.from(this.astCache.keys());
  }

  /**
   * Find the AST node at a specific position (line, character)
   * Lines and characters are 0-indexed (LSP convention)
   */
  findNodeAtPosition(
    filePath: string,
    line: number,
    character: number,
  ): AST.ASTNode | null {
    const ast = this.getAST(filePath);
    if (!ast) return null;

    // Convert to 1-indexed for AST comparison (compiler uses 1-indexed)
    const targetLine = line + 1;
    const targetCol = character + 1;

    console.log(
      `[ASTResolver] Finding node at ${filePath}:${targetLine}:${targetCol}`,
    );

    const result = this.findNodeRecursive(ast, targetLine, targetCol);

    if (result) {
      console.log(
        `[ASTResolver] Found node: kind=${result.kind}, location=${JSON.stringify(result.location)}`,
      );
    } else {
      console.log(`[ASTResolver] No node found at position`);
    }

    return result;
  }

  /**
   * Recursively traverse AST to find the most specific node containing the position
   */
  private findNodeRecursive(
    node: any,
    line: number,
    col: number,
  ): AST.ASTNode | null {
    if (!node || typeof node !== "object") return null;

    // Check if this node has location information
    const loc = node.location;
    if (loc) {
      const inRange =
        (line > loc.startLine ||
          (line === loc.startLine && col >= loc.startColumn)) &&
        (line < loc.endLine || (line === loc.endLine && col <= loc.endColumn));

      if (!inRange) {
        return null; // Position is outside this node
      }
    }

    // This node contains the position, check children for more specific match
    let bestMatch: AST.ASTNode | null = null;
    let bestMatchSize = Infinity;

    // Calculate size of current node
    if (loc && node.kind) {
      const currentSize =
        (loc.endLine - loc.startLine) * 1000 +
        (loc.endColumn - loc.startColumn);
      bestMatch = node;
      bestMatchSize = currentSize;
    }

    // Traverse all properties that might contain child nodes
    for (const key of Object.keys(node)) {
      const value = node[key];

      if (Array.isArray(value)) {
        // Check each element in arrays
        for (const item of value) {
          const match = this.findNodeRecursive(item, line, col);
          if (match && match.location) {
            const matchSize =
              (match.location.endLine - match.location.startLine) * 1000 +
              (match.location.endColumn - match.location.startColumn);
            if (matchSize < bestMatchSize) {
              bestMatch = match;
              bestMatchSize = matchSize;
            }
          }
        }
      } else if (value && typeof value === "object" && value.kind) {
        // This looks like an AST node
        const match = this.findNodeRecursive(value, line, col);
        if (match && match.location) {
          const matchSize =
            (match.location.endLine - match.location.startLine) * 1000 +
            (match.location.endColumn - match.location.startColumn);
          if (matchSize < bestMatchSize) {
            bestMatch = match;
            bestMatchSize = matchSize;
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Resolve the type of an AST node
   */
  resolveType(node: AST.ASTNode, filePath: string): string | null {
    console.log(`[ASTResolver] Resolving type for node kind: ${node.kind}`);

    switch (node.kind) {
      case "Identifier":
        return this.resolveIdentifierType(node as AST.IdentifierExpr, filePath);

      case "Member":
        return this.resolveMemberAccessType(node as AST.MemberExpr, filePath);

      case "Call":
        return this.resolveCallExpressionType(node as AST.CallExpr, filePath);

      case "VariableDecl": {
        const varDecl = node as AST.VariableDecl;
        return varDecl.typeAnnotation
          ? typeNodeToString(varDecl.typeAnnotation)
          : null;
      }

      case "FunctionDecl": {
        const funcDecl = node as AST.FunctionDecl;
        return typeNodeToString(funcDecl.returnType);
      }

      default:
        console.log(`[ASTResolver] Unhandled node kind: ${node.kind}`);
        return null;
    }
  }

  /**
   * Resolve the type of an identifier (variable, function, etc.)
   */
  private resolveIdentifierType(
    node: AST.IdentifierExpr,
    filePath: string,
  ): string | null {
    let ast = this.getCachedAST(filePath);
    if (!ast) {
      ast = this.getAST(filePath);
    }
    if (!ast) return null;

    const name = node.name;
    console.log(`[ASTResolver] Resolving identifier: ${name}`);

    // Find the declaration of this identifier
    // 1. Look for local variables in the current function
    // If node has location (even if synthetic), try to find containing function by position
    let containingFunc: AST.FunctionDecl | null = null;
    if (node.location) {
      containingFunc = this.findContainingFunctionByPosition(
        ast,
        node.location.startLine,
        node.location.startColumn,
      );
    } else {
      containingFunc = this.findContainingFunction(ast, node);
    }
    if (containingFunc) {
      const localVar = this.findLocalVariable(containingFunc, name, node);
      if (localVar) {
        console.log(`[ASTResolver] Found local variable: ${name}`);

        // First try explicit type annotation
        if (localVar.typeAnnotation) {
          return typeNodeToString(localVar.typeAnnotation);
        }

        // If no type annotation, try to infer from initializer
        if (localVar.initializer) {
          console.log(
            `[ASTResolver] Inferring type from initializer for: ${name}`,
          );
          const inferredType = this.resolveType(localVar.initializer, filePath);
          if (inferredType) {
            console.log(`[ASTResolver] Inferred type: ${inferredType}`);
            return inferredType;
          }
        }

        return null;
      }
    }

    // 2. Look for function parameters
    if (containingFunc && containingFunc.params) {
      const param = containingFunc.params.find((p) => p.name === name);
      if (param) {
        console.log(`[ASTResolver] Found parameter: ${name}`);
        return typeNodeToString(param.type);
      }
    }

    // 3. Look for global variables
    for (const stmt of ast.statements) {
      if (stmt.kind === "VariableDecl") {
        const varDecl = stmt as AST.VariableDecl;
        if (varDecl.name === name) {
          console.log(`[ASTResolver] Found global variable: ${name}`);

          // First try explicit type annotation
          if (varDecl.typeAnnotation) {
            return typeNodeToString(varDecl.typeAnnotation);
          }

          // If no type annotation, try to infer from initializer
          if (varDecl.initializer) {
            console.log(
              `[ASTResolver] Inferring type from initializer for: ${name}`,
            );
            const inferredType = this.resolveType(
              varDecl.initializer,
              filePath,
            );
            if (inferredType) {
              console.log(`[ASTResolver] Inferred type: ${inferredType}`);
              return inferredType;
            }
          }

          return null;
        }
      }
    }

    // 4. Check symbol index for imported symbols (structs, enums, functions)
    const symbols = this.symbolIndex.findSymbol(name);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      console.log(
        `[ASTResolver] Found in symbol index: ${name}, kind: ${symbol.kind}`,
      );

      // For functions, return the return type from signature
      if (symbol.kind === "function" && symbol.signature) {
        console.log(
          `[ASTResolver] Function ${name} returns: ${symbol.signature.returnType}`,
        );
        return symbol.signature.returnType;
      }

      // Return the symbol name as the type for structs/enums/types
      return symbol.name;
    }

    return null;
  }

  /**
   * Resolve the type of a member access (e.g., obj.field, obj.method)
   */
  private resolveMemberAccessType(
    node: AST.MemberExpr,
    filePath: string,
  ): string | null {
    // First resolve the type of the object
    const objectType = this.resolveType(node.object, filePath);
    if (!objectType) {
      console.log(`[ASTResolver] Could not resolve object type`);
      return null;
    }

    console.log(`[ASTResolver] Member access: ${objectType}.${node.property}`);

    // Extract base type without generics, pointers, arrays
    const baseType = this.extractBaseType(objectType);

    // Look up the member in the symbol index
    const symbols = this.symbolIndex.findSymbol(baseType);
    for (const symbol of symbols) {
      // Check fields
      if (symbol.fields) {
        const field = symbol.fields.find((f) => f.name === node.property);
        if (field) {
          console.log(`[ASTResolver] Found field: ${node.property}`);
          return this.substituteGenerics(field.type, objectType);
        }
      }

      // Check methods
      if (symbol.methods) {
        const method = symbol.methods.find((m) => m.name === node.property);
        if (method) {
          console.log(`[ASTResolver] Found method: ${node.property}`);
          return this.substituteGenerics(
            method.signature.returnType,
            objectType,
          );
        }
      }
    }

    return null;
  }

  /**
   * Resolve the type of a call expression (function call or method call)
   */
  private resolveCallExpressionType(
    node: AST.CallExpr,
    filePath: string,
  ): string | null {
    // If it's a member access call (e.g., App.new(), obj.method())
    if (node.callee.kind === "Member") {
      const memberExpr = node.callee as AST.MemberExpr;
      const methodName = memberExpr.property;

      // Get the type/struct being called (e.g., "App" from App.new())
      const objectType = this.resolveType(memberExpr.object, filePath);

      if (objectType) {
        const baseType = this.extractBaseType(objectType);

        // Special case: constructor methods like "new" typically return the type itself
        if (methodName === "new") {
          console.log(
            `[ASTResolver] Constructor call, returning type: ${baseType}`,
          );
          return baseType;
        }

        // Look up the method's return type
        const symbols = this.symbolIndex.findSymbol(baseType);
        for (const symbol of symbols) {
          if (symbol.methods) {
            const method = symbol.methods.find((m) => m.name === methodName);
            if (method && method.signature) {
              console.log(
                `[ASTResolver] Method ${methodName} returns: ${method.signature.returnType}`,
              );
              return method.signature.returnType;
            }
          }
        }
      }

      return null;
    }

    // If it's a direct function call, resolve the identifier
    if (node.callee.kind === "Identifier") {
      const funcName = (node.callee as AST.IdentifierExpr).name;
      const symbols = this.symbolIndex.findSymbol(funcName);
      if (symbols.length > 0 && symbols[0] && symbols[0].kind === "function") {
        const returnType = symbols[0].signature?.returnType || "void";
        console.log(
          `[ASTResolver] Function ${funcName} returns: ${returnType}`,
        );
        return returnType;
      }
    }

    return null;
  }

  /**
   * Find the function containing a given position (for synthetic nodes)
   */
  private findContainingFunctionByPosition(
    ast: AST.Program,
    line: number,
    col: number,
  ): AST.FunctionDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const funcDecl = stmt as AST.FunctionDecl;
        const loc = funcDecl.location;
        if (
          loc &&
          line >= loc.startLine &&
          line <= loc.endLine &&
          (line > loc.startLine || col >= loc.startColumn) &&
          (line < loc.endLine || col <= loc.endColumn)
        ) {
          return funcDecl;
        }
      }
    }
    return null;
  }

  /**
   * Find the function containing a given node
   */
  private findContainingFunction(
    ast: AST.Program,
    node: AST.ASTNode,
  ): AST.FunctionDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const funcDecl = stmt as AST.FunctionDecl;
        if (this.containsNode(funcDecl, node)) {
          return funcDecl;
        }
      }
    }
    return null;
  }

  /**
   * Check if a node contains another node
   */
  private containsNode(parent: any, child: AST.ASTNode): boolean {
    if (parent === child) return true;

    if (!parent || typeof parent !== "object") return false;

    for (const key of Object.keys(parent)) {
      const value = parent[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.containsNode(item, child)) return true;
        }
      } else if (value && typeof value === "object") {
        if (this.containsNode(value, child)) return true;
      }
    }

    return false;
  }

  /**
   * Find a local variable in a function before a given node
   */
  private findLocalVariable(
    func: AST.FunctionDecl,
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    if (!func.body) return null;

    // Search statements recursively
    return this.findVariableInStatements(
      func.body.statements,
      name,
      beforeNode,
    );
  }

  /**
   * Search for a variable declaration in a list of statements (recursively handles nested blocks)
   */
  private findVariableInStatements(
    statements: AST.ASTNode[],
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    for (const stmt of statements) {
      // Stop if we've passed the node we're looking for
      if (
        stmt.location &&
        beforeNode.location &&
        stmt.location.startLine > beforeNode.location.startLine
      ) {
        break;
      }

      if (stmt.kind === "VariableDecl") {
        const varDecl = stmt as AST.VariableDecl;
        if (varDecl.name === name) {
          return varDecl;
        }
      }

      // Recursively search nested blocks
      if (stmt.kind === "Loop") {
        const loop = stmt as AST.LoopStmt;
        // Check if beforeNode is inside this loop
        if (
          loop.location &&
          beforeNode.location &&
          beforeNode.location.startLine >= loop.location.startLine &&
          beforeNode.location.startLine <= loop.location.endLine
        ) {
          if (loop.body && loop.body.kind === "Block") {
            const found = this.findVariableInStatements(
              (loop.body as AST.BlockStmt).statements,
              name,
              beforeNode,
            );
            if (found) return found;
          }
        }
      } else if (stmt.kind === "IfStmt") {
        const ifStmt = stmt as AST.IfStmt;
        // Handle thenBranch (can be array or single statement)
        if (ifStmt.thenBranch) {
          const thenStatements = Array.isArray(ifStmt.thenBranch)
            ? ifStmt.thenBranch
            : [ifStmt.thenBranch];
          const found = this.findVariableInStatements(
            thenStatements,
            name,
            beforeNode,
          );
          if (found) return found;
        }
        // Handle elseBranch
        if (ifStmt.elseBranch) {
          const elseStatements = Array.isArray(ifStmt.elseBranch)
            ? ifStmt.elseBranch
            : [ifStmt.elseBranch];
          const found = this.findVariableInStatements(
            elseStatements,
            name,
            beforeNode,
          );
          if (found) return found;
        }
      } else if (stmt.kind === "Block") {
        const block = stmt as AST.BlockStmt;
        if (
          block.location &&
          beforeNode.location &&
          beforeNode.location.startLine >= block.location.startLine &&
          beforeNode.location.startLine <= block.location.endLine
        ) {
          const found = this.findVariableInStatements(
            block.statements,
            name,
            beforeNode,
          );
          if (found) return found;
        }
      }
      // Add more statement types as needed (MatchExpr, etc.)
    }

    return null;
  }

  /**
   * Extract base type name, removing generics, pointers, arrays
   */
  private extractBaseType(type: string): string {
    return type
      .replace(/^\*+/, "") // Remove leading pointers
      .replace(/\[\]$/, "") // Remove trailing array brackets
      .replace(/<.*>/, ""); // Remove generics
  }

  /**
   * Substitute generic type parameters (e.g., T -> Row)
   */
  private substituteGenerics(memberType: string, objectType: string): string {
    // Extract generic arguments from object type
    const genericMatch = objectType.match(/<(.+)>/);
    if (!genericMatch || !genericMatch[1]) return memberType;

    const genericArgs = genericMatch[1].split(",").map((a) => a.trim());

    // If member type is a single capital letter (generic parameter), substitute it
    if (
      /^[A-Z]$/.test(memberType) &&
      genericArgs.length > 0 &&
      genericArgs[0]
    ) {
      return genericArgs[0];
    }

    return memberType;
  }

  /**
   * Clear the AST cache (useful when files change externally)
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      this.astCache.delete(filePath);
      console.log(`[ASTResolver] Cleared cache for ${filePath}`);
    } else {
      this.astCache.clear();
      console.log(`[ASTResolver] Cleared entire AST cache`);
    }
  }

  /**
   * Get the source text for a node's location
   */
  getNodeText(node: AST.ASTNode, filePath: string): string | null {
    const cached = this.astCache.get(filePath);
    if (!cached || !node.location) return null;

    const lines = cached.source.split("\n");
    const startLine = node.location.startLine - 1;
    const endLine = node.location.endLine - 1;
    const startCol = node.location.startColumn - 1;
    const endCol = node.location.endColumn - 1;

    if (startLine === endLine) {
      const line = lines[startLine];
      return line ? line.substring(startCol, endCol) : "";
    }

    // Multi-line node
    const result: string[] = [];
    const firstLine = lines[startLine];
    if (firstLine) {
      result.push(firstLine.substring(startCol));
    }
    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line !== undefined) {
        result.push(line);
      }
    }
    const lastLine = lines[endLine];
    if (lastLine) {
      result.push(lastLine.substring(0, endCol));
    }

    return result.join("\n");
  }
}
