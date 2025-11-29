import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class ImportExpr extends Expression {
  constructor(
    public moduleName: string,
    public importName: { name: string; type: "function" | "type" }[],
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
    const finalImports = [];
    for (const importItem of this.importName) {
      if (importItem.type === "type") {
        continue;
      }
      const name = importItem.name;
      finalImports.push(name);

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
}
