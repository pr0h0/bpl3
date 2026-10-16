import * as AST from "../../common/AST";
import { TokenType } from "../../frontend/TokenType";
import type { CheckerContext } from "../CheckerContext";

/** Lower compiler-owned interpolation values into a scope with deferred cleanup.
 * The match arm supplies an expression-valued block without allocating a closure.
 * User String operands stay borrowed, just as they do for ordinary addition.
 */
export function lowerStringInterpolation(
  context: CheckerContext,
  concat: AST.Expression,
  ownedParts: Set<AST.Expression>,
): AST.MatchExpr {
  const location = concat.location;
  const parts: AST.Expression[] = [];
  let initial = concat;
  while (initial.kind === "Binary") {
    parts.push(initial.right);
    initial = initial.left;
  }
  parts.reverse();
  let counter = 0;
  const freshName = () => {
    let value: string;
    do {
      value = `__bpl_interpolation_${counter++}`;
    } while (context.currentScope.resolve(value));
    return value;
  };
  const type = (pointerDepth = 0): AST.BasicTypeNode => ({
    kind: "BasicType",
    name: "String",
    genericArgs: [],
    arrayDimensions: [],
    pointerDepth,
    location,
  });
  const id = (name: string): AST.IdentifierExpr => ({
    kind: "Identifier",
    name,
    location,
  });
  const call = (object: AST.Expression, property: string): AST.CallExpr => ({
    kind: "Call",
    callee: { kind: "Member", object, property, location },
    args: [],
    genericArgs: [],
    location,
  });
  const statement = (expression: AST.Expression): AST.ExpressionStmt => ({
    kind: "ExpressionStmt",
    expression,
    location,
  });
  const variable = (
    name: string,
    initializer: AST.Expression,
    pointerDepth = 0,
  ): AST.VariableDecl => ({
    kind: "VariableDecl",
    name,
    typeAnnotation: type(pointerDepth),
    initializer,
    isGlobal: false,
    isConst: false,
    location,
  });
  const assign = (
    assignee: AST.Expression,
    value: AST.Expression,
  ): AST.ExpressionStmt =>
    statement({
      kind: "Assignment",
      assignee,
      value,
      operator: {
        type: TokenType.Equal,
        lexeme: "=",
        literal: null,
        line: location.startLine,
        column: location.startColumn,
        file: location.file,
      },
      location,
    });
  const cleanup = (value: string): AST.Statement[] => {
    const owner = freshName();
    return [
      variable(
        owner,
        {
          kind: "Unary",
          operator: {
            type: TokenType.Ampersand,
            lexeme: "&",
            literal: null,
            line: location.startLine,
            column: location.startColumn,
            file: location.file,
          },
          operand: id(value),
          isPrefix: true,
          location,
        },
        1,
      ),
      {
        kind: "Defer",
        statement: statement(call(id(owner), "destroy")),
        location,
      },
    ];
  };
  const accumulator = freshName();
  const statements: AST.Statement[] = [
    variable(accumulator, initial),
    ...cleanup(accumulator),
  ];
  for (const part of parts) {
    const block: AST.Statement[] = [];
    let rhs = part;
    if (
      ownedParts.has(part) &&
      part.resolvedType?.kind === "BasicType" &&
      part.resolvedType.name === "String" &&
      part.resolvedType.pointerDepth === 0
    ) {
      const temporary = freshName();
      block.push(variable(temporary, part), ...cleanup(temporary));
      rhs = id(temporary);
    }
    const next = freshName();
    block.push(
      variable(next, {
        kind: "Binary",
        left: id(accumulator),
        right: rhs,
        operator: {
          type: TokenType.Plus,
          lexeme: "+",
          literal: "+",
          line: location.startLine,
          column: location.startColumn,
          file: location.file,
        },
        location,
      }),
      statement(call(id(accumulator), "destroy")),
      assign(id(accumulator), id(next)),
    );
    statements.push({ kind: "Block", statements: block, location });
  }
  // Transfer the final allocation to the caller; the deferred owner sees an
  // empty String, including when this expression yields from a nested match.
  const result = freshName();
  statements.push(
    variable(result, id(accumulator)),
    assign(
      { kind: "Member", object: id(accumulator), property: "data", location },
      {
        kind: "Literal",
        type: "nullptr",
        value: null,
        raw: "nullptr",
        location,
      },
    ),
    assign(
      { kind: "Member", object: id(accumulator), property: "length", location },
      { kind: "Literal", type: "number", value: 0, raw: "0", location },
    ),
    { kind: "Return", value: id(result), location },
  );
  return {
    kind: "Match",
    value: { kind: "Literal", type: "number", value: 0, raw: "0", location },
    arms: [
      {
        kind: "MatchArm",
        pattern: { kind: "PatternWildcard", location },
        body: { kind: "Block", statements, location },
        location,
      },
    ],
    location,
  };
}
