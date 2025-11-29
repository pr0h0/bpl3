import type AsmGenerator from "../../transpiler/AsmGenerator";
import HelperGenerator from "../../transpiler/HelperGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class ProgramExpr extends Expression {
  public constructor() {
    super(ExpressionType.Program);
  }

  expressions: Expression[] = [];

  public addExpression(expr: Expression): void {
    this.expressions.push(expr);
  }

  public toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Program ]\n";
    for (const expr of this.expressions) {
      output += expr.toString(this.depth + 1);
    }
    output += this.getDepth() + "/[ Program ]\n";
    return output;
  }

  public log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    this.expressions = this.expressions.map((expr) => expr.optimize());
    return this;
  }

  validate(): void {
    // Ensure only few expr types are at the top level
    const allowedTopLevelTypes = new Set<ExpressionType>([
      ExpressionType.FunctionDeclaration,
      ExpressionType.VariableDeclaration,
      ExpressionType.ImportExpression,
      ExpressionType.ExportExpression,
      ExpressionType.StructureDeclaration,
      ExpressionType.ExternDeclaration,
      ExpressionType.EOF,
    ]);

    for (const expr of this.expressions) {
      if (!allowedTopLevelTypes.has(expr.type)) {
        throw new Error(
          `Invalid expression type at top level: ${ExpressionType[expr.type]}`,
        );
      }
    }
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    this.validate();
    const weHaveExportStmt = this.expressions.find(
      (expr) => expr.type === ExpressionType.ExportExpression,
    );
    HelperGenerator.generateBaseTypes(gen, scope);
    HelperGenerator.generateHelperFunctions(gen, scope);
    if (!weHaveExportStmt) {
      gen.emitGlobalDefinition("global main");
      gen.emitLabel("main");
      gen.emit("push rbp", "standard function prologue");
      gen.emit("mov rbp, rsp", "standard function prologue");

      // Save argc, argv, and envp
      // gen.emit("push rdi", "save argc");
      // gen.emit("push rsi", "save argv");
      // gen.emit("push rdx", "save envp");

      // Restore argc, argv, and envp
      // gen.emit("pop rdx", "restore envp");
      // gen.emit("pop rsi", "restore argv");
      // gen.emit("pop rdi", "restore argc");

      gen.emit("call _user_main", "call main function");
      gen.emit("pop rbp", "standard function epilogue");
      gen.emit("mov rdi, rax", "move return value into rdi for exit");
      gen.emit("call exit", "call exit function");
      gen.emit("", "end of main");
    }

    for (const expr of this.expressions) {
      expr.transpile(gen, scope);
    }
  }
}
