import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class MemberAccessExpr extends Expression {
  constructor(
    public object: Expression,
    public property: Expression, // since it can be identifier or expression (for index access)
    public isIndexAccess: boolean,
  ) {
    super(ExpressionType.MemberAccessExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ MemberAccess ]\n";
    this.depth++;
    output += this.object.toString(this.depth + 1);
    output +=
      this.getDepth() + `Property: \n${this.property.toString(this.depth + 1)}`;
    output += this.getDepth() + `IsIndexAccess: ${this.isIndexAccess}\n`;
    this.depth--;
    output += this.getDepth() + "/[ MemberAccess ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit("; not yet implemented", "Member access expression");
    this.object.transpile(gen, scope);
    this.property.transpile(gen, scope);
    gen.emit("; end not yet implemented", "Member access expression");
  }
}
