import * as AST from "./AST";

export class ASTPrinter {
  print(node: AST.ASTNode): string {
    return this.printNode(node, "", "", undefined);
  }

  private printNode(
    node: AST.ASTNode,
    prefix: string,
    childPrefix: string,
    key?: string,
  ): string {
    let output = "";

    // Determine label
    let label = node.kind;
    if ("name" in node && typeof node.name === "string") {
      label += ` (${node.name})`;
    } else if ("value" in node) {
      if (node.kind === "Return") {
        // Don't print value for Return if it's an object (expression)
      } else if (typeof node.value === "string") {
        label += ` (${node.value.replaceAll("\n", "\\n")})`;
      } else if (typeof node.value === "object" && node.value !== null) {
        label += ` (${(node.value as AST.AssignmentExpr).kind})`;
      } else {
        label += ` (${node.value})`;
      }
    } else if ("operator" in node) {
      label += ` (${(node as AST.BinaryExpr).operator.lexeme})`;
    }

    // Determine type
    let typeStr = "";
    if (node.resolvedType) {
      typeStr = " -> " + this.typeToString(node.resolvedType);
    }

    const nodeText = `${label}${typeStr}`;
    if (key) {
      output += `${prefix}${key}: ${nodeText}\n`;
    } else {
      output += `${prefix}${nodeText}\n`;
    }

    // Find children
    const children: { key: string; value: AST.ASTNode | AST.ASTNode[] }[] = [];

    const keys = Object.keys(node);
    for (const k of keys) {
      if (
        k === "kind" ||
        k === "location" ||
        k === "resolvedType" ||
        k === "genericParams" ||
        k === "isFrame" ||
        k === "isStatic"
      )
        continue;
      const value = (node as any)[k];
      if (this.isNode(value)) {
        children.push({ key: k, value });
      } else if (
        Array.isArray(value) &&
        value.length > 0 &&
        this.isNode(value[0])
      ) {
        children.push({ key: k, value });
      }
    }

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const isLast = i === children.length - 1;
      const keyPrefix = childPrefix + (isLast ? "└── " : "├── ");
      const nextChildPrefix = childPrefix + (isLast ? "    " : "│   ");

      if (Array.isArray(child.value)) {
        output += `${keyPrefix}${child.key}\n`;
        for (let j = 0; j < child.value.length; j++) {
          const item = child.value[j]!;
          const isLastItem = j === child.value.length - 1;
          const itemPrefix = nextChildPrefix + (isLastItem ? "└── " : "├── ");
          const nextItemPrefix =
            nextChildPrefix + (isLastItem ? "    " : "│   ");
          output += this.printNode(item, itemPrefix, nextItemPrefix);
        }
      } else {
        output += this.printNode(
          child.value as AST.ASTNode,
          keyPrefix,
          nextChildPrefix,
          child.key,
        );
      }
    }

    return output;
  }

  private isNode(obj: any): obj is AST.ASTNode {
    return obj && typeof obj === "object" && "kind" in obj;
  }

  private typeToString(type: AST.TypeNode): string {
    if (type.kind === "BasicType") {
      let s = type.name;
      if (type.genericArgs.length > 0) {
        s +=
          "<" +
          type.genericArgs.map((a) => this.typeToString(a)).join(", ") +
          ">";
      }
      for (let i = 0; i < type.pointerDepth; i++) s += "*";
      for (const dim of type.arrayDimensions) s += `[${dim ?? ""}]`;
      return s;
    } else if (type.kind === "FunctionType") {
      const params = type.paramTypes
        .map((p) => this.typeToString(p))
        .join(", ");
      const ret = this.typeToString(type.returnType);
      return `(${params}) => ${ret}`;
    } else if (type.kind === "TupleType") {
      return "(" + type.types.map((t) => this.typeToString(t)).join(", ") + ")";
    } else if (type.kind === "MetaType") {
      return `Type<${this.typeToString(type.type)}>`;
    }
    return "unknown";
  }
}
