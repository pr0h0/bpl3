import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import ArrayLiteralExpr from "./arrayLiteralExpr";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import NullLiteralExpr from "./nullLiteralExpr";
import NumberLiteralExpr from "./numberLiteralExpr";
import StringLiteralExpr from "./stringLiteralExpr";
import Token from "../../lexer/token";

export type VariableType = {
  name: string;
  isPointer: number;
  isArray: number[];
  token?: Token;
  isLiteral?: boolean;
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

  private resolveExprType(expr: Expression, scope: Scope): string | null {
    if (expr.type === ExpressionType.NumberLiteralExpr) {
      return (expr as NumberLiteralExpr).value.includes(".") ? "f64" : "u64";
    }
    if (expr.type === ExpressionType.IdentifierExpr) {
      const sym = scope.resolve((expr as any).name);
      return sym ? sym.varType.name : null;
    }
    if (expr.type === ExpressionType.BinaryExpression) {
      const binExpr = expr as BinaryExpr;
      const leftType = this.resolveExprType(binExpr.left, scope);
      const rightType = this.resolveExprType(binExpr.right, scope);
      if (
        leftType === "f64" ||
        leftType === "f32" ||
        rightType === "f64" ||
        rightType === "f32"
      ) {
        return "f64";
      }
      return null;
    }
    return null;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
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
      const typeInfo = scope.resolveType(this.varType.name);
      if (typeInfo) {
        baseSize = typeInfo.size;
      }
    }

    const totalBytes = this.varType.isArray.length
      ? baseSize * this.varType.isArray.reduce((a, b) => a * b, 1)
      : baseSize;
    const offset = scope.allocLocal(totalBytes);
    gen.emit("sub rsp, " + totalBytes, "Allocate space for local variable");

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
        if (sourceType === "f32") {
          gen.emit(`mov [ rbp - ${offset} ], eax`, "Init f32 from f32");
        } else {
          // Assume f64 (from literal or binary op)
          gen.emit("movq xmm0, rax", "Move f64 bits");
          gen.emit("cvtsd2ss xmm0, xmm0", "Convert f64 to f32");
          gen.emit("movd eax, xmm0", "Move f32 bits");
          gen.emit(`mov [ rbp - ${offset} ], eax`, "Init f32 from f64");
        }
        return;
      } else if (this.varType.name === "f64") {
        if (sourceType === "f32") {
          gen.emit("movd xmm0, eax", "Move f32 bits");
          gen.emit("cvtss2sd xmm0, xmm0", "Convert f32 to f64");
          gen.emit("movq rax, xmm0", "Move f64 bits");
        }
        gen.emit(
          `mov [ rbp - ${offset} ], rax`,
          "Initialize f64 local variable",
        );
        return;
      } else {
        // Target is int/struct
        if (sourceType === "f64" || sourceType === "f32") {
          // Convert float to int
          if (sourceType === "f32") {
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
        const typeInfo = scope.resolveType(this.varType.name);
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

    const label = gen.generateLabel("global_var_" + this.name);
    scope.define(this.name, {
      offset: label,
      type: "global",
      varType: this.varType,
      declaration: this.startToken,
    });

    if (!this.value && !this.varType.isArray.length) {
      gen.emitBss(label, "resq", 1);
      gen.startPrecomputeBlock();
      gen.emit(
        "mov qword [ rel " + label + " ], 0",
        "Uninitialized global variable",
      );
      gen.endPrecomputeBlock();
    } else if (!this.value && this.varType.isArray.length) {
      const arraySize = this.varType.isArray.reduce((a, b) => a * b, 1) || 1;
      gen.emitBss(label, "resq", arraySize);
    } else if (this.value && this.varType.isArray.length) {
      const arraySize = this.varType.isArray.reduce((a, b) => a * b, 1) || 1;
      gen.emitBss(label, "resq", arraySize);
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
      gen.emitBss(label, "resq", 1);
      gen.startPrecomputeBlock();
      this.value!.transpile(gen, scope);
      gen.emit(
        "mov [ rel " + label + " ], rax",
        "Initialize global variable " + this.name,
      );
      gen.endPrecomputeBlock();
    }
  }
}
