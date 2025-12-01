import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class ArrayLiteralExpr extends Expression {
  constructor(public elements: Expression[]) {
    super(ExpressionType.ArrayLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ ArrayLiteral ]\n";
    this.depth++;
    output += this.getDepth() + `Elements:\n`;
    this.depth++;
    for (const element of this.elements) {
      output += element.toString(this.depth);
    }
    this.depth--;
    this.depth--;
    output += this.getDepth() + "/[ ArrayLiteral ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      this.elements[i]!.transpile(gen, scope);
      gen.emit("push rax", "Pushing array element onto stack");
      scope.stackOffset += 8;
    }
    gen.emit("mov rax, rsp", "Setting rax to point to start of array literal");
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const size = this.elements.length;
    const arrayType = `[${size} x i64]`;
    const ptr = gen.generateReg("array_lit");
    gen.emit(`${ptr} = alloca ${arrayType}, align 8`);

    for (let i = 0; i < size; i++) {
      const val = this.elements[i]!.generateIR(gen, scope);
      const elemPtr = gen.generateReg("elem_ptr");
      gen.emit(
        `${elemPtr} = getelementptr ${arrayType}, ptr ${ptr}, i64 0, i64 ${i}`,
      );
      gen.emit(`store i64 ${val}, ptr ${elemPtr}`);
    }

    return ptr;
  }
}
