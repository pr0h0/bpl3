import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class FunctionCallExpr extends Expression {
  constructor(
    public functionName: string,
    public args: Expression[],
  ) {
    super(ExpressionType.FunctionCall);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + `[ FunctionCall: ${this.functionName} ]\n`;
    this.depth++;
    for (const arg of this.args) {
      output += arg.toString(depth + 1);
    }
    this.depth--;
    output += this.getDepth() + `/[ FunctionCall ]\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  argOrders: string[] = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit(`; call function ${this.functionName}`, "func_call");
    this.args.forEach((arg, index) => {
      if (index < this.argOrders.length) {
        arg.transpile(gen, scope);
        gen.emit(
          `mov ${this.argOrders[index]}, rax`,
          `Move argument ${index + 1} into ${this.argOrders[index]}`,
        );
      } else {
        throw new Error(
          `Function calls with more than ${this.argOrders.length} arguments are not supported.`,
        );
      }
    });

    gen.emit(`call ${this.functionName}`, "call_instr");
  }
}
