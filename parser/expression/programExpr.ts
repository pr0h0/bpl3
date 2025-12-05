import HelperGenerator from "../../transpiler/HelperGenerator";
import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import type { IRType } from "../../transpiler/ir/IRType";

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

  toIR(gen: IRGenerator, scope: Scope): string {
    this.validate();

    const weHaveExportStmt = this.expressions.find(
      (expr) => expr.type === ExpressionType.ExportExpression,
    );

    for (const expr of this.expressions) {
      expr.toIR(gen, scope);
    }

    // Generate instantiated generic methods
    this.generateInstantiatedGenericMethods(gen, scope);

    if (!weHaveExportStmt) {
      const irArgs = [
        { name: "argc", type: { type: "i32" } as any },
        {
          name: "argv",
          type: { type: "pointer", base: { type: "i8" } } as any,
        },
        {
          name: "envp",
          type: { type: "pointer", base: { type: "i8" } } as any,
        },
      ];
      const irRet = { type: "i32" } as any;

      gen.createFunction("main", irArgs, irRet);
      const entry = gen.createBlock("entry");
      gen.setBlock(entry);

      const userMain = scope.resolveFunction("main");
      if (userMain) {
        const callArgs: { value: string; type: IRType }[] = [];
        if (userMain.args) {
          userMain.args.forEach((arg, index) => {
            if (index === 0)
              callArgs.push({ value: "%argc", type: { type: "i32" } });
            else if (index === 1)
              callArgs.push({
                value: "%argv",
                type: { type: "pointer", base: { type: "i8" } },
              });
            else if (index === 2)
              callArgs.push({
                value: "%envp",
                type: { type: "pointer", base: { type: "i8" } },
              });
          });
        }

        const retType = userMain.returnType
          ? gen.getIRType(userMain.returnType)
          : ({ type: "void" } as any);
        const res = gen.emitCall("user_main", callArgs, retType);

        if (retType.type === "void") {
          gen.emitReturn("0", { type: "i32" });
        } else {
          // Cast result to i32 if needed
          if (retType.type === "i64") {
            const trunc = gen.emitCast(
              IROpcode.TRUNC,
              res!,
              { type: "i32" },
              retType,
            );
            gen.emitReturn(trunc, { type: "i32" });
          } else if (retType.type === "i8" || retType.type === "i16") {
            const zext = gen.emitCast(
              IROpcode.ZEXT,
              res!,
              { type: "i32" },
              retType,
            );
            gen.emitReturn(zext, { type: "i32" });
          } else if (retType.type === "i32") {
            gen.emitReturn(res, { type: "i32" });
          } else {
            gen.emitReturn("0", { type: "i32" });
          }
        }
      } else {
        gen.emitReturn("0", { type: "i32" });
      }
    }
    return "";
  }

  private generateInstantiatedGenericMethods(
    gen: IRGenerator,
    scope: Scope,
  ): void {
    // Find all generic struct declarations
    const genericStructs = this.expressions.filter(
      (expr) =>
        expr.type === ExpressionType.StructureDeclaration &&
        (expr as any).genericParams &&
        (expr as any).genericParams.length > 0,
    );

    // For each generic struct, find all instantiated versions in the scope
    for (const structExpr of genericStructs) {
      const structDecl = structExpr as any;
      const baseTypeName = structDecl.name;

      // Look through all types in scope to find instantiations
      const globalScope = scope.getGlobalScope();
      for (const [typeName, typeInfo] of globalScope.types) {
        // Check if this is an instantiation of our generic struct
        if (
          typeName.startsWith(baseTypeName + "<") &&
          typeInfo.name === typeName
        ) {
          // Generate methods for this instantiation
          this.generateMethodsForInstantiation(
            gen,
            scope,
            structDecl,
            typeName,
          );
        }
      }
    }
  }

  private generateMethodsForInstantiation(
    gen: IRGenerator,
    scope: Scope,
    structDecl: any,
    instantiatedTypeName: string,
  ): void {
    const { mangleMethod } = require("../../utils/methodMangler");

    // Extract generic type mappings from instantiated type name
    const paramMap = this.extractGenericMappings(
      structDecl.genericParams,
      instantiatedTypeName,
    );

    // Generate IR for each method
    for (const method of structDecl.methods) {
      const mangledName = mangleMethod(instantiatedTypeName, method.name);

      // Check if this method was already instantiated during semantic analysis
      // If so, it was already added to the program and will be/was IR-generated
      const funcInfo = scope.resolveFunction(mangledName);
      if (
        funcInfo &&
        funcInfo.astDeclaration &&
        (funcInfo.astDeclaration as any)._analyzed
      ) {
        continue; // Skip - already handled during semantic analysis
      }

      // Clone and substitute generic types in the method
      const substitutedMethod = this.substituteGenericTypesInMethod(
        method,
        paramMap,
      );

      // Mark method as belonging to the instantiated type
      (substitutedMethod as any).isMethod = true;
      (substitutedMethod as any).receiverStruct = instantiatedTypeName;

      // Generate the method IR with substituted types
      substitutedMethod.toIR(gen, scope);
    }
  }

  private substituteGenericTypesInMethod(
    method: any,
    paramMap: Map<string, any>,
  ): any {
    // Deep clone the method to avoid modifying the original
    const clonedMethod = this.cloneMethod(method);

    // Substitute types in arguments
    if (clonedMethod.args) {
      clonedMethod.args = clonedMethod.args.map((arg: any) => ({
        ...arg,
        type: this.substituteTypeInVariableType(arg.type, paramMap),
      }));
    }

    // Substitute return type
    if (clonedMethod.returnType) {
      clonedMethod.returnType = this.substituteTypeInVariableType(
        clonedMethod.returnType,
        paramMap,
      );
    }

    return clonedMethod;
  }

  private cloneMethod(method: any): any {
    // Create a new FunctionDeclarationExpr with the same properties
    const FunctionDeclarationExpr = require("./functionDeclaration").default;

    return new FunctionDeclarationExpr(
      method.name,
      method.args ? JSON.parse(JSON.stringify(method.args)) : [],
      method.returnType ? JSON.parse(JSON.stringify(method.returnType)) : null,
      method.body, // Keep same body reference (expressions will resolve types at IR time)
      method.nameToken,
      method.isVariadic || false,
      method.variadicType
        ? JSON.parse(JSON.stringify(method.variadicType))
        : null,
    );
  }

  private substituteTypeInVariableType(
    type: any,
    paramMap: Map<string, any>,
  ): any {
    if (paramMap.has(type.name)) {
      // Replace generic parameter with concrete type
      const concreteType = paramMap.get(type.name);
      return {
        ...concreteType,
        isPointer: type.isPointer + (concreteType.isPointer || 0),
        isArray: [...type.isArray, ...(concreteType.isArray || [])],
      };
    }

    // Handle generic args recursively (e.g., Container<T>)
    if (type.genericArgs && type.genericArgs.length > 0) {
      return {
        ...type,
        genericArgs: type.genericArgs.map((arg: any) =>
          this.substituteTypeInVariableType(arg, paramMap),
        ),
      };
    }

    return type;
  }

  private extractGenericMappings(
    genericParams: string[],
    instantiatedTypeName: string,
  ): Map<string, any> {
    const paramMap = new Map<string, any>();

    // Parse the instantiated type name (e.g., "Container<i32>")
    const match = instantiatedTypeName.match(/^([^<]+)<(.+)>$/);
    if (!match || !genericParams || genericParams.length === 0) {
      return paramMap;
    }

    const typeArgsString = match[2]!;
    const typeArgs = typeArgsString.split(",").map((s) => s.trim());

    for (let i = 0; i < genericParams.length && i < typeArgs.length; i++) {
      const paramName = genericParams[i]!;
      const concreteTypeName = typeArgs[i];

      // Create a VariableType object for the concrete type
      paramMap.set(paramName, {
        name: concreteTypeName,
        isPointer: 0,
        isArray: [],
      });
    }

    return paramMap;
  }
}
