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

  optimize(): Expression {
    this.body = this.body.optimize();
    return this;
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
      returnType: this.returnType,
    });

    // Function prologue
    gen.emit("push rbp", "save base pointer");
    gen.emit("mov rbp, rsp", "set new base pointer");

    let isStructReturn = false;
    if (
      this.returnType &&
      !this.returnType.isPointer &&
      !this.returnType.isArray.length
    ) {
      const typeInfo = scope.resolveType(this.returnType.name);
      if (typeInfo && !typeInfo.isPrimitive) {
        isStructReturn = true;
      }
    }

    // Set up function arguments in the new scope
    if (this.args.length > 0 || isStructReturn) {
      const stackSpace = (this.args.length + (isStructReturn ? 1 : 0)) * 8;
      gen.emit(`sub rsp, ${stackSpace}`, "allocate space for arguments");
    }

    if (isStructReturn) {
      const offset = funcScope.allocLocal(8);
      gen.emit(`mov [rbp - ${offset}], rdi`, `store hidden return pointer`);
      funcScope.define("__return_slot__", {
        offset: offset.toString(),
        type: "local",
        varType: { name: "u64", isPointer: 1, isArray: [] }, // Treat as pointer
      });
    }

    let intArgIndex = isStructReturn ? 1 : 0;
    let floatArgIndex = 0;

    this.args.forEach((arg, index) => {
      const offset = funcScope.allocLocal(8);
      let reg = "";
      const isFloat = arg.type.name === "f32" || arg.type.name === "f64";

      if (isFloat) {
        if (floatArgIndex < 8) {
          reg = `xmm${floatArgIndex++}`;
        }
      } else {
        if (intArgIndex < this.argOrders.length) {
          reg = this.argOrders[intArgIndex++]!;
        }
      }

      if (reg) {
        if (isFloat) {
          gen.emit(`movq rax, ${reg}`, `Move float arg ${arg.name} to rax`);
          gen.emit(
            `mov [rbp - ${offset}], rax`,
            `store argument ${arg.name} (float)`,
          );
        } else {
          gen.emit(
            `mov [rbp - ${offset}], ${reg}`,
            `store argument ${arg.name}`,
          );
        }
      } else {
        // Handle arguments passed on stack (if > 6 args)
        // For now, assume < 6 args + return pointer
        // Stack args are at [rbp + 16 + (index - 6) * 8]
        // But we need to account for return pointer shifting registers
        // This is getting complicated for > 6 args.
        // Let's assume < 6 args for now.
        throw new Error(
          "Too many arguments (stack passing not fully implemented with struct return)",
        );
      }

      funcScope.define(arg.name, {
        offset: offset.toString(),
        type: "local",
        varType: arg.type,
        isParameter: true,
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
