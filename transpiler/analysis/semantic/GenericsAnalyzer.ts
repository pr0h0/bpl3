import type { ISemanticAnalyzer } from "./ISemanticAnalyzer";
import ArrayLiteralExpr from "../../../parser/expression/arrayLiteralExpr";
import BinaryExpr from "../../../parser/expression/binaryExpr";
import BlockExpr from "../../../parser/expression/blockExpr";
import CastExpr from "../../../parser/expression/castExpr";
import Expression from "../../../parser/expression/expr";
import FunctionCallExpr from "../../../parser/expression/functionCallExpr";
import FunctionDeclarationExpr from "../../../parser/expression/functionDeclaration";
import IfExpr from "../../../parser/expression/ifExpr";
import MemberAccessExpr from "../../../parser/expression/memberAccessExpr";
import MethodCallExpr from "../../../parser/expression/methodCallExpr";
import ReturnExpr from "../../../parser/expression/returnExpr";
import { SizeofExpr } from "../../../parser/expression/sizeofExpr";
import StructLiteralExpr from "../../../parser/expression/structLiteralExpr";
import UnaryExpr from "../../../parser/expression/unaryExpr";
import VariableDeclarationExpr, {
  type VariableType,
} from "../../../parser/expression/variableDeclarationExpr";
import ExpressionType from "../../../parser/expressionType";
import { mangleMethod } from "../../../utils/methodMangler";
import Scope, { type FunctionInfo, type TypeInfo } from "../../Scope";

export class GenericsAnalyzer {
  constructor(private analyzer: ISemanticAnalyzer) {}

  public monomorphizeFunction(
    func: FunctionInfo,
    typeArgs: VariableType[],
    scope: Scope,
    line: number,
  ): FunctionInfo {
    // Generate mangled name for this instantiation
    const mangledName = this.getMangledFunctionName(func.name, typeArgs);

    // Check if this instantiation already exists
    const existing = scope.resolveFunction(mangledName);
    if (existing) {
      return existing;
    }

    // Clone the function declaration
    if (!func.astDeclaration) {
      throw new Error(
        `Cannot monomorphize function '${func.name}' without AST declaration.`,
      );
    }

    const clonedDecl = this.cloneFunctionDeclaration(func.astDeclaration);
    // Preserve the original scope for resolving symbols during analysis
    if (func.astDeclaration.scope && !clonedDecl.scope) {
      clonedDecl.scope = func.astDeclaration.scope;
    }

    // Create type substitution map
    const typeMap = new Map<string, VariableType>();
    if (func.genericParams) {
      for (let i = 0; i < func.genericParams.length; i++) {
        if (typeArgs[i]) {
          typeMap.set(func.genericParams[i]!, typeArgs[i]!);
        }
      }
    }

    // Substitute types throughout the cloned function
    this.substituteTypesInFunction(clonedDecl, typeMap);

    // Update the function name to mangled name
    clonedDecl.name = mangledName;
    clonedDecl.genericParams = []; // Clear generic params since this is now concrete

    if (func.isMethod) {
      clonedDecl.isMethod = true;
      clonedDecl.receiverStruct = func.receiverStruct;
    }

    // For methods, we need to preserve the 'this' parameter which is in func.args
    // but not in the AST declaration
    let finalArgs = clonedDecl.args;
    const thisParam =
      func.isMethod && func.args.length > clonedDecl.args.length
        ? func.args[0]
        : undefined;
    if (thisParam) {
      // If we have a this param, we might need to substitute its type too
      // But usually 'this' type is handled by the struct instantiation logic
      // However, if the method itself is generic, we need to be careful.
      // For now, just prepend it.
      finalArgs = [thisParam, ...clonedDecl.args];
    }

    // Define the monomorphized function in scope FIRST to avoid re-entry
    scope.defineFunction(mangledName, {
      name: mangledName,
      label: `${mangledName}_start`,
      startLabel: `${mangledName}_start`,
      endLabel: `${mangledName}_end`,
      args: finalArgs.map((a) => ({ name: a.name, type: a.type })),
      returnType: clonedDecl.returnType,
      isExternal: false,
      isVariadic: clonedDecl.isVariadic,
      variadicType: clonedDecl.variadicType,
      genericParams: [],
      astDeclaration: clonedDecl,
      isMethod: func.isMethod,
      receiverStruct: func.receiverStruct,
      originalName: func.originalName,
    });

    // Add the monomorphized function to the program so it gets code generated
    if (this.analyzer.currentProgram) {
      this.analyzer.currentProgram.addExpression(clonedDecl);
    }

    // Ensure the original scope (from the library) has access to types from the current scope
    // This is necessary for monomorphization to work when the generic type arguments
    // (like String) are defined in the current file but not in the library where the generic was defined
    if (clonedDecl.scope && clonedDecl.scope !== scope) {
      // Copy missing types from current scope (including parent chain) to the analysis scope
      const typesToCopy: Map<string, TypeInfo> = new Map();

      // Collect all types from current scope chain
      let currentScope: Scope | null = scope;
      while (currentScope) {
        for (const [typeName, typeInfo] of currentScope.types) {
          if (!typesToCopy.has(typeName)) {
            typesToCopy.set(typeName, typeInfo);
          }
        }
        currentScope = currentScope.parent;
      }

      // Copy to analysis scope (but don't overwrite existing types)
      for (const [typeName, typeInfo] of typesToCopy) {
        if (!clonedDecl.scope.resolveType(typeName)) {
          clonedDecl.scope.defineType(typeName, typeInfo);
        }
      }
    }

    const analyzeScope = clonedDecl.scope || scope;
    this.analyzer.analyzeFunctionDeclaration(clonedDecl, analyzeScope);

    const instantiated = scope.resolveFunction(mangledName);
    if (!instantiated) {
      throw new Error(
        `Failed to instantiate generic function '${func.name}' -> '${mangledName}'`,
      );
    }

    return instantiated;
  }

  public instantiateStructMethod(
    structName: string,
    methodAst: FunctionDeclarationExpr,
    typeArgs: VariableType[],
    scope: Scope,
    genericParams: string[],
  ): void {
    const mangledName = mangleMethod(structName, methodAst.name);

    // Check if already exists
    if (scope.resolveFunction(mangledName)) return;

    // Get the type info to find the defining scope
    const typeInfo = scope.resolveType(structName);
    const definingScope = typeInfo?.definingScope;

    // Check if already exists in defining scope
    if (definingScope) {
      const existing = definingScope.resolveFunction(mangledName);
      if (existing) {
        scope.defineFunction(mangledName, existing);
        return;
      }
    }

    // Clone AST
    const clonedDecl = this.cloneFunctionDeclaration(methodAst);
    // Preserve the original scope for resolving symbols during analysis
    if (methodAst.scope && !clonedDecl.scope) {
      clonedDecl.scope = methodAst.scope;
    }

    // If no scope is set on the method but we have a defining scope, use that
    if (!clonedDecl.scope && definingScope) {
      clonedDecl.scope = definingScope;
    }

    // Substitute types
    const typeMap = new Map<string, VariableType>();
    for (let i = 0; i < genericParams.length; i++) {
      if (typeArgs[i]) {
        typeMap.set(genericParams[i]!, typeArgs[i]!);
      }
    }

    this.substituteTypesInFunction(clonedDecl, typeMap);

    // Update name
    clonedDecl.name = mangledName;
    clonedDecl.isMethod = true;
    clonedDecl.receiverStruct = structName;

    // Add 'this' param with proper generic args
    let thisType: VariableType;
    const match = structName.match(/^([^<]+)<(.+)>$/);
    if (match) {
      const baseName = match[1]!;
      const argsStr = match[2]!;
      const genericArgNames = this.parseGenericArgs(argsStr);
      thisType = {
        name: baseName,
        isPointer: 1,
        isArray: [],
        genericArgs: genericArgNames.map((arg) => this.parseTypeString(arg)),
      };
    } else {
      thisType = {
        name: structName,
        isPointer: 1,
        isArray: [],
      };
    }

    // Store the this type on the declaration for later use
    clonedDecl.thisType = thisType;

    const thisParam = {
      name: "this",
      type: thisType,
    };

    const finalArgs = [thisParam, ...clonedDecl.args];

    // Define in scope - register in BOTH the defining scope (if different) and current scope
    const funcInfo: FunctionInfo = {
      name: mangledName,
      label: mangledName,
      startLabel: `${mangledName}_start`,
      endLabel: `${mangledName}_end`,
      args: finalArgs.map((a) => ({ name: a.name, type: a.type })),
      returnType: clonedDecl.returnType,
      isExternal: false,
      isVariadic: clonedDecl.isVariadic,
      variadicType: clonedDecl.variadicType,
      genericParams: [],
      astDeclaration: clonedDecl,
      isMethod: true,
      receiverStruct: structName,
      originalName: methodAst.name,
      definitionScope: definingScope,
    };

    // Register in global scope to ensure it's visible to IR generator
    scope.getGlobalScope().defineFunction(mangledName, funcInfo);

    // Also register in defining scope if it's different
    if (definingScope && definingScope !== scope) {
      if (!definingScope.resolveFunction(mangledName)) {
        definingScope.defineFunction(mangledName, funcInfo);
      }
    }

    // Verify the function was stored correctly
    const stored = scope.resolveFunction(mangledName);
    const storedThisArg = stored?.args.find((arg) => arg.name === "this");

    // Add to program
    if (this.analyzer.currentProgram) {
      this.analyzer.currentProgram.addExpression(clonedDecl);
    }

    // Ensure the scope used for analysis has access to types from the current scope
    // This is necessary for monomorphization to work when the generic type arguments
    // (like String) are defined in the current file but not in the library where the generic was defined
    const analyzeScope = clonedDecl.scope || definingScope || scope;
    if (analyzeScope && analyzeScope !== scope) {
      // Copy missing types from current scope (including parent chain) to the analysis scope
      const typesToCopy: Map<string, TypeInfo> = new Map();

      // Collect all types from current scope chain
      let currentScope: Scope | null = scope;
      while (currentScope) {
        for (const [typeName, typeInfo] of currentScope.types) {
          if (!typesToCopy.has(typeName)) {
            typesToCopy.set(typeName, typeInfo);
          }
        }
        currentScope = currentScope.parent;
      }

      // Copy to analysis scope (but don't overwrite existing types)
      for (const [typeName, typeInfo] of typesToCopy) {
        if (!analyzeScope.resolveType(typeName)) {
          analyzeScope.defineType(typeName, typeInfo);
        }
      }
    }

    this.analyzer.analyzeFunctionDeclaration(clonedDecl, analyzeScope);
    clonedDecl._analyzed = true;
  }

  private getMangledFunctionName(
    baseName: string,
    typeArgs: VariableType[],
  ): string {
    const mangledTypes = typeArgs.map((t) => this.mangleTypeName(t)).join("_");
    return `${baseName}__${mangledTypes}`;
  }

  private mangleTypeName(type: VariableType): string {
    let result = "";

    if (type.isPointer > 0) {
      result += "ptr_".repeat(type.isPointer);
    }

    result += type.name;

    if (type.isArray && type.isArray.length > 0) {
      result += "_arr" + type.isArray.join("_");
    }

    if (type.genericArgs && type.genericArgs.length > 0) {
      result +=
        "_lt_" +
        type.genericArgs.map((t) => this.mangleTypeName(t)).join("_") +
        "_gt_";
    }

    return result;
  }

  private deepCloneExpression(expr: any): any {
    if (!expr || typeof expr !== "object") {
      return expr;
    }

    if (Array.isArray(expr)) {
      return expr.map((item) => this.deepCloneExpression(item));
    }

    // Create a new object with the same prototype
    const cloned = Object.create(Object.getPrototypeOf(expr));

    // Copy all properties
    for (const key in expr) {
      if (Object.prototype.hasOwnProperty.call(expr, key)) {
        cloned[key] = this.deepCloneExpression(expr[key]);
      }
    }

    return cloned;
  }

  private cloneFunctionDeclaration(
    decl: FunctionDeclarationExpr,
  ): FunctionDeclarationExpr {
    // Deep clone the body to avoid mutating the original template
    const clonedBody = decl.body
      ? this.deepCloneExpression(decl.body)
      : decl.body;

    // Deep clone is handled by creating a new instance with cloned properties
    return new FunctionDeclarationExpr(
      decl.name,
      decl.args.map((a) => ({
        name: a.name,
        type: {
          ...a.type,
          genericArgs: a.type.genericArgs?.map((g) => ({ ...g })),
        },
      })),
      decl.returnType
        ? {
            ...decl.returnType,
            genericArgs: decl.returnType.genericArgs?.map((g) => ({ ...g })),
          }
        : decl.returnType,
      clonedBody,
      decl.nameToken,
      decl.isVariadic,
      decl.variadicType
        ? {
            ...decl.variadicType,
            genericArgs: decl.variadicType.genericArgs?.map((g) => ({ ...g })),
          }
        : undefined,
      decl.genericParams ? [...decl.genericParams] : undefined,
      decl.scope,
    );
  }

  private substituteTypesInFunction(
    decl: FunctionDeclarationExpr,
    typeMap: Map<string, VariableType>,
  ): void {
    // Substitute in return type
    if (decl.returnType) {
      this.substituteType(decl.returnType, typeMap);
    }

    // Substitute in arguments
    for (const arg of decl.args) {
      this.substituteType(arg.type, typeMap);
    }

    // Substitute in variadic type
    if (decl.variadicType) {
      this.substituteType(decl.variadicType, typeMap);
    }

    // Substitute in body - recursively walk all expressions
    if (decl.body) {
      this.substituteTypesInExpression(decl.body, typeMap);
    }
  }

  private substituteTypesInExpression(
    expr: Expression,
    typeMap: Map<string, VariableType>,
  ): void {
    // Handle different expression types
    switch (expr.type) {
      case ExpressionType.VariableDeclaration:
        const varDecl = expr as VariableDeclarationExpr;
        if (varDecl.varType) {
          this.substituteType(varDecl.varType, typeMap);
        }
        if (varDecl.value) {
          this.substituteTypesInExpression(varDecl.value, typeMap);
        }
        break;

      case ExpressionType.BlockExpression:
        const block = expr as BlockExpr;
        for (const subExpr of block.expressions) {
          this.substituteTypesInExpression(subExpr, typeMap);
        }
        break;

      case ExpressionType.IfExpression:
        const ifExpr = expr as IfExpr;
        this.substituteTypesInExpression(ifExpr.condition, typeMap);
        this.substituteTypesInExpression(ifExpr.thenBranch, typeMap);
        if (ifExpr.elseBranch) {
          this.substituteTypesInExpression(ifExpr.elseBranch, typeMap);
        }
        break;

      case ExpressionType.ReturnExpression:
        const retExpr = expr as ReturnExpr;
        if (retExpr.value) {
          this.substituteTypesInExpression(retExpr.value, typeMap);
        }
        break;

      case ExpressionType.FunctionCall:
        const callExpr = expr as FunctionCallExpr;
        for (const arg of callExpr.args) {
          this.substituteTypesInExpression(arg, typeMap);
        }
        // Also substitute generic args if present
        if (callExpr.genericArgs) {
          for (const genArg of callExpr.genericArgs) {
            this.substituteType(genArg, typeMap);
          }
        }
        break;

      case ExpressionType.BinaryExpression:
        const binOp = expr as BinaryExpr;
        this.substituteTypesInExpression(binOp.left, typeMap);
        this.substituteTypesInExpression(binOp.right, typeMap);
        break;

      case ExpressionType.UnaryExpression:
        const unaryOp = expr as UnaryExpr;
        this.substituteTypesInExpression(unaryOp.right, typeMap);
        break;

      case ExpressionType.CastExpression:
        const cast = expr as CastExpr;
        this.substituteTypesInExpression(cast.value, typeMap);
        if (cast.targetType) {
          this.substituteType(cast.targetType, typeMap);
        }
        break;

      case ExpressionType.MethodCallExpr:
        const methodCall = expr as MethodCallExpr;
        this.substituteTypesInExpression(methodCall.receiver, typeMap);
        for (const arg of methodCall.args) {
          this.substituteTypesInExpression(arg, typeMap);
        }
        if (methodCall.genericArgs) {
          for (const genArg of methodCall.genericArgs) {
            this.substituteType(genArg, typeMap);
          }
        }
        break;

      case ExpressionType.MemberAccessExpression:
        const memberAccess = expr as MemberAccessExpr;
        this.substituteTypesInExpression(memberAccess.object, typeMap);
        if (memberAccess.isIndexAccess) {
          this.substituteTypesInExpression(memberAccess.property, typeMap);
        }
        break;

      case ExpressionType.ArrayLiteralExpr:
        const arrayLit = expr as ArrayLiteralExpr;
        for (const elem of arrayLit.elements) {
          this.substituteTypesInExpression(elem, typeMap);
        }
        break;

      case ExpressionType.StructLiteralExpr:
        const structLit = expr as StructLiteralExpr;
        for (const field of structLit.fields) {
          this.substituteTypesInExpression(field.value, typeMap);
        }
        break;

      case ExpressionType.SizeOfExpression:
        const sizeofExpr = expr as SizeofExpr;
        if (sizeofExpr.typeArg) {
          this.substituteType(sizeofExpr.typeArg, typeMap);
        }
        break;

      default:
        break;
    }
  }

  private substituteType(
    type: VariableType,
    typeMap: Map<string, VariableType>,
  ): void {
    const concrete = typeMap.get(type.name);
    if (concrete) {
      // Replace with concrete type
      type.name = concrete.name;
      // Add pointer levels
      type.isPointer += concrete.isPointer;
      // Add array dimensions
      type.isArray = [...type.isArray, ...concrete.isArray];
      // If concrete type has generic args, use them
      if (concrete.genericArgs) {
        type.genericArgs = concrete.genericArgs.map((g) => ({ ...g }));
      }
    }

    // Recursively substitute in generic args
    if (type.genericArgs) {
      for (const arg of type.genericArgs) {
        this.substituteType(arg, typeMap);
      }
    }
  }

  private parseGenericArgs(argsString: string): string[] {
    const args: string[] = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if (char === "<") {
        depth++;
        current += char;
      } else if (char === ">") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        args.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args;
  }

  private parseTypeString(typeStr: string): VariableType {
    const trimmed = typeStr.trim();

    // Check for generics
    const genericMatch = trimmed.match(/^([^<]+)<(.+)>$/);
    if (genericMatch) {
      const baseName = genericMatch[1]!.trim();
      const argsString = genericMatch[2]!;
      const genericArgNames = this.parseGenericArgs(argsString);

      return {
        name: baseName,
        isPointer: 0,
        isArray: [],
        genericArgs: genericArgNames.map((arg) => this.parseTypeString(arg)),
      };
    }

    // Simple type
    return {
      name: trimmed,
      isPointer: 0,
      isArray: [],
    };
  }
}
