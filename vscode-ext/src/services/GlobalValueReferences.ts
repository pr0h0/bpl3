import type * as AST from "../../../compiler/common/AST";

function declaresName(value: unknown, name: string): boolean {
  if (typeof value === "string") return value === name;
  if (Array.isArray(value))
    return value.some((item) => declaresName(item, name));
  return (
    !!value &&
    typeof value === "object" &&
    "name" in value &&
    declaresName(value.name, name)
  );
}

function bindsPattern(pattern: AST.Pattern, name: string): boolean {
  switch (pattern.kind) {
    case "PatternIdentifier":
      return pattern.name === name;
    case "PatternTuple":
      return pattern.patterns.some((child) => bindsPattern(child, name));
    case "PatternEnumTuple":
      return pattern.bindings.some((child) => bindsPattern(child, name));
    case "PatternEnumStruct":
      return pattern.fields.some((field) => field.binding === name);
    default:
      return false;
  }
}

/** Find value references that resolve past local bindings to an outer name. */
export function collectUnshadowedValueReferences(
  program: AST.ASTNode | undefined,
  name: string,
): AST.ASTNode[] {
  const references: AST.ASTNode[] = [];
  const ancestors = new Set<object>();
  const metadata = new Set([
    "location",
    "comments",
    "resolvedDeclaration",
    "resolvedType",
    "bindingDeclaration",
    "capturedVariables",
    "desugared",
  ]);
  const visit = (value: unknown, shadowed: boolean): void => {
    if (!value || typeof value !== "object" || ancestors.has(value)) return;
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        value.forEach((child) => visit(child, shadowed));
        return;
      }
      const node = value as AST.ASTNode;
      switch (node.kind) {
        case "Identifier":
          if (!shadowed && (node as AST.IdentifierExpr).name === name)
            references.push(node);
          return;
        case "Export":
          if ((node as AST.ExportStmt).items.some((item) => item.name === name))
            references.push(node);
          return;
        case "Block": {
          let localShadow = shadowed;
          for (const statement of (node as AST.BlockStmt).statements) {
            visit(statement, localShadow);
            if (
              statement.kind === "VariableDecl" &&
              declaresName(statement.name, name)
            )
              localShadow = true;
          }
          return;
        }
        case "VariableDecl": {
          const declaration = node as AST.VariableDecl;
          visit(declaration.typeAnnotation, shadowed);
          // Initializers evaluate before the new binding enters its scope.
          visit(declaration.initializer, shadowed);
          return;
        }
        case "FunctionDecl":
        case "LambdaExpression": {
          const fn = node as AST.FunctionDecl | AST.LambdaExpr;
          if (fn.kind === "FunctionDecl") visit(fn.genericParams, shadowed);
          for (const parameter of fn.params) visit(parameter.type, shadowed);
          const bodyShadow =
            shadowed || fn.params.some((parameter) => parameter.name === name);
          visit(fn.returnType, bodyShadow);
          visit(fn.body, bodyShadow);
          return;
        }
        case "Loop": {
          const loop = node as AST.LoopStmt;
          visit(loop.init, shadowed);
          const loopShadow =
            shadowed ||
            (loop.init?.kind === "VariableDecl" &&
              declaresName(loop.init.name, name));
          visit(loop.condition, loopShadow);
          visit(loop.body, loopShadow);
          visit(loop.step, loopShadow);
          return;
        }
        case "CatchClause": {
          const clause = node as AST.CatchClause;
          visit(clause.type, shadowed);
          visit(clause.body, shadowed || clause.variable === name);
          return;
        }
        case "Match": {
          const match = node as AST.MatchExpr;
          visit(match.value, shadowed);
          for (const arm of match.arms) {
            visit(arm.pattern, shadowed);
            const armShadow = shadowed || bindsPattern(arm.pattern, name);
            visit(arm.guard, armShadow);
            visit(arm.body, armShadow);
          }
          return;
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (!metadata.has(key)) visit(child, shadowed);
      }
    } finally {
      ancestors.delete(value);
    }
  };
  visit(program, false);
  return references;
}

/** Find value references that resolve past local bindings to a global name. */
export function collectGlobalValueReferences(
  program: AST.Program,
  name: string,
): AST.ASTNode[] {
  return collectUnshadowedValueReferences(program, name);
}
