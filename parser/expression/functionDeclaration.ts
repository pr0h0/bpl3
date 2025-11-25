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
    const label = gen.generateLabel(`func_${this.name}_`);
    const endLabel = label + "_end";

    scope.defineFunction(this.name, {
      args: this.args,
      returnType: this.returnType,
      endLabel: endLabel,
      label: label,
      name: this.name,
      startLabel: label,
    });

    if (this.name === "main") {
      gen.emitGlobalDefinition(`_user_main equ ${label}`);
    }
    gen.emitLabel(label);
    const funcScope = new Scope(scope);
    funcScope.setCurrentContext({
      type: "function",
      label: label,
      endLabel: endLabel,
    });

    // Function prologue
    gen.emit("push rbp", "save base pointer");
    gen.emit("mov rbp, rsp", "set new base pointer");
    // funcScope.allocLocal(8); // RBP - Removed to fix stack offset

    // Set up function arguments in the new scope
    if (this.args.length > 0) {
      gen.emit(
        `sub rsp, ${this.args.length * 8}`,
        "allocate space for arguments",
      );
    }
    this.args.forEach((arg, index) => {
      const offset = funcScope.allocLocal(8);
      gen.emit(
        `mov [rbp - ${offset}], ${this.argOrders[index]}`,
        `store argument ${arg.name}`,
      );
      funcScope.define(arg.name, {
        offset: offset.toString(),
        type: "local",
        varType: arg.type,
      });
    });

    // body
    this.body.transpile(gen, funcScope);

    funcScope.removeCurrentContext("function");

    // Function epilogue
    gen.emitLabel(endLabel);
    gen.emit("mov rsp, rbp", "reset stack pointer");
    gen.emit("pop rbp", "restore base pointer");
    gen.emit("ret", "return from function");
    // funcScope.allocLocal(-8); // RBP
  }
}
