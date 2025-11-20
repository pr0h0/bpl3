import type Token from "../../lexer/token";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";

export type StructField = {
  name: string;
  type: VariableType;
};

export default class StructDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public fields: StructField[],
  ) {
    super(ExpressionType.StructureDeclaration);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ StructDeclaration ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Name: ${this.name}\n`;
    output += this.getDepth();
    output += `Fields:\n`;
    this.depth++;
    for (const field of this.fields) {
      output += this.getDepth();
      output += `- Name: ${field.name}, ${this.printType(field.type)}\n`;
    }
    this.depth--;
    this.depth--;
    output += this.getDepth();
    output += "/[ StructDeclaration ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit("; not yet implemented", " Struct Declaration " + this.name);
  }
}
