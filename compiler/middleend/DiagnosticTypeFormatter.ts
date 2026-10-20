import type * as AST from "../common/AST";

function isStringAlias(type: AST.BasicTypeNode): boolean {
  const seen = new Set<AST.TypeNode>();
  let current: AST.TypeNode | undefined = type;
  while (current?.kind === "BasicType" && !seen.has(current)) {
    if (current.aliasDeclaration?.name === "string") return true;
    seen.add(current);
    current = current.aliasTarget;
  }
  return false;
}

/** User-facing spelling only; never use this for type identity or runtime IDs. */
export function formatDiagnosticType(type: AST.TypeNode | undefined): string {
  if (!type) return "unknown";
  if (type.kind === "MetaType")
    return `type of ${formatDiagnosticType(type.type)}`;

  const dimensions = (type.arrayDimensions ?? [])
    .map((dimension) => `[${dimension === null ? "" : dimension}]`)
    .join("");
  const qualifier = type.isConst ? "const " : "";
  let body: string;
  switch (type.kind) {
    case "BasicType": {
      let name = type.name === "i1" ? "bool" : type.name;
      let pointers = type.pointerDepth;
      // The checker resolves string to a pointer to signed 8-bit characters.
      if (
        (name === "char" || (name === "i8" && isStringAlias(type))) &&
        pointers > 0 &&
        !type.isPointerToArray
      ) {
        name = "string";
        pointers--;
      }
      body = "*".repeat(pointers) + name;
      if (type.genericArgs.length)
        body += `<${type.genericArgs.map(formatDiagnosticType).join(", ")}>`;
      if (type.isPointerToArray && pointers > 0) body = `(${body})`;
      break;
    }
    case "FunctionType":
    case "LambdaType": {
      const kind = type.kind === "FunctionType" ? "Func" : "Lambda";
      body = `${kind}<${formatDiagnosticType(type.returnType)}>(${type.paramTypes.map(formatDiagnosticType).join(", ")})`;
      break;
    }
    case "TupleType":
      body = `(${type.types.map(formatDiagnosticType).join(", ")})`;
      break;
    default:
      body = "unknown";
  }
  return qualifier + body + dimensions;
}
