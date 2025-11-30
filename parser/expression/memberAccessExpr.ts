import type AsmGenerator from "../../transpiler/AsmGenerator";
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
      throw new Error("Could not resolve type of object in member access");
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
}
