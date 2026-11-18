import * as AST from "../../common/AST";
import { walkAST } from "../../common/ASTTraversal";
import { TokenType } from "../../frontend/TokenType";

/**
 * Loop snapshots of global pointers (BUG-824).
 *
 * A loop that reads a global pointer reloads it from memory on every
 * iteration, because any store in the loop might change the global's storage.
 * The reload also repeats the null check and keeps LLVM from vectorizing the
 * loop. When nothing in the loop can change the global, the code generator
 * copies it into a local before the loop and reads the copy instead, which is
 * what `local r: *T = GLOBAL;` written by hand does.
 *
 * Nothing in the loop can change the global when:
 * - the global is a non-const pointer that is not exported, so only its own
 *   module can name it, and no code anywhere takes its address (`&GLOBAL`),
 *   so no other pointer reaches its storage;
 * - the loop makes no calls (a called function could assign it), declares no
 *   lambdas, has no inline assembly, no overloaded operators and no values
 *   destroyed automatically, and neither assigns the global nor applies
 *   `&`, `++` or `--` to it;
 * - when the loop can `return`, no `defer` registered before the loop refers
 *   to the global, because those run while the loop's copy is in use.
 */

/** Unary operators that only read their operand. */
const READ_ONLY_UNARY_OPERATORS = new Set<string>([
  TokenType.Star,
  TokenType.Minus,
  TokenType.Bang,
  TokenType.Tilde,
]);

/** Statement kinds that run code the loop analysis cannot see. */
const OPAQUE_KINDS = new Set<string>([
  "Call",
  "LambdaExpression",
  "Asm",
  "InterpolatedString",
  "AutoDestroy",
  "RuntimeDeferCleanup",
  "UnwindNodePop",
]);

function unwrapGroup(expr: AST.Expression): AST.Expression {
  let current = expr;
  while (current.kind === "Group") {
    current = (current as AST.GroupExpr).expression;
  }
  return current;
}

/** The global declaration an identifier names, if any. */
export function referencedGlobal(
  expr: AST.Expression,
): AST.VariableDecl | undefined {
  const unwrapped = unwrapGroup(expr);
  if (unwrapped.kind !== "Identifier") return undefined;
  const declaration = (unwrapped as AST.IdentifierExpr).resolvedDeclaration;
  if (
    declaration?.kind === "VariableDecl" &&
    declaration.isGlobal &&
    typeof declaration.name === "string"
  ) {
    return declaration;
  }
  return undefined;
}

function isPointerGlobal(declaration: AST.VariableDecl): boolean {
  if (declaration.isConst) return false;
  const type = declaration.typeAnnotation ?? declaration.resolvedType;
  return (
    type?.kind === "BasicType" &&
    type.pointerDepth > 0 &&
    type.arrayDimensions.length === 0
  );
}

/**
 * Globals that may never be snapshotted: those whose address is taken
 * anywhere in the program and those that are exported (another module can
 * name them). Export items name the source spelling, while a global's
 * declaration may carry a uniqued `NAME__N` linker name, so both match.
 */
export function collectUnsnapshottableGlobals(
  program: AST.Program,
): Set<AST.VariableDecl> {
  const unsafe = new Set<AST.VariableDecl>();
  const exportedNames = new Set<string>();
  const globals: AST.VariableDecl[] = [];

  walkAST(
    program,
    (node) => {
      if (node.kind === "Export") {
        for (const item of (node as AST.ExportStmt).items) {
          exportedNames.add(item.name);
        }
      } else if (node.kind === "VariableDecl") {
        const decl = node as AST.VariableDecl;
        if (decl.isGlobal && typeof decl.name === "string") globals.push(decl);
      } else if (node.kind === "Unary") {
        const unary = node as AST.UnaryExpr;
        if (unary.operator.type === TokenType.Ampersand) {
          const global = referencedGlobal(unary.operand);
          if (global) unsafe.add(global);
        }
      }
    },
    { trackPath: false },
  );

  for (const global of globals) {
    const name = global.name as string;
    const sourceName = name.replace(/__\d+$/, "");
    if (exportedNames.has(name) || exportedNames.has(sourceName)) {
      unsafe.add(global);
    }
  }
  return unsafe;
}

function mentionsGlobal(node: AST.ASTNode, global: AST.VariableDecl): boolean {
  let found = false;
  walkAST(
    node,
    (child) => {
      if (
        child.kind === "Identifier" &&
        (child as AST.IdentifierExpr).resolvedDeclaration === global
      ) {
        found = true;
        return false;
      }
    },
    { trackPath: false },
  );
  return found;
}

/**
 * The globals a loop may read through a local copy, in first-use order.
 * `outerDeferred` holds the `defer` statements registered before the loop in
 * the enclosing scopes of the function.
 */
export function findLoopGlobalSnapshots(
  loop: AST.LoopStmt,
  unsafe: ReadonlySet<AST.VariableDecl>,
  outerDeferred: readonly AST.Statement[],
  ownsAutoDestroy: (decl: AST.VariableDecl) => boolean,
): AST.VariableDecl[] {
  const read: AST.VariableDecl[] = [];
  const written = new Set<AST.VariableDecl>();
  let opaque = false;
  let returns = false;

  const markWritten = (expr: AST.Expression) => {
    const global = referencedGlobal(expr);
    if (global) written.add(global);
  };

  walkAST(
    loop,
    (node) => {
      if (
        OPAQUE_KINDS.has(node.kind) ||
        (node as { operatorOverload?: unknown }).operatorOverload
      ) {
        opaque = true;
        return false;
      }
      switch (node.kind) {
        case "Return":
          returns = true;
          break;
        case "VariableDecl":
          if (ownsAutoDestroy(node as AST.VariableDecl)) {
            opaque = true;
            return false;
          }
          break;
        case "Assignment": {
          const assignee = (node as AST.AssignmentExpr).assignee;
          markWritten(assignee);
          if (unwrapGroup(assignee).kind === "TupleLiteral") {
            walkAST(
              assignee,
              (child) => {
                if (child.kind === "Identifier") {
                  markWritten(child as AST.IdentifierExpr);
                }
              },
              { trackPath: false },
            );
          }
          break;
        }
        case "Unary": {
          const unary = node as AST.UnaryExpr;
          if (!READ_ONLY_UNARY_OPERATORS.has(unary.operator.type)) {
            markWritten(unary.operand);
          }
          break;
        }
        case "Identifier": {
          const global = referencedGlobal(node as AST.IdentifierExpr);
          if (
            global &&
            !read.includes(global) &&
            isPointerGlobal(global) &&
            !unsafe.has(global)
          ) {
            read.push(global);
          }
          break;
        }
      }
    },
    { trackPath: false },
  );

  if (opaque) return [];
  return read.filter(
    (global) =>
      !written.has(global) &&
      !(
        returns &&
        outerDeferred.some((statement) => mentionsGlobal(statement, global))
      ),
  );
}
