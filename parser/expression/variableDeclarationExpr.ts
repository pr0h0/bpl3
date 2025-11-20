import type Token from "../../lexer/token";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export type VariableType = {
  name: string;
  isPointer: number;
  isArray: number;
};

export default class VariableDeclarationExpr extends Expression {
  constructor(
    public scope: "global" | "local",
    public isConst: boolean,
    public name: string,
    public varType: VariableType,
    public value: Expression | null,
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
    output += `Type: ${this.varType.name} IsPointer: ${this.varType.isPointer ? (this.varType.isPointer === 1 ? "true" : this.varType.isPointer) : "false"}, IsArray: ${this.varType.isArray ? (this.varType.isArray === 1 ? "true" : this.varType.isArray) : "false"}\n`;
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

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.scope === "global") {
      const label = gen.generateLabel(
        "global_" + (this.isConst ? "const_" : "") + this.name,
      );
      gen.emitData(label, 0);
      if (this.value) {
        gen.startPrecomputeBlock();
        this.value.transpile(gen, scope);
        gen.emit(
          `mov [${label}], rax`,
          "initialize global variable " + this.name,
        );
        gen.endPrecomputeBlock();
        scope.define(this.name, {
          type: "global",
          label: label,
        });
      } else {
        gen.startPrecomputeBlock();
        gen.emit(
          `mov qword [${label}], 0`,
          "initialize global variable " + this.name + " to 0",
        );
        gen.endPrecomputeBlock();
        scope.define(this.name, {
          type: "global",
          label: label,
        });
      }
    } else {
      throw new Error("Local variable declarations not implemented yet.");
    }
  }
}
