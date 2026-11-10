import * as AST from "../common/AST";
import { CompilerError } from "../common/CompilerError";

/** The same code as other type recursion cycles. */
const TYPE_RECURSION_CYCLE_CODE = "BPL_TYPE_RECURSION_CYCLE";

/** A type parameter of one generic function: `${function}#${index}`. */
type ParameterNode = string;

interface Edge {
  to: ParameterNode;
  /** The argument wraps the parameter, for example `W<T>` or `*T`. */
  grows: boolean;
  call: AST.CallExpr;
}

function mentions(type: AST.TypeNode, name: string): boolean {
  switch (type.kind) {
    case "BasicType":
      return (
        type.name === name ||
        type.genericArgs.some((argument) => mentions(argument, name))
      );
    case "TupleType":
      return type.types.some((element) => mentions(element, name));
    case "FunctionType":
    case "LambdaType":
      return (
        mentions(type.returnType, name) ||
        type.paramTypes.some((param) => mentions(param, name))
      );
    default:
      return false;
  }
}

function isBare(type: AST.TypeNode, name: string): boolean {
  return (
    type.kind === "BasicType" &&
    type.name === name &&
    type.genericArgs.length === 0 &&
    type.pointerDepth === 0 &&
    type.arrayDimensions.length === 0
  );
}

function forEachCall(node: unknown, visit: (call: AST.CallExpr) => void) {
  const seen = new Set<object>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.kind === "Call") visit(record as unknown as AST.CallExpr);
    for (const key in record) {
      // Resolved links point back into other declarations and types.
      if (
        key === "location" ||
        key.startsWith("resolved") ||
        key === "declaration" ||
        key === "parent"
      )
        continue;
      walk(record[key]);
    }
  };
  walk(node);
}

/**
 * A generic function that calls a generic function with a type argument
 * built from its own type parameter (`grow<W<T>>` inside `grow<T>`) would
 * need infinitely many instantiations when the calls form a cycle. Code
 * generation stops such programs only after many rounds, so the checker
 * reports the cycle at the call that makes the type grow (R-FN-9).
 */
export function findInstantiationCycle(
  statements: readonly AST.Statement[],
): CompilerError | undefined {
  const functions = statements.filter(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl" && statement.genericParams.length > 0,
  );
  if (functions.length === 0) return undefined;
  const generic = new Set(functions);
  const edges = new Map<ParameterNode, Edge[]>();
  const node = (decl: AST.FunctionDecl, index: number) =>
    `${decl.name}@${decl.location.startLine}:${decl.location.startColumn}#${index}`;

  for (const caller of functions) {
    forEachCall(caller.body, (call) => {
      const callee = call.resolvedDeclaration;
      if (!callee || callee.kind !== "FunctionDecl" || !generic.has(callee))
        return;
      const args = call.genericArgs ?? [];
      caller.genericParams.forEach((param, from) => {
        args.forEach((argument, to) => {
          if (!mentions(argument, param.name)) return;
          const key = node(caller, from);
          const list = edges.get(key) ?? [];
          list.push({
            to: node(callee, to),
            grows: !isBare(argument, param.name),
            call,
          });
          edges.set(key, list);
        });
      });
    });
  }

  const reaches = (start: ParameterNode, goal: ParameterNode): boolean => {
    const visited = new Set<ParameterNode>();
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === goal) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const edge of edges.get(current) ?? []) stack.push(edge.to);
    }
    return false;
  };

  for (const [from, list] of edges) {
    for (const edge of list) {
      if (edge.grows && reaches(edge.to, from)) {
        const name =
          edge.call.callee.kind === "GenericInstantiation"
            ? (edge.call.callee.base as AST.IdentifierExpr).name
            : (edge.call.callee as AST.IdentifierExpr).name;
        return new CompilerError(
          `Generic function '${name}' instantiates itself with ever larger type arguments`,
          "Each call in this cycle wraps a type parameter in a bigger type, so it would need infinitely many copies. Use a fixed type or a pointer to an erased type.",
          edge.call.location,
          TYPE_RECURSION_CYCLE_CODE,
        );
      }
    }
  }
  return undefined;
}
