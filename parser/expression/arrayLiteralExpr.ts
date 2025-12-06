import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { IRType } from "../../transpiler/ir/IRType";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import IdentifierExpr from "./identifierExpr";
import NumberLiteralExpr from "./numberLiteralExpr";

export default class ArrayLiteralExpr extends Expression {
  constructor(public elements: Expression[]) {
    super(ExpressionType.ArrayLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ ArrayLiteral ]\n";
    this.depth++;
    output += this.getDepth() + `Elements:\n`;
    this.depth++;
    for (const element of this.elements) {
      output += element.toString(this.depth);
    }
    this.depth--;
    this.depth--;
    output += this.getDepth() + "/[ ArrayLiteral ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const size = this.elements.length;
    let elemType: IRType = { type: "i64" };

    if (size > 0) {
      const first = this.elements[0];
      if (!first) {
        throw new Error("Array element is undefined");
      }
      if (first.type === ExpressionType.NumberLiteralExpr) {
        const val = (first as NumberLiteralExpr).value;
        elemType =
          val.includes(".") || val.includes("e")
            ? { type: "f64" }
            : { type: "i64" };
      } else if (first.type === ExpressionType.StringLiteralExpr) {
        elemType = { type: "pointer", base: { type: "i8" } };
      } else if (first.type === ExpressionType.IdentifierExpr) {
        const name = (first as IdentifierExpr).name;
        const resolved = scope.resolve(name);
        if (resolved) elemType = gen.getIRType(resolved.varType);
      }
    }

    const arrayType: IRType = { type: "array", base: elemType, size };
    const ptr = gen.emitAlloca(arrayType);

    for (let i = 0; i < size; i++) {
      const element = this.elements[i];
      if (!element) {
        throw new Error(`Array element at index ${i} is undefined`);
      }
      const val = element.toIR(gen, scope);
      const elemPtr = gen.emitGEP(arrayType, ptr, ["0", i.toString()]);
      gen.emitStore(elemType, val, elemPtr);
    }

    return ptr;
  }
}
