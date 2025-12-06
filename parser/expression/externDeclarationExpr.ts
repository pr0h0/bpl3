import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { IRFunction } from "../../transpiler/ir/IRFunction";
import { IRVoid } from "../../transpiler/ir/IRType";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { VariableType } from "./variableDeclarationExpr";

export default class ExternDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public args: { type: VariableType; name: string }[],
    public returnType: VariableType | null,
    public isVariadic: boolean = false,
  ) {
    super(ExpressionType.ExternDeclaration);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ ExternDeclaration ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    output += this.getDepth() + `Arguments:\n`;
    this.depth++;
    for (const arg of this.args) {
      output +=
        this.getDepth() + `Name: ${arg.name}, ${this.printType(arg.type)}\n`;
    }
    if (this.isVariadic) {
      output += this.getDepth() + `...\n`;
    }
    this.depth--;
    if (this.returnType) {
      output +=
        this.getDepth() + `Return Type: ${this.printType(this.returnType)}\n`;
    } else {
      output += this.getDepth() + `Return Type: void\n`;
    }
    this.depth--;
    output += this.getDepth() + `/[ ExternDeclaration ]\n`;

    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const existingFunc = scope.resolveFunction(this.name);
    if (existingFunc) {
      existingFunc.irName = this.name;
      existingFunc.args = this.args;
      existingFunc.returnType = this.returnType;
      existingFunc.isVariadic = this.isVariadic;
    } else {
      scope.defineFunction(this.name, {
        args: this.args,
        returnType: this.returnType,
        endLabel: this.name + "_end",
        label: this.name,
        name: this.name,
        startLabel: this.name,
        isExternal: true,
        isVariadic: this.isVariadic,
        irName: this.name,
      });
    }

    const retType = this.returnType ? gen.getIRType(this.returnType) : IRVoid;
    const args = this.args.map((a) => ({
      name: a.name,
      type: gen.getIRType(a.type),
    }));

    // Check if already declared as extern
    if (!gen.module.functions.some((f) => f.name === this.name)) {
      const func = new IRFunction(this.name, args, retType, this.isVariadic);
      gen.module.addFunction(func);
    }

    return "";
  }
}
