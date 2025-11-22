import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
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

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.args.length > this.argOrders.length) {
      throw new Error(
        `Function declarations with more than ${this.argOrders.length} arguments are not supported.`,
      );
    }

    const localScope = new Scope(scope);

    const funcLabel =
      this.name === "main" ? "main" : gen.generateLabel(`func_${this.name}_`);
    const endLabel = `${funcLabel}_end`;

    scope.defineFunction(this.name, funcLabel);

    gen.emitLabel(funcLabel);
    gen.emit("", `func_begin ${this.name}`);
    gen.emit("push rbp", "Function prologue");
    gen.emit("mov rbp, rsp");

    if (this.args.length) {
      gen.emit(
        "sub rsp, " + this.args.length * 8,
        `Allocate space for arguments`,
      );
    }

    this.args.forEach((arg, index) => {
      const offset = localScope.allocLocal(8); // Assuming 8 bytes for each argument which is 64-bit
      localScope.define(arg.name, { type: "local", offset: offset });
      gen.emit(
        `mov [rbp - ${offset}], ${this.argOrders[index]}`,
        `func_param ${arg.name}: ${this.printType(arg.type)}`,
      );
    });

    localScope.setCurrentContext({
      type: "function",
      label: funcLabel,
      endLabel: endLabel,
    });
    this.body.transpile(gen, localScope);
    localScope.removeCurrentContext("function");

    gen.emitLabel(endLabel);
    gen.emit("mov rsp, rbp", "Function epilogue");
    gen.emit("pop rbp");
    gen.emit("ret");
    gen.emit("", `func_end ${this.name}`);
  }
}
