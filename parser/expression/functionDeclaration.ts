import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { VariableType } from "./variableDeclarationExpr";
import Token from "../../lexer/token";

export default class FunctionDeclarationExpr extends Expression {
  constructor(
    public name: string,
    public args: { type: VariableType; name: string }[],
    public returnType: VariableType | null,
    public body: Expression,
    public nameToken?: Token,
    public isVariadic: boolean = false,
    public variadicType: VariableType | null = null,
    public genericParams: string[] = [],
  ) {
    super(ExpressionType.FunctionDeclaration);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ FunctionDeclaration ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    if (this.genericParams.length > 0) {
      output +=
        this.getDepth() +
        `Generic Params: <${this.genericParams.join(", ")}>\n`;
    }
    output += this.getDepth() + `Arguments:\n`;
    this.depth++;
    for (const arg of this.args) {
      output +=
        this.getDepth() + `Name: ${arg.name}, ${this.printType(arg.type)}\n`;
    }
    if (this.isVariadic && this.variadicType) {
      output +=
        this.getDepth() +
        `Variadic: ...:${this.printType(this.variadicType)}\n`;
    }
    this.depth--;
    if (this.returnType) {
      output +=
        this.getDepth() + `Return Type: ${this.printType(this.returnType)}\n`;
    } else {
      output += this.getDepth() + `Return Type: void\n`;
    }
    output += this.getDepth() + `Body:\n`;
    output += this.body.toString(this.depth + 1);
    this.depth--;
    output += this.getDepth() + `/[ FunctionDeclaration ]\n`;

    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    this.body = this.body.optimize();
    return this;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    // Skip IR generation for generic function templates - only their monomorphized
    // instances should generate code
    if (this.genericParams && this.genericParams.length > 0) {
      return "";
    }

    // Check if this is a method
    const isMethod = (this as any).isMethod;
    const receiverStruct = (this as any).receiverStruct;

    // Use mangled name for methods, regular name for functions
    let name: string;
    if (isMethod && receiverStruct) {
      const { mangleMethod } = require("../../utils/methodMangler");
      // If the name already contains the mangled pattern (from monomorphization), use it as-is
      if (this.name.startsWith("__bplm__") || this.name.includes("__")) {
        name = this.name;
      } else {
        name = mangleMethod(receiverStruct, this.name);
      }
    } else {
      name = this.name === "main" ? "user_main" : this.name;
    }

    // Prepare receiver type if method
    let allArgs = this.args;
    if (isMethod && receiverStruct) {
      const thisParam = {
        name: "this",
        type: {
          name: receiverStruct,
          isPointer: 1,
          isArray: [],
        },
      };
      allArgs = [thisParam, ...this.args];
    }

    const resolvedArgs = allArgs.map((arg) => {
      let argType = arg.type;
      if (arg.type.genericArgs && arg.type.genericArgs.length > 0) {
        const typeInfo = scope.resolveGenericType(
          arg.type.name,
          arg.type.genericArgs,
        );
        if (typeInfo) {
          argType = { ...arg.type, name: typeInfo.name, genericArgs: [] };
          gen.registerStruct(typeInfo, scope);
        }
      } else {
        const typeInfo = scope.resolveType(arg.type.name);
        if (typeInfo && !typeInfo.isPrimitive) {
          gen.registerStruct(typeInfo, scope);
        }
      }
      return { ...arg, type: argType };
    });

    let resolvedReturnType = this.returnType;
    if (
      this.returnType &&
      this.returnType.genericArgs &&
      this.returnType.genericArgs.length > 0
    ) {
      const typeInfo = scope.resolveGenericType(
        this.returnType.name,
        this.returnType.genericArgs,
      );
      if (typeInfo) {
        resolvedReturnType = {
          ...this.returnType,
          name: typeInfo.name,
          genericArgs: [],
        };
        gen.registerStruct(typeInfo, scope);
      }
    } else if (this.returnType) {
      const typeInfo = scope.resolveType(this.returnType.name);
      if (typeInfo && !typeInfo.isPrimitive) {
        gen.registerStruct(typeInfo, scope);
      }
    }

    const irArgs = resolvedArgs.map((arg) => ({
      name: arg.name,
      type: gen.getIRType(arg.type),
    }));

    const irReturnType = resolvedReturnType
      ? gen.getIRType(resolvedReturnType)
      : ({ type: "void" } as any);

    const irName = name;
    gen.createFunction(irName, irArgs, irReturnType, this.isVariadic);

    const existingFunc = scope.resolveFunction(this.name);
    if (existingFunc) {
      existingFunc.irName = name;
      existingFunc.args = resolvedArgs;
      existingFunc.returnType = resolvedReturnType;
    } else {
      scope.defineFunction(this.name, {
        args: resolvedArgs,
        returnType: resolvedReturnType,
        endLabel: name + "_end",
        label: name,
        name: this.name,
        startLabel: name,
        declaration: this.startToken,
        isVariadic: this.isVariadic,
        irName: name,
      });
    }

    const funcScope = new Scope(scope);
    funcScope.setCurrentContext({
      type: "function",
      label: name,
      endLabel: name + "_end",
      returnType: resolvedReturnType,
    });

    const entryBlock = gen.createBlock("entry");
    gen.setBlock(entryBlock);

    resolvedArgs.forEach((arg, index) => {
      const irType = irArgs[index]!.type;
      const argVal = `%${arg.name}`;
      const ptr = gen.emitAlloca(irType, arg.name);
      gen.emitStore(irType, argVal, ptr);

      funcScope.define(arg.name, {
        type: "local",
        offset: "0",
        varType: arg.type,
        irName: ptr,
      });
    });

    if (this.isVariadic) {
      // Define 'args' to enable detection in MemberAccessExpr
      funcScope.define("args", {
        offset: "0",
        type: "local",
        varType: { name: "u64", isPointer: 1, isArray: [] }, // Treat as pointer-like for resolution
        irName: "args_marker",
      });

      // Emit va_start logic
      gen.ensureIntrinsic(
        "llvm.va_start",
        [{ name: "list", type: { type: "pointer", base: { type: "i8" } } }],
        { type: "void" },
      );

      // Define struct.__va_list_tag if not exists
      if (!gen.module.structs.some((s) => s.name === "struct.__va_list_tag")) {
        gen.module.addStruct("struct.__va_list_tag", [
          { type: "i32" },
          { type: "i32" },
          { type: "pointer", base: { type: "i8" } },
          { type: "pointer", base: { type: "i8" } },
        ]);
      }

      const vaList = gen.emitAlloca(
        { type: "struct", name: "struct.__va_list_tag", fields: [] },
        "va_list",
      );
      gen.emitCall(
        "llvm.va_start",
        [{ value: vaList, type: { type: "pointer", base: { type: "i8" } } }],
        { type: "void" },
      );

      // Extract reg_save_area (index 3) and overflow_arg_area (index 2)
      // We need to know the structure of va_list. It is target dependent.
      // On x86_64 linux it is:
      // struct __va_list_tag {
      //   i32 gp_offset;
      //   i32 fp_offset;
      //   ptr overflow_arg_area;
      //   ptr reg_save_area;
      // }
      // We can use getelementptr to access fields.

      // reg_save_area is at index 3
      const regSaveAreaPtr = gen.emitGEP(
        { type: "struct", name: "struct.__va_list_tag", fields: [] },
        vaList,
        [
          { value: "0", type: "i32" },
          { value: "3", type: "i32" },
        ],
      );
      const regSaveArea = gen.emitLoad(
        { type: "pointer", base: { type: "i8" } },
        regSaveAreaPtr,
      );

      // overflow_arg_area is at index 2
      const overflowArgAreaPtr = gen.emitGEP(
        { type: "struct", name: "struct.__va_list_tag", fields: [] },
        vaList,
        [
          { value: "0", type: "i32" },
          { value: "2", type: "i32" },
        ],
      );
      const overflowArgArea = gen.emitLoad(
        { type: "pointer", base: { type: "i8" } },
        overflowArgAreaPtr,
      );

      // Count fixed GP arguments
      let gpCount = 0;
      this.args.forEach((arg) => {
        const isFloat = arg.type.name === "f32" || arg.type.name === "f64";
        if (!isFloat) gpCount++;
      });

      funcScope.define("__va_reg_save_area__", {
        offset: "0",
        type: "local",
        varType: { name: "u64", isPointer: 1, isArray: [] },
        irName: regSaveArea,
      });

      funcScope.define("__va_overflow_arg_area__", {
        offset: "0",
        type: "local",
        varType: { name: "u64", isPointer: 1, isArray: [] },
        irName: overflowArgArea,
      });

      funcScope.define("__va_gp_offset__", {
        offset: gpCount.toString(),
        type: "local",
        varType: { name: "u64", isPointer: 0, isArray: [] },
        irName: gpCount.toString(),
      });
    }

    this.body.toIR(gen, funcScope);

    if (irReturnType.type === "void") {
      gen.emitReturn(null);
    }

    return "";
  }
}
