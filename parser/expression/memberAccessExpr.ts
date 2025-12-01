import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import IdentifierExpr from "./identifierExpr";
import UnaryExpr from "./unaryExpr";
import type { VariableType } from "./variableDeclarationExpr";

export default class MemberAccessExpr extends Expression {
  constructor(
    public object: Expression,
    public property: Expression, // since it can be identifier or expression (for index access)
    public isIndexAccess: boolean,
  ) {
    super(ExpressionType.MemberAccessExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ MemberAccess ]\n";
    this.depth++;
    output += this.object.toString(this.depth + 1);
    output +=
      this.getDepth() + `Property: \n${this.property.toString(this.depth + 1)}`;
    output += this.getDepth() + `IsIndexAccess: ${this.isIndexAccess}\n`;
    this.depth--;
    output += this.getDepth() + "/[ MemberAccess ]\n";
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
        let typeInfo;
        if (objectType.genericArgs && objectType.genericArgs.length > 0) {
          typeInfo = scope.resolveGenericType(
            objectType.name,
            objectType.genericArgs,
          );
        } else {
          typeInfo = scope.resolveType(objectType.name);
        }
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
    }
    return null;
  }

  private getIntSize(typeName: string): number {
    switch (typeName) {
      case "i8":
      case "u8":
      case "char":
      case "bool":
        return 1;
      case "i16":
      case "u16":
        return 2;
      case "i32":
      case "u32":
        return 4;
      case "i64":
      case "u64":
      case "int":
      case "usize":
        return 8;
      default:
        return 8;
    }
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    // Handle variadic args access: args[i]
    if (
      this.object instanceof IdentifierExpr &&
      this.object.name === "args" &&
      this.isIndexAccess
    ) {
      const variadicStart = scope.resolve("__variadic_start_offset__");
      const variadicCount = scope.resolve("__variadic_reg_count__");

      if (variadicStart && variadicCount) {
        // This is a variadic args access
        // Calculate index
        this.property.transpile(gen, scope);
        // RAX has index 'i'

        // We need to check if i < variadicCount (registers) or i >= variadicCount (stack)
        // But wait, variadicCount is stored as a string offset in scope (hack).
        // Let's parse it.
        const numRegs = parseInt(variadicCount.offset);
        const startOffset = parseInt(variadicStart.offset);

        const labelStack = gen.generateLabel("variadic_stack");
        const labelDone = gen.generateLabel("variadic_done");

        gen.emit(
          `cmp rax, ${numRegs}`,
          "Check if variadic arg is in register spill area",
        );
        gen.emit(`jge ${labelStack}`, "If index >= numRegs, go to stack");

        // Register access
        // Addr = RBP - startOffset - (i * 8)
        gen.emit("mov rbx, rax", "Copy index");
        gen.emit("imul rbx, 8", "Scale index");
        gen.emit("mov rax, rbp", "Base RBP");
        gen.emit(`sub rax, ${startOffset}`, "Subtract start offset");
        gen.emit("sub rax, rbx", "Subtract scaled index");
        gen.emit(`jmp ${labelDone}`, "Done");

        gen.emitLabel(labelStack);
        // Stack access
        // Addr = RBP + 16 + (i - numRegs) * 8
        gen.emit(`sub rax, ${numRegs}`, "Adjust index for stack");
        gen.emit("imul rax, 8", "Scale index");
        gen.emit("add rax, 16", "Add return address + saved rbp offset");
        gen.emit("add rax, rbp", "Add RBP");

        gen.emitLabel(labelDone);

        // Now RAX has the address of the argument.
        // If !isLHS, dereference it.
        if (!isLHS) {
          // Assuming u64 for now as per implementation in FunctionDeclaration
          gen.emit("mov rax, [rax]", "Dereference variadic arg");
        } else {
          scope.setCurrentContext({ type: "LHS" });
        }
        return;
      }
    }

    const objectType = this.resolveExpressionType(this.object, scope);
    if (!objectType) {
      if (this.object instanceof IdentifierExpr) {
        console.error(
          `Could not resolve type of object '${this.object.name}' in member access`,
        );
        console.error("Is it defined?");
      }
      throw new Error(`Could not resolve type of object in member access`);
    }

    // If object is NOT a pointer (struct instance or array), we need its address (LHS context)
    // If object IS a pointer, we need its value (address it points to) (RHS context)
    if (objectType.isPointer === 0) {
      scope.setCurrentContext({ type: "LHS" });
    }

    this.object.transpile(gen, scope);

    if (objectType.isPointer === 0) {
      scope.removeCurrentContext("LHS");
    }

    gen.emit("push rax", "MEMBER ACCESS EXPR - save base address");
    scope.stackOffset += 8;

    if (this.isIndexAccess) {
      this.property.transpile(gen, scope);
      gen.emit("pop rbx", "MEMBER ACCESS EXPR - restore base address");
      scope.stackOffset -= 8;

      // Calculate element size
      let elementSize = 8;
      let baseType;
      if (objectType.genericArgs && objectType.genericArgs.length > 0) {
        baseType = scope.resolveGenericType(
          objectType.name,
          objectType.genericArgs,
        );
      } else {
        baseType = scope.resolveType(objectType.name);
      }

      if (objectType.isArray.length > 0) {
        if (baseType) {
          const tempType = {
            ...baseType,
            isArray: objectType.isArray.slice(1),
            isPointer: objectType.isPointer,
          };
          elementSize = scope.calculateSizeOfType(tempType);
        }
      } else if (objectType.isPointer > 0) {
        if (objectType.isPointer > 1) {
          elementSize = 8;
        } else {
          elementSize = baseType ? baseType.size : 8;
        }
      }

      gen.emit(`imul rax, ${elementSize}`, "MEMBER ACCESS EXPR - scale index");
      gen.emit("add rax, rbx", "MEMBER ACCESS EXPR - calculate address");
    } else {
      gen.emit("pop rax", "MEMBER ACCESS EXPR - restore base address");
      scope.stackOffset -= 8;

      const propertyName = (this.property as IdentifierExpr).name;
      let typeInfo;
      if (objectType.genericArgs && objectType.genericArgs.length > 0) {
        typeInfo = scope.resolveGenericType(
          objectType.name,
          objectType.genericArgs,
        );
      } else {
        typeInfo = scope.resolveType(objectType.name);
      }

      if (!typeInfo) {
        throw new Error(`Undefined type '${objectType.name}'`);
      }

      const memberInfo = typeInfo.members.get(propertyName);
      if (!memberInfo) {
        throw new Error(
          `Type '${typeInfo.name}' has no member named '${propertyName}'.`,
        );
      }

      const propertyOffset = memberInfo.offset || 0;

      gen.emit(
        `add rax, ${propertyOffset}`,
        `MEMBER ACCESS EXPR - add property offset for ${propertyName}`,
      );
    }

    if (!isLHS) {
      const resultType = this.resolveExpressionType(this, scope);
      // If result is struct (not pointer) or array, keep address (L-value)
      if (resultType) {
        const isArray = resultType.isArray.length > 0;
        let typeInfoForStructCheck;
        if (resultType.genericArgs && resultType.genericArgs.length > 0) {
          typeInfoForStructCheck = scope.resolveGenericType(
            resultType.name,
            resultType.genericArgs,
          );
        } else {
          typeInfoForStructCheck = scope.resolveType(resultType.name);
        }

        const isStruct =
          !resultType.isPointer &&
          !isArray &&
          typeInfoForStructCheck?.isPrimitive === false;

        if (isArray || isStruct) {
          // Do NOT dereference
        } else {
          let typeInfo;
          if (resultType.genericArgs && resultType.genericArgs.length > 0) {
            typeInfo = scope.resolveGenericType(
              resultType.name,
              resultType.genericArgs,
            );
          } else {
            typeInfo = scope.resolveType(resultType.name);
          }

          if (typeInfo) {
            if (resultType.isPointer > 0) {
              gen.emit("mov rax, [rax]", "Dereference pointer (64-bit)");
            } else if (typeInfo.size === 1) {
              gen.emit("movzx rax, byte [rax]", "Dereference 8-bit");
            } else if (typeInfo.size === 2) {
              gen.emit("movzx rax, word [rax]", "Dereference 16-bit");
            } else if (typeInfo.size === 4) {
              if (typeInfo.info.signed) {
                gen.emit(
                  "movsxd rax, dword [rax]",
                  "Dereference 32-bit (signed)",
                );
              } else {
                gen.emit(
                  "mov eax, dword [rax]",
                  "Dereference 32-bit (unsigned)",
                );
              }
            } else {
              gen.emit("mov rax, [rax]", "Dereference 64-bit");
            }
          } else {
            gen.emit(
              "mov rax, [rax]",
              "MEMBER ACCESS EXPR - dereference if RHS",
            );
          }
        }
      } else {
        gen.emit("mov rax, [rax]", "MEMBER ACCESS EXPR - dereference if RHS");
      }
    } else {
      scope.setCurrentContext({ type: "LHS" });
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    // Handle variadic args access: args[i]
    if (
      this.object instanceof IdentifierExpr &&
      this.object.name === "args" &&
      this.isIndexAccess
    ) {
      const regSaveArea = scope.resolve("__va_reg_save_area__");
      const overflowArgArea = scope.resolve("__va_overflow_arg_area__");
      const gpOffset = scope.resolve("__va_gp_offset__");

      if (regSaveArea && overflowArgArea && gpOffset) {
        const index = this.property.generateIR(gen, scope);

        // Ensure index is i64
        let idxVal = index;
        const indexType = this.resolveExpressionType(this.property, scope);
        if (indexType && this.getIntSize(indexType.name) < 8) {
          const castReg = gen.generateReg("idx_ext");
          const isSigned = ["i32", "i16", "i8"].includes(indexType.name);
          const op = isSigned ? "sext" : "zext";
          const llvmType = gen.mapType(indexType);
          gen.emit(`${castReg} = ${op} ${llvmType} ${index} to i64`);
          idxVal = castReg;
        }

        const gpCount = gpOffset.llvmName!; // This is the constant string count

        const totalIdx = gen.generateReg("total_idx");
        gen.emit(`${totalIdx} = add i64 ${idxVal}, ${gpCount}`);

        const cond = gen.generateReg("cond");
        gen.emit(`${cond} = icmp ult i64 ${totalIdx}, 6`);

        // Reg Save Area Address
        const regOffset = gen.generateReg("reg_offset");
        gen.emit(`${regOffset} = mul i64 ${totalIdx}, 8`);
        const regPtr = gen.generateReg("reg_ptr");
        gen.emit(
          `${regPtr} = getelementptr i8, ptr ${regSaveArea.llvmName}, i64 ${regOffset}`,
        );

        // Overflow Arg Area Address
        const stackIdx = gen.generateReg("stack_idx");
        gen.emit(`${stackIdx} = sub i64 ${totalIdx}, 6`);
        const stackOffset = gen.generateReg("stack_offset");
        gen.emit(`${stackOffset} = mul i64 ${stackIdx}, 8`);
        const stackPtr = gen.generateReg("stack_ptr");
        gen.emit(
          `${stackPtr} = getelementptr i8, ptr ${overflowArgArea.llvmName}, i64 ${stackOffset}`,
        );

        const ptr = gen.generateReg("arg_ptr");
        gen.emit(`${ptr} = select i1 ${cond}, ptr ${regPtr}, ptr ${stackPtr}`);

        if (isLHS) {
          scope.setCurrentContext({ type: "LHS" });
          return ptr;
        }

        const val = gen.generateReg("arg_val");
        gen.emit(`${val} = load i64, ptr ${ptr}`);
        return val;
      }

      throw new Error(
        "Variadic arguments 'args' not implemented for LLVM backend yet.",
      );
    }

    const objectType = this.resolveExpressionType(this.object, scope);
    if (!objectType) throw new Error("Cannot resolve object type");

    let basePtr: string;
    // If object is a struct/array variable, we need its address (LHS).
    // If object is a pointer, we need its value (RHS).
    if (objectType.isPointer === 0 && objectType.isArray.length === 0) {
      scope.setCurrentContext({ type: "LHS" });
      basePtr = this.object.generateIR(gen, scope);
      scope.removeCurrentContext("LHS");
    } else if (objectType.isArray.length > 0) {
      scope.setCurrentContext({ type: "LHS" });
      basePtr = this.object.generateIR(gen, scope);
      scope.removeCurrentContext("LHS");
    } else {
      basePtr = this.object.generateIR(gen, scope);
    }

    let resultPtr: string;

    if (this.isIndexAccess) {
      let index = this.property.generateIR(gen, scope);

      // Cast index to i64 if needed
      const indexType = this.resolveExpressionType(this.property, scope);
      if (indexType) {
        const typeName = indexType.name;
        if (["i32", "u32", "i16", "u16", "i8", "u8"].includes(typeName)) {
          const castReg = gen.generateReg("idx_ext");
          const isSigned = typeName.startsWith("i");
          const op = isSigned ? "sext" : "zext";
          const llvmType = gen.mapType(indexType);
          gen.emit(`${castReg} = ${op} ${llvmType} ${index} to i64`);
          index = castReg;
        }
      }

      const resultReg = gen.generateReg("elem");

      if (objectType.isArray.length > 0) {
        const arrayType = gen.mapType(objectType);
        gen.emit(
          `${resultReg} = getelementptr ${arrayType}, ptr ${basePtr}, i64 0, i64 ${index}`,
        );
      } else {
        // Pointer
        const pointedType = {
          ...objectType,
          isPointer: objectType.isPointer - 1,
        };
        const llvmPointedType = gen.mapType(pointedType);
        gen.emit(
          `${resultReg} = getelementptr ${llvmPointedType}, ptr ${basePtr}, i64 ${index}`,
        );
      }
      resultPtr = resultReg;
    } else {
      const propertyName = (this.property as IdentifierExpr).name;
      let typeInfo;
      if (objectType.genericArgs && objectType.genericArgs.length > 0) {
        typeInfo = scope.resolveGenericType(
          objectType.name,
          objectType.genericArgs,
        );
      } else {
        typeInfo = scope.resolveType(objectType.name);
      }

      if (!typeInfo) {
        // Try to resolve generic type if applicable
        if (objectType.genericArgs && objectType.genericArgs.length > 0) {
          // ...
        }
        // If still not found, check if it's a primitive type that hasn't been defined in scope yet?
        // Primitives should be pre-defined.
        // Maybe it's u64?
        if (
          [
            "u64",
            "i64",
            "f64",
            "u32",
            "i32",
            "f32",
            "u16",
            "i16",
            "u8",
            "i8",
            "bool",
            "char",
            "void",
          ].includes(objectType.name)
        ) {
          // It is a primitive, but maybe scope doesn't have TypeInfo for it?
          // We should construct a temporary TypeInfo for primitives if missing.
          // But normally HelperGenerator or Scope should have them.
        }

        throw new Error(`Undefined type '${objectType.name}'`);
      }

      let memberIndex = 0;
      let found = false;
      for (const [key] of typeInfo.members) {
        if (key === propertyName) {
          found = true;
          break;
        }
        memberIndex++;
      }
      if (!found)
        throw new Error(
          `Member ${propertyName} not found in ${objectType.name}`,
        );

      const resultReg = gen.generateReg("member");
      // We need the underlying struct type for GEP, not the pointer type
      const structType = gen.mapType({ ...objectType, isPointer: 0 });
      gen.emit(
        `${resultReg} = getelementptr ${structType}, ptr ${basePtr}, i32 0, i32 ${memberIndex}`,
      );
      resultPtr = resultReg;
    }

    if (isLHS) {
      scope.setCurrentContext({ type: "LHS" });
      return resultPtr;
    } else {
      const resultType = this.resolveExpressionType(this, scope);
      if (!resultType) throw new Error("Cannot resolve result type");

      // If result is struct or array, return pointer (address)
      // If result is primitive/pointer, load value
      const isArray = resultType.isArray.length > 0;
      let typeInfoForStructCheck;
      if (resultType.genericArgs && resultType.genericArgs.length > 0) {
        typeInfoForStructCheck = scope.resolveGenericType(
          resultType.name,
          resultType.genericArgs,
        );
      } else {
        typeInfoForStructCheck = scope.resolveType(resultType.name);
      }

      const isStruct =
        !resultType.isPointer &&
        !isArray &&
        typeInfoForStructCheck?.isPrimitive === false;

      if (isArray) {
        return resultPtr;
      } else {
        const llvmType = gen.mapType(resultType);
        const valReg = gen.generateReg("val");
        gen.emit(`${valReg} = load ${llvmType}, ptr ${resultPtr}`);
        return valReg;
      }
    }
  }
}
