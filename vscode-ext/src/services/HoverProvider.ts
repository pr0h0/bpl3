/**
 * Hover Provider Service
 * Provides hover information using the symbol index
 */

import { Hover, MarkupKind } from "vscode-languageserver/node";
import type { SymbolInfo, MethodInfo, FieldInfo } from "./SymbolIndex";
import { debugLog } from "./utils";

export class HoverProvider {
  /**
   * Create hover content for a symbol
   */
  static createHover(symbol: SymbolInfo): Hover {
    const contents = this.formatSymbol(symbol);

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: contents,
      },
    };
  }

  /**
   * Format symbol information as markdown
   */
  private static formatSymbol(symbol: SymbolInfo): string {
    let md = "";

    // Header with kind
    md += `**${this.getKindLabel(symbol.kind)}** \`${symbol.name}\`\n\n`;

    // Source information
    if (symbol.source) {
      md += this.formatSource(symbol);
    }

    // Documentation
    if (symbol.documentation) {
      md += this.formatDocumentation(symbol.documentation);
    }

    // Type-specific content
    switch (symbol.kind) {
      case "struct":
        md += this.formatStruct(symbol);
        break;
      case "enum":
        md += this.formatEnum(symbol);
        break;
      case "function":
        md += this.formatFunction(symbol);
        break;
      case "type-alias":
        md += this.formatTypeAlias(symbol);
        break;
      case "spec":
        md += this.formatSpec(symbol);
        break;
    }

    return md;
  }

  /**
   * Get human-readable label for symbol kind
   */
  private static getKindLabel(kind: SymbolInfo["kind"]): string {
    switch (kind) {
      case "struct":
        return "Struct";
      case "enum":
        return "Enum";
      case "function":
        return "Function";
      case "type-alias":
        return "Type Alias";
      case "variable":
        return "Variable";
      case "constant":
        return "Constant";
      case "spec":
        return "Spec (Interface)";
      default:
        return "Symbol";
    }
  }

  /**
   * Format source information
   */
  private static formatSource(symbol: SymbolInfo): string {
    let md = "";

    switch (symbol.source) {
      case "stdlib":
        md += `📚 *Standard Library*\n\n`;
        break;
      case "local-package":
        md += `📦 *Local Package*`;
        if (symbol.packageName) {
          md += `: \`${symbol.packageName}\``;
        }
        md += `\n\n`;
        break;
      case "global-package":
        md += `🌍 *Global Package*`;
        if (symbol.packageName) {
          md += `: \`${symbol.packageName}\``;
        }
        md += `\n\n`;
        break;
    }

    return md;
  }

  /**
   * Format documentation string
   */
  private static formatDocumentation(doc: string): string {
    // Remove leading comment markers and trim
    const lines = doc
      .split("\n")
      .map((line) => line.trim().replace(/^#\s*/, ""));

    return lines.join("\n") + "\n\n";
  }

  /**
   * Format struct information
   */
  private static formatStruct(symbol: SymbolInfo): string {
    let md = "";

    // Fields
    if (symbol.fields && symbol.fields.length > 0) {
      md += `### Fields\n\n`;
      for (const field of symbol.fields) {
        md += `- \`${field.name}: ${field.type}\``;
        if (field.documentation) {
          md += ` - ${field.documentation}`;
        }
        md += `\n`;
      }
      md += `\n`;
    }

    // Methods
    if (symbol.methods && symbol.methods.length > 0) {
      md += this.formatMethods(symbol.methods);
    }

    return md;
  }

  /**
   * Format enum information
   */
  private static formatEnum(symbol: SymbolInfo): string {
    let md = "";

    // Variants
    if (symbol.variants && symbol.variants.length > 0) {
      md += `### Variants\n\n`;
      for (const variant of symbol.variants) {
        md += `- \`${variant.name}\``;
        if (variant.dataType) {
          md += ` ${variant.dataType}`;
        }
        md += `\n`;
      }
      md += `\n`;
    }

    // Methods
    if (symbol.methods && symbol.methods.length > 0) {
      md += this.formatMethods(symbol.methods);
    }

    return md;
  }

  /**
   * Format function information
   */
  private static formatFunction(symbol: SymbolInfo): string {
    let md = "";

    if (symbol.signature) {
      md += `\`\`\`bpl\n`;

      // Check if it's an extern declaration
      const isExtern = symbol.declaration?.kind === "Extern";

      if (isExtern) {
        md += `extern ${symbol.name}(`;
        md += symbol.signature.parameters
          .map((p) => `${p.name}: ${p.type}`)
          .join(", ");
        // Add variadic placeholder for extern functions
        if (symbol.signature.isVariadic) {
          if (symbol.signature.parameters.length > 0) {
            md += ", ...";
          } else {
            md += "...";
          }
        }
        if (symbol.signature.returnType !== "void") {
          md += `) ret ${symbol.signature.returnType}\n`;
        } else {
          md += ")\n";
        }
      } else {
        md += `frame ${symbol.name}(`;
        md += symbol.signature.parameters
          .map((p) => {
            const typeStr = p.isVariadic ? `...${p.type}` : p.type;
            return `${p.name}: ${typeStr}`;
          })
          .join(", ");
        md += `) ret ${symbol.signature.returnType}\n`;
      }

      md += `\`\`\`\n\n`;

      // Parameters
      if (symbol.signature.parameters.length > 0) {
        md += `### Parameters\n\n`;
        for (const param of symbol.signature.parameters) {
          md += `- \`${param.name}\`: \`${param.type}\`\n`;
        }
        md += `\n`;
      }

      // Return type
      if (symbol.signature.returnType !== "void") {
        md += `### Returns\n\n`;
        md += `\`${symbol.signature.returnType}\`\n\n`;
      }
    }

    return md;
  }

  /**
   * Format type alias information
   */
  private static formatTypeAlias(_symbol: SymbolInfo): string {
    return ""; // Type alias details handled in documentation
  }

  /**
   * Format spec information
   */
  private static formatSpec(symbol: SymbolInfo): string {
    let md = "";

    // Methods (required by implementors)
    if (symbol.methods && symbol.methods.length > 0) {
      md += `### Required Methods\n\n`;
      for (const method of symbol.methods) {
        md += `- \`${method.name}(`;
        md += method.signature.parameters
          .map((p) => {
            const typeStr = p.isVariadic ? `...${p.type}` : p.type;
            return `${p.name}: ${typeStr}`;
          })
          .join(", ");
        md += `) ret ${method.signature.returnType}\``;
        if (method.documentation) {
          md += ` - ${method.documentation}`;
        }
        md += `\n`;
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Format methods list
   */
  private static formatMethods(methods: MethodInfo[]): string {
    let md = "";

    const staticMethods = methods.filter((m) => m.isStatic);
    const instanceMethods = methods.filter((m) => !m.isStatic);

    if (staticMethods.length > 0) {
      md += `### Static Methods\n\n`;
      for (const method of staticMethods) {
        md += this.formatMethodSignature(method);
      }
      md += `\n`;
    }

    if (instanceMethods.length > 0) {
      md += `### Instance Methods\n\n`;
      for (const method of instanceMethods) {
        md += this.formatMethodSignature(method);
      }
      md += `\n`;
    }

    return md;
  }

  /**
   * Format a single method signature
   */
  private static formatMethodSignature(method: MethodInfo): string {
    let md = `- \`${method.name}(`;
    md += method.signature.parameters
      .map((p) => {
        const typeStr = p.isVariadic ? `...${p.type}` : p.type;
        return `${p.name}: ${typeStr}`;
      })
      .join(", ");
    md += `) ret ${method.signature.returnType}\``;
    if (method.documentation) {
      md += ` - ${method.documentation}`;
    }
    md += `\n`;
    return md;
  }

  /**
   * Create hover for a method
   */
  static createMethodHover(
    methodName: string,
    method: MethodInfo,
    parentTypeName: string,
  ): Hover {
    debugLog(
      `[HoverProvider.createMethodHover] Creating hover for ${parentTypeName}.${methodName}`,
    );
    debugLog(
      `[HoverProvider.createMethodHover] Method signature:`,
      () => JSON.stringify(method.signature),
    );

    let md = `**${method.isStatic ? "Static " : ""}Method** \`${methodName}\`\n\n`;
    md += `*of* \`${parentTypeName}\`\n\n`;

    md += `\`\`\`bpl\n`;
    md += `frame ${methodName}(`;
    md += method.signature.parameters
      .map((p) => {
        const typeStr = p.isVariadic ? `...${p.type}` : p.type;
        return `${p.name}: ${typeStr}`;
      })
      .join(", ");
    md += `) ret ${method.signature.returnType}\n`;
    md += `\`\`\`\n\n`;

    if (method.documentation) {
      md += this.formatDocumentation(method.documentation);
    }

    if (method.signature.parameters.length > 0) {
      md += `### Parameters\n\n`;
      for (const param of method.signature.parameters) {
        md += `- \`${param.name}\`: \`${param.type}\`\n`;
      }
      md += `\n`;
    }

    if (method.signature.returnType !== "void") {
      md += `### Returns\n\n`;
      md += `\`${method.signature.returnType}\`\n\n`;
    }

    debugLog(
      `[HoverProvider.createMethodHover] Generated markdown length: ${md.length}`,
    );

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: md,
      },
    };
  }

  /**
   * Create hover for a field
   */
  static createFieldHover(
    fieldName: string,
    field: FieldInfo,
    parentTypeName: string,
  ): Hover {
    let md = `**Field** \`${fieldName}\`\n\n`;
    md += `*of* \`${parentTypeName}\`\n\n`;
    md += `Type: \`${field.type}\`\n\n`;

    if (field.documentation) {
      md += this.formatDocumentation(field.documentation);
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: md,
      },
    };
  }
}
