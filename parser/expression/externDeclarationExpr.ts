import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

export default class ExternDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public args: { type: VariableType; name: string }[],
    public returnType: VariableType | null,
    public isVariadic: boolean = false,
  ) {
    super(ExpressionType.ExternDeclaration);
    this.requiresSemicolon = true;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ ExternDeclaration ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    output += this.getDepth() + `Arguments:\n`;
    this.depth++;
    for (const arg of this.args) {
      output +=
        this.getDepth() + `Name: ${arg.name}, ${this.printType(arg.type)}\n`;
    }
    if (this.isVariadic) {
      output += this.getDepth() + `...\n`;
    }
    this.depth--;
    if (this.returnType) {
      output +=
        this.getDepth() + `Return Type: ${this.printType(this.returnType)}\n`;
    } else {
      output += this.getDepth() + `Return Type: void\n`;
    }
    this.depth--;
    output += this.getDepth() + `/[ ExternDeclaration ]\n`;

    return output;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const existingFunc = scope.resolveFunction(this.name);
    if (!existingFunc || !existingFunc.isExternal) {
      throw new Error(
        `Function ${this.name} is not defined, or it's already defined and is not external.`,
      );
    }

    scope.defineFunction(this.name, {
      args: this.args,
      returnType: this.returnType,
      endLabel: this.name + "_end",
      label: this.name,
      name: this.name,
      startLabel: this.name,
      isExternal: true,
      isVariadic: this.isVariadic,
    });
  }
}
