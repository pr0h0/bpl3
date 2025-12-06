import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Token from "../../lexer/token";
import { IRFunction } from "../../transpiler/ir/IRFunction";
import { IRVoid } from "../../transpiler/ir/IRType";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type Scope from "../../transpiler/Scope";
import type { VariableType } from "./variableDeclarationExpr";

export default class ImportExpr extends Expression {
  constructor(
    public moduleName: string,
    public importName: {
      name: string;
      type: "function" | "type";
      token?: Token;
    }[],
    public moduleNameToken?: Token,
  ) {
    super(ExpressionType.ImportExpression);
  }

  public toString(depth: number = 0): string {
    this.depth = depth;
    let output = `${this.getDepth()}`;
    output += " [Import Expression]\n";
    this.depth++;
    output += `${this.getDepth()} Module Name: ${this.moduleName}\n`;
    output += `${this.getDepth()} Import Names: ${this.importName.map((i) => `${i.name} (${i.type})`).join(", ")}\n`;
    this.depth--;
    output += `${this.getDepth()}`;
    output += "/[ Import Expression ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    for (const importItem of this.importName) {
      if (importItem.type === "type") {
        const typeName = importItem.name;
        for (const [funcName, funcInfo] of scope.functions) {
          if (
            funcInfo.isMethod &&
            funcInfo.receiverStruct === typeName &&
            funcInfo.isExternal
          ) {
            const retType = funcInfo.returnType
              ? gen.getIRType(funcInfo.returnType)
              : IRVoid;
            const args = funcInfo.args.map((a) => ({
              name: a.name,
              type: gen.getIRType(a.type),
            }));

            const func = new IRFunction(funcName, args, retType);
            gen.module.addFunction(func);
          }
        }
        continue;
      }
      const name = importItem.name;

      const existingFunc = scope.resolveFunction(name);
      if (existingFunc) {
        const retType = existingFunc.returnType
          ? gen.getIRType(existingFunc.returnType)
          : IRVoid;
        const args = existingFunc.args.map((a) => ({
          name: a.name,
          type: gen.getIRType(a.type),
        }));

        const func = new IRFunction(name, args, retType);
        gen.module.addFunction(func);
        continue;
      }

      const returnType: VariableType = {
        name: "i64",
        isPointer: 0,
        isArray: [],
      };

      scope.defineFunction(name, {
        name: name,
        label: name,
        args: [],
        returnType: returnType,
        startLabel: name,
        endLabel: name,
        isExternal: true,
        isVariadic: true,
        irName: name,
      });

      const func = new IRFunction(name, [], gen.getIRType(returnType));
      gen.module.addFunction(func);
    }
    return "";
  }
}
