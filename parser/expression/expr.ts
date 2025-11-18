import ExpressionType from "../expressionType";
import type { VariableType } from "./variableDeclarationExpr";

export default class Expression {
  constructor(type: ExpressionType) {
    this.type = type;
  }
  public type: ExpressionType;
  public depth: number = 0;
  public requiresSemicolon: boolean = true;

  toString(depth: number = 0): string {
    throw new Error("Method not implemented.");
  }

  log(depth: number = 0): void {
    throw new Error("Method not implemented.");
  }

  transpile(): string {
    throw new Error("Method not implemented.");
  }

  getDepth(): string {
    return " ".repeat(this.depth * 2);
  }

  printType(type: VariableType): string {
    let output = "";
    output += "Type: " + type.name;
    output +=
      ", IsPointer: " +
      (type.isPointer === 1 ? "true" : type.isPointer || "false");
    output +=
      ", IsArray: " + (type.isArray === 1 ? "true" : type.isArray || "false");
    return output;
  }
}
