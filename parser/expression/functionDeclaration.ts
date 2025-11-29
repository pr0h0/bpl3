import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";
import Token from "../../lexer/token";

export default class FunctionDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public args: { type: VariableType; name: string }[],
    public returnType: VariableType | null,
    public body: Expression,
    public nameToken?: Token,
    public isVariadic: boolean = false,
    public variadicType: VariableType | null = null,
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
    if (this.isVariadic && this.variadicType) {
      output +=
        this.getDepth() +
        `Variadic: ...:${this.printType(this.variadicType)}\n`;
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

    const existingFunc = scope.resolveFunction(this.name);
    if (existingFunc) {
      // Update existing function definition (e.g. from SemanticAnalyzer or forward declaration)
      existingFunc.label = label;
      existingFunc.startLabel = label;
      existingFunc.endLabel = endLabel;
      // We could also verify that args and return type match here
    } else {
      scope.defineFunction(this.name, {
        args: this.args,
        returnType: this.returnType,
        endLabel: endLabel,
        label: label,
        name: this.name,
        startLabel: label,
        declaration: this.startToken,
        isVariadic: this.isVariadic,
      });
    }

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

    if (this.isVariadic && this.variadicType) {
      // Spill remaining registers to stack for variadic access
      // We only support u64 variadic args for now (GP registers)
      // If variadicType is float, we should spill XMM registers.
      // Assuming u64 for now as per user request.

      const isFloatVariadic =
        this.variadicType.name === "f32" || this.variadicType.name === "f64";

      if (isFloatVariadic) {
        // Spill XMM registers
        const startReg = floatArgIndex;
        const numRegs = 8 - startReg;
        if (numRegs > 0) {
          const spillSize = numRegs * 8;
          gen.emit(
            `sub rsp, ${spillSize}`,
            `allocate space for variadic float registers`,
          );
          const baseOffset = funcScope.stackOffset + spillSize; // Offset from RBP to start of spill area (bottom)
          // Actually, let's just allocate and store.
          // We want them contiguous.
          // [xmm0, xmm1, ...]
          // If we push, we get reverse order?
          // Let's use mov.
          for (let i = 0; i < numRegs; i++) {
            const regIndex = startReg + i;
            const offset = funcScope.allocLocal(8);
            gen.emit(`movq rax, xmm${regIndex}`, `Move variadic arg to rax`);
            gen.emit(
              `mov [rbp - ${offset}], rax`,
              `store variadic arg (xmm${regIndex})`,
            );
          }
          // Define a special variable to know where the register save area starts
          // The first variadic register is at [rbp - (baseOffset - (numRegs-1)*8)]?
          // No, we allocated sequentially.
          // First (startReg) is at [rbp - (stackOffset_before + 8)]
          // Last is at [rbp - stackOffset_after]
          // So they are contiguous in memory:
          // High Addr: [Arg0]
          // Low Addr: [ArgN]
          // This is reverse order of array indexing if we want args[0] to be Arg0.
          // args[0] should be at High Addr.
          // args[1] should be at Lower Addr.
          // So args[i] address = Base - i*8.
          // Base = Address of Arg0.
          // Address of Arg0 = rbp - (stackOffset_start + 8).

          funcScope.define("__variadic_start_offset__", {
            offset: (funcScope.stackOffset - numRegs * 8 + 8).toString(), // Offset of the *first* variadic arg (Arg0)
            type: "local",
            varType: this.variadicType,
            isParameter: true, // Mark as parameter-like
          });
          funcScope.define("__variadic_reg_count__", {
            offset: numRegs.toString(), // Store count as offset string (hack)
            type: "local",
            varType: { name: "u64", isPointer: 0, isArray: [] },
            isParameter: true,
          });
        }
      } else {
        // Spill GP registers
        const startReg = intArgIndex;
        const numRegs = 6 - startReg;
        if (numRegs > 0) {
          const spillSize = numRegs * 8;
          gen.emit(
            `sub rsp, ${spillSize}`,
            `allocate space for variadic GP registers`,
          );

          // We want args[0] (startReg) to be at High Address.
          // args[1] at Lower Address.
          // So we store startReg at [rbp - (current + 8)]
          // startReg+1 at [rbp - (current + 16)]

          const startOffset = funcScope.stackOffset + 8;

          for (let i = 0; i < numRegs; i++) {
            const regIndex = startReg + i;
            const offset = funcScope.allocLocal(8);
            gen.emit(
              `mov [rbp - ${offset}], ${this.argOrders[regIndex]}`,
              `store variadic arg (${this.argOrders[regIndex]})`,
            );
          }

          funcScope.define("__variadic_start_offset__", {
            offset: startOffset.toString(),
            type: "local",
            varType: this.variadicType,
            isParameter: true,
          });
          funcScope.define("__variadic_reg_count__", {
            offset: numRegs.toString(),
            type: "local",
            varType: { name: "u64", isPointer: 0, isArray: [] },
            isParameter: true,
          });
        } else {
          // No registers used for variadic, all on stack
          funcScope.define("__variadic_reg_count__", {
            offset: "0",
            type: "local",
            varType: { name: "u64", isPointer: 0, isArray: [] },
            isParameter: true,
          });
        }
      }
    }

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
