import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";
import MemberAccessExpr from "./memberAccessExpr";
import BinaryExpr from "./binaryExpr";
import UnaryExpr from "./unaryExpr";
import IdentifierExpr from "./identifierExpr";
import StringLiteralExpr from "./stringLiteralExpr";
import TernaryExpr from "./ternaryExpr";
import type { VariableType } from "./variableDeclarationExpr";
import TokenType from "../../lexer/tokenType";
import { resolveExpressionType, getIntSize } from "../../utils/typeResolver";

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

  private getExprType(expr: Expression, scope: Scope): string {
    const type = resolveExpressionType(expr, scope);
    return type ? type.name : "u64";
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const initialStackOffset = scope.stackOffset;
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    this.contextScope = scope;
    const func = scope.resolveFunction(this.functionName);
    if (!func) {
      throw new Error(`Function ${this.functionName} not found`);
    }

    // 1. Calculate struct allocation sizes
    let returnStructSize = 0;
    let isStructReturn = false;

    if (
      func.returnType &&
      !func.returnType.isPointer &&
      !func.returnType.isArray.length
    ) {
      let typeInfo;
      if (
        func.returnType.genericArgs &&
        func.returnType.genericArgs.length > 0
      ) {
        typeInfo = scope.resolveGenericType(
          func.returnType.name,
          func.returnType.genericArgs,
        );
      } else {
        typeInfo = scope.resolveType(func.returnType.name);
      }

      if (typeInfo && !typeInfo.isPrimitive) {
        isStructReturn = true;
        returnStructSize = typeInfo.size;
      }
    }

    let argStructsSize = 0;
    const argIsStruct: boolean[] = [];
    const argSizes: number[] = [];

    this.args.forEach((arg, index) => {
      let isStructByValue = false;
      let structSize = 0;

      if (func.args && func.args[index]) {
        const paramType = func.args[index].type;
        if (paramType.isPointer === 0 && paramType.isArray.length === 0) {
          let typeInfo;
          if (paramType.genericArgs && paramType.genericArgs.length > 0) {
            typeInfo = scope.resolveGenericType(
              paramType.name,
              paramType.genericArgs,
            );
          } else {
            typeInfo = scope.resolveType(paramType.name);
          }

          if (typeInfo && !typeInfo.isPrimitive) {
            isStructByValue = true;
            structSize = typeInfo.size;
          }
        }
      }

      argIsStruct.push(isStructByValue);
      argSizes.push(structSize);
      if (isStructByValue) {
        argStructsSize += structSize;
      }
    });

    const totalStructAllocation = returnStructSize + argStructsSize;
    if (totalStructAllocation > 0) {
      gen.emit(
        `sub rsp, ${totalStructAllocation}`,
        `Allocate stack for structs (Return: ${returnStructSize}, Args: ${argStructsSize})`,
      );
    }

    let pushedBytes = 0;
    let currentArgStructOffset = 0;

    // 3. Push Hidden Return Pointer (if needed)
    if (isStructReturn) {
      // Address of return slot = RSP + pushedBytes + argStructsSize
      gen.emit(
        `lea rax, [rsp + ${pushedBytes + argStructsSize}]`,
        `Address of return value slot`,
      );
      gen.emit(`push rax`, `Push return value slot address`);
      pushedBytes += 8;
      scope.stackOffset += 8;
    }

    // 4. Process Arguments
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

      scope.stackOffset += totalStructAllocation;
      arg.transpile(gen, scope);
      scope.stackOffset -= totalStructAllocation;

      // Promote f32 to f64 for varargs or unknown args
      if ((!func.args || !func.args[index]) && typeName === "f32") {
        gen.emit("movq xmm0, rax", "Move f32 bits to xmm0");
        gen.emit("cvtss2sd xmm0, xmm0", "Promote f32 to f64");
        gen.emit("movq rax, xmm0", "Move f64 bits back to rax");
        argTypes[index] = "f64";
      }

      if (argIsStruct[index]) {
        const size = argSizes[index]!;
        // Copy struct to allocated slot
        // Slot address = RSP + pushedBytes + currentArgStructOffset
        gen.emit(`mov rsi, rax`, `Source address`);
        gen.emit(
          `lea rdi, [rsp + ${pushedBytes + currentArgStructOffset}]`,
          `Destination address (stack slot)`,
        );
        gen.emit(`mov rcx, ${size}`, `Size to copy`);
        gen.emit(`rep movsb`, `Copy struct`);

        // Push address of the copy
        gen.emit(
          `lea rax, [rsp + ${pushedBytes + currentArgStructOffset}]`,
          `Address of copy`,
        );
        gen.emit(`push rax`, `Push address of copy`);

        currentArgStructOffset += size;
      } else {
        gen.emit(
          "push rax",
          `Push argument ${index} for function call ${this.functionName}`,
        );
      }
      pushedBytes += 8;
      scope.stackOffset += 8;
    });

    // 5. Pop arguments into registers
    let intArgIndex = 0;
    let floatArgIndex = 0;

    // Assign registers
    const assignments: {
      type: "int" | "float";
      index: number;
      regIndex: number;
    }[] = [];

    let currentInt = isStructReturn ? 1 : 0; // RDI used if struct return
    let currentFloat = 0;

    for (let i = 0; i < this.args.length; i++) {
      const typeName = argTypes[i];
      const isFloat = typeName === "f32" || typeName === "f64";
      if (isFloat) {
        assignments.push({ type: "float", index: i, regIndex: currentFloat++ });
      } else {
        assignments.push({ type: "int", index: i, regIndex: currentInt++ });
      }
    }

    // Pop in reverse order
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
          // Spill handling (omitted for brevity, assuming < 8 floats)
        }
      } else {
        if (assign.regIndex < 6) {
          gen.emit(
            `pop ${this.argOrders[assign.regIndex]}`,
            `Move to ${this.argOrders[assign.regIndex]}`,
          );
        } else {
          // Spill handling (omitted for brevity, assuming < 6 ints)
        }
      }
      scope.stackOffset -= 8;
      pushedBytes -= 8;
    }

    // Pop Hidden Return Pointer if needed
    if (isStructReturn) {
      gen.emit(`pop rdi`, `Pop hidden return pointer into RDI`);
      scope.stackOffset -= 8;
      pushedBytes -= 8;
    }

    // Check for spills (not fully implemented in this fix)
    let hasSpill = false;
    for (const assign of assignments) {
      if (assign.type === "float" && assign.regIndex >= 8) hasSpill = true;
      if (assign.type === "int" && assign.regIndex >= 6) hasSpill = true;
    }

    const doTailCall =
      this.isTailCall && totalStructAllocation === 0 && !hasSpill;

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
    // Calculate current stack alignment
    // We have 'totalStructAllocation' on stack.
    // Plus 'temps' (locals).
    const temps = scope.stackOffset - scope.localsOffset;
    // Note: scope.stackOffset currently tracks pushes (which are 0 now) + locals.
    // But we have 'totalStructAllocation' which is NOT in scope.stackOffset.

    const totalStackOffset = temps + totalStructAllocation;
    const stackOffset = totalStackOffset % stackAlignment;

    if (stackOffset !== 0) {
      gen.emit(
        `sub rsp, ${stackAlignment - stackOffset}`,
        `Align stack before calling function ${this.functionName}`,
      );
    }

    // Set RAX to number of vector registers used (for varargs)
    gen.emit(`mov rax, ${currentFloat}`, "Number of vector registers used");

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

    // 6. Cleanup Struct Copies (Args only)
    // We keep Return Slot (if any).
    if (argStructsSize > 0) {
      gen.emit(
        `add rsp, ${argStructsSize}`,
        `Deallocate stack space for argument structs`,
      );
    }

    // Note: Return Slot remains on stack.
    // We need to update scope.stackOffset to reflect this, so future pushes don't overwrite it.
    if (isStructReturn) {
      scope.stackOffset += returnStructSize;
    }

    scope.stackOffset =
      initialStackOffset + (isStructReturn ? returnStructSize : 0);
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const func = scope.resolveFunction(this.functionName);
    if (!func) {
      throw new Error(`Function ${this.functionName} not found`);
    }

    const argValues: string[] = [];
    const argTypes: string[] = [];

    this.args.forEach((arg, index) => {
      const val = arg.generateIR(gen, scope);
      argValues.push(val);

      // Determine type
      let typeName = "i64"; // Default
      let isPointer = 0;
      let isArray: number[] = [];
      let genericArgs: VariableType[] | undefined = undefined;

      // If we have function definition, use expected type for fixed args
      if (func.args && func.args[index]) {
        const paramType = func.args[index].type;
        typeName = paramType.name;
        isPointer = paramType.isPointer;
        isArray = paramType.isArray;
        genericArgs = paramType.genericArgs;

        // Handle implicit casting for fixed args
        const exprType = resolveExpressionType(arg, scope);
        const exprTypeName = exprType ? exprType.name : "i64";
        const exprIsPointer = exprType ? exprType.isPointer : 0;
        const exprIsArray = exprType ? exprType.isArray.length : 0;

        // Check for int size mismatch
        const paramSize = getIntSize(typeName);
        const exprSize = getIntSize(exprTypeName);

        if (!isPointer && !isArray.length && !exprIsPointer && !exprIsArray) {
          const isParamFloat = typeName === "f64" || typeName === "f32";
          const isExprFloat = exprTypeName === "f64" || exprTypeName === "f32";

          if (isParamFloat && !isExprFloat) {
            // Int to Float
            const conv = gen.generateReg("sitofp");
            const destType = gen.mapType(paramType);
            const srcType = gen.mapType({
              name: exprTypeName,
              isPointer: 0,
              isArray: [],
            });
            gen.emit(`${conv} = sitofp ${srcType} ${val} to ${destType}`);
            argValues[index] = conv;
          } else if (!isParamFloat && isExprFloat) {
            // Float to Int
            const conv = gen.generateReg("fptosi");
            const destType = gen.mapType(paramType);
            const srcType = gen.mapType({
              name: exprTypeName,
              isPointer: 0,
              isArray: [],
            });
            gen.emit(`${conv} = fptosi ${srcType} ${val} to ${destType}`);
            argValues[index] = conv;
          } else if (isParamFloat && isExprFloat) {
            // Float to Float
            if (typeName === "f64" && exprTypeName === "f32") {
              const conv = gen.generateReg("fpext");
              gen.emit(`${conv} = fpext float ${val} to double`);
              argValues[index] = conv;
            } else if (typeName === "f32" && exprTypeName === "f64") {
              const conv = gen.generateReg("fptrunc");
              gen.emit(`${conv} = fptrunc double ${val} to float`);
              argValues[index] = conv;
            }
          } else if (paramSize < exprSize) {
            // Truncate
            let valIsI64 = false;
            if (
              arg.type === ExpressionType.BinaryExpression ||
              arg.type === ExpressionType.NumberLiteralExpr ||
              !exprType // Assume i64 if unknown
            ) {
              valIsI64 = true;
            }

            if (valIsI64 && paramSize < 8) {
              const trunc = gen.generateReg("trunc");
              const destType = gen.mapType(paramType);
              gen.emit(`${trunc} = trunc i64 ${val} to ${destType}`);
              argValues[index] = trunc;
            } else if (!valIsI64 && exprSize > paramSize) {
              const trunc = gen.generateReg("trunc");
              const destType = gen.mapType(paramType);
              const srcType = gen.mapType({
                name: exprTypeName,
                isPointer: 0,
                isArray: [],
              });
              gen.emit(`${trunc} = trunc ${srcType} ${val} to ${destType}`);
              argValues[index] = trunc;
            }
          } else if (paramSize > exprSize) {
            // Extend
            const isSigned = ["i8", "i16", "i32"].includes(exprTypeName);
            const castOp = isSigned ? "sext" : "zext";
            const ext = gen.generateReg("ext");
            const destType = gen.mapType(paramType);
            const srcType = gen.mapType({
              name: exprTypeName,
              isPointer: 0,
              isArray: [],
            });
            gen.emit(`${ext} = ${castOp} ${srcType} ${val} to ${destType}`);
            argValues[index] = ext;
          }
        }
      } else {
        // Varargs or unknown function: infer from expression
        const exprType = resolveExpressionType(arg, scope);
        if (exprType) {
          typeName = exprType.name;
          isPointer = exprType.isPointer;
          isArray = exprType.isArray;
          genericArgs = exprType.genericArgs;

          // Array decay
          if (isArray.length > 0) {
            isPointer += 1;
            isArray = isArray.slice(1);
          }
        }

        // Promote f32 to f64 for varargs
        if (typeName === "f32" && isPointer === 0 && isArray.length === 0) {
          const ext = gen.generateReg("ext");
          gen.emit(`${ext} = fpext float ${val} to double`);
          argValues[index] = ext;
          typeName = "f64";
        }
      }

      const typeObj: VariableType = {
        name: typeName,
        isPointer,
        isArray,
        genericArgs,
      };
      argTypes.push(gen.mapType(typeObj));
    });

    // Construct call arguments string: "type %val, type %val"
    const argsString = argValues
      .map((val, i) => `${argTypes[i]} ${val}`)
      .join(", ");

    // Return type
    let returnType = "void";
    if (func.returnType) {
      returnType = gen.mapType(func.returnType);
    }

    const resultReg = returnType === "void" ? "" : gen.generateReg("call");
    const assignPrefix = returnType === "void" ? "" : `${resultReg} = `;

    // Construct parameter types string for the function signature
    const paramTypes = func.args.map((arg) => gen.mapType(arg.type));
    if (func.isVariadic) {
      paramTypes.push("...");
    }
    const paramTypesStr = paramTypes.join(", ");

    const funcName = `@${this.functionName}`;

    gen.emit(
      `${assignPrefix}call ${returnType} (${paramTypesStr}) ${funcName}(${argsString})`,
    );

    return resultReg;
  }
}
