import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import Token from "../../lexer/token";
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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const finalImports: string[] = [];
    for (const importItem of this.importName) {
      if (importItem.type === "type") {
        continue;
      }
      const name = importItem.name;
      finalImports.push(name);

      if (scope.resolveFunction(name)) {
        continue;
      }

      scope.defineFunction(name, {
        name: name,
        label: name,
        args: [],
        returnType: null,
        startLabel: name,
        endLabel: name,
        isExternal: true,
      });
    }
    if (finalImports.length) {
      gen.emitImportStatement(`extern ${finalImports.join(", ")}`);
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    for (const importItem of this.importName) {
      if (importItem.type === "type") {
        continue;
      }
      const name = importItem.name;

      const existingFunc = scope.resolveFunction(name);
      if (existingFunc) {
        const ret = existingFunc.returnType
          ? gen.mapType(existingFunc.returnType)
          : "void";
        const args = existingFunc.args
          .map((a) => gen.mapType(a.type))
          .join(", ");
        const vararg = existingFunc.isVariadic
          ? args.length > 0
            ? ", ..."
            : "..."
          : "";

        gen.emitGlobal(`declare ${ret} @${name}(${args}${vararg})`);
        continue;
      }

      const returnType: VariableType = {
        name: "i32",
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
        llvmName: `@${name}`,
      });
    }
    return "";
  }
}
