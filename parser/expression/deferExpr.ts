/**
 * DeferExpr - Implements the 'defer' statement for resource management
 *
 * The defer statement schedules a block of code to be executed when the
 * current function exits, regardless of how it exits (return, throw, or
 * reaching the end of the function).
 *
 * BEHAVIOR:
 * - Deferred expressions are executed in LIFO (Last-In-First-Out) order
 * - If you have: defer A; defer B; defer C; they execute as: C, B, A
 * - Deferred code runs BEFORE the function actually returns
 * - Deferred code runs even if an exception is thrown (cleanup guarantee)
 *
 * USAGE:
 *   frame example() {
 *       local file: *u8 = call fopen("test.txt", "r");
 *       defer { call fclose(file); }  // Will run when function exits
 *
 *       // ... do work with file ...
 *       // fclose will be called automatically
 *   }
 *
 * IMPLEMENTATION:
 * - When a defer statement is encountered, the body expression is stored
 *   in the function's defer stack (managed by Scope)
 * - The actual IR generation for the deferred code happens at function
 *   exit points (return statements and function end)
 * - This class only registers the defer; execution is handled by
 *   ReturnExpr and FunctionDeclarationExpr
 *
 * SIMILAR TO:
 * - Go's defer statement
 * - Swift's defer statement
 * - Zig's defer keyword
 * - C++ RAII / scope guards
 */

import { CompilerError } from "../../errors";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class DeferExpr extends Expression {
  /**
   * The body of the defer statement - code to execute on function exit
   */
  public body: Expression;

  constructor(body: Expression) {
    super(ExpressionType.DeferExpression);
    this.body = body;
    this.requiresSemicolon = false; // Block doesn't need semicolon
  }

  /**
   * Returns a string representation of the defer expression for debugging
   */
  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += `[ DeferExpr ]\n`;
    this.depth++;
    output += this.getDepth() + `Body:\n`;
    output += this.body.toString(this.depth + 1);
    this.depth--;
    output += this.getDepth() + `/[ DeferExpr ]\n`;
    return output;
  }

  /**
   * Optimizes the defer expression by optimizing its body
   */
  optimize(): Expression {
    this.body = this.body.optimize();
    return this;
  }

  /**
   * IR Generation for defer statement
   *
   * Unlike most expressions, defer does NOT generate IR code at the point
   * where it's encountered. Instead, it registers the deferred expression
   * with the current function scope. The actual IR will be generated later
   * at function exit points.
   *
   * @param gen - The IR generator
   * @param scope - The current scope
   * @returns Empty string (no immediate IR output)
   * @throws CompilerError if defer is used outside a function
   */
  toIR(gen: IRGenerator, scope: Scope): string {
    // Verify we're inside a function
    const functionContext = scope.getCurrentContext("function");
    if (!functionContext || functionContext.type !== "function") {
      throw new CompilerError(
        "defer statement must be inside a function",
        this.startToken?.line ?? 0,
        this.startToken?.column ?? 0,
        this.startToken?.fileName,
      );
    }

    // Register this defer expression with the scope
    // The scope will track all deferred expressions for the current function
    // They will be executed in reverse order (LIFO) when the function exits
    scope.addDeferredExpression(this.body);

    // No IR is generated here - the deferred code will be emitted
    // at function exit points (return statements and function end)
    return "";
  }
}
