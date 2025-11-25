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

  transpile(gen: AsmGenerator, scope: Scope): void {
    const func = scope.resolveFunction(this.functionName);
    if (!func) {
      throw new Error(`Function ${this.functionName} not found`);
    }

    this.args.forEach((arg, index) => {
      arg.transpile(gen, scope);
      gen.emit(
        "push rax",
        `Push argument ${index} for function call ${this.functionName}`,
      );
      scope.stackOffset += 8; // assuming 64-bit architecture
    });

    for (let i = this.args.length - 1; i >= 0; i--) {
      gen.emit(
        `pop ${this.argOrders[i]}`,
        `Move argument ${i} into correct register for function call ${this.functionName}`,
      );
      scope.stackOffset -= 8;
    }

    const stackAlignment = 16;
    const stackOffset = scope.stackOffset % stackAlignment;
    if (stackOffset !== 0) {
      gen.emit(
        `sub rsp, ${stackAlignment - stackOffset}`,
        `Align stack before calling function ${this.functionName}`,
      );
    }

    gen.emit(
      "xor rax, rax",
      `Clear rax before calling function ${this.functionName}`,
    );
    gen.emit(
      "xor rbx, rbx",
      `Clear rbx before calling function ${this.functionName}`,
    );
    if (func.isExternal) {
      gen.emit(
        `call ${func.startLabel} WRT ..plt`,
        `Call external function ${this.functionName}`,
      );
    } else {
      gen.emit(`call ${func.startLabel}`, `Call function ${this.functionName}`);
    }

    if (stackOffset !== 0) {
      gen.emit(
        `add rsp, ${stackAlignment - stackOffset}`,
        `Restore stack after calling function ${this.functionName}`,
      );
    }
  }
}
