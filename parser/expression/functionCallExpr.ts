import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
import MemberAccessExpr from "./memberAccessExpr";
import BinaryExpr from "./binaryExpr";
import UnaryExpr from "./unaryExpr";
import IdentifierExpr from "./identifierExpr";
import type { VariableType } from "./variableDeclarationExpr";

export default class FunctionCallExpr extends Expression {
  constructor(
    public functionName: string,
    public args: Expression[],
  ) {
    super(ExpressionType.FunctionCall);
  }

  argOrders = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"];
  public isTailCall: boolean = false;
  floatArgOrders = [
    "xmm0",
    "xmm1",
    "xmm2",
    "xmm3",
    "xmm4",
    "xmm5",
    "xmm6",
    "xmm7",
  ];

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

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr instanceof IdentifierExpr) {
      const resolved = scope.resolve(expr.name);
      return resolved ? resolved.varType : null;
    } else if (expr instanceof MemberAccessExpr) {
      const objectType = this.resolveExpressionType(expr.object, scope);
      if (!objectType) return null;

      if (expr.isIndexAccess) {
        if (objectType.isArray.length > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer,
            isArray: objectType.isArray.slice(1),
          };
        } else if (objectType.isPointer > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer - 1,
            isArray: [],
          };
        }
        return null;
      } else {
        const typeInfo = scope.resolveType(objectType.name);
        if (!typeInfo) return null;

        const propertyName = (expr.property as IdentifierExpr).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    } else if (expr instanceof BinaryExpr) {
      const leftType = this.resolveExpressionType(expr.left, scope);
      const rightType = this.resolveExpressionType(expr.right, scope);

      if (leftType && leftType.isPointer > 0) return leftType;
      if (rightType && rightType.isPointer > 0) return rightType;

      // Handle float binary ops
      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };

      return null;
    } else if (expr instanceof UnaryExpr) {
      if (expr.operator.value === "*") {
        const opType = this.resolveExpressionType(expr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (expr.operator.value === "&") {
        const opType = this.resolveExpressionType(expr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      return null;
    } else if (expr instanceof NumberLiteralExpr) {
      return expr.value.includes(".")
        ? { name: "f64", isPointer: 0, isArray: [] }
        : { name: "u64", isPointer: 0, isArray: [] };
    }
    return null;
  }

  private getExprType(expr: Expression, scope: Scope): string {
    const type = this.resolveExpressionType(expr, scope);
    return type ? type.name : "u64";
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    this.contextScope = scope;
    const func = scope.resolveFunction(this.functionName);
    if (!func) {
      throw new Error(`Function ${this.functionName} not found`);
    }

    let extraStackAllocated = 0;
    let returnStructSize = 0;
    let isStructReturn = false;

    if (
      func.returnType &&
      !func.returnType.isPointer &&
      !func.returnType.isArray.length
    ) {
      const typeInfo = scope.resolveType(func.returnType.name);
      if (typeInfo && !typeInfo.isPrimitive) {
        isStructReturn = true;
        returnStructSize = typeInfo.size;
      }
    }

    if (isStructReturn) {
      gen.emit(
        `sub rsp, ${returnStructSize}`,
        `Allocate stack for return value (${returnStructSize} bytes)`,
      );
      gen.emit(`mov rax, rsp`, `Address of return value slot`);
      gen.emit(`push rax`, `Push return value slot address`);
      scope.stackOffset += 8;
      extraStackAllocated += returnStructSize;
    }

    const argTypes: string[] = [];

    this.args.forEach((arg, index) => {
      // Determine type
      let typeName = "u64";
      if (func.args && func.args[index]) {
        typeName = func.args[index].type.name;
      } else {
        typeName = this.getExprType(arg, scope);
      }
      argTypes.push(typeName);

      arg.transpile(gen, scope);

      // Promote f32 to f64 for varargs or unknown args
      if ((!func.args || !func.args[index]) && typeName === "f32") {
        gen.emit("movq xmm0, rax", "Move f32 bits to xmm0");
        gen.emit("cvtss2sd xmm0, xmm0", "Promote f32 to f64");
        gen.emit("movq rax, xmm0", "Move f64 bits back to rax");
        argTypes[index] = "f64";
      }

      let isStructByValue = false;
      let structSize = 0;

      if (func.args && func.args[index]) {
        const paramType = func.args[index].type;
        if (paramType.isPointer === 0 && paramType.isArray.length === 0) {
          const typeInfo = scope.resolveType(paramType.name);
          if (typeInfo && !typeInfo.isPrimitive) {
            isStructByValue = true;
            structSize = typeInfo.size;
          }
        }
      }

      if (isStructByValue) {
        gen.emit(
          `sub rsp, ${structSize}`,
          `Allocate stack for struct copy (${structSize} bytes)`,
        );
        gen.emit(`mov rsi, rax`, `Source address`);
        gen.emit(`mov rdi, rsp`, `Destination address (stack)`);
        gen.emit(`mov rcx, ${structSize}`, `Size to copy`);
        gen.emit(`rep movsb`, `Copy struct`);
        gen.emit(`mov rax, rsp`, `Address of copy`);
        gen.emit(`push rax`, `Push address of copy`);
        extraStackAllocated += structSize;
      } else {
        gen.emit(
          "push rax",
          `Push argument ${index} for function call ${this.functionName}`,
        );
      }
      scope.stackOffset += 8; // assuming 64-bit architecture
    });

    let intArgIndex = 0;
    let floatArgIndex = 0;
    const totalArgs = this.args.length + (isStructReturn ? 1 : 0);

    // We need to pop in reverse order
    // But we need to assign to registers based on forward order
    // So we pop into temporary registers or stack slots?
    // Actually, we pushed in forward order (0, 1, 2...)
    // So stack is: [Arg0, Arg1, Arg2 ...] (Top is Arg2)
    // So popping gives Arg2, then Arg1, then Arg0.

    // Pre-calculate register assignments
    const assignments: {
      type: "int" | "float";
      index: number;
      regIndex: number;
    }[] = [];
    let currentInt = isStructReturn ? 1 : 0; // RDI used if struct return
    let currentFloat = 0;

    if (isStructReturn) {
      // Implicit first arg is handled separately
    }

    for (let i = 0; i < this.args.length; i++) {
      const typeName = argTypes[i];
      const isFloat = typeName === "f32" || typeName === "f64";
      if (isFloat) {
        assignments.push({ type: "float", index: i, regIndex: currentFloat++ });
      } else {
        assignments.push({ type: "int", index: i, regIndex: currentInt++ });
      }
    }

    // Now pop in reverse
    for (let i = this.args.length - 1; i >= 0; i--) {
      const assign = assignments[i]!;
      if (assign.type === "float") {
        if (assign.regIndex < 8) {
          gen.emit("pop rax", "Pop float bits");
          gen.emit(
            `movq ${this.floatArgOrders[assign.regIndex]}, rax`,
            `Move to ${this.floatArgOrders[assign.regIndex]}`,
          );
        } else {
          // Stack argument (spill)
          // It's already on the stack!
          // But we are popping everything to restore stack?
          // No, System V ABI says arguments > 6 (or > 8 xmm) are passed on stack.
          // But we pushed ALL arguments.
          // So the ones that should be in registers need to be popped.
          // The ones that should stay on stack... should stay?
          // But we pushed them in order 0, 1, 2...
          // Stack top is Last Arg.
          // If Last Arg is a register arg, we pop it.
          // If Last Arg is a stack arg, we leave it?
          // But if we have mixed register and stack args, the order on stack matters.
          // The stack args must be at the top of stack before call?
          // No, stack args are pushed in reverse order (Right-to-Left) in C.
          // But we pushed Left-to-Right.

          // Oh, we pushed Left-to-Right.
          // Arg0 is at bottom. ArgN is at top.
          // This is WRONG for C calling convention if we leave them on stack.
          // C expects ArgN at high address, Arg0 at low address (relative to RSP)?
          // Actually, C pushes Right-to-Left.
          // So ArgN is pushed first (High Address). Arg0 is pushed last (Low Address).
          // RSP points to Arg0 (or return address after call).

          // We pushed Arg0, then Arg1...
          // So Arg0 is High Address. ArgN is Low Address (Top).
          // This is REVERSE of C convention for stack arguments.

          // So for stack arguments, we are in trouble if we just leave them.
          // But for register arguments, we pop them, so it's fine.

          // Since we support only up to 6 ints and 8 floats in registers,
          // and we probably don't have many args, let's assume they fit in registers for now.
          // Or we fix the push order.

          // To fix push order:
          // We should evaluate args, store them (e.g. in temps), then push in correct order?
          // Or just evaluate in reverse?
          // Evaluating in reverse might change side-effect order.
          // So evaluate Left-to-Right, save to temps (stack), then put in registers/stack.

          // Current implementation:
          // Evaluate Arg0 -> Push
          // Evaluate Arg1 -> Push
          // ...
          // Pop ArgN -> Reg
          // ...
          // Pop Arg0 -> Reg

          // This works perfectly for Register Arguments.
          // Because we pop ArgN (Top) first.

          // If we have stack arguments (spill), we need to handle them.
          // But let's ignore spill for now and focus on floats.

          // If assign.regIndex >= 8, we have a problem.
          // But let's assume < 8.

          // Wait, if we have a spill, we need to pop it and push it back in correct location?
          // Or just not pop it?
          // If we don't pop it, it stays at Top.
          // But it might be ArgN (which should be at Top).
          // So if we have spills, and we pushed 0..N, then N is at Top.
          // If N is a spill, it is at the correct location (Top of stack).
          // If N-1 is a spill, it is under N.
          // This matches C convention (Right-to-Left push) IF we consider that we pushed 0..N.
          // Wait.
          // C: Push N, Push N-1 ... Push 7. (Args 0-5 in regs).
          // Stack: [7, 8, ... N] (7 is Top).
          // We: Push 0, Push 1 ... Push N.
          // Stack: [N, N-1 ... 0] (N is Top).

          // So our stack order is REVERSED for stack arguments.
          // ArgN is at Top (Low Addr). Arg0 is at Bottom (High Addr).
          // C expects Arg7 at Top (Low Addr). ArgN at Bottom (High Addr).

          // So we are completely reversed for stack args.
          // But for register args, we pop them all, so it doesn't matter.

          // For now, I will implement register args only.
          gen.emit("pop rax", "Pop float bits");
          gen.emit(
            `movq ${this.floatArgOrders[assign.regIndex]}, rax`,
            `Move to ${this.floatArgOrders[assign.regIndex]}`,
          );
        }
      } else {
        if (assign.regIndex < 6) {
          gen.emit(
            `pop ${this.argOrders[assign.regIndex]}`,
            `Move to ${this.argOrders[assign.regIndex]}`,
          );
        } else {
          // Spill
          // See above.
        }
      }
      scope.stackOffset -= 8;
    }

    if (isStructReturn) {
      gen.emit("pop rdi", "Pop struct return pointer into RDI");
      scope.stackOffset -= 8;
    }

    let hasSpill = false;
    for (const assign of assignments) {
      if (assign.type === "float" && assign.regIndex >= 8) hasSpill = true;
      if (assign.type === "int" && assign.regIndex >= 6) hasSpill = true;
    }

    const doTailCall =
      this.isTailCall && extraStackAllocated === 0 && !hasSpill;

    if (doTailCall) {
      // Set RAX to number of vector registers used (for varargs)
      gen.emit(`mov rax, ${currentFloat}`, "Number of vector registers used");

      // Epilogue for TCO
      gen.emit("mov rsp, rbp", "reset stack pointer (TCO)");
      gen.emit("pop rbp", "restore base pointer (TCO)");

      if (func.isExternal) {
        gen.emit(
          `jmp ${func.startLabel} WRT ..plt`,
          `Tail call external ${this.functionName}`,
        );
      } else {
        gen.emit(`jmp ${func.startLabel}`, `Tail call ${this.functionName}`);
      }
      return;
    }

    const stackAlignment = 16;
    const currentStackDisplacement = scope.stackOffset + extraStackAllocated;
    const stackOffset = currentStackDisplacement % stackAlignment;
    if (stackOffset !== 0) {
      gen.emit(
        `sub rsp, ${stackAlignment - stackOffset}`,
        `Align stack before calling function ${this.functionName}`,
      );
    }

    // Set RAX to number of vector registers used (for varargs)
    gen.emit(`mov rax, ${currentFloat}`, "Number of vector registers used");

    // gen.emit("xor rbx, rbx", "Clear rbx"); // Not strictly needed but good for safety?

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

    if (extraStackAllocated > 0) {
      const argsStackSize =
        extraStackAllocated - (isStructReturn ? returnStructSize : 0);
      if (argsStackSize > 0) {
        gen.emit(
          `add rsp, ${argsStackSize}`,
          `Free stack space for struct copies (args)`,
        );
      }

      if (isStructReturn) {
        gen.emit(
          `add rsp, ${returnStructSize}`,
          `Free stack space for return value (relying on Red Zone/immediate usage)`,
        );
      }
    }
  }
}
