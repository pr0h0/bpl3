import {
  Hover,
  MarkupKind,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as path from "path";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex, HoverProvider } from "./index";
import * as AST from "../../../compiler/common/AST";

/**
 * AST-based hover handler using the compiler's parser
 */
export class ASTHoverHandler {
  private currentFilePath: string = "";

  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Handle hover request using AST-based resolution
   */
  handle(
    params: TextDocumentPositionParams,
    document: TextDocument,
  ): Hover | null {
    try {
      const filePath = fileURLToPath(params.textDocument.uri);
      this.currentFilePath = filePath;
      console.log(
        `[ASTHover] Hover at ${filePath}:${params.position.line + 1}:${params.position.character + 1}`,
      );

      // Find the AST node at the cursor position
      const node = this.astResolver.findNodeAtPosition(
        filePath,
        params.position.line,
        params.position.character,
      );

      if (!node) {
        console.log(`[ASTHover] No AST node found at position`);
        return this.handleFallback(document, params);
      }

      console.log(`[ASTHover] Found node kind: ${node.kind}`);

      // Handle different node types
      switch (node.kind) {
        case "Identifier":
          return this.handleIdentifier(node as AST.IdentifierExpr, filePath);

        case "Member":
          return this.handleMemberAccess(node as AST.MemberExpr, filePath);

        case "Call":
          return this.handleCallExpression(node as AST.CallExpr, filePath);

        case "VariableDecl":
          return this.handleVariableDecl(node as AST.VariableDecl);

        case "FunctionDecl":
          return this.handleFunctionDecl(node as AST.FunctionDecl);

        case "StructDecl":
          return this.handleStructDecl(node as AST.StructDecl);

        case "EnumDecl":
          return this.handleEnumDecl(node as AST.EnumDecl);

        case "SpecDecl":
          return this.handleSpecDecl(node as AST.SpecDecl);

        case "TypeAliasDecl":
          return this.handleTypeAliasDecl(node as AST.TypeAliasDecl);

        case "BasicType":
          return this.handleBasicType(node as AST.BasicTypeNode, filePath);

        case "Parameter":
          return this.handleParameter(node as AST.Parameter);

        case "PatternIdentifier":
          return this.handlePatternIdentifier(node as AST.PatternIdentifier);

        case "PatternEnum":
        case "PatternEnumTuple":
        case "PatternEnumStruct":
          return this.handlePatternEnum(
            node as
              | AST.PatternEnum
              | AST.PatternEnumTuple
              | AST.PatternEnumStruct,
            filePath,
            params.position.line,
            params.position.character,
          );

        default:
          console.log(`[ASTHover] Unhandled node kind: ${node.kind}`);
          return this.handleFallback(document, params);
      }
    } catch (error) {
      console.error(`[ASTHover] Error in handle():`, error);
      return this.handleFallback(document, params);
    }
  }

  /**
   * Handle hover on identifiers (variables, functions, types)
   */
  private handleIdentifier(
    node: AST.IdentifierExpr,
    filePath: string,
  ): Hover | null {
    const name = node.name;
    console.log(`[ASTHover] Identifier: ${name}`);

    // Check if resolved declaration is a function
    if (node.resolvedDeclaration?.kind === "FunctionDecl") {
      const funcDecl = node.resolvedDeclaration as AST.FunctionDecl;
      return this.handleFunctionDecl(funcDecl);
    }

    // Check if resolved declaration is a variable
    if (node.resolvedDeclaration?.kind === "VariableDecl") {
      const varDecl = node.resolvedDeclaration as AST.VariableDecl;
      return this.handleVariableDecl(varDecl);
    }

    // Check if resolved declaration is a parameter
    if (node.resolvedDeclaration?.kind === "Parameter") {
      const param = node.resolvedDeclaration as AST.Parameter;
      return this.handleParameter(param);
    }

    // If no resolved declaration, search AST for local variable
    const ast = this.astResolver.getAST(filePath);
    if (ast) {
      console.log(`[ASTHover] Searching AST for local variable: ${name}`);
      const varDecl = this.findVariableDeclaration(ast, name, node);
      if (varDecl) {
        console.log(`[ASTHover] Found local variable declaration in AST`);
        return this.handleVariableDecl(varDecl);
      }

      // Search for pattern variable
      const patternVar = this.findPatternVariable(ast, name, node);
      if (patternVar) {
        console.log(`[ASTHover] Found pattern variable in AST`);
        return this.handlePatternIdentifier(patternVar);
      }
    }

    // Check if this is an enum type reference
    const symbols = this.symbolIndex.findSymbol(name);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      console.log(`[ASTHover] Found symbol: ${symbol.name} (${symbol.kind})`);

      if (symbol.kind === "enum") {
        return this.createTypeHover(symbol);
      } else if (symbol.kind === "function") {
        return HoverProvider.createHover(symbol);
      } else if (symbol.kind === "struct" || symbol.kind === "spec") {
        return this.createTypeHover(symbol);
      }
    }

    // Try to resolve the type
    const type = this.astResolver.resolveType(node, filePath);
    if (type) {
      console.log(`[ASTHover] Resolved type: ${type}`);

      // Look up the symbol in the index
      const typeSymbols = this.symbolIndex.findSymbol(type);
      if (typeSymbols.length > 0) {
        const symbol = typeSymbols[0];
        if (!symbol) return null;

        // Show symbol information
        if (symbol.kind === "function") {
          return HoverProvider.createHover(symbol);
        } else if (
          symbol.kind === "struct" ||
          symbol.kind === "enum" ||
          symbol.kind === "spec"
        ) {
          return this.createTypeHover(symbol);
        }
      }

      // Show basic type information
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${name}**: \`${type}\``,
        },
      };
    }

    return null;
  }

  /**
   * Handle hover on member access (obj.field, obj.method)
   */
  private handleMemberAccess(
    node: AST.MemberExpr,
    filePath: string,
  ): Hover | null {
    const memberName = node.property;
    console.log(`[ASTHover] Member access: .${memberName}`);

    // Resolve the type of the object (handles nested access)
    const objectType = this.astResolver.resolveType(node.object, filePath);

    // If object is itself a member or call expression, we've already resolved it
    // For nested access like obj.method().property, resolveType handles the chain
    if (!objectType) {
      console.log(`[ASTHover] Could not resolve object type`);
      return null;
    }

    console.log(`[ASTHover] Object type: ${objectType}`);

    // Extract base type (remove pointers, arrays, generics)
    const baseType = objectType
      .replace(/^\*+/, "")
      .replace(/\[\]$/, "")
      .replace(/<.*>/, "");

    // Look up the type in symbol index
    const symbols = this.symbolIndex.findSymbol(baseType);
    if (symbols.length === 0) {
      console.log(`[ASTHover] Type not found: ${baseType}`);
      return null;
    }

    for (const symbol of symbols) {
      // Check methods
      if (symbol.methods) {
        const method = symbol.methods.find((m) => m.name === memberName);
        if (method) {
          console.log(`[ASTHover] Found method: ${memberName}`);
          return HoverProvider.createMethodHover(
            memberName,
            method,
            symbol.name,
          );
        }
      }

      // Check fields
      if (symbol.fields) {
        const field = symbol.fields.find((f) => f.name === memberName);
        if (field) {
          console.log(`[ASTHover] Found field: ${memberName}`);
          return HoverProvider.createFieldHover(memberName, field, symbol.name);
        }
      }

      // Check enum variants
      if (symbol.variants) {
        const variant = symbol.variants.find((v) => v.name === memberName);
        if (variant) {
          console.log(`[ASTHover] Found enum variant: ${memberName}`);
          return this.createEnumVariantHover(variant, symbol.name);
        }
      }
    }

    return null;
  }

  /**
   * Handle hover on call expressions
   */
  private handleCallExpression(
    node: AST.CallExpr,
    filePath: string,
  ): Hover | null {
    console.log(`[ASTHover] Call expression`);

    // If the callee is a member access, show info about the method
    if (node.callee.kind === "Member") {
      return this.handleMemberAccess(node.callee as AST.MemberExpr, filePath);
    }

    // If it's a function call, show info about the function
    if (node.callee.kind === "Identifier") {
      return this.handleIdentifier(node.callee as AST.IdentifierExpr, filePath);
    }

    return null;
  }

  /**
   * Handle hover on variable declarations
   */
  private handleVariableDecl(node: AST.VariableDecl): Hover | null {
    const name = typeof node.name === "string" ? node.name : "<destructured>";
    const type = node.typeAnnotation
      ? this.typeNodeToString(node.typeAnnotation)
      : "inferred";

    // Enhanced header with icon
    let docs = `### 🔹 Variable \`${name}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Type info
    docs += `**Type:** \`${type}\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Scope info
    if (node.isGlobal) {
      docs += `**Scope:** Global\n\n`;
    } else {
      docs += `**Scope:** Local\n\n`;
    }

    // Const modifier
    if (node.isConst) {
      docs += `**Modifier:** Constant (read-only)\n\n`;
    }

    // Try to get type information from symbol index
    if (type && type !== "inferred") {
      const baseType = type
        .replace(/^\*+/, "")
        .replace(/\[\]$/, "")
        .replace(/<.*>/, "");
      const symbols = this.symbolIndex.findSymbol(baseType);
      if (symbols.length > 0 && symbols[0]) {
        const symbol = symbols[0];

        // Show fields
        if (symbol.fields && symbol.fields.length > 0) {
          docs += `**Available Fields:**\n\n`;
          for (const field of symbol.fields.slice(0, 10)) {
            // Limit to first 10
            docs += `- \`${field.name}\`: \`${field.type}\`\n`;
          }
          if (symbol.fields.length > 10) {
            docs += `- *...and ${symbol.fields.length - 10} more*\n`;
          }
          docs += `\n`;
        }

        // Show methods
        if (symbol.methods && symbol.methods.length > 0) {
          docs += `**Available Methods:**\n\n`;
          for (const method of symbol.methods.slice(0, 10)) {
            // Limit to first 10
            const params = method.signature.parameters
              .map((p) => `${p.name}: ${p.type}`)
              .join(", ");
            docs += `- \`${method.name}(${params}) -> ${method.signature.returnType}\`\n`;
          }
          if (symbol.methods.length > 10) {
            docs += `- *...and ${symbol.methods.length - 10} more*\n`;
          }
          docs += `\n`;
        }

        // Show variants for enums
        if (symbol.variants && symbol.variants.length > 0) {
          docs += `**Available Variants:**\n\n`;
          for (const variant of symbol.variants.slice(0, 10)) {
            docs += `- \`${variant.name}\`\n`;
          }
          if (symbol.variants.length > 10) {
            docs += `- *...and ${symbol.variants.length - 10} more*\n`;
          }
          docs += `\n`;
        }
      }
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on function declarations
   */
  private handleFunctionDecl(node: AST.FunctionDecl): Hover | null {
    const name = node.name;

    // Build parameter list with types
    const params = node.params
      .map((p: AST.Parameter) => {
        const paramType = this.typeNodeToString(p.type);
        const constModifier = p.isConst ? "const " : "";
        return `${constModifier}${p.name}: ${paramType}`;
      })
      .join(", ");

    // Get return type
    const returnType = this.typeNodeToString(node.returnType);

    // Enhanced header with icon
    let docs = `### ⚡ Function \`${name}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Build full signature
    const signature = `frame ${name}(${params}) ret ${returnType}`;
    docs += `\`\`\`bpl\n${signature}\n\`\`\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Generic parameters
    if (node.genericParams && node.genericParams.length > 0) {
      docs += `**Generic Parameters:**\n\n`;
      for (const gp of node.genericParams) {
        docs += `- \`${gp.name}\``;
        if (gp.constraint) {
          docs += ` extends \`${this.typeNodeToString(gp.constraint)}\``;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    // Parameters
    if (node.params.length > 0) {
      docs += `**Parameters:**\n\n`;
      for (const param of node.params) {
        const paramType = this.typeNodeToString(param.type);
        const constModifier = param.isConst ? "const " : "";
        docs += `- \`${constModifier}${param.name}\`: \`${paramType}\``;
        if (param.documentation) {
          docs += ` — ${this.cleanDocumentation(param.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    // Return type
    if (returnType !== "void") {
      docs += `**Returns:** \`${returnType}\`\n\n`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Create hover for type symbols (struct, enum, spec)
   */
  private createTypeHover(symbol: any): Hover {
    const fileName = symbol.filePath ? path.basename(symbol.filePath) : "";

    // Choose icon based on kind
    let icon: string;
    let kindLabel: string;
    if (symbol.kind === "struct") {
      icon = "📦";
      kindLabel = "Struct";
    } else if (symbol.kind === "enum") {
      icon = "🔢";
      kindLabel = "Enum";
    } else {
      icon = "🎯";
      kindLabel = "Spec";
    }

    let docs = `### ${icon} ${kindLabel} \`${symbol.name}\`\n\n`;

    // Documentation if available
    if (symbol.documentation) {
      docs += this.formatDocumentation(symbol.documentation);
      docs += `\n---\n\n`;
    }

    // Signature
    docs += `\`\`\`bpl\n${symbol.kind} ${symbol.name}\n\`\`\`\n\n`;

    // Source location
    if (fileName) {
      docs += `📍 *Defined in:* \`${fileName}\`\n\n`;
    }

    // Variants for enums
    if (symbol.variants && symbol.variants.length > 0) {
      docs += `**Variants:**\n\n`;
      for (const variant of symbol.variants) {
        if (variant.dataType) {
          docs += `- \`${variant.name}${variant.dataType}\``;
        } else {
          docs += `- \`${variant.name}\``;
        }
        if (variant.documentation) {
          docs += ` — ${this.cleanDocumentation(variant.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    // Fields for structs
    if (symbol.fields && symbol.fields.length > 0) {
      docs += `**Fields:**\n\n`;
      for (const field of symbol.fields) {
        docs += `- \`${field.name}\`: \`${field.type}\``;
        if (field.documentation) {
          docs += ` — ${this.cleanDocumentation(field.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    // Methods
    if (symbol.methods && symbol.methods.length > 0) {
      docs += `**Methods:**\n\n`;
      for (const method of symbol.methods) {
        const params = method.signature.parameters
          .map((p: any) => `${p.name}: ${p.type}`)
          .join(", ");
        const staticLabel = method.isStatic ? "static " : "";
        docs += `- ${staticLabel}\`${method.name}(${params}) -> ${method.signature.returnType}\``;
        if (method.documentation) {
          docs += ` — ${this.cleanDocumentation(method.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Create hover for enum variants
   */
  private createEnumVariantHover(variant: any, enumName: string): Hover {
    let value = `**Enum variant**: \`${enumName}.${variant.name}\``;

    if (variant.associatedTypes && variant.associatedTypes.length > 0) {
      value += `\n\nAssociated types: \`${variant.associatedTypes.join(", ")}\``;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value,
      },
    };
  }

  /**
   * Fallback to keyword/builtin type hover
   */
  private handleFallback(
    document: TextDocument,
    params: TextDocumentPositionParams,
  ): Hover | null {
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Extract word at position
    const wordRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
    let match;
    let word = "";
    while ((match = wordRegex.exec(text)) !== null) {
      if (offset >= match.index && offset <= match.index + match[0].length) {
        word = match[0];
        break;
      }
    }

    if (!word) return null;

    // Check keywords
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
      "defer",
    ];

    if (keywords.includes(word)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Keyword**: \`${word}\`\n\nBPL language keyword.`,
        },
      };
    }

    // Check built-in types
    const types = [
      "int",
      "uint",
      "u8",
      "u16",
      "u32",
      "u64",
      "i8",
      "i16",
      "i32",
      "i64",
      "float",
      "f32",
      "f64",
      "bool",
      "char",
      "void",
      "string",
    ];

    if (types.includes(word)) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Type**: \`${word}\`\n\nBuilt-in BPL type.`,
        },
      };
    }

    return null;
  }

  /**
   * Handle hover on struct declaration
   */
  private handleStructDecl(node: AST.StructDecl): Hover {
    const genericParams =
      node.genericParams && node.genericParams.length > 0
        ? `<${node.genericParams.map((p) => p.name).join(", ")}>`
        : "";
    const parent =
      node.inheritanceList && node.inheritanceList.length > 0
        ? ` extends ${this.typeNodeToString(node.inheritanceList[0])}`
        : "";

    // Enhanced header with icon
    let docs = `### 📦 Struct \`${node.name}${genericParams}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Signature
    docs += `\`\`\`bpl\nstruct ${node.name}${genericParams}${parent}\n\`\`\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Inheritance info
    if (parent) {
      docs += `**Inheritance:**  \n`;
      docs += `Extends: \`${this.typeNodeToString(node.inheritanceList![0])}\`\n\n`;
    }

    // Fields
    if (node.members && node.members.length > 0) {
      const fields = node.members.filter((m) => m.kind === "StructField");
      if (fields.length > 0) {
        docs += "**Fields:**\n\n";
        for (const member of fields) {
          const field = member as AST.StructField;
          const fieldType = this.typeNodeToString(field.type);
          docs += `- \`${field.name}\`: \`${fieldType}\``;
          if (field.documentation) {
            docs += ` — ${this.cleanDocumentation(field.documentation)}`;
          }
          docs += `\n`;
        }
        docs += `\n`;
      }
    }

    // Methods
    if (node.members && node.members.length > 0) {
      const methods = node.members.filter((m) => m.kind === "FunctionDecl");
      if (methods.length > 0) {
        docs += "**Methods:**\n\n";
        for (const member of methods) {
          const method = member as AST.FunctionDecl;
          const params = method.params
            .filter((p) => p.name !== "this") // Exclude this parameter
            .map((p: AST.Parameter) => {
              const paramType = this.typeNodeToString(p.type);
              return `${p.name}: ${paramType}`;
            })
            .join(", ");
          const retType = this.typeNodeToString(method.returnType);
          const isStatic = !method.params.some((p) => p.name === "this");
          const staticLabel = isStatic ? "static " : "";
          docs += `- ${staticLabel}\`${method.name}(${params}) -> ${retType}\``;
          if (method.documentation) {
            docs += ` — ${this.cleanDocumentation(method.documentation)}`;
          }
          docs += `\n`;
        }
        docs += `\n`;
      }
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on enum declaration
   */
  private handleEnumDecl(node: AST.EnumDecl): Hover {
    const genericParams =
      node.genericParams && node.genericParams.length > 0
        ? `<${node.genericParams.map((p) => p.name).join(", ")}>`
        : "";

    // Enhanced header with icon
    let docs = `### 🔢 Enum \`${node.name}${genericParams}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Signature
    docs += `\`\`\`bpl\nenum ${node.name}${genericParams}\n\`\`\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Variants
    if (node.variants && node.variants.length > 0) {
      docs += "**Variants:**\n\n";
      for (const variant of node.variants) {
        docs += `- \`${variant.name}\``;
        if (variant.documentation) {
          docs += ` — ${this.cleanDocumentation(variant.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    // Methods
    if (node.methods && node.methods.length > 0) {
      docs += "**Methods:**\n\n";
      for (const method of node.methods) {
        const params = method.params
          .map((p: any) => {
            const paramType = this.typeNodeToString(p.type);
            return `${p.name}: ${paramType}`;
          })
          .join(", ");
        const retType = this.typeNodeToString(method.returnType);
        docs += `- \`${method.name}(${params}) -> ${retType}\``;
        if (method.documentation) {
          docs += ` — ${this.cleanDocumentation(method.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on spec declaration
   */
  private handleSpecDecl(node: AST.SpecDecl): Hover {
    const genericParams =
      node.genericParams && node.genericParams.length > 0
        ? `<${node.genericParams.map((p) => p.name).join(", ")}>`
        : "";

    // Enhanced header with icon
    let docs = `### 🎯 Spec \`${node.name}${genericParams}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Signature
    docs += `\`\`\`bpl\nspec ${node.name}${genericParams}\n\`\`\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Methods
    if (node.methods && node.methods.length > 0) {
      docs += "**Required Methods:**\n\n";
      for (const method of node.methods) {
        const params = method.params
          .map((p: any) => {
            const paramType = this.typeNodeToString(p.type);
            return `${p.name}: ${paramType}`;
          })
          .join(", ");
        const retType = this.typeNodeToString(method.returnType);
        docs += `- \`${method.name}(${params}) -> ${retType}\``;
        if (method.documentation) {
          docs += ` — ${this.cleanDocumentation(method.documentation)}`;
        }
        docs += `\n`;
      }
      docs += `\n`;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on type alias declaration
   */
  private handleTypeAliasDecl(node: AST.TypeAliasDecl): Hover {
    const aliasedType = this.typeNodeToString(node.type);

    // Enhanced header with icon
    let docs = `### 🏷️ Type Alias \`${node.name}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Type definition
    docs += `\`\`\`bpl\ntype ${node.name} = ${aliasedType}\n\`\`\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Show what it aliases to
    docs += `**Aliases:** \`${aliasedType}\`\n\n`;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on BasicType (type references)
   */
  private handleBasicType(
    node: AST.BasicTypeNode,
    _filePath: string,
  ): Hover | null {
    const typeName = node.name;
    console.log(`[ASTHover] BasicType: ${typeName}`);

    // Check if it's a builtin type
    const builtinTypes: { [key: string]: string } = {
      int: "32-bit signed integer",
      uint: "32-bit unsigned integer",
      u8: "8-bit unsigned integer",
      u16: "16-bit unsigned integer",
      u32: "32-bit unsigned integer",
      u64: "64-bit unsigned integer",
      i8: "8-bit signed integer",
      i16: "16-bit signed integer",
      i32: "32-bit signed integer",
      i64: "64-bit signed integer",
      float: "64-bit floating point",
      f32: "32-bit floating point",
      f64: "64-bit floating point",
      bool: "Boolean value (true/false)",
      char: "8-bit character",
      string: "Immutable string slice",
      void: "Empty type",
      any: "Any type",
    };

    if (builtinTypes[typeName]) {
      let docs = `### 🔧 Built-in Type \`${typeName}\`\n\n`;
      docs += `\`\`\`bpl\n${typeName}\n\`\`\`\n\n`;
      docs += `**Description:** ${builtinTypes[typeName]}\n\n`;

      // Add size information
      const sizeInfo: { [key: string]: string } = {
        int: "4 bytes",
        uint: "4 bytes",
        u8: "1 byte",
        u16: "2 bytes",
        u32: "4 bytes",
        u64: "8 bytes",
        i8: "1 byte",
        i16: "2 bytes",
        i32: "4 bytes",
        i64: "8 bytes",
        float: "8 bytes",
        f32: "4 bytes",
        f64: "8 bytes",
        bool: "1 byte",
        char: "1 byte",
      };

      if (sizeInfo[typeName]) {
        docs += `**Size:** ${sizeInfo[typeName]}\n\n`;
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: docs,
        },
      };
    }

    // Look up in symbol index
    const symbols = this.symbolIndex.findSymbol(typeName);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (
        symbol &&
        (symbol.kind === "struct" ||
          symbol.kind === "enum" ||
          symbol.kind === "spec")
      ) {
        return this.createTypeHover(symbol);
      }
    }

    return null;
  }

  /**
   * Handle hover on parameter
   */
  private handleParameter(node: AST.Parameter): Hover {
    console.log(`[ASTHover] Parameter node:`, JSON.stringify(node, null, 2));

    const paramType = this.typeNodeToString(node.type);
    console.log(`[ASTHover] Parameter ${node.name} type: ${paramType}`);

    const constModifier = node.isConst ? "const " : "";

    // Enhanced header with icon
    let docs = `### 📝 Parameter \`${node.name}\`\n\n`;

    // Documentation comment (if available)
    if (node.documentation) {
      docs += this.formatDocumentation(node.documentation);
      docs += `\n---\n\n`;
    }

    // Type and signature
    docs += `\`\`\`bpl\n${constModifier}${node.name}: ${paramType}\n\`\`\`\n\n`;

    // Add description
    docs += `**Type:** \`${paramType}\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location?.file)}\` (line ${node.location.startLine})\n\n`;
    }

    // Const modifier
    if (node.isConst) {
      docs += `**Modifier:** Read-only parameter\n\n`;
    } else {
      docs += `**Modifier:** Mutable parameter\n\n`;
    }

    docs += `*Function parameter that can be used within the function body.*`;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on pattern identifiers (variables in match patterns)
   */
  private handlePatternIdentifier(node: AST.PatternIdentifier): Hover | null {
    console.log(`[ASTHover] Pattern identifier: ${node.name}`);

    const type = node.type ? this.typeNodeToString(node.type) : "inferred";

    // Enhanced header with icon
    let docs = `### 🎭 Pattern Variable \`${node.name}\`\n\n`;

    // Type signature
    docs += `\`\`\`bpl\n${node.name}: ${type}\n\`\`\`\n\n`;

    // Type info
    docs += `**Type:** \`${type}\`\n\n`;

    // Source location
    if (node.location?.file) {
      docs += `📍 *Defined in:* \`${this.shortenFilePath(node.location.file)}\` (line ${node.location.startLine})\n\n`;
    }

    docs += `*Variable bound in pattern matching expression.*`;

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: docs,
      },
    };
  }

  /**
   * Handle hover on enum patterns (Option.Some, etc.)
   */
  private handlePatternEnum(
    node: AST.PatternEnum | AST.PatternEnumTuple | AST.PatternEnumStruct,
    filePath: string,
    line: number,
    character: number,
  ): Hover | null {
    console.log(
      `[ASTHover] Pattern enum: ${node.enumName}.${node.variantName}`,
    );

    if (!node.location) {
      return null;
    }

    // Convert 0-based LSP position to 1-based AST position
    const cursorLine = line + 1;
    const cursorCol = character + 1;

    // Check if we're on the same line as the pattern
    if (cursorLine !== node.location.startLine) {
      return null;
    }

    // Pattern format: EnumName.VariantName(bindings) or EnumName.VariantName
    // Calculate approximate positions
    const patternStartCol = node.location.startColumn;
    const enumNameEnd = patternStartCol + node.enumName.length;
    const dotCol = enumNameEnd;
    const variantNameStart = dotCol + 1;
    const variantNameEnd = variantNameStart + node.variantName.length;

    console.log(
      `[ASTHover] Cursor at col ${cursorCol}, enum: ${patternStartCol}-${enumNameEnd}, variant: ${variantNameStart}-${variantNameEnd}`,
    );

    // Check if hovering on enum name
    if (cursorCol >= patternStartCol && cursorCol < dotCol) {
      console.log(`[ASTHover] Hovering enum name: ${node.enumName}`);
      const enumSymbols = this.symbolIndex.findSymbol(node.enumName);
      if (
        enumSymbols.length > 0 &&
        enumSymbols[0] &&
        enumSymbols[0].kind === "enum"
      ) {
        return this.createTypeHover(enumSymbols[0]);
      }
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**Enum**: \`${node.enumName}\``,
        },
      };
    }

    // Check if hovering on variant name
    if (cursorCol >= variantNameStart && cursorCol <= variantNameEnd) {
      console.log(`[ASTHover] Hovering variant name: ${node.variantName}`);
      const enumSymbols = this.symbolIndex.findSymbol(node.enumName);
      if (
        enumSymbols.length > 0 &&
        enumSymbols[0] &&
        enumSymbols[0].kind === "enum"
      ) {
        let docs = `### 🔹 Enum Variant \`${node.enumName}.${node.variantName}\`\n\n`;
        docs += `\`\`\`bpl\n${node.enumName}.${node.variantName}\n\`\`\`\n\n`;
        docs += `**Enum:** \`${node.enumName}\`\n\n`;

        // Find the variant info
        const variant = enumSymbols[0].variants?.find(
          (v: any) => v.name === node.variantName,
        );
        if (variant && variant.dataType) {
          docs += `**Payload:** \`${variant.dataType}\`\n\n`;
        }

        if (enumSymbols[0].documentation) {
          docs += `---\n\n${this.formatDocumentation(enumSymbols[0].documentation)}`;
        }
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: docs,
          },
        };
      }
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `### 🔹 Enum Variant \`${node.enumName}.${node.variantName}\``,
        },
      };
    }

    // Check if hovering on a binding variable (for PatternEnumTuple)
    if (node.kind === "PatternEnumTuple" && node.bindings.length > 0) {
      // Opening paren is after variant name
      const openParenCol = variantNameEnd + 1;
      const closingParenCol = node.location.endColumn;

      // For single binding, it's between the parens
      // We need to be more generous with the range to catch the binding
      if (cursorCol > openParenCol && cursorCol < closingParenCol) {
        console.log(`[ASTHover] Hovering binding: ${node.bindings[0]}`);
        let docs = `### 🎭 Pattern Binding \`${node.bindings[0]}\`\n\n`;
        docs += `\`\`\`bpl\n${node.bindings[0]}: inferred\n\`\`\`\n\n`;
        docs += `**Type:** \`inferred\`\n\n`;
        docs += `*Variable bound from enum variant payload.*`;
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: docs,
          },
        };
      }
    }

    // Default: show enum variant info
    const enumSymbols = this.symbolIndex.findSymbol(node.enumName);
    if (
      enumSymbols.length > 0 &&
      enumSymbols[0] &&
      enumSymbols[0].kind === "enum"
    ) {
      let docs = `**Enum Variant**: \`${node.enumName}.${node.variantName}\`\n\n`;
      docs += `From enum: \`${node.enumName}\`\n\n`;
      if (enumSymbols[0].documentation) {
        docs += `---\n\n${enumSymbols[0].documentation}`;
      }
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: docs,
        },
      };
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**Enum Variant**: \`${node.enumName}.${node.variantName}\``,
      },
    };
  }

  /**
   * Convert TypeNode to string (helper)
   */
  private typeNodeToString(type: AST.TypeNode | null | undefined): string {
    if (!type) return "void";

    switch (type.kind) {
      case "BasicType": {
        const basic = type as AST.BasicTypeNode;
        let result = basic.name;
        if (basic.genericArgs && basic.genericArgs.length > 0) {
          result +=
            "<" +
            basic.genericArgs.map((t) => this.typeNodeToString(t)).join(", ") +
            ">";
        }
        if (basic.pointerDepth > 0) {
          result = "*".repeat(basic.pointerDepth) + result;
        }
        if (basic.arrayDimensions && basic.arrayDimensions.length > 0) {
          for (const dim of basic.arrayDimensions) {
            result += dim !== null ? `[${dim}]` : "[]";
          }
        }
        return result;
      }
      case "TupleType": {
        const tuple = type as AST.TupleTypeNode;
        return (
          "(" +
          tuple.types.map((t) => this.typeNodeToString(t)).join(", ") +
          ")"
        );
      }
      case "FunctionType": {
        const func = type as AST.FunctionTypeNode;
        const params = func.paramTypes
          .map((t) => this.typeNodeToString(t))
          .join(", ");
        const ret = this.typeNodeToString(func.returnType);
        return `Func<${ret}>(${params})`;
      }
      case "LambdaType": {
        const lambda = type as AST.LambdaTypeNode;
        const params = lambda.paramTypes
          .map((t) => this.typeNodeToString(t))
          .join(", ");
        const ret = this.typeNodeToString(lambda.returnType);
        return `Lambda<${ret}>(${params})`;
      }
      default:
        return "unknown";
    }
  }

  /**
   * Find a variable declaration in the AST by searching from the top level
   * and within function bodies that contain the reference point
   */
  private findVariableDeclaration(
    ast: AST.Program,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.VariableDecl | null {
    console.log(
      `[ASTHover] Searching for variable "${name}" at line ${refNode.location?.startLine}, col ${refNode.location?.startColumn}`,
    );
    console.log(
      `[ASTHover] AST has ${ast.statements.length} top-level statements`,
    );

    // Search through all top-level declarations
    for (const topNode of ast.statements) {
      if (topNode.kind === "FunctionDecl") {
        console.log(`[ASTHover] Checking function: ${topNode.name}`);
        // Check if the reference is inside this function
        if (this.isNodeContainedIn(refNode, topNode)) {
          console.log(
            `[ASTHover] Reference is inside function ${topNode.name}`,
          );
          const varDecl = this.findVariableInFunction(topNode, name, refNode);
          if (varDecl) {
            console.log(
              `[ASTHover] Found variable in function ${topNode.name}`,
            );
            return varDecl;
          }
        }
      } else if (topNode.kind === "VariableDecl") {
        if (topNode.name === name) {
          console.log(`[ASTHover] Found global variable: ${name}`);
          return topNode;
        }
      } else if (topNode.kind === "StructDecl") {
        // Check methods
        for (const member of topNode.members || []) {
          if (
            member.kind === "FunctionDecl" &&
            this.isNodeContainedIn(refNode, member)
          ) {
            console.log(
              `[ASTHover] Reference is inside method ${member.name} of struct ${topNode.name}`,
            );
            const varDecl = this.findVariableInFunction(member, name, refNode);
            if (varDecl) return varDecl;
          }
        }
      }
    }

    console.log(`[ASTHover] Variable "${name}" not found in AST search`);
    return null;
  }

  /**
   * Find a pattern variable in match expressions
   */
  private findPatternVariable(
    ast: AST.Program,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.PatternIdentifier | null {
    console.log(`[ASTHover] Searching for pattern variable: ${name}`);

    // Search through all top-level declarations
    for (const topNode of ast.statements) {
      if (topNode.kind === "FunctionDecl") {
        if (this.isNodeContainedIn(refNode, topNode)) {
          const patternVar = this.findPatternVariableInFunction(
            topNode,
            name,
            refNode,
          );
          if (patternVar) return patternVar;
        }
      } else if (topNode.kind === "StructDecl") {
        for (const member of topNode.members || []) {
          if (
            member.kind === "FunctionDecl" &&
            this.isNodeContainedIn(refNode, member)
          ) {
            const patternVar = this.findPatternVariableInFunction(
              member,
              name,
              refNode,
            );
            if (patternVar) return patternVar;
          }
        }
      }
    }

    return null;
  }

  /**
   * Find pattern variable in a function body
   */
  private findPatternVariableInFunction(
    funcNode: AST.FunctionDecl,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.PatternIdentifier | null {
    if (funcNode.body) {
      return this.findPatternVariableInBlock(funcNode.body, name, refNode);
    }
    return null;
  }

  /**
   * Find pattern variable in a block (search match expressions)
   */
  private findPatternVariableInBlock(
    block: AST.BlockStmt,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.PatternIdentifier | null {
    for (const stmt of block.statements) {
      // Stop if we're past the reference point
      if (
        stmt.location &&
        refNode.location &&
        stmt.location.startLine > refNode.location.startLine
      ) {
        break;
      }

      if (stmt.kind === "ExpressionStmt") {
        const exprStmt = stmt as AST.ExpressionStmt;
        if (exprStmt.expression.kind === "Match") {
          const matchExpr = exprStmt.expression as AST.MatchExpr;
          console.log(
            `[ASTHover] Found match expression with ${matchExpr.arms.length} arms at line ${matchExpr.location?.startLine}`,
          );

          // Check if reference is inside one of the match arms
          for (const arm of matchExpr.arms) {
            console.log(
              `[ASTHover] Checking match arm at line ${arm.location?.startLine}`,
            );

            // Check if the reference is within this arm's body AND this match expression
            let isInArm = false;
            if (
              arm.body &&
              typeof arm.body === "object" &&
              arm.body.location &&
              refNode.location &&
              matchExpr.location
            ) {
              const bodyLoc = arm.body.location;
              const refLoc = refNode.location;
              const matchLoc = matchExpr.location;

              // Reference must be inside the arm body AND after the match starts
              isInArm =
                refLoc.startLine >= bodyLoc.startLine &&
                refLoc.endLine <= bodyLoc.endLine &&
                refLoc.startLine >= matchLoc.startLine &&
                (refLoc.startLine > bodyLoc.startLine ||
                  refLoc.startColumn >= bodyLoc.startColumn) &&
                (refLoc.endLine < bodyLoc.endLine ||
                  refLoc.endColumn <= bodyLoc.endColumn);
            }

            if (isInArm) {
              console.log(
                `[ASTHover] Reference is inside match arm body, searching pattern`,
              );
              // Search the pattern for the variable
              const patternVar = this.searchPattern(arm.pattern, name);
              if (patternVar) {
                console.log(`[ASTHover] Found pattern variable: ${name}`);
                return patternVar;
              }
            }
          }

          // If we found a match expression but no pattern variable, recursively search its arms
          for (const arm of matchExpr.arms) {
            if (
              arm.body &&
              typeof arm.body === "object" &&
              arm.body.kind === "Block"
            ) {
              const patternVar = this.findPatternVariableInBlock(
                arm.body,
                name,
                refNode,
              );
              if (patternVar) return patternVar;
            }
          }
        }
      } else if (stmt.kind === "Block") {
        const patternVar = this.findPatternVariableInBlock(stmt, name, refNode);
        if (patternVar) return patternVar;
      } else if (stmt.kind === "If") {
        if (stmt.thenBranch && stmt.thenBranch.kind === "Block") {
          const patternVar = this.findPatternVariableInBlock(
            stmt.thenBranch,
            name,
            refNode,
          );
          if (patternVar) return patternVar;
        }
        if (stmt.elseBranch && stmt.elseBranch.kind === "Block") {
          const patternVar = this.findPatternVariableInBlock(
            stmt.elseBranch,
            name,
            refNode,
          );
          if (patternVar) return patternVar;
        }
      } else if (stmt.kind === "Loop") {
        if (stmt.body && stmt.body.kind === "Block") {
          const patternVar = this.findPatternVariableInBlock(
            stmt.body,
            name,
            refNode,
          );
          if (patternVar) return patternVar;
        }
      }
    }

    return null;
  }

  /**
   * Search a pattern for a specific variable binding
   */
  private searchPattern(
    pattern: AST.Pattern,
    name: string,
  ): AST.PatternIdentifier | null {
    console.log(
      `[ASTHover] Searching pattern kind=${pattern.kind} for name="${name}"`,
    );

    if (pattern.kind === "PatternIdentifier") {
      console.log(`[ASTHover] PatternIdentifier name="${pattern.name}"`);
      if (pattern.name === name) {
        return pattern;
      }
    } else if (pattern.kind === "PatternEnumTuple") {
      console.log(
        `[ASTHover] PatternEnumTuple bindings count=${pattern.bindings.length}`,
      );
      // Check bindings in tuple patterns like Option.Some(val)
      const binding = pattern.bindings.find(
        (b) => b.kind === "PatternIdentifier" && b.name === name,
      );
      if (binding && binding.kind === "PatternIdentifier") {
        console.log(`[ASTHover] Found binding ${name}`);
        return binding;
      }
    } else if (pattern.kind === "PatternEnumStruct") {
      // Check field bindings in struct patterns
      const field = pattern.fields.find((f) => f.binding === name);
      if (field) {
        return {
          kind: "PatternIdentifier",
          name: name,
          location: pattern.location,
          type: undefined,
        } as AST.PatternIdentifier;
      }
    }

    return null;
  }

  /**
   * Check if a node is contained within another node
   */
  private isNodeContainedIn(
    node: AST.ASTNode,
    container: AST.ASTNode,
  ): boolean {
    const nodeLoc = node.location;
    const containerLoc = container.location;

    if (!nodeLoc || !containerLoc) return false;

    if (nodeLoc.startLine < containerLoc.startLine) return false;
    if (nodeLoc.endLine > containerLoc.endLine) return false;
    if (
      nodeLoc.startLine === containerLoc.startLine &&
      nodeLoc.startColumn < containerLoc.startColumn
    )
      return false;
    if (
      nodeLoc.endLine === containerLoc.endLine &&
      nodeLoc.endColumn > containerLoc.endColumn
    )
      return false;

    return true;
  }

  /**
   * Find a variable declaration within a function
   */
  private findVariableInFunction(
    funcNode: AST.FunctionDecl,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.VariableDecl | null {
    console.log(`[ASTHover] Searching in function body for: ${name}`);

    // Check parameters first
    for (const param of funcNode.params) {
      if (param.name === name) {
        console.log(`[ASTHover] Variable "${name}" is a parameter`);
        // Parameters are handled separately
        return null;
      }
    }

    // Search function body
    if (funcNode.body) {
      console.log(`[ASTHover] Function has body, searching...`);
      return this.findVariableInBlock(funcNode.body, name, refNode);
    }

    console.log(`[ASTHover] Function has no body`);
    return null;
  }

  /**
   * Find a variable declaration within a block statement
   */
  private findVariableInBlock(
    block: AST.BlockStmt,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.VariableDecl | null {
    console.log(
      `[ASTHover] Searching block with ${block.statements.length} statements`,
    );

    for (const stmt of block.statements) {
      // Check if this statement comes before the reference point
      if (
        stmt.location &&
        refNode.location &&
        stmt.location.startLine > refNode.location.startLine
      ) {
        // Don't search statements after the reference
        console.log(
          `[ASTHover] Statement at line ${stmt.location.startLine} is after reference at line ${refNode.location.startLine}, stopping`,
        );
        break;
      }

      if (stmt.kind === "VariableDecl") {
        console.log(`[ASTHover] Found VariableDecl: ${stmt.name}`);
        if (stmt.name === name) {
          console.log(`[ASTHover] MATCH! Found variable: ${name}`);
          return stmt;
        }
      } else if (stmt.kind === "Block") {
        // Recursively search nested blocks
        const varDecl = this.findVariableInBlock(stmt, name, refNode);
        if (varDecl) return varDecl;
      } else if (stmt.kind === "If") {
        // Search in if/else branches - search ALL branches before the reference
        if (stmt.thenBranch && stmt.thenBranch.kind === "Block") {
          const varDecl = this.findVariableInBlock(
            stmt.thenBranch,
            name,
            refNode,
          );
          if (varDecl) return varDecl;
        }
        if (stmt.elseBranch && stmt.elseBranch.kind === "Block") {
          const varDecl = this.findVariableInBlock(
            stmt.elseBranch,
            name,
            refNode,
          );
          if (varDecl) return varDecl;
        }
      } else if (stmt.kind === "Loop") {
        // Search in loop body
        if (stmt.body && stmt.body.kind === "Block") {
          const varDecl = this.findVariableInBlock(stmt.body, name, refNode);
          if (varDecl) return varDecl;
        }
      } else if (stmt.kind === "ExpressionStmt") {
        // Check if it's a match expression
        const exprStmt = stmt as AST.ExpressionStmt;
        if (exprStmt.expression.kind === "Match") {
          const matchExpr = exprStmt.expression as AST.MatchExpr;
          for (const arm of matchExpr.arms) {
            if (
              arm.body &&
              typeof arm.body === "object" &&
              arm.body.kind === "Block"
            ) {
              const varDecl = this.findVariableInBlock(arm.body, name, refNode);
              if (varDecl) return varDecl;
            }
          }
        }
      }
      // Add more statement types as needed
    }

    console.log(`[ASTHover] Variable not found in this block`);
    return null;
  }

  /**
   * Format documentation comment for hover display
   */
  private formatDocumentation(doc: string): string {
    if (!doc) return "";

    // Split into lines and process
    const lines = doc.split("\n").map((line) => line.trim());

    // Join with proper line breaks
    return lines.join("  \n"); // Two spaces for markdown line break
  }

  /**
   * Clean documentation for inline display (single line)
   */
  private cleanDocumentation(doc: string): string {
    if (!doc) return "";

    // Remove newlines and extra whitespace
    return doc.replace(/\s+/g, " ").trim();
  }

  /**
   * Shorten file path for display
   */
  private shortenFilePath(filePath: string): string {
    if (!filePath) return "";

    // If it's the same file as the one being edited, just say "this file"
    if (
      this.currentFilePath &&
      path.resolve(filePath) === path.resolve(this.currentFilePath)
    ) {
      return "this file";
    }

    // Get just the filename
    const filename = path.basename(filePath);

    // If in the same directory as current file, just show filename
    if (
      this.currentFilePath &&
      path.dirname(path.resolve(filePath)) ===
        path.dirname(path.resolve(this.currentFilePath))
    ) {
      return filename;
    }

    // Otherwise show parent directory + filename
    const parts = filePath.split(path.sep);
    if (parts.length <= 2) return filePath;

    return "..." + path.sep + parts.slice(-2).join(path.sep);
  }
}
