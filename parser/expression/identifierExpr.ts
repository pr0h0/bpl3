import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class IdentifierExpr extends Expression {
  constructor(public name: string) {
    super(ExpressionType.IdentifierExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Identifier ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    this.depth--;
    output += this.getDepth() + "/[ Identifier ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const symbol = scope.resolve(this.name);
    if (!symbol) {
      // Check for function
      const func = scope.resolveFunction(this.name);
      if (func) {
        return `@${func.name}`;
      }
      throw new Error(`Undefined identifier: ${this.name}`);
    }

    if (!symbol.irName) {
      throw new Error(`Variable ${this.name} has no IR representation`);
    }

    // Array decay
    if (symbol.varType.isArray.length > 0) {
      const type = gen.getIRType(symbol.varType);
      return gen.emitGEP(type, symbol.irName, ["0", "0"]);
    }

    const type = gen.getIRType(symbol.varType);
    // If it's a struct, we might want to return the pointer if it's too large?
    // But for consistency, let's load it.
    // Optimization: if we are just passing it to a function that takes a pointer, we shouldn't load.
    // But `toIR` is generic.
    return gen.emitLoad(type, symbol.irName);
  }

  getAddress(gen: IRGenerator, scope: Scope): string {
    const symbol = scope.resolve(this.name);
    if (!symbol) throw new Error(`Undefined identifier: ${this.name}`);
    if (!symbol.irName)
      throw new Error(`Variable ${this.name} has no IR representation`);
    return symbol.irName;
  }
}
