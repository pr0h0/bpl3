import type AsmGenerator from "../../transpiler/AsmGenerator";
import HelperGenerator from "../../transpiler/HelperGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";

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
    // HelperGenerator.generateBaseTypes(gen, scope); // Moved to transpileProgram
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
      gen.emit("mov rax, 60", "syscall: exit");
      gen.emit("syscall");
      gen.emit("", "end of main");
    }

    for (const expr of this.expressions) {
      expr.transpile(gen, scope);
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    this.validate();

    // Check if we need a main wrapper
    const weHaveExportStmt = this.expressions.find(
      (expr) => expr.type === ExpressionType.ExportExpression,
    );

    for (const expr of this.expressions) {
      expr.generateIR(gen, scope);
    }

    if (!weHaveExportStmt) {
      gen.emit("");
      gen.emit("define i32 @main(i32 %argc, ptr %argv) {");
      gen.emit("entry:");

      const mainFunc = scope.resolveFunction("main");
      if (mainFunc && mainFunc.label === "user_main") {
        const retType = mainFunc.returnType
          ? gen.mapType(mainFunc.returnType)
          : "void";
        if (retType === "void") {
          gen.emit("  call void @user_main()");
          gen.emit("  ret i32 0");
        } else {
          const res = gen.generateReg("res");
          gen.emit(`  ${res} = call ${retType} @user_main()`);
          // If retType is not i32, we might need to cast or ignore.
          // Assuming i32 or compatible.
          if (retType === "i32") {
            gen.emit(`  ret i32 ${res}`);
          } else {
            gen.emit("  ret i32 0");
          }
        }
      } else {
        // No main function found?
        // Maybe just return 0.
        gen.emit("  ret i32 0");
      }
      gen.emit("}");
    }

    // Emit struct definitions
    for (const [name, typeInfo] of scope.types) {
      if (
        !typeInfo.isPrimitive &&
        typeInfo.members.size > 0 &&
        (!typeInfo.genericParams || typeInfo.genericParams.length === 0)
      ) {
        const sortedMembers = Array.from(typeInfo.members.values()).sort(
          (a, b) => (a.offset || 0) - (b.offset || 0),
        );

        const memberTypes = sortedMembers
          .map((m) => {
            return gen.mapType({
              name: m.name,
              isPointer: m.isPointer,
              isArray: m.isArray,
              genericArgs: [], // Members inside instantiated struct are already concrete types
            });
          })
          .join(", ");

        if (name.includes("<")) {
          gen.emitGlobal(`%"struct.${name}" = type { ${memberTypes} }`);
        } else {
          gen.emitGlobal(`%struct.${name} = type { ${memberTypes} }`);
        }
      }
    }

    // Emit external function declarations
    for (const [name, func] of scope.functions) {
      if (func.isExternal) {
        const ret = func.returnType ? gen.mapType(func.returnType) : "void";
        const args = func.args.map((arg) => gen.mapType(arg.type)).join(", ");
        const vararg = func.isVariadic
          ? args.length > 0
            ? ", ..."
            : "..."
          : "";
        gen.emitGlobal(`declare ${ret} @${name}(${args}${vararg})`);
      }
    }

    return "";
  }
}
