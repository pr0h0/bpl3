import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const varInfo = scope.resolve(this.name);
    if (!varInfo) {
      throw new Error(`Undefined variable: ${this.name}`);
    }

    if (varInfo.type === "global") {
      const label = varInfo.label;
      gen.emit(`mov rax, [${label}]`, `load global variable ${this.name}`);
    } else {
      throw new Error(
        `Local variable access not implemented for: ${this.name}`,
      );
    }
  }
}
