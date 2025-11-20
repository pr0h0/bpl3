import type AsmGenerator from "../../transpiler/AsmGenerator";
import HelperGenerator from "../../transpiler/HelperGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class ProgramExpr extends Expression {
  public constructor() {
    super(ExpressionType.Program);
  }

  expressions: Expression[] = [];

  public addExpression(expr: Expression): void {
    this.expressions.push(expr);
  }

  public toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Program ]\n";
    for (const expr of this.expressions) {
      output += expr.toString(this.depth + 1);
    }
    output += this.getDepth() + "/[ Program ]\n";
    return output;
  }

  public log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    // We can assume 'scope' passed here is the Global Scope

    // Generate Helper Functions like print(value: any with max len 20 bytes) and exit(status: int)
    HelperGenerator.generateHelperFunctions(gen, scope);
    // 1. Entry point label
    gen.emitLabel("_start");

    // Call precompute section to initialize any precomputed values like globals
    gen.emit("call _precompute", "call precompute section");

    // 2. Standard Prologue (Setup Stack)
    gen.emit("push rbp");
    gen.emit("mov rbp, rsp");

    // 3. Transpile all children
    for (const expr of this.expressions) {
      expr.transpile(gen, scope);
    }

    // 4. Standard Epilogue (Exit with 0)
    gen.emit("mov rax, 60", "syscall: exit");
    gen.emit("mov rdi, 0", "status: 0");
    gen.emit("syscall");

    HelperGenerator.generateExitFunction(gen, scope);
  }
}
