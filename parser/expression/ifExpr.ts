import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import type BlockExpr from "./blockExpr";
import Expression from "./expr";

export default class IfExpr extends Expression {
  constructor(
    public condition: Expression,
    public thenBranch: BlockExpr,
    public elseBranch: BlockExpr | null,
  ) {
    super(ExpressionType.IfExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ IfExpr ]\n";
    this.depth++;
    output += this.getDepth() + " Condition:\n";
    output += this.condition.toString(depth + 1);
    output += this.getDepth() + " Then Branch:\n";
    output += this.thenBranch.toString(depth + 1);
    if (this.elseBranch) {
      output += this.getDepth() + " Else Branch:\n";
      output += this.elseBranch.toString(depth + 1);
    }

    this.depth--;
    output += this.getDepth() + "/[ IfExpr ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    const label = gen.generateLabel("if_");
    const conditionLabel = `${label}_condition`;
    const thenLabel = `${label}_then`;
    const endLabel = `${label}_end`;
    const elseLabel = this.elseBranch ? `${label}_else` : endLabel;

    gen.emitLabel(conditionLabel);
    this.condition.transpile(gen, scope);
    gen.emit(`cmp rax, 0`, "compare condition result to 0");
    gen.emit(`je ${elseLabel}`, "jump to else branch if condition is false");

    gen.emitLabel(thenLabel);
    this.thenBranch.transpile(gen, scope);
    gen.emit(`jmp ${endLabel}`, "jump to end after then branch");

    if (this.elseBranch) {
      gen.emitLabel(elseLabel);
      this.elseBranch.transpile(gen, scope);
    }

    gen.emitLabel(endLabel);
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const cond = this.condition.generateIR(gen, scope);
    const thenLabel = gen.generateLabel("then");
    const elseLabel = gen.generateLabel("else");
    const endLabel = gen.generateLabel("if_end");

    const condReg = gen.generateReg("cond");
    gen.emit(`${condReg} = icmp ne i64 ${cond}, 0`);

    if (this.elseBranch) {
      gen.emit(`br i1 ${condReg}, label %${thenLabel}, label %${elseLabel}`);

      gen.emitLabel(thenLabel);
      this.thenBranch.generateIR(gen, scope);
      gen.emit(`br label %${endLabel}`);

      gen.emitLabel(elseLabel);
      this.elseBranch.generateIR(gen, scope);
      gen.emit(`br label %${endLabel}`);
    } else {
      gen.emit(`br i1 ${condReg}, label %${thenLabel}, label %${endLabel}`);

      gen.emitLabel(thenLabel);
      this.thenBranch.generateIR(gen, scope);
      gen.emit(`br label %${endLabel}`);
    }

    gen.emitLabel(endLabel);
    return "";
  }
}
