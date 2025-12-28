/**
 * TypeChecker - Main type checking class for BPL
 * Extends TypeCheckerBase and uses modular checker functions
 */

import * as fs from "fs";
import * as path from "path";

import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";
import { TokenType } from "../frontend/TokenType";
import type { Symbol } from "./SymbolTable";
import { SymbolTable } from "./SymbolTable";
import { TypeCheckerBase } from "./TypeCheckerBase";
import {
  TypeUtils,
  TypeSubstitution,
  INTEGER_TYPES,
  KNOWN_TYPES,
  NUMERIC_TYPES,
} from "./TypeUtils";
import { OPERATOR_METHOD_MAP, OverloadResolver } from "./OverloadResolver";
import { ImportHandler } from "./ImportHandler";
import type { CheckerContext } from "./CheckerContext";

// Import checker functions
import * as ExprChecker from "./ExpressionChecker";
import * as StmtChecker from "./StatementChecker";
import * as CallChecker from "./CallChecker";

/**
 * TypeChecker implementation that uses modular checker functions
 */
export class TypeChecker extends TypeCheckerBase implements CheckerContext {
  private importHandler: ImportHandler;
  private overloadResolver: OverloadResolver;
  public matchContext: {
    expectedType?: AST.TypeNode;
    inferredTypes: AST.TypeNode[];
  }[] = [];

  constructor(
    options: {
      skipImportResolution?: boolean;
      collectAllErrors?: boolean;
    } = {},
  ) {
    super(options);
    this.importHandler = new ImportHandler(this);
    this.overloadResolver = new OverloadResolver(this);

    // Load implicit imports (primitives)
    if (!options.skipImportResolution) {
      this.importHandler.loadImplicitImports();
    }
  }

  /**
   * Inject primitive symbols from a loaded module into the global scope
   * Used when running with module resolution to ensure primitives are available globally
   */
  public injectPrimitivesFromModule(modulePath: string): void {
    const moduleScope = this.modules.get(modulePath);
    if (!moduleScope) return;

    const symbolsToExport = [
      "Int",
      "Bool",
      "Double",
      "Long",
      "Char",
      "UChar",
      "Short",
      "UShort",
      "UInt",
      "ULong",
    ];

    for (const name of symbolsToExport) {
      const symbol = moduleScope.resolve(name);
      if (symbol) {
        // Define in global scope if not already defined
        if (!this.globalScope.resolve(name)) {
          this.globalScope.define({
            name,
            kind: symbol.kind,
            type: symbol.type,
            declaration: symbol.declaration,
          });
        }
      }
    }
  }

  // ========== Program Checking ==========

  public checkProgram(program: AST.Program, modulePath?: string): void {
    const moduleScope = new SymbolTable(this.globalScope);
    this.currentScope = moduleScope;

    if (modulePath) {
      this.modules.set(modulePath, moduleScope);
    }

    // Pass 0: Process imports
    for (const stmt of program.statements) {
      if (stmt.kind === "Import") {
        try {
          this.checkImport(stmt as AST.ImportStmt);
        } catch (e) {
          if (this.collectAllErrors && e instanceof CompilerError) {
            this.errors.push(e);
            continue;
          }
          throw e;
        }
      }
    }

    // Pass 1: Hoist declarations
    for (const stmt of program.statements) {
      if (stmt.kind === "Import") continue;
      try {
        this.hoistDeclaration(stmt);
      } catch (e) {
        if (this.collectAllErrors && e instanceof CompilerError) {
          this.errors.push(e);
          continue;
        }
        throw e;
      }
    }

    // Pass 2: Check bodies
    for (const stmt of program.statements) {
      if (stmt.kind === "Import") continue;
      try {
        this.checkStatement(stmt);
      } catch (e) {
        if (this.collectAllErrors && e instanceof CompilerError) {
          this.errors.push(e);
          continue;
        }
        throw e;
      }
    }
  }

  // ========== Declaration Hoisting ==========

  public hoistDeclaration(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case "StructDecl":
        const structType: AST.TypeNode = {
          kind: "MetaType",
          type: {
            kind: "BasicType",
            name: stmt.name,
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: stmt.location,
            resolvedDeclaration: stmt,
          },
          location: stmt.location,
        };
        this.defineSymbol(stmt.name, "Struct", structType, stmt);
        this.registerLinkerSymbol(stmt.name, "type", structType, stmt);
        stmt.resolvedType = structType.type;
        break;
      case "EnumDecl":
        const enumType: AST.TypeNode = {
          kind: "MetaType",
          type: {
            kind: "BasicType",
            name: stmt.name,
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: stmt.location,
            resolvedDeclaration: stmt,
          },
          location: stmt.location,
        };
        this.defineSymbol(stmt.name, "Enum", enumType, stmt);
        this.registerLinkerSymbol(stmt.name, "type", enumType, stmt);
        stmt.resolvedType = enumType.type;
        break;
      case "SpecDecl":
        this.defineSymbol(stmt.name, "Spec", undefined, stmt);
        this.registerLinkerSymbol(stmt.name, "type", undefined, stmt);
        break;
      case "FunctionDecl":
        const isVariadic = stmt.params.some((p) => p.isVariadic);
        const functionType: AST.FunctionTypeNode = {
          kind: "FunctionType",
          returnType: this.resolveType(stmt.returnType),
          paramTypes: stmt.params.map((p) => {
            const resolved = this.resolveType(p.type);
            if (p.isVariadic && resolved.kind === "BasicType") {
              // Variadic parameters are passed as pointers (arrays)
              return { ...resolved, pointerDepth: resolved.pointerDepth + 1 };
            }
            return resolved;
          }),
          isVariadic: isVariadic,
          location: stmt.location,
          declaration: stmt,
        };
        this.defineSymbol(stmt.name, "Function", functionType, stmt);
        this.registerLinkerSymbol(stmt.name, "function", functionType, stmt);
        stmt.resolvedType = functionType;
        break;
      case "TypeAlias":
        this.defineSymbol(
          stmt.name,
          "TypeAlias",
          this.resolveType(stmt.type),
          stmt,
        );
        break;
      case "Extern":
        const externType: AST.FunctionTypeNode = {
          kind: "FunctionType",
          returnType: stmt.returnType
            ? this.resolveType(stmt.returnType)
            : {
                kind: "BasicType",
                name: "void",
                genericArgs: [],
                pointerDepth: 0,
                arrayDimensions: [],
                location: stmt.location,
              },
          paramTypes: stmt.params.map((p) => this.resolveType(p.type)),
          isVariadic: stmt.isVariadic,
          location: stmt.location,
        };
        this.defineSymbol(stmt.name, "Function", externType, stmt);
        this.registerLinkerSymbol(
          stmt.name,
          "function",
          externType,
          stmt,
          true,
        );
        stmt.resolvedType = externType;
        break;
      case "Import":
        this.checkImport(stmt);
        break;
    }
  }

  // ========== Statement Checking ==========

  public checkStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case "VariableDecl":
        this.checkVariableDecl(stmt);
        break;
      case "FunctionDecl":
        this.checkFunctionBody(stmt);
        break;
      case "StructDecl":
        this.checkStructBody(stmt);
        break;
      case "EnumDecl":
        this.checkEnumBody(stmt);
        break;
      case "SpecDecl":
        this.checkSpecBody(stmt);
        break;
      case "TypeAlias":
        this.checkTypeAlias(stmt);
        break;
      case "ExpressionStmt":
        this.checkExpression(stmt.expression);
        break;
      case "Block":
        StmtChecker.checkBlock.call(this, stmt);
        break;
      case "If":
        StmtChecker.checkIf.call(this, stmt);
        break;
      case "Loop":
        StmtChecker.checkLoop.call(this, stmt);
        break;
      case "Return":
        StmtChecker.checkReturn.call(this, stmt);
        break;
      case "Break":
        StmtChecker.checkBreak.call(this, stmt);
        break;
      case "Continue":
        StmtChecker.checkContinue.call(this, stmt);
        break;
      case "Try":
        StmtChecker.checkTry.call(this, stmt);
        break;
      case "Throw":
        StmtChecker.checkThrow.call(this, stmt);
        break;
      case "Switch":
        StmtChecker.checkSwitch.call(this, stmt);
        break;
      case "Asm":
        StmtChecker.checkAsm.call(this, stmt as AST.AsmBlockStmt);
        break;
      case "Import":
      case "Export":
      case "Extern":
        // Already handled in hoisting phase
        break;
    }
  }

  // ========== Expression Checking ==========

  public checkExpression(expr: AST.Expression): AST.TypeNode | undefined {
    let type: AST.TypeNode | undefined;
    switch (expr.kind) {
      case "Literal":
        type = ExprChecker.checkLiteral.call(this, expr);
        break;
      case "InterpolatedString":
        type = ExprChecker.checkInterpolatedString.call(this, expr);
        break;
      case "Identifier":
        type = ExprChecker.checkIdentifier.call(this, expr);
        break;
      case "Binary":
        type = ExprChecker.checkBinary.call(this, expr);
        break;
      case "Unary":
        type = ExprChecker.checkUnary.call(this, expr);
        break;
      case "Assignment":
        type = this.checkAssignment(expr);
        break;
      case "Call":
        type = CallChecker.checkCall.call(this, expr);
        break;
      case "Member":
        type = CallChecker.checkMember.call(this, expr);
        break;
      case "Index":
        type = CallChecker.checkIndex.call(this, expr);
        break;
      case "Ternary":
        type = ExprChecker.checkTernary.call(this, expr);
        break;
      case "Cast":
        type = ExprChecker.checkCast.call(this, expr);
        break;
      case "Sizeof":
        type = ExprChecker.checkSizeof.call(this, expr);
        break;
      case "TypeMatch":
        type = ExprChecker.checkTypeMatch.call(this, expr);
        break;
      case "Is":
        type = ExprChecker.checkIs.call(this, expr);
        break;
      case "As":
        type = ExprChecker.checkAs.call(this, expr);
        break;
      case "Match":
        type = ExprChecker.checkMatchExpr.call(this, expr);
        break;
      case "ArrayLiteral":
        type = ExprChecker.checkArrayLiteral.call(this, expr);
        break;
      case "StructLiteral":
        type = ExprChecker.checkStructLiteral.call(this, expr);
        break;
      case "TupleLiteral":
        type = ExprChecker.checkTupleLiteral.call(this, expr);
        break;
      case "EnumStructVariant":
        type = this.checkEnumStructVariant(expr as AST.EnumStructVariantExpr);
        break;
      case "GenericInstantiation":
        type = this.checkGenericInstantiation(expr);
        break;
      case "LambdaExpression":
        type = ExprChecker.checkLambda.call(this, expr);
        break;
    }

    if (type) {
      const resolved = this.resolveType(type);
      expr.resolvedType = resolved;
    }
    return type;
  }

  // ========== Variable Declaration ==========

  private checkVariableDecl(decl: AST.VariableDecl): void {
    StmtChecker.checkVariableDecl.call(this, decl);
  }

  // ========== Function Body Checking ==========

  private checkFunctionBody(
    decl: AST.FunctionDecl,
    parentStruct?: AST.StructDecl | AST.EnumDecl,
  ): void {
    this.currentScope = this.currentScope.enterScope();

    if (parentStruct) {
      // Check for shadowing of generic parameters
      for (const gp of decl.genericParams) {
        if (parentStruct.genericParams.some((p) => p.name === gp.name)) {
          throw new CompilerError(
            `Shadowing of generic parameter '${gp.name}'`,
            `The generic parameter '${gp.name}' is already defined in the parent ${
              parentStruct.kind === "StructDecl" ? "struct" : "enum"
            } '${parentStruct.name}'. Please use a different name.`,
            decl.location,
          );
        }
      }

      // Define 'this'
      this.defineSymbol(
        "this",
        "Parameter",
        {
          kind: "BasicType",
          name: parentStruct.name,
          genericArgs: parentStruct.genericParams.map((p) => ({
            kind: "BasicType",
            name: p.name,
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: decl.location,
          })),
          pointerDepth: 1,
          arrayDimensions: [],
          location: decl.location,
        },
        decl,
        undefined,
        true, // 'this' is const
      );
    }

    // Add generic params to scope
    for (const gp of decl.genericParams) {
      this.defineSymbol(
        gp.name,
        "TypeAlias",
        {
          kind: "BasicType",
          name: gp.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: decl.location,
        },
        {
          kind: "GenericParam",
          location: decl.location,
          ...gp,
        } as AST.ASTNode,
      );
    }

    // Add params to scope
    const paramNames = new Set<string>();
    for (const param of decl.params) {
      if (paramNames.has(param.name)) {
        throw new CompilerError(
          `Duplicate parameter name '${param.name}'`,
          `The parameter '${param.name}' is declared multiple times in function '${decl.name}'.`,
          param.location,
        );
      }
      paramNames.add(param.name);

      let paramType = this.resolveType(param.type);

      if (
        paramType.kind === "BasicType" &&
        paramType.name === "void" &&
        paramType.pointerDepth === 0
      ) {
        throw new CompilerError(
          `Parameter '${param.name}' cannot be of type 'void'`,
          "Parameters cannot be void. Use '*void' for void pointers.",
          param.location,
        );
      }

      if (param.isVariadic) {
        // Variadic param is a pointer to array of Any
        // We treat it as *Any in the body
        if (paramType.kind === "BasicType") {
          paramType = {
            ...paramType,
            pointerDepth: paramType.pointerDepth + 1,
          };
        }

        // Define implicit count variable
        // const countName = `${param.name}_count`;
        // this.defineSymbol(
        //   countName,
        //   "Variable",
        //   {
        //     kind: "BasicType",
        //     name: "int",
        //     genericArgs: [],
        //     pointerDepth: 0,
        //     arrayDimensions: [],
        //     location: param.location,
        //   },
        //   param as any,
        //   undefined,
        //   true, // const
        // );
      }

      this.defineSymbol(
        param.name,
        "Variable",
        paramType,
        { ...param, kind: "Parameter" } as AST.ASTNode,
        undefined,
        param.isConst,
      );

      // Note: We used to define implicit _count variable here, but now we require
      // an explicit count parameter for native variadics.
    }

    const prevReturnType = this.currentFunctionReturnType;
    this.currentFunctionReturnType = decl.returnType;

    StmtChecker.checkBlock.call(this, decl.body, false);

    // Check return path for non-void functions
    if (
      decl.returnType.kind === "BasicType" &&
      decl.returnType.name !== "void"
    ) {
      if (!StmtChecker.checkAllPathsReturn.call(this, decl.body)) {
        throw new CompilerError(
          `Function '${decl.name}' may not return a value on all code paths`,
          "Ensure all paths return a value.",
          decl.location,
        );
      }
    }

    // Check for unused variables in function scope
    const unused = this.currentScope.getUnusedVariables();
    for (const symbol of unused) {
      if (symbol.name === "this") continue;
      if (symbol.name.startsWith("_")) continue;
      const error = new CompilerError(
        `Unused variable '${symbol.name}'`,
        "Variable is declared but never used.",
        symbol.declaration.location,
      );
      if (this.collectAllErrors) {
        this.errors.push(error);
      } else {
        throw error;
      }
    }

    this.currentFunctionReturnType = prevReturnType;
    this.currentScope = this.currentScope.exitScope();
  }

  // ========== Struct Body Checking ==========

  private checkSpecImplementation(
    structDecl: AST.StructDecl,
    specDecl: AST.SpecDecl,
    specType: AST.BasicTypeNode,
  ): void {
    const genericMap = new Map<string, AST.TypeNode>();
    if (specDecl.genericParams.length > 0 && specType.genericArgs.length > 0) {
      for (let i = 0; i < specDecl.genericParams.length; i++) {
        genericMap.set(
          specDecl.genericParams[i]!.name,
          specType.genericArgs[i]!,
        );
      }
    }

    const structType: AST.BasicTypeNode = {
      kind: "BasicType",
      name: structDecl.name,
      genericArgs: structDecl.genericParams.map((p) => ({
        kind: "BasicType",
        name: p.name,
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: p.location || structDecl.location,
      })),
      pointerDepth: 0,
      arrayDimensions: [],
      location: structDecl.location,
    };
    genericMap.set("Self", structType);

    for (const method of specDecl.methods) {
      const structMethod = structDecl.members.find(
        (m) => m.kind === "FunctionDecl" && m.name === method.name,
      ) as AST.FunctionDecl | undefined;

      if (!structMethod) {
        throw new CompilerError(
          `Struct '${structDecl.name}' does not implement method '${method.name}' from spec '${specDecl.name}'`,
          `Missing implementation of: ${method.name}`,
          structDecl.location,
        );
      }

      const expectedReturnType = method.returnType
        ? this.substituteType(method.returnType, genericMap)
        : this.makeVoidType();
      const resolvedActualReturnType = this.resolveType(
        structMethod.returnType,
      );

      if (
        !this.areTypesCompatible(expectedReturnType, resolvedActualReturnType)
      ) {
        throw new CompilerError(
          `Method '${method.name}' in struct '${structDecl.name}' has incorrect return type`,
          `Expected '${this.typeToString(expectedReturnType)}', got '${this.typeToString(resolvedActualReturnType)}'`,
          structMethod.location,
        );
      }

      if (method.params.length !== structMethod.params.length) {
        throw new CompilerError(
          `Method '${method.name}' in struct '${structDecl.name}' has incorrect parameter count`,
          `Expected ${method.params.length}, got ${structMethod.params.length}`,
          structMethod.location,
        );
      }

      for (let i = 0; i < method.params.length; i++) {
        const expectedParamType = this.substituteType(
          method.params[i]!.type,
          genericMap,
        );
        const actualParamType = this.resolveType(structMethod.params[i]!.type);

        if (!this.areTypesCompatible(expectedParamType, actualParamType)) {
          throw new CompilerError(
            `Parameter '${method.params[i]!.name}' of method '${method.name}' has incorrect type`,
            `Expected '${this.typeToString(expectedParamType)}', got '${this.typeToString(actualParamType)}'`,
            structMethod.params[i]!.type.location,
          );
        }
      }
    }
  }

  private checkStructBody(decl: AST.StructDecl): void {
    this.currentScope = this.currentScope.enterScope();

    // Check for duplicate member names
    const fieldNames = new Set<string>();
    const methodNames = new Set<string>();

    for (const member of decl.members) {
      if (member.kind === "FunctionDecl") {
        if (fieldNames.has(member.name)) {
          throw new CompilerError(
            `Method '${member.name}' conflicts with field in struct '${decl.name}'`,
            `The method '${member.name}' shares a name with a field in struct '${decl.name}'.`,
            member.location,
          );
        }
        methodNames.add(member.name);
      } else {
        // Field
        if (fieldNames.has(member.name)) {
          throw new CompilerError(
            `Duplicate field '${member.name}' in struct '${decl.name}'`,
            `The field '${member.name}' is defined multiple times in struct '${decl.name}'.`,
            member.location,
          );
        }
        if (methodNames.has(member.name)) {
          throw new CompilerError(
            `Field '${member.name}' conflicts with method in struct '${decl.name}'`,
            `The field '${member.name}' shares a name with a method in struct '${decl.name}'.`,
            member.location,
          );
        }
        fieldNames.add(member.name);
      }
    }

    // Add generic params
    for (const gp of decl.genericParams) {
      this.defineSymbol(
        gp.name,
        "TypeAlias",
        {
          kind: "BasicType",
          name: gp.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: decl.location,
        },
        {
          kind: "GenericParam",
          location: decl.location,
          ...gp,
        } as AST.ASTNode,
      );
    }

    // Check inheritance
    // Inject implicit inheritance from Type
    if (decl.name !== "Type") {
      let hasStructParent = false;
      for (const parent of decl.inheritanceList) {
        const resolved = this.resolveType(parent);
        if (
          resolved.kind === "BasicType" &&
          resolved.resolvedDeclaration &&
          resolved.resolvedDeclaration.kind === "StructDecl"
        ) {
          hasStructParent = true;
          break;
        }
      }

      if (!hasStructParent && decl.name !== "Type") {
        // Only add Type as parent if the struct has methods
        // This avoids adding vtable pointer overhead to POD structs
        const hasMethods = decl.members.some((m) => m.kind === "FunctionDecl");

        if (hasMethods) {
          // Add Type as parent
          // We rely on Type being available in the scope (e.g. via std import)
          try {
            const typeStruct = this.resolveType({
              kind: "BasicType",
              name: "Type",
              genericArgs: [],
              pointerDepth: 0,
              arrayDimensions: [],
              location: decl.location,
            });

            if (
              typeStruct.kind === "BasicType" &&
              typeStruct.resolvedDeclaration &&
              typeStruct.resolvedDeclaration.kind === "StructDecl"
            ) {
              decl.inheritanceList.push({
                kind: "BasicType",
                name: "Type",
                genericArgs: [],
                pointerDepth: 0,
                arrayDimensions: [],
                location: decl.location,
                resolvedDeclaration: typeStruct.resolvedDeclaration,
              });
            }
          } catch (e) {
            // Type struct not found (e.g. std not imported), ignore
          }
        }
      }
    }

    for (const parentType of decl.inheritanceList) {
      const resolvedParent = this.resolveType(parentType);
      if (
        resolvedParent.kind === "BasicType" &&
        resolvedParent.resolvedDeclaration &&
        resolvedParent.resolvedDeclaration.kind === "SpecDecl"
      ) {
        this.checkSpecImplementation(
          decl,
          resolvedParent.resolvedDeclaration as AST.SpecDecl,
          resolvedParent as AST.BasicTypeNode,
        );
      }
    }

    // Check member methods and fields
    for (const member of decl.members) {
      if (member.kind === "FunctionDecl") {
        // Set resolvedType for struct methods so CodeGenerator can use it
        const functionType: AST.FunctionTypeNode = {
          kind: "FunctionType",
          returnType: this.resolveType(member.returnType),
          paramTypes: member.params.map((p) => this.resolveType(p.type)),
          location: member.location,
          declaration: member,
        };
        member.resolvedType = functionType;

        this.checkFunctionBody(member, decl);
      } else if (member.kind === "StructField") {
        // Check for recursive struct definition without pointer
        const fieldType = this.resolveType(member.type);
        if (
          fieldType.kind === "BasicType" &&
          fieldType.name === decl.name &&
          fieldType.pointerDepth === 0 &&
          fieldType.arrayDimensions.length === 0
        ) {
          throw new CompilerError(
            `Recursive struct '${decl.name}' contains field '${member.name}' of type '${decl.name}' without pointer`,
            "Recursive structs must use pointers for self-reference (e.g., *Node instead of Node) to have finite size.",
            member.location,
          );
        }
      }
    }

    this.currentScope = this.currentScope.exitScope();
  }

  // ========== Enum Body Checking ==========

  private checkEnumBody(decl: AST.EnumDecl): void {
    this.currentScope = this.currentScope.enterScope();

    // Add generic params
    for (const gp of decl.genericParams) {
      this.defineSymbol(
        gp.name,
        "TypeAlias",
        {
          kind: "BasicType",
          name: gp.name,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: decl.location,
        },
        {
          kind: "GenericParam",
          location: decl.location,
          ...gp,
        } as AST.ASTNode,
      );
    }

    // Validate variants
    for (const variant of decl.variants) {
      if (variant.dataType) {
        if (variant.dataType.kind === "EnumVariantTuple") {
          for (const type of variant.dataType.types) {
            this.resolveType(type);
          }
        } else if (variant.dataType.kind === "EnumVariantStruct") {
          for (const field of variant.dataType.fields) {
            this.resolveType(field.type);
          }
        }
      }
    }

    // Check member methods
    if (decl.methods) {
      for (const method of decl.methods) {
        // Set resolvedType for enum methods so CodeGenerator can use it
        const functionType: AST.FunctionTypeNode = {
          kind: "FunctionType",
          returnType: this.resolveType(method.returnType),
          paramTypes: method.params.map((p) => this.resolveType(p.type)),
          location: method.location,
          declaration: method,
        };
        method.resolvedType = functionType;

        this.checkFunctionBody(method, decl);
      }
    }

    this.currentScope = this.currentScope.exitScope();
  }

  // ========== Spec Body Checking ==========

  private checkSpecBody(decl: AST.SpecDecl): void {
    // Validate inheritance list
    if (decl.extends) {
      for (const parentType of decl.extends) {
        if (parentType.kind === "BasicType") {
          const symbol = this.currentScope.resolve(parentType.name);
          if (!symbol) {
            throw new CompilerError(
              `Undefined spec '${parentType.name}' in inheritance list`,
              "Ensure the spec is defined.",
              parentType.location,
            );
          }
          if (symbol.kind !== "Spec") {
            throw new CompilerError(
              `Type '${parentType.name}' is not a spec`,
              "Only specs can be inherited by other specs.",
              parentType.location,
            );
          }
        }
        this.resolveType(parentType);
      }
    }

    // Validate spec methods
    for (const method of decl.methods) {
      for (const param of method.params) {
        this.resolveType(param.type);
      }
      if (method.returnType) {
        this.resolveType(method.returnType);
      }
    }
  }

  // ========== Type Alias Checking ==========

  private checkTypeAlias(decl: AST.TypeAliasDecl): void {
    const resolved = this.resolveType(decl.type);
    if (!this.currentScope.getInCurrentScope(decl.name)) {
      this.defineSymbol(decl.name, "TypeAlias", resolved, decl);
    }
  }

  // ========== Import Handling ==========

  private checkImport(stmt: AST.ImportStmt): void {
    this.importHandler.checkImport(stmt);
  }

  // ========== Complex Expression Checkers ==========
  // These need to remain in the main class due to complexity

  private checkIsMutable(expr: AST.Expression): void {
    if (expr.kind === "Identifier") {
      const id = expr as AST.IdentifierExpr;
      const symbol = this.currentScope.resolve(id.name);
      if (symbol && symbol.isConst) {
        throw new CompilerError(
          `Cannot assign to constant '${id.name}'`,
          "Constants cannot be modified.",
          expr.location,
        );
      }
    } else if (expr.kind === "Member") {
      const member = expr as AST.MemberExpr;
      const objType = this.checkExpression(member.object);
      if (objType && (objType as AST.BasicTypeNode).pointerDepth > 0) {
        return;
      }
      this.checkIsMutable(member.object);
    } else if (expr.kind === "Index") {
      const index = expr as AST.IndexExpr;
      const objType = this.checkExpression(index.object);
      if (objType && (objType as AST.BasicTypeNode).pointerDepth > 0) {
        return;
      }
      this.checkIsMutable(index.object);
    } else if (expr.kind === "TupleLiteral") {
      const tuple = expr as AST.TupleLiteralExpr;
      for (const elem of tuple.elements) {
        this.checkIsMutable(elem);
      }
    }
  }

  private checkAssignment(expr: AST.AssignmentExpr): AST.TypeNode | undefined {
    // Check if assignee is an l-value
    if (
      expr.assignee.kind !== "Identifier" &&
      expr.assignee.kind !== "Member" &&
      expr.assignee.kind !== "Index" &&
      expr.assignee.kind !== "TupleLiteral" &&
      (expr.assignee.kind !== "Unary" ||
        (expr.assignee as AST.UnaryExpr).operator.type !== TokenType.Star)
    ) {
      throw new CompilerError(
        "Invalid assignment target",
        "Left-hand side of assignment must be a variable, member, array element, pointer dereference, or tuple destructuring.",
        expr.assignee.location,
      );
    }

    // For tuple destructuring, verify all elements are l-values
    if (expr.assignee.kind === "TupleLiteral") {
      const tupleLit = expr.assignee as AST.TupleLiteralExpr;
      for (const elem of tupleLit.elements) {
        if (
          elem.kind !== "Identifier" &&
          elem.kind !== "Member" &&
          elem.kind !== "Index" &&
          (elem.kind !== "Unary" ||
            (elem as AST.UnaryExpr).operator.type !== TokenType.Star)
        ) {
          throw new CompilerError(
            "Invalid assignment target in tuple destructuring",
            "Tuple elements in assignment must be valid l-values (variable, member, array element, or pointer dereference).",
            elem.location,
          );
        }
      }
    }

    const targetType = this.checkExpression(expr.assignee);

    // Check const correctness
    this.checkIsMutable(expr.assignee);

    const valueType = this.checkExpression(expr.value);

    if (targetType && valueType) {
      let compatible = this.areTypesCompatible(targetType, valueType);
      if (!compatible) {
        const val = this.getIntegerConstantValue(expr.value);
        if (val !== undefined) {
          compatible = this.isIntegerTypeCompatible(val, targetType);
        }
      }

      if (!compatible) {
        throw new CompilerError(
          `Type mismatch in assignment: cannot assign ${this.typeToString(
            valueType,
          )} to ${this.typeToString(targetType)}`,
          "The assigned value is not compatible with the target variable's type.",
          expr.location,
        );
      }
    }
    return targetType;
  }

  private checkEnumStructVariant(
    expr: AST.EnumStructVariantExpr,
  ): AST.TypeNode | undefined {
    const symbol = this.currentScope.resolve(expr.enumName);
    if (!symbol || symbol.kind !== "Enum") {
      throw new CompilerError(
        `Unknown enum '${expr.enumName}'`,
        "Ensure the enum is defined.",
        expr.location,
      );
    }

    const enumDecl = symbol.declaration as AST.EnumDecl;
    const variant = enumDecl.variants.find((v) => v.name === expr.variantName);

    if (!variant) {
      throw new CompilerError(
        `Unknown variant '${expr.variantName}' in enum '${expr.enumName}'`,
        "Check the enum definition.",
        expr.location,
      );
    }

    if (!variant.dataType || variant.dataType.kind !== "EnumVariantStruct") {
      throw new CompilerError(
        `Variant '${expr.variantName}' is not a struct variant`,
        "Use tuple syntax for tuple variants.",
        expr.location,
      );
    }

    // Store variant info for code generation
    (expr as any).enumVariantInfo = {
      enumDecl,
      variant,
      variantIndex: enumDecl.variants.indexOf(variant),
      genericArgs: [],
    };

    // Validate fields
    const expectedFields = new Map(
      variant.dataType.fields.map((f) => [f.name, f.type]),
    );
    for (const field of expr.fields) {
      if (!expectedFields.has(field.name)) {
        throw new CompilerError(
          `Unknown field '${field.name}' in variant '${expr.variantName}'`,
          "Check the variant definition.",
          field.value.location,
        );
      }

      const expectedType = expectedFields.get(field.name)!;
      const valueType = this.checkExpression(field.value);
      if (valueType && !this.areTypesCompatible(expectedType, valueType)) {
        throw new CompilerError(
          `Type mismatch for field '${field.name}': expected ${this.typeToString(
            expectedType,
          )}, got ${this.typeToString(valueType)}`,
          "Field value must match the declared type.",
          field.value.location,
        );
      }
    }

    return {
      kind: "BasicType",
      name: expr.enumName,
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: expr.location,
    };
  }

  private checkGenericInstantiation(
    expr: AST.GenericInstantiationExpr,
  ): AST.TypeNode | undefined {
    const baseType = this.checkExpression(expr.base);
    if (!baseType) return undefined;

    if (baseType.kind === "MetaType") {
      const innerType = baseType.type as AST.BasicTypeNode;
      // Return MetaType with genericArgs applied
      return {
        kind: "MetaType",
        type: {
          ...innerType,
          genericArgs: expr.genericArgs,
        },
        location: expr.location,
      };
    }

    // Handle generic function instantiation
    if (baseType.kind === "FunctionType") {
      const funcType = baseType as AST.FunctionTypeNode;
      const overloads = funcType.overloads;

      const candidates = [funcType, ...(overloads || [])];
      const validCandidates: AST.FunctionTypeNode[] = [];

      for (const candidate of candidates) {
        const decl = candidate.declaration as AST.FunctionDecl;
        if (
          decl &&
          decl.genericParams &&
          decl.genericParams.length === expr.genericArgs.length
        ) {
          // Match! Substitute.
          const typeMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < decl.genericParams.length; i++) {
            typeMap.set(
              decl.genericParams[i]!.name,
              this.resolveType(expr.genericArgs[i]!),
            );
          }

          validCandidates.push({
            ...candidate,
            returnType: this.substituteType(candidate.returnType, typeMap),
            paramTypes: candidate.paramTypes.map((t) =>
              this.substituteType(t, typeMap),
            ),
            // Remove overloads from the candidate itself to avoid recursion/confusion
            overloads: undefined,
          });
        }
      }

      if (validCandidates.length === 0) {
        // No matching generic overload found
        const anyGeneric = candidates.some((c) => {
          const d = c.declaration as AST.FunctionDecl;
          return d && d.genericParams && d.genericParams.length > 0;
        });

        if (anyGeneric) {
          throw new CompilerError(
            `No overload of '${funcType.declaration?.name || "function"}' accepts ${
              expr.genericArgs.length
            } generic arguments`,
            "Check generic argument count.",
            expr.location,
          );
        } else {
          throw new CompilerError(
            `Type '${funcType.declaration?.name || "function"}' is not generic`,
            "Cannot provide generic arguments to non-generic function.",
            expr.location,
          );
        }
      }

      if (validCandidates.length === 1) {
        return validCandidates[0];
      }

      // Multiple matches
      const result = validCandidates[0]!;
      (result as any).overloads = validCandidates;
      return result;
    }

    return baseType;
  }

  // ========== Overload Resolution ==========

  public resolveOverload(
    name: string,
    candidates: Symbol[],
    argTypes: (AST.TypeNode | undefined)[],
    genericArgs: AST.TypeNode[],
    location: SourceLocation,
  ): {
    symbol: Symbol;
    type: AST.FunctionTypeNode;
    declaration: AST.ASTNode;
    genericArgs?: AST.TypeNode[];
  } {
    return this.overloadResolver.resolveOverload(
      name,
      candidates,
      argTypes,
      genericArgs,
      location,
    );
  }

  // ========== Operator Overload Resolution ==========

  public findOperatorOverload(
    targetType: AST.TypeNode,
    methodName: string,
    paramTypes: AST.TypeNode[],
  ): AST.FunctionDecl | undefined {
    return this.overloadResolver.findOperatorOverload(
      targetType,
      methodName,
      paramTypes,
      this.resolveMemberWithContext.bind(this),
    );
  }

  // ========== Match Pattern Checking ==========

  public checkMatchExhaustiveness(
    expr: AST.MatchExpr,
    enumDecl: AST.EnumDecl | undefined,
  ): void {
    // If matching on Any/Type, we only require a default case for now
    if (!enumDecl) {
      const hasDefault = expr.arms.some(
        (arm) => arm.pattern.kind === "PatternWildcard" && !arm.guard,
      );
      if (!hasDefault) {
        throw new CompilerError(
          "Non-exhaustive match: missing default case (_)",
          "Type matching requires a default case.",
          expr.location,
        );
      }
      return;
    }

    const coveredVariants = new Set<string>();
    let hasWildcard = false;

    for (const arm of expr.arms) {
      if (arm.pattern.kind === "PatternWildcard") {
        // Wildcard covers everything, but only if it's unguarded
        if (!arm.guard) {
          hasWildcard = true;
          break;
        }
      } else if (
        arm.pattern.kind === "PatternEnum" ||
        arm.pattern.kind === "PatternEnumTuple" ||
        arm.pattern.kind === "PatternEnumStruct"
      ) {
        // A variant is only covered if the arm is unguarded
        if (!arm.guard) {
          coveredVariants.add(arm.pattern.variantName);
        }
      }
    }

    if (!hasWildcard) {
      const allVariants = new Set(enumDecl.variants.map((v) => v.name));
      const missingVariants = [...allVariants].filter(
        (v) => !coveredVariants.has(v),
      );

      if (missingVariants.length > 0) {
        throw new CompilerError(
          `Non-exhaustive match: missing variants: ${missingVariants.join(", ")}`,
          "Match expressions must handle all enum variants or include a wildcard (_) pattern. Note: Guarded arms do not contribute to exhaustiveness.",
          expr.location,
        );
      }
    }
  }

  public checkPattern(
    pattern: AST.Pattern,
    enumType: AST.TypeNode,
    enumDecl: AST.EnumDecl | undefined,
  ): void {
    if (pattern.kind === "PatternWildcard") return;

    // Handle Type Matching (when enumDecl is undefined)
    if (!enumDecl) {
      if (pattern.kind === "PatternEnumTuple") {
        // Treat as Type(binding)
        // e.g. int(i)
        // pattern.variantName is the type name
        // pattern.bindings is [i]

        if (pattern.bindings.length !== 1) {
          throw new CompilerError(
            "Type pattern must have exactly one binding",
            "Usage: Type(variable)",
            pattern.location,
          );
        }

        // Resolve the type
        const typeName = pattern.variantName;
        const typeSymbol = this.currentScope.resolve(typeName);

        // Allow primitives
        let isValidType = false;
        if (KNOWN_TYPES.includes(typeName) || typeName === "string") {
          isValidType = true;
        } else if (
          typeSymbol &&
          (typeSymbol.kind === "Struct" || typeSymbol.kind === "Enum")
        ) {
          isValidType = true;
        }

        if (!isValidType) {
          throw new CompilerError(
            `Unknown type '${typeName}' in match pattern`,
            "Ensure the type is defined.",
            pattern.location,
          );
        }

        // Define the binding variable
        const bindingName = pattern.bindings[0]!;
        // We need to construct the type node for the binding
        const bindingType: AST.TypeNode = {
          kind: "BasicType",
          name: typeName,
          genericArgs: [], // TODO: Support generic types in match?
          pointerDepth: 0,
          arrayDimensions: [],
          location: pattern.location,
        };

        // Resolve it properly
        const resolvedBindingType = this.resolveType(bindingType);

        this.defineSymbol(
          bindingName,
          "Variable",
          resolvedBindingType,
          pattern as any,
        );

        return;
      } else {
        throw new CompilerError(
          "Invalid pattern for type matching",
          "Only Type(variable) or _ patterns are supported for Any matching.",
          pattern.location,
        );
      }
    }

    if (pattern.kind === "PatternEnum") {
      const variant = enumDecl.variants.find(
        (v) => v.name === pattern.variantName,
      );
      if (!variant) {
        throw new CompilerError(
          `Unknown variant '${pattern.variantName}' in enum '${enumDecl.name}'`,
          "Check the enum definition.",
          pattern.location,
        );
      }
      if (variant.dataType) {
        throw new CompilerError(
          `Variant '${pattern.variantName}' has associated data, use tuple or struct pattern`,
          "This variant requires destructuring.",
          pattern.location,
        );
      }
    }

    if (pattern.kind === "PatternEnumTuple") {
      const variant = enumDecl.variants.find(
        (v) => v.name === pattern.variantName,
      );
      if (!variant || variant.dataType?.kind !== "EnumVariantTuple") {
        throw new CompilerError(
          `Variant '${pattern.variantName}' is not a tuple variant`,
          "Use the correct pattern syntax.",
          pattern.location,
        );
      }

      if (pattern.bindings.length !== variant.dataType.types.length) {
        throw new CompilerError(
          `Expected ${variant.dataType.types.length} bindings, got ${pattern.bindings.length}`,
          `Variant '${pattern.variantName}' requires ${variant.dataType.types.length} values.`,
          pattern.location,
        );
      }

      // Build type substitution for generic enums
      const typeMap = new Map<string, AST.TypeNode>();
      if (enumType.kind === "BasicType" && enumDecl.genericParams) {
        const genericArgs = enumType.genericArgs || [];
        for (
          let i = 0;
          i < enumDecl.genericParams.length && i < genericArgs.length;
          i++
        ) {
          typeMap.set(enumDecl.genericParams[i]!.name, genericArgs[i]!);
        }
      }

      // Bind variables
      for (let i = 0; i < pattern.bindings.length; i++) {
        const bindingName = pattern.bindings[i]!;
        if (bindingName === "_") continue;

        let bindingType = variant.dataType.types[i]!;
        if (typeMap.size > 0) {
          bindingType = this.substituteType(bindingType, typeMap);
        }

        // Create a synthetic VariableDecl for the binding so it can be captured correctly
        const bindingDecl: AST.VariableDecl = {
          kind: "VariableDecl",
          name: bindingName,
          typeAnnotation: bindingType,
          resolvedType: bindingType,
          location: pattern.location,
          isGlobal: false,
          isConst: false,
        };

        this.defineSymbol(bindingName, "Variable", bindingType, bindingDecl);
      }
    }

    if (pattern.kind === "PatternEnumStruct") {
      const variant = enumDecl.variants.find(
        (v) => v.name === pattern.variantName,
      );
      if (!variant || variant.dataType?.kind !== "EnumVariantStruct") {
        throw new CompilerError(
          `Variant '${pattern.variantName}' is not a struct variant`,
          "Use the correct pattern syntax.",
          pattern.location,
        );
      }

      const expectedFields = new Map(
        variant.dataType.fields.map((f) => [f.name, f.type]),
      );
      for (const field of pattern.fields) {
        if (!expectedFields.has(field.fieldName)) {
          throw new CompilerError(
            `Unknown field '${field.fieldName}' in variant '${pattern.variantName}'`,
            "Check the variant definition.",
            pattern.location,
          );
        }

        const bindingName = field.binding;
        if (bindingName === "_") continue;

        const bindingType = expectedFields.get(field.fieldName)!;

        // Create a synthetic VariableDecl for the binding so it can be captured correctly
        const bindingDecl: AST.VariableDecl = {
          kind: "VariableDecl",
          name: bindingName,
          typeAnnotation: bindingType,
          resolvedType: bindingType,
          location: pattern.location,
          isGlobal: false,
          isConst: false,
        };

        this.defineSymbol(bindingName, "Variable", bindingType, bindingDecl);
      }
    }
  }

  public checkMatchArmBody(
    body: AST.Expression | AST.BlockStmt,
  ): AST.TypeNode | undefined {
    if (body.kind === "Block") {
      // Push context for collecting return types
      this.matchContext.push({ inferredTypes: [] });
      try {
        StmtChecker.checkBlock.call(this, body);
        // If we have collected return types, unify them
        const context = this.matchContext[this.matchContext.length - 1]!;
        if (context.inferredTypes.length > 0) {
          // For now, just take the first one or check compatibility
          // Ideally we should unify all of them
          return context.inferredTypes[0];
        }

        // Check if the block diverges (ends with Throw, Break, or Continue)
        if (body.statements.length > 0) {
          const lastStmt = body.statements[body.statements.length - 1]!;
          if (
            lastStmt.kind === "Throw" ||
            lastStmt.kind === "Break" ||
            lastStmt.kind === "Continue"
          ) {
            return undefined; // Diverges, compatible with any type
          }
        }

        return this.makeVoidType();
      } finally {
        this.matchContext.pop();
      }
    } else {
      return this.checkExpression(body);
    }
  }

  // ========== Scope access for checkers ==========

  public checkBlock(stmt: AST.BlockStmt, newScope: boolean = true): void {
    StmtChecker.checkBlock.call(this, stmt, newScope);
  }
}
