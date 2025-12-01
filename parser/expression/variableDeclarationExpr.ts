import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import ArrayLiteralExpr from "./arrayLiteralExpr";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import NullLiteralExpr from "./nullLiteralExpr";
import NumberLiteralExpr from "./numberLiteralExpr";
import StringLiteralExpr from "./stringLiteralExpr";
import UnaryExpr from "./unaryExpr";
import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";

export type VariableType = {
  name: string;
  isPointer: number;
  isArray: number[];
  token?: Token;
  isLiteral?: boolean;
  genericArgs?: VariableType[];
};

export default class VariableDeclarationExpr extends Expression {
  constructor(
    public scope: "global" | "local",
    public isConst: boolean,
    public name: string,
    public varType: VariableType,
    public value: Expression | null,
    public nameToken?: Token,
  ) {
    super(ExpressionType.VariableDeclaration);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ VariableDeclaration ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Scope: ${this.scope}\n`;
    output += this.getDepth();
    output += `IsConst: ${this.isConst}\n`;
    output += this.getDepth();
    output += `Name: ${this.name}\n`;
    output += this.getDepth();
    output += this.printType(this.varType);
    if (this.value) {
      output += this.getDepth();
      output += `Value:\n`;
      output += this.value.toString(this.depth + 1);
    } else {
      output += this.getDepth();
      output += `Value: uninitialized\n`;
    }
    this.depth--;
    output += this.getDepth();
    output += "/[ VariableDeclaration ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    if (this.value) {
      this.value = this.value.optimize();
    }
    return this;
  }

  private resolveExprType(expr: Expression, scope: Scope): VariableType | null {
    if (expr.type === ExpressionType.NumberLiteralExpr) {
      return (expr as NumberLiteralExpr).value.includes(".")
        ? { name: "f64", isPointer: 0, isArray: [] }
        : { name: "u64", isPointer: 0, isArray: [] };
    }
    if (expr.type === ExpressionType.IdentifierExpr) {
      const sym = scope.resolve((expr as any).name);
      return sym ? sym.varType : null;
    }
    if (expr.type === ExpressionType.FunctionCall) {
      const call = expr as any;
      const func = scope.resolveFunction(call.functionName);
      return func ? func.returnType : null;
    }
    if (expr.type === ExpressionType.BinaryExpression) {
      const binExpr = expr as BinaryExpr;
      const leftType = this.resolveExprType(binExpr.left, scope);
      const rightType = this.resolveExprType(binExpr.right, scope);

      if (binExpr.operator.type === TokenType.SLASH) {
        if (leftType?.name === "f64" || rightType?.name === "f64")
          return { name: "f64", isPointer: 0, isArray: [] };
        if (leftType?.name === "f32" && rightType?.name === "f32")
          return { name: "f32", isPointer: 0, isArray: [] };

        // Default to f64 for division if not f32
        return { name: "f64", isPointer: 0, isArray: [] };
      }

      if (leftType?.name === "f64" || rightType?.name === "f64") {
        return { name: "f64", isPointer: 0, isArray: [] };
      }
      if (leftType?.name === "f32" || rightType?.name === "f32") {
        return { name: "f32", isPointer: 0, isArray: [] };
      }
      // Return left type if compatible?
      return leftType;
    }
    if (expr.type === ExpressionType.MemberAccessExpression) {
      const memberExpr = expr as any;
      const objectType = this.resolveExprType(memberExpr.object, scope);
      if (!objectType) return null;

      if (memberExpr.isIndexAccess) {
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

        const propertyName = (memberExpr.property as any).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    }
    if (expr.type === ExpressionType.UnaryExpression) {
      const unaryExpr = expr as UnaryExpr;
      if (unaryExpr.operator.type === TokenType.STAR) {
        const opType = this.resolveExprType(unaryExpr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (unaryExpr.operator.type === TokenType.AMPERSAND) {
        const opType = this.resolveExprType(unaryExpr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      // Handle other unary ops if needed (e.g. MINUS preserves type)
      return this.resolveExprType(unaryExpr.right, scope);
    }
    return null;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    this.contextScope = scope;
    if (this.scope === "global") {
      this.parseGlobalVariableDeclaration(gen, scope);
      return;
    }

    if (this.scope !== "local") {
      throw new Error("Invalid variable scope: " + this.scope);
    }

    if (this.value === null && this.isConst) {
      throw new Error("Const local variable must be initialized");
    }

    let baseSize = 8;
    if (!this.varType.isPointer) {
      let typeInfo;
      if (this.varType.genericArgs && this.varType.genericArgs.length > 0) {
        typeInfo = scope.resolveGenericType(
          this.varType.name,
          this.varType.genericArgs,
        );
      } else {
        typeInfo = scope.resolveType(this.varType.name);
      }

      if (typeInfo) {
        baseSize = typeInfo.size;
      }
    }

    const totalBytes = this.varType.isArray.length
      ? baseSize * this.varType.isArray.reduce((a, b) => a * b, 1)
      : baseSize;
    const offset = scope.allocLocal(totalBytes);

    scope.define(this.name, {
      offset: offset.toString(),
      type: "local",
      varType: this.varType,
      declaration: this.startToken,
    });

    if (this.value && this.varType.isArray.length) {
      if (this.value instanceof StringLiteralExpr) {
        // Handle string literal initialization for arrays
        this.value.transpile(gen, scope);
        // rax now contains the address of the string in .rodata
        gen.emit("mov rsi, rax", "Source address (string literal)");
        gen.emit(
          `lea rdi, [ rbp - ${offset} ]`,
          "Destination address (local array)",
        );

        // We need to copy the string. We can use the length of the string literal.
        // +1 for null terminator
        const strLen = (this.value as StringLiteralExpr).value.length + 1;
        gen.emit(`mov rcx, ${strLen}`, "String length + null terminator");
        gen.emit("rep movsb", "Copy string to stack");
      } else if (!(this.value instanceof ArrayLiteralExpr)) {
        throw new Error(
          "Local array variable must be initialized with an array literal or string literal",
        );
      } else {
        this.value.transpile(gen, scope);
        (this.value as ArrayLiteralExpr).elements.forEach((_, index) => {
          gen.emit("pop rbx", "Load array element");
          scope.stackOffset -= 8;
          gen.emit(
            `mov [ rbp - ${offset} + ${index} * 8 ], rbx`,
            `Initialize local array variable ${this.name}[${index}]`,
          );
        });
      }
    } else if (this.value) {
      this.value.transpile(gen, scope);

      // Handle float initialization
      const sourceType = this.resolveExprType(this.value, scope);
      if (this.varType.name === "f32") {
        if (sourceType?.name === "f32") {
          gen.emit(`mov [ rbp - ${offset} ], eax`, "Init f32 from f32");
        } else if (sourceType?.name === "f64") {
          // Assume f64 (from literal or binary op)
          gen.emit("movq xmm0, rax", "Move f64 bits");
          gen.emit("cvtsd2ss xmm0, xmm0", "Convert f64 to f32");
          gen.emit("movd eax, xmm0", "Move f32 bits");
          gen.emit(`mov [ rbp - ${offset} ], eax`, "Init f32 from f64");
        } else {
          // Assume int -> f32
          gen.emit("cvtsi2ss xmm0, rax", "Convert int to f32");
          gen.emit("movd eax, xmm0", "Move f32 bits");
          gen.emit(`mov [ rbp - ${offset} ], eax`, "Init f32 from int");
        }
        return;
      } else if (this.varType.name === "f64") {
        if (sourceType?.name === "f32") {
          gen.emit("movd xmm0, eax", "Move f32 bits");
          gen.emit("cvtss2sd xmm0, xmm0", "Convert f32 to f64");
          gen.emit("movq rax, xmm0", "Move f64 bits");
        } else if (sourceType?.name !== "f64") {
          // Assume int -> f64
          gen.emit("cvtsi2sd xmm0, rax", "Convert int to f64");
          gen.emit("movq rax, xmm0", "Move f64 bits");
        }
        gen.emit(
          `mov [ rbp - ${offset} ], rax`,
          "Initialize f64 local variable",
        );
        return;
      } else {
        // Target is int/struct
        if (sourceType?.name === "f64" || sourceType?.name === "f32") {
          // Convert float to int
          if (sourceType.name === "f32") {
            gen.emit("movd xmm0, eax", "Move f32 bits");
            gen.emit("cvtss2sd xmm0, xmm0", "Convert f32 to f64");
          } else {
            gen.emit("movq xmm0, rax", "Move f64 bits");
          }
          gen.emit("cvttsd2si rax, xmm0", "Convert float to int");
        }
      }

      let isStruct = false;
      if (!this.varType.isPointer && !this.varType.isArray.length) {
        let typeInfo;
        if (this.varType.genericArgs && this.varType.genericArgs.length > 0) {
          typeInfo = scope.resolveGenericType(
            this.varType.name,
            this.varType.genericArgs,
          );
        } else {
          typeInfo = scope.resolveType(this.varType.name);
        }
        if (typeInfo && !typeInfo.isPrimitive) {
          isStruct = true;
        }
      }

      if (isStruct) {
        gen.emit(`mov rsi, rax`, "Source address (from expression)");
        gen.emit(
          `lea rdi, [ rbp - ${offset} ]`,
          "Destination address (local variable)",
        );
        gen.emit(`mov rcx, ${baseSize}`, "Size to copy");
        gen.emit("rep movsb", "Copy struct to local variable");
      } else if (baseSize === 1) {
        gen.emit(
          `mov [ rbp - ${offset} ], al`,
          "Initialize local variable " + this.name,
        );
      } else if (baseSize === 2) {
        gen.emit(
          `mov [ rbp - ${offset} ], ax`,
          "Initialize local variable " + this.name,
        );
      } else if (baseSize === 4) {
        gen.emit(
          `mov [ rbp - ${offset} ], eax`,
          "Initialize local variable " + this.name,
        );
      } else {
        gen.emit(
          `mov [ rbp - ${offset} ], rax`,
          "Initialize local variable " + this.name,
        );
      }
    } else if (!this.value && !this.varType.isArray.length) {
      gen.emit(
        `mov qword [ rbp - ${offset} ], 0`,
        "Uninitialized local variable",
      );
    } else if (!this.value && this.varType.isArray.length) {
      gen.emit("xor rax, rax", "Zero value for array initialization");
      gen.emit(`mov rcx, ${totalBytes}`, "Array initialization loop counter");
      gen.emit(`lea rdi, [ rbp - ${offset} ]`, "Array start address");
      gen.emit("rep stosb", "Initialize local array variable to zero");
    }
  }

  private parseGlobalVariableDeclaration(
    gen: AsmGenerator,
    scope: Scope,
  ): void {
    if (scope.parent !== null) {
      throw new Error(
        "Global variable declaration should be in the global scope",
      );
    }

    if (this.value === null && this.isConst) {
      throw new Error("Const global variable must be initialized");
    }

    let baseSize = 8;
    if (!this.varType.isPointer) {
      let typeInfo;
      if (this.varType.genericArgs && this.varType.genericArgs.length > 0) {
        typeInfo = scope.resolveGenericType(
          this.varType.name,
          this.varType.genericArgs,
        );
      } else {
        typeInfo = scope.resolveType(this.varType.name);
      }

      if (typeInfo) {
        baseSize = typeInfo.size;
      }
    }

    const label = gen.generateLabel("global_var_" + this.name);
    scope.define(this.name, {
      offset: label,
      type: "global",
      varType: this.varType,
      declaration: this.startToken,
    });

    if (!this.value && !this.varType.isArray.length) {
      gen.emitBss(label, "resb", baseSize);
      gen.startPrecomputeBlock();
      gen.endPrecomputeBlock();
    } else if (!this.value && this.varType.isArray.length) {
      const arraySize = this.varType.isArray.reduce((a, b) => a * b, 1) || 1;
      gen.emitBss(label, "resb", arraySize * baseSize);
    } else if (this.value && this.varType.isArray.length) {
      const arraySize = this.varType.isArray.reduce((a, b) => a * b, 1) || 1;
      gen.emitBss(label, "resb", arraySize * baseSize);
      if (!(this.value instanceof ArrayLiteralExpr)) {
        throw new Error(
          "Global array variable must be initialized with an array literal",
        );
      }
      gen.startPrecomputeBlock();
      this.value!.transpile(gen, scope);
      (this.value as ArrayLiteralExpr).elements.forEach((_, index) => {
        gen.emit("pop rbx", "Load array element");
        scope.stackOffset -= 8;
        gen.emit(
          `mov [ rel ${label} + ${index} * 8 ], rbx`,
          `Initialize global array variable ${this.name}[${index}]`,
        );
      });
      gen.endPrecomputeBlock();
    } else if (this.value instanceof NumberLiteralExpr) {
      gen.emitData(label, "dq", this.value.value);
    } else if (this.value instanceof NullLiteralExpr) {
      gen.emitData(label, "dq", 0);
    } else {
      gen.emitBss(label, "resb", baseSize);
      gen.startPrecomputeBlock();
      this.value!.transpile(gen, scope);
      gen.emit(
        "mov [ rel " + label + " ], rax",
        "Initialize global variable " + this.name,
      );
      gen.endPrecomputeBlock();
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    if (this.varType.genericArgs && this.varType.genericArgs.length > 0) {
      scope.resolveGenericType(this.varType.name, this.varType.genericArgs);
    }

    if (this.scope === "global") {
      const type = gen.mapType(this.varType);
      const name = `@${this.name}`;

      let init = "zeroinitializer";
      if (this.value instanceof NumberLiteralExpr) {
        init = this.value.value;
        if (this.value.value.includes(".")) {
          // Float literal
        }
      }

      gen.emitGlobal(`${name} = global ${type} ${init}`);

      scope.define(this.name, {
        offset: "0",
        type: "global",
        varType: this.varType,
        llvmName: name,
      });
      return "";
    } else {
      const type = gen.mapType(this.varType);
      const ptr = gen.generateLocal(this.name);
      gen.emit(`  %${ptr} = alloca ${type}`);

      if (this.value) {
        // Initializer for local variable
        if (
          this.varType.isArray.length > 0 &&
          this.value instanceof StringLiteralExpr
        ) {
          const srcPtr = this.value.generateIR(gen, scope);
          const destPtr = `%${ptr}`;

          const unescaped = (this.value as StringLiteralExpr).value
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\r/g, "\r")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\");
          const byteLength = unescaped.length + 1;

          gen.emitGlobal(
            "declare void @llvm.memcpy.p0.p0.i64(ptr nocapture writeonly, ptr nocapture readonly, i64, i1 immarg)",
          );
          gen.emit(
            `  call void @llvm.memcpy.p0.p0.i64(ptr align 1 ${destPtr}, ptr align 1 ${srcPtr}, i64 ${byteLength}, i1 false)`,
          );
        } else {
          let val = this.value.generateIR(gen, scope);
          const valType = this.resolveExprType(this.value, scope);

          const getIntSize = (name: string) => {
            if (["u8", "i8", "bool", "char"].includes(name)) return 1;
            if (["u16", "i16"].includes(name)) return 2;
            if (["u32", "i32"].includes(name)) return 4;
            return 8;
          };

          // Determine if val is i64 (promoted) or native size
          let valIsI64 = false;
          if (
            (this.value.type === ExpressionType.BinaryExpression ||
              this.value.type === ExpressionType.NumberLiteralExpr) &&
            (!valType ||
              (valType.isPointer === 0 && valType.isArray.length === 0))
          ) {
            const isFloat =
              valType?.name === "f64" ||
              valType?.name === "f32" ||
              (this.value as any).operator?.type === TokenType.SLASH;
            if (!isFloat) valIsI64 = true;
          }

          if (valIsI64) {
            // val is i64. If dest is smaller, trunc.
            const destSize = getIntSize(this.varType.name);
            if (destSize < 8 && !this.varType.isPointer) {
              const trunc = gen.generateReg("trunc");
              gen.emit(`  ${trunc} = trunc i64 ${val} to ${type}`);
              val = trunc;
            } else if (this.varType.isPointer > 0) {
              const inttoptr = gen.generateReg("inttoptr");
              gen.emit(`  ${inttoptr} = inttoptr i64 ${val} to ptr`);
              val = inttoptr;
            }
          } else if (valType && valType.name !== this.varType.name) {
            // val is native size. Handle implicit casting.
            // Check if types are pointers
            const srcIsPointer =
              valType.isPointer > 0 || valType.isArray.length > 0;
            const destIsPointer =
              this.varType.isPointer > 0 || this.varType.isArray.length > 0;

            if (srcIsPointer && destIsPointer) {
              // Pointer to pointer assignment. No cast needed for opaque pointers.
            } else if (!srcIsPointer && destIsPointer) {
              // Int to Pointer
              const inttoptr = gen.generateReg("inttoptr");
              // Assuming val is i64. If not, we might need to extend/trunc first?
              // Usually literals are i64.
              gen.emit(`  ${inttoptr} = inttoptr i64 ${val} to ptr`);
              val = inttoptr;
            } else if (!srcIsPointer && !destIsPointer) {
              const srcSize = getIntSize(valType.name);
              const destSize = getIntSize(this.varType.name);
              const srcType = gen.mapType({
                name: valType.name,
                isPointer: 0,
                isArray: [],
              });

              const isSrcFloat =
                valType.name === "f64" || valType.name === "f32";
              const isDestFloat =
                this.varType.name === "f64" || this.varType.name === "f32";

              if (isSrcFloat && !isDestFloat) {
                // Float to Int
                const conv = gen.generateReg("fptosi");
                gen.emit(`  ${conv} = fptosi ${srcType} ${val} to ${type}`);
                val = conv;
              } else if (!isSrcFloat && isDestFloat) {
                // Int to Float
                const conv = gen.generateReg("sitofp");
                gen.emit(`  ${conv} = sitofp ${srcType} ${val} to ${type}`);
                val = conv;
              } else if (isSrcFloat && isDestFloat) {
                // Float to Float
                if (valType.name === "f64" && this.varType.name === "f32") {
                  const conv = gen.generateReg("fptrunc");
                  gen.emit(`  ${conv} = fptrunc double ${val} to float`);
                  val = conv;
                } else if (
                  valType.name === "f32" &&
                  this.varType.name === "f64"
                ) {
                  const conv = gen.generateReg("fpext");
                  gen.emit(`  ${conv} = fpext float ${val} to double`);
                  val = conv;
                }
              } else if (srcSize < destSize) {
                const isSigned = ["i8", "i16", "i32"].includes(valType.name);
                const castOp = isSigned ? "sext" : "zext";
                const ext = gen.generateReg("ext");
                gen.emit(`  ${ext} = ${castOp} ${srcType} ${val} to ${type}`);
                val = ext;
              } else if (srcSize > destSize) {
                const trunc = gen.generateReg("trunc");
                gen.emit(`  ${trunc} = trunc ${srcType} ${val} to ${type}`);
                val = trunc;
              }
            }
          }

          gen.emit(`  store ${type} ${val}, ptr %${ptr}`);
        }
      }

      scope.define(this.name, {
        offset: "0",
        type: "local",
        varType: this.varType,
        llvmName: `%${ptr}`,
      });
    }
    return "";
  }
}
