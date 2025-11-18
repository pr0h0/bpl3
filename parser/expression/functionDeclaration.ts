import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

export default class FunctionDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public args: { type: VariableType; name: string }[],
    public returnType: VariableType | null,
    public body: Expression,
  ) {
    super(ExpressionType.FunctionDeclaration);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ FunctionDeclaration ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    output += this.getDepth() + `Arguments:\n`;
    this.depth++;
    for (const arg of this.args) {
      output +=
        this.getDepth() + `Name: ${arg.name}, ${this.printType(arg.type)}\n`;
    }
    this.depth--;
    if (this.returnType) {
      output +=
        this.getDepth() + `Return Type: ${this.printType(this.returnType)}\n`;
    } else {
      output += this.getDepth() + `Return Type: void\n`;
    }
    output += this.getDepth() + `Body:\n`;
    output += this.body.toString(this.depth + 1);
    this.depth--;
    output += this.getDepth() + `/[ FunctionDeclaration ]\n`;

    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(): string {
    let output = `function ${this.name}(`;
    const argsOutput: string[] = [];
    for (const arg of this.args) {
      argsOutput.push(arg.name + ": " + this.printType(arg.type));
    }
    output += argsOutput.join(", ");
    output += ")";
    if (this.returnType) {
      output += ": " + this.printType(this.returnType);
    }
    output += " {\n";
    output += this.body.transpile() + "\n";
    output += "}";
    return output;
  }
}
