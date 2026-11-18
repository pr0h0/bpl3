import * as AST from "./AST";
import type { SourceLocation } from "./CompilerError";
import { TokenType } from "../frontend/TokenType";
import {
  parseTargetTriple,
  targetHasAnyComponent,
  targetHasComponent,
} from "./TargetTriple";

/**
 * Built-in constants that describe the compilation target (BUG-827). The type
 * checker knows only their types, so `bpl check` stays target-independent;
 * the code generator substitutes the value for the build's target, and an
 * `if` whose condition uses only these constants and literals keeps only the
 * branch that runs, so the other branch may call functions the target lacks.
 */
export const TARGET_CONSTANT_TYPES = {
  __TARGET_WASM__: "bool",
  __TARGET_LINUX__: "bool",
  __TARGET_MACOS__: "bool",
  __TARGET_WINDOWS__: "bool",
  __TARGET_POINTER_BITS__: "int",
} as const;

export type TargetConstantName = keyof typeof TARGET_CONSTANT_TYPES;

const TARGET_CONSTANT_LOCATION: SourceLocation = {
  file: "internal",
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
};

/** One shared declaration per constant, the identifiers' resolved declaration. */
export const TARGET_CONSTANT_DECLARATIONS: ReadonlyMap<
  TargetConstantName,
  AST.VariableDecl
> = new Map(
  (Object.keys(TARGET_CONSTANT_TYPES) as TargetConstantName[]).map((name) => {
    const typeAnnotation: AST.BasicTypeNode = {
      kind: "BasicType",
      name: TARGET_CONSTANT_TYPES[name],
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: TARGET_CONSTANT_LOCATION,
    };
    const declaration: AST.VariableDecl = {
      kind: "VariableDecl",
      isGlobal: true,
      isConst: true,
      name,
      typeAnnotation,
      resolvedType: typeAnnotation,
      location: TARGET_CONSTANT_LOCATION,
    } as AST.VariableDecl;
    return [name, declaration];
  }),
);

const DECLARATION_NAMES = new Map<AST.ASTNode, TargetConstantName>(
  [...TARGET_CONSTANT_DECLARATIONS].map(([name, decl]) => [decl, name]),
);

/** The constant a declaration stands for, if it is one of these built-ins. */
export function targetConstantName(
  declaration: AST.ASTNode | undefined,
): TargetConstantName | undefined {
  return declaration ? DECLARATION_NAMES.get(declaration) : undefined;
}

/** A constant's value for a target triple and its pointer width in bits. */
export function targetConstantValue(
  name: TargetConstantName,
  target: string,
  pointerBits: number,
): boolean | number {
  const parsed = parseTargetTriple(target);
  switch (name) {
    case "__TARGET_WASM__":
      return parsed?.arch === "wasm32" || parsed?.arch === "wasm64";
    case "__TARGET_LINUX__":
      return targetHasComponent(parsed, "linux");
    case "__TARGET_MACOS__":
      return targetHasAnyComponent(parsed, ["darwin", "macos"]);
    case "__TARGET_WINDOWS__":
      return targetHasComponent(parsed, "windows");
    case "__TARGET_POINTER_BITS__":
      return pointerBits;
  }
}

/**
 * The value of an expression built only from target constants, literals,
 * `!`, `&&`, `||` and integer comparisons, or `undefined` when it uses
 * anything else (including when no target constant appears in it).
 */
export function evaluateTargetCondition(
  expr: AST.Expression,
  valueOf: (name: TargetConstantName) => boolean | number,
): boolean | undefined {
  let usesTargetConstant = false;
  const evaluate = (node: AST.Expression): boolean | number | undefined => {
    switch (node.kind) {
      case "Group":
        return evaluate((node as AST.GroupExpr).expression);
      case "Identifier": {
        const name = targetConstantName(
          (node as AST.IdentifierExpr).resolvedDeclaration,
        );
        if (!name) return undefined;
        usesTargetConstant = true;
        return valueOf(name);
      }
      case "Literal": {
        const literal = node as AST.LiteralExpr;
        if (literal.type === "bool") return literal.value === true;
        if (literal.type === "number" && typeof literal.value === "number") {
          return Number.isInteger(literal.value) ? literal.value : undefined;
        }
        return undefined;
      }
      case "Unary": {
        const unary = node as AST.UnaryExpr;
        if (unary.operatorOverload) return undefined;
        const operand = evaluate(unary.operand);
        if (unary.operator.type === TokenType.Bang) {
          return typeof operand === "boolean" ? !operand : undefined;
        }
        if (unary.operator.type === TokenType.Minus) {
          return typeof operand === "number" ? -operand : undefined;
        }
        return undefined;
      }
      case "Binary": {
        const binary = node as AST.BinaryExpr;
        if (binary.operatorOverload) return undefined;
        const left = evaluate(binary.left);
        const right = evaluate(binary.right);
        if (left === undefined || right === undefined) return undefined;
        if (typeof left !== typeof right) return undefined;
        switch (binary.operator.type) {
          case TokenType.AndAnd:
            return typeof left === "boolean" ? left && right : undefined;
          case TokenType.OrOr:
            return typeof left === "boolean" ? left || right : undefined;
          case TokenType.EqualEqual:
            return left === right;
          case TokenType.BangEqual:
            return left !== right;
          case TokenType.Less:
            return typeof left === "number" && typeof right === "number"
              ? left < right
              : undefined;
          case TokenType.LessEqual:
            return typeof left === "number" && typeof right === "number"
              ? left <= right
              : undefined;
          case TokenType.Greater:
            return typeof left === "number" && typeof right === "number"
              ? left > right
              : undefined;
          case TokenType.GreaterEqual:
            return typeof left === "number" && typeof right === "number"
              ? left >= right
              : undefined;
          default:
            return undefined;
        }
      }
      default:
        return undefined;
    }
  };
  const value = evaluate(expr);
  return usesTargetConstant && typeof value === "boolean" ? value : undefined;
}
