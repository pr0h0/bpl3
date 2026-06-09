/**
 * Main expression dispatcher and literal code generation.
 *
 * Generates code for:
 * - Literal values (int, float, string, bool, char)
 * - Interpolated strings
 * - Identifier resolution
 * - Struct/array/tuple literals
 * - Ternary expressions
 * - Generic instantiation expressions
 * - Lambda expressions
 *
 * @extends UnaryExpressionGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { codeGenLog } from "../../common/Logger";
import { TokenType } from "../../frontend/TokenType";
import { UnaryExpressionGenerator } from "./UnaryExpressionGenerator";
import { getIntegerBitWidth } from "./utils";

const STRUCT_LITERAL_FIELD_MAP_THRESHOLD = 4;

export abstract class ExpressionGenerator extends UnaryExpressionGenerator {
  protected abstract generateBlock(block: AST.BlockStmt): void;

  protected generateExpression(expr: AST.Expression): string {
    switch (expr.kind) {
      case "Literal":
        return this.generateLiteral(expr as AST.LiteralExpr);
      case "InterpolatedString":
        return this.generateInterpolatedString(
          expr as AST.InterpolatedStringExpr,
        );
      case "Identifier":
        return this.generateIdentifier(expr as AST.IdentifierExpr);
      case "Binary":
        const binExpr = expr as AST.BinaryExpr;
        if (binExpr.operator.type === TokenType.AndAnd) {
          return this.generateLogicalAnd(binExpr);
        } else if (binExpr.operator.type === TokenType.OrOr) {
          return this.generateLogicalOr(binExpr);
        }
        return this.generateBinary(binExpr);
      case "Call":
        return this.generateCall(expr as AST.CallExpr);
      case "Assignment":
        return this.generateAssignment(expr as AST.AssignmentExpr);
      case "Member":
        return this.generateMember(expr as AST.MemberExpr);
      case "Index":
        return this.generateIndex(expr as AST.IndexExpr);
      case "Unary":
        return this.generateUnary(expr as AST.UnaryExpr);
      case "Cast":
        return this.generateCast(expr as AST.CastExpr);
      case "ArrayLiteral":
        return this.generateArrayLiteral(expr as AST.ArrayLiteralExpr);
      case "StructLiteral":
        return this.generateStructLiteral(expr as AST.StructLiteralExpr);
      case "TupleLiteral":
        return this.generateTupleLiteral(expr as AST.TupleLiteralExpr);
      case "EnumStructVariant":
        return this.generateEnumStructVariant(
          expr as AST.EnumStructVariantExpr,
        );
      case "Sizeof":
        return this.generateSizeof(expr as AST.SizeofExpr);
      case "TypeOf":
        return this.generateTypeOf(expr as AST.TypeOfExpr);
      case "OffsetOf":
        return this.generateOffsetOf(expr as AST.OffsetOfExpr);
      case "Ternary":
        return this.generateTernary(expr as AST.TernaryExpr);
      case "Match":
        return this.generateMatchExpr(expr as AST.MatchExpr);
      case "TypeMatch":
        return this.generateTypeMatch(expr as AST.TypeMatchExpr);
      case "Is":
        return this.generateIs(expr as AST.IsExpr);
      case "As":
        return this.generateAs(expr as AST.AsExpr);
      case "LambdaExpression":
        return this.generateLambda(expr as AST.LambdaExpr);
      case "Group":
        return this.generateExpression(expr.expression);
      case "GenericInstantiation":
        return this.generateGenericInstantiation(
          expr as AST.GenericInstantiationExpr,
        );
      default:
        throw this.createError(
          `Unhandled expression kind during code generation: ${(expr as AST.Expression).kind}`,
          expr,
          "This is an internal compiler error. All type-checked expression kinds should have a code generation path.",
        );
    }
  }

  protected generateGenericInstantiation(
    expr: AST.GenericInstantiationExpr,
  ): string {
    const base = expr.base as AST.IdentifierExpr;
    const genericArgs = expr.genericArgs;
    const decl = (base as any).resolvedDeclaration as AST.FunctionDecl;

    let mangledName = "";

    if (decl && decl.kind === "FunctionDecl") {
      // Trigger instantiation and get mangled name
      mangledName = this.resolveMonomorphizedFunction(decl, genericArgs);
    } else {
      const funcName = base.name;
      const mangledArgs = genericArgs
        .map((arg) => {
          const concrete = this.substituteType(arg, this.currentTypeMap);
          return this.mangleType(concrete);
        })
        .join("_");

      mangledName = `${funcName}_${mangledArgs}`;
    }

    // Generic Instantiation returns a raw function pointer
    const ptrVal = `@${mangledName}`;

    // Resolve the type of the expression
    return ptrVal;
  }

  protected generateInterpolatedString(
    expr: AST.InterpolatedStringExpr,
  ): string {
    if (expr.desugared) {
      return this.generateExpression(expr.desugared);
    }
    throw new CompilerError(
      "Interpolated string was not desugared during type checking",
      "This is an internal compiler error.",
      expr.location,
    );
  }

  protected generateLambda(expr: AST.LambdaExpr): string {
    if (!expr.resolvedType) {
      codeGenLog.error("Lambda expression has no resolved type!");
      throw new CompilerError(
        "Lambda expression has no resolved type",
        "",
        expr.location,
      );
    }
    let lambdaName = `lambda_L${expr.location.startLine}_C${expr.location.startColumn}`;

    // If we are in a generic context, append generic args to make the name unique
    if (this.currentTypeMap.size > 0) {
      const args: string[] = [];
      // Sort keys to ensure deterministic order
      const keys = Array.from(this.currentTypeMap.keys()).sort();
      for (const key of keys) {
        const val = this.currentTypeMap.get(key)!;
        args.push(this.mangleType(val));
      }
      if (args.length > 0) {
        lambdaName += "_" + args.join("_");
      }
    }

    this.pendingLambdas.push({
      name: lambdaName,
      expr,
      typeMap: new Map(this.currentTypeMap),
    });

    const type = expr.resolvedType;

    if (type.kind === "FunctionType") {
      // Stateless lambda -> Raw function pointer
      const funcType = type as AST.FunctionTypeNode;

      let effectiveFuncType = funcType;
      if (this.currentTypeMap.size > 0) {
        effectiveFuncType = this.substituteType(
          funcType,
          this.currentTypeMap,
        ) as AST.FunctionTypeNode;
      }

      const mangledName = this.getMangledName(lambdaName, effectiveFuncType);
      return `@${mangledName}`;
    }

    const funcType = type as AST.LambdaTypeNode;

    let effectiveFuncType = funcType;
    if (this.currentTypeMap.size > 0) {
      effectiveFuncType = this.substituteType(
        funcType,
        this.currentTypeMap,
      ) as AST.LambdaTypeNode;
    }

    const mangledName = this.getMangledName(
      lambdaName,
      effectiveFuncType as any,
    );
    const closureType = this.resolveType(effectiveFuncType); // { func*, i8* }

    let ctxPtr = "null";

    if (expr.capturedVariables && expr.capturedVariables.length > 0) {
      const captureStructName = `${lambdaName}_ctx`;
      expr.captureStructName = captureStructName;
      const captureStructType = `%struct.${captureStructName}`;

      // Create struct layout
      const layout = new Map<string, number>();
      const fieldTypes: string[] = [];

      expr.capturedVariables.forEach((decl, i) => {
        layout.set(decl.name as string, i);
        if ("typeAnnotation" in decl && decl.typeAnnotation) {
          fieldTypes.push(this.resolveType(decl.typeAnnotation));
        } else if ("type" in decl && decl.type) {
          // Handle captured parameters which have 'type' instead of 'typeAnnotation'
          fieldTypes.push(this.resolveType(decl.type));
        } else if ("resolvedType" in decl && (decl as any).resolvedType) {
          fieldTypes.push(this.resolveType((decl as any).resolvedType));
        } else {
          codeGenLog.debug(`Failed to resolve type for ${decl.name}`, {
            keys: Object.keys(decl),
          });
          throw new CompilerError(
            `Cannot resolve type for captured variable ${decl.name}`,
            "",
            decl.location,
          );
        }
      });

      this.structLayouts.set(captureStructName, layout);

      // Emit struct declaration
      const structBody = fieldTypes.join(", ");
      this.emitDeclaration(`${captureStructType} = type { ${structBody} }`);

      // Allocate Capture Struct (Heap)
      const nullPtrReg = this.newRegister();
      const sizeReg = this.newRegister();
      this.emit(
        `  ${nullPtrReg} = getelementptr ${captureStructType}, ${captureStructType}* null, i32 1`,
      );
      this.emit(
        `  ${sizeReg} = ptrtoint ${captureStructType}* ${nullPtrReg} to i64`,
      );

      const mallocReg = this.newRegister();
      this.emit(`  ${mallocReg} = call i8* @malloc(i64 ${sizeReg})`);
      const structPtr = this.newRegister();
      this.emit(
        `  ${structPtr} = bitcast i8* ${mallocReg} to ${captureStructType}*`,
      );

      // Populate Struct
      expr.capturedVariables.forEach((decl, i) => {
        const varName = decl.name as string;
        const resType =
          ("typeAnnotation" in decl ? decl.typeAnnotation : undefined) ||
          ("type" in decl ? decl.type : undefined) ||
          decl.resolvedType;
        if (!resType) {
          codeGenLog.debug(
            `Missing resolvedType for captured variable ${varName}`,
            {
              keys: Object.keys(decl),
            },
          );
        }
        const ident: AST.IdentifierExpr = {
          kind: "Identifier",
          name: varName,
          resolvedDeclaration: decl,
          resolvedType: resType,
          location: expr.location,
        };
        const val = this.generateExpression(ident);

        const fieldPtr = this.newRegister();
        this.emit(
          `  ${fieldPtr} = getelementptr inbounds ${captureStructType}, ${captureStructType}* ${structPtr}, i32 0, i32 ${i}`,
        );
        const fieldType = fieldTypes[i];
        this.emit(`  store ${fieldType} ${val}, ${fieldType}* ${fieldPtr}`);
      });

      ctxPtr = mallocReg;
    }

    // Create Closure Struct
    const retTypeStr = this.resolveType(funcType.returnType);
    const paramTypesStr = funcType.paramTypes
      .map((t) => this.resolveType(t))
      .join(", ");
    const funcPtrType = `${retTypeStr} (i8*${paramTypesStr ? ", " + paramTypesStr : ""})*`;

    const undef = this.newRegister();
    this.emit(
      `  ${undef} = insertvalue ${closureType} undef, ${funcPtrType} @${mangledName}, 0`,
    );

    const closure = this.newRegister();
    this.emit(
      `  ${closure} = insertvalue ${closureType} ${undef}, i8* ${ctxPtr}, 1`,
    );

    return closure;
  }

  protected generateLiteral(expr: AST.LiteralExpr): string {
    if (expr.type === "number") {
      const resolvedType = expr.resolvedType;
      if (
        expr.value !== 0 &&
        resolvedType?.kind === "BasicType" &&
        resolvedType.name === "i32"
      ) {
        const raw = expr.raw;
        if (
          raw &&
          (raw.length === 1 || raw.charCodeAt(0) !== 48) &&
          raw.indexOf("_") === -1 &&
          raw.indexOf(".") === -1
        ) {
          return raw;
        }
      }

      // Handle zero initialization for non-primitive types
      if (expr.value === 0 && expr.resolvedType) {
        const type = expr.resolvedType;
        if (type.kind === "BasicType") {
          if (type.pointerDepth > 0) return "null";
          if (type.arrayDimensions.length > 0) return "zeroinitializer";
          const primitives = [
            "int",
            "uint",
            "u8",
            "u16",
            "u32",
            "u64",
            "float",
            "double",
            "bool",
            "char",
            "void",
          ];
          if (!primitives.includes(type.name)) {
            return "zeroinitializer";
          }
        } else if (type.kind === "TupleType") {
          return "zeroinitializer";
        }
      }

      // Check if this is a floating point type
      if (expr.resolvedType && expr.resolvedType.kind === "BasicType") {
        const typeName = (expr.resolvedType as AST.BasicTypeNode).name;
        if (typeName === "float" || typeName === "double") {
          // Ensure float literals have decimal point
          const str = String(expr.value);
          return str.includes(".") ? str : `${str}.0`;
        }
      }

      // Use raw value for integers to preserve precision
      if (expr.raw) {
        const raw = expr.raw;
        if (
          (raw.length === 1 || raw.charCodeAt(0) !== 48) &&
          raw.indexOf("_") === -1 &&
          raw.indexOf(".") === -1
        ) {
          return raw;
        }
        try {
          const cleaned = raw.replace(/_/g, "");
          // Only use BigInt if it doesn't look like a float
          if (!cleaned.includes(".")) {
            return BigInt(cleaned).toString();
          }
        } catch {
          // Fallback to value.toString() - this is expected for non-integer raw values
        }
      }

      return String(expr.value);
    } else if (expr.type === "char") {
      return String(expr.value).charCodeAt(0).toString();
    } else if (expr.type === "bool") {
      return expr.value ? "1" : "0";
    } else if (expr.type === "nullptr" || expr.type === "null") {
      return "null";
    } else if (expr.type === "string") {
      const content = String(expr.value);
      if (!this.stringLiterals.has(content)) {
        const varName = `@.str.${this.stringLiterals.size}`;
        this.stringLiterals.set(content, varName);
      }
      const varName = this.stringLiterals.get(content)!;
      const len = content.length + 1;
      // Get pointer to first element
      return `getelementptr inbounds ([${len} x i8], [${len} x i8]* ${varName}, i64 0, i64 0)`; // This returns i8*
    }

    throw this.createError(
      `Unsupported literal type during code generation: ${expr.type}`,
      expr,
      "This is an internal compiler error. All type-checked literal types should have a code generation path.",
    );
  }

  protected generateIdentifier(expr: AST.IdentifierExpr): string {
    const name = expr.name;
    if (!expr.resolvedType) {
      throw new CompilerError(
        `Identifier '${name}' has no resolved type`,
        "",
        expr.location,
      );
    }

    // Special case: function identifiers (not local variables) evaluate to their address directly
    if (expr.resolvedType.kind === "FunctionType" && !this.locals.has(name)) {
      let funcName = name;

      if (
        expr.resolvedDeclaration &&
        expr.resolvedDeclaration.kind === "FunctionDecl"
      ) {
        const decl = expr.resolvedDeclaration as AST.FunctionDecl;
        funcName = this.getMangledName(
          decl.name,
          expr.resolvedType as AST.FunctionTypeNode,
        );
      } else if (
        expr.resolvedDeclaration &&
        expr.resolvedDeclaration.kind === "Extern"
      ) {
        funcName = expr.resolvedDeclaration.name;
      }

      // Function identifier: return raw pointer address
      return `@${funcName}`;
    }

    const type = this.resolveType(expr.resolvedType!);
    const addr = this.generateAddress(expr);

    const declaredType = this.localTypes.get(name);
    if (declaredType) {
      const declaredLlvmType = this.resolveType(declaredType);
      if (
        declaredLlvmType !== type &&
        declaredLlvmType.endsWith("*") &&
        type.endsWith("*")
      ) {
        const originalReg = this.newRegister();
        this.emit(
          `  ${originalReg} = load ${declaredLlvmType}, ${declaredLlvmType}* ${addr}`,
        );
        const castReg = this.newRegister();
        this.emit(
          `  ${castReg} = bitcast ${declaredLlvmType} ${originalReg} to ${type}`,
        );
        return castReg;
      }
    }

    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  protected generateAssignment(expr: AST.AssignmentExpr): string {
    // Check for index assignment with __set__ operator overload
    if (expr.assignee.kind === "Index") {
      const indexExpr = expr.assignee as AST.IndexExpr;
      // Check if there's a __set__ operator overload
      // We need to find the __set__ method in the TypeChecker annotations
      // For now, look up the method from the object's type
      if (
        indexExpr.object.resolvedType &&
        indexExpr.object.resolvedType.kind === "BasicType"
      ) {
        const objectType = indexExpr.object.resolvedType as AST.BasicTypeNode;
        const structDecl = this.structMap.get(objectType.name);

        if (structDecl) {
          // Look for __set__ method in struct members
          const setMethod = structDecl.members.find(
            (m): m is AST.FunctionDecl =>
              m.kind === "FunctionDecl" && m.name === "__set__",
          );
          if (setMethod && expr.operator.type === TokenType.Equal) {
            // Generate __set__ call: object.__set__(index, value)
            const objectRaw = this.generateExpression(indexExpr.object);
            const indexRaw = this.generateExpression(indexExpr.index);
            const valueRaw = this.generateExpression(expr.value);

            // Get the struct name and build full method name
            let structName = objectType.name;
            let methodType = setMethod.resolvedType as AST.FunctionTypeNode;

            // Handle generic struct method calls
            if (objectType.genericArgs && objectType.genericArgs.length > 0) {
              const innerStructDecl = this.structMap.get(objectType.name);
              if (innerStructDecl && innerStructDecl.genericParams.length > 0) {
                // Build context map for generic substitution
                const contextMap = new Map<string, AST.TypeNode>();
                for (let i = 0; i < innerStructDecl.genericParams.length; i++) {
                  contextMap.set(
                    innerStructDecl.genericParams[i]!.name,
                    objectType.genericArgs[i]!,
                  );
                }

                // Build monomorphized struct name using mangleType
                const argNames = objectType.genericArgs
                  .map((arg) => this.mangleType(arg))
                  .join("_");
                structName = `${objectType.name}_${argNames}`;

                // Substitute types in method signature
                methodType = this.substituteType(
                  methodType,
                  contextMap,
                ) as AST.FunctionTypeNode;
              }
            }

            const fullMethodName = `${structName}_${setMethod.name}`;
            const mangledName = this.getMangledName(fullMethodName, methodType);

            // Get address of object (this pointer)
            const objectTypeStr = this.resolveType(objectType);
            const indexType = this.resolveType(indexExpr.index.resolvedType!);
            const valueType = this.resolveType(expr.value.resolvedType!);

            let thisPtr: string;
            try {
              thisPtr = this.generateAddress(indexExpr.object);
            } catch {
              // If we can't get address, spill to stack
              const spillAddr = this.allocateStack(
                `op_spill_${this.labelCount++}`,
                objectTypeStr,
              );
              this.emit(
                `  store ${objectTypeStr} ${objectRaw}, ${objectTypeStr}* ${spillAddr}`,
              );
              thisPtr = spillAddr;
            }

            // Call __set__ method: returns void typically
            const returnType = this.resolveType(setMethod.returnType);
            if (returnType !== "void") {
              const resultReg = this.newRegister();
              this.emit(
                `  ${resultReg} = call ${returnType} @${mangledName}(${objectTypeStr}* ${thisPtr}, ${indexType} ${indexRaw}, ${valueType} ${valueRaw})`,
              );
              return resultReg;
            }
            this.emit(
              `  call void @${mangledName}(${objectTypeStr}* ${thisPtr}, ${indexType} ${indexRaw}, ${valueType} ${valueRaw})`,
            );
            return valueRaw; // Return the assigned value
          }
        }
      }
    }

    // Handle tuple destructuring assignment: (a, b) = expr
    if (expr.assignee.kind === "TupleLiteral") {
      const tupleLit = expr.assignee as AST.TupleLiteralExpr;
      const tupleVal = this.generateExpression(expr.value);
      const tupleType = this.resolveType(expr.value.resolvedType!);

      // Extract each element and assign to the corresponding target
      for (let i = 0; i < tupleLit.elements.length; i++) {
        const target = tupleLit.elements[i]!;
        const addr = this.generateAddress(target, true);

        const sourceTypeNode = this.getTargetTypeNodeFromTuple(
          expr.value.resolvedType!,
          [i],
        );
        const targetTypeNode = target.resolvedType!;
        const elemType = this.resolveType(targetTypeNode);
        const elemVal = this.newRegister();
        this.emit(`  ${elemVal} = extractvalue ${tupleType} ${tupleVal}, ${i}`);
        const storeVal = sourceTypeNode
          ? this.emitCast(
              elemVal,
              this.resolveType(sourceTypeNode),
              elemType,
              sourceTypeNode,
              targetTypeNode,
            )
          : elemVal;
        this.emit(`  store ${elemType} ${storeVal}, ${elemType}* ${addr}`);
      }

      return tupleVal;
    }

    // Don't skip null check if assignee is a member access through pointer
    const skipCheck = expr.assignee.kind !== "Member"; // Skip for direct identifiers to avoid double-checking

    const addr = this.generateAddress(expr.assignee, skipCheck);
    const destType = this.resolveType(expr.assignee.resolvedType!);

    if (expr.operator.type === TokenType.Equal) {
      const destTypeNode = expr.assignee.resolvedType!;
      const castVal =
        expr.value.kind === "TupleLiteral" && destTypeNode.kind === "TupleType"
          ? this.generateTupleLiteralForTarget(
              expr.value as AST.TupleLiteralExpr,
              destTypeNode,
            )
          : this.emitCast(
              this.generateExpression(expr.value),
              this.resolveType(expr.value.resolvedType!),
              destType,
              expr.value.resolvedType!,
              destTypeNode,
            );
      this.emit(`  store ${destType} ${castVal}, ${destType}* ${addr}`);
      this.clearBasicBlockIntegerExpressionFact(
        this.exprToDescription(expr.assignee),
      );
      this.clearBasicBlockPointerExpressionFact(
        this.exprToDescription(expr.assignee),
      );

      return castVal;
    }

    // Compound assignment
    const currentValue = this.newRegister();
    this.emit(`  ${currentValue} = load ${destType}, ${destType}* ${addr}`);

    const val = this.generateExpression(expr.value);
    const srcType = this.resolveType(expr.value.resolvedType!);
    const castVal = this.emitCast(
      val,
      srcType,
      destType,
      expr.value.resolvedType!,
      expr.assignee.resolvedType!,
    );

    const isFloat = destType === "double";
    let op = "";
    switch (expr.operator.type) {
      case TokenType.PlusEqual:
        op = isFloat ? "fadd" : "add";
        break;
      case TokenType.MinusEqual:
        op = isFloat ? "fsub" : "sub";
        break;
      case TokenType.StarEqual:
        op = isFloat ? "fmul" : "mul";
        break;
      case TokenType.SlashEqual:
        op = isFloat ? "fdiv" : "sdiv";
        break;
      case TokenType.PercentEqual:
        op = isFloat ? "frem" : "srem";
        break;
      // Bitwise operators can be added here
    }

    if (!op) {
      throw new CompilerError(
        `Unsupported compound assignment operator: ${expr.operator.lexeme}`,
        "This operator is not supported for compound assignment.",
        expr.location,
      );
    }

    const result = this.newRegister();
    this.emit(`  ${result} = ${op} ${destType} ${currentValue}, ${castVal}`);
    this.emit(`  store ${destType} ${result}, ${destType}* ${addr}`);
    this.clearBasicBlockIntegerExpressionFact(
      this.exprToDescription(expr.assignee),
    );
    this.clearBasicBlockPointerExpressionFact(
      this.exprToDescription(expr.assignee),
    );

    return result;
  }

  protected generateMember(expr: AST.MemberExpr): string {
    // Handle enum variant construction (e.g., Color.Red or Option<int>.Some)
    const enumVariantInfo = (expr as any).enumVariantInfo;
    if (enumVariantInfo) {
      return this.generateEnumVariantConstruction(
        enumVariantInfo.enumDecl,
        enumVariantInfo.variant,
        enumVariantInfo.variantIndex,
        enumVariantInfo.genericArgs, // Pass generic args if present
      );
    }

    // Handle tuple element access (e.g., tuple.0, tuple.1)
    if (expr.object.resolvedType?.kind === "TupleType") {
      const tupleIndex = Number.parseInt(expr.property, 10);
      if (!Number.isNaN(tupleIndex)) {
        const tupleType = expr.object.resolvedType as AST.TupleTypeNode;
        if (tupleIndex < 0 || tupleIndex >= tupleType.types.length) {
          throw new CompilerError(
            `Tuple index ${tupleIndex} out of bounds for tuple with ${tupleType.types.length} elements`,
            "Check the tuple index.",
            expr.location,
          );
        }

        const tupleVal = this.generateExpression(expr.object);
        const llvmTupleType = this.resolveType(tupleType);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = extractvalue ${llvmTupleType} ${tupleVal}, ${tupleIndex}`,
        );
        return reg;
      }
    }

    if (expr.object.kind === "Call") {
      const callType = expr.object.resolvedType as
        | AST.BasicTypeNode
        | undefined;
      if (!callType || callType.kind !== "BasicType") {
        throw new CompilerError(
          "Member access on non-struct type",
          "Members can only be accessed on struct types.",
          expr.location,
        );
      }

      // When a call returns a value (non-pointer), materialize a temporary so reads work.
      // For pointer returns, we can treat the call result as the base pointer directly.
      const isPointerReturn = callType.pointerDepth > 0;
      const llvmObjType = this.resolveType(callType);
      let basePtr: string;

      if (isPointerReturn) {
        basePtr = this.generateExpression(expr.object);
      } else {
        // Allocate space, store the value, and use it as the struct base.
        basePtr = this.newRegister();
        this.emit(`  ${basePtr} = alloca ${llvmObjType}`);
        const valueReg = this.generateExpression(expr.object);
        this.emit(
          `  store ${llvmObjType} ${valueReg}, ${llvmObjType}* ${basePtr}`,
        );
      }

      // Determine struct layout
      let structName = callType.name;
      if (llvmObjType.startsWith("%struct.")) {
        structName = llvmObjType.substring(8);
        while (structName.endsWith("*")) structName = structName.slice(0, -1);
      }

      let layout = this.structLayouts.get(structName);
      if (!layout && structName.includes(".")) {
        const shortName = structName.split(".").pop()!;
        layout = this.structLayouts.get(shortName);
      }
      if (!layout) {
        throw new CompilerError(
          `Unknown struct type: ${structName}`,
          "Internal compiler error: struct layout missing.",
          expr.location,
        );
      }

      const fieldIndex = layout.get(expr.property);
      if (fieldIndex === undefined) {
        throw new CompilerError(
          `Unknown field '${expr.property}' in struct '${structName}'`,
          "Check the struct definition.",
          expr.location,
        );
      }

      const addr = this.newRegister();
      const structBase = `%struct.${structName}`;
      this.emit(
        `  ${addr} = getelementptr inbounds ${structBase}, ${structBase}* ${basePtr}, i32 0, i32 ${fieldIndex}`,
      );

      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
      return reg;
    }

    // Handle bound methods
    if (
      expr.resolvedType &&
      expr.resolvedType.kind === "LambdaType" &&
      (expr.resolvedType as any).declaration?.kind === "FunctionDecl"
    ) {
      return this.generateBoundMethod(
        expr,
        (expr.resolvedType as any).declaration,
      );
    }

    if (expr.object.kind === "Identifier") {
      const objectType = expr.object.resolvedType;
      if (
        objectType?.kind === "BasicType" &&
        objectType.pointerDepth === 0 &&
        objectType.arrayDimensions.length === 0 &&
        objectType.genericArgs.length === 0 &&
        !objectType.aliasDeclaration &&
        !objectType.variableDeclaration &&
        !objectType.isPointerToArray
      ) {
        const identifier = expr.object as AST.IdentifierExpr;
        const basePtr = this.localPointers.get(identifier.name);
        const fieldIndex = this.structLayouts
          .get(objectType.name)
          ?.get(expr.property);
        if (basePtr !== undefined && fieldIndex !== undefined) {
          const structBase = `%struct.${objectType.name}`;
          const addr = this.newRegister();
          this.emit(
            `  ${addr} = getelementptr inbounds ${structBase}, ${structBase}* ${basePtr}, i32 0, i32 ${fieldIndex}`,
          );
          const type = this.resolveType(expr.resolvedType!);
          const reg = this.newRegister();
          this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
          return reg;
        }
      }
    }

    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  protected generateBoundMethod(
    expr: AST.MemberExpr,
    methodDecl: AST.FunctionDecl,
  ): string {
    const objType = expr.object.resolvedType as AST.BasicTypeNode;
    let valPtr: string;
    let valPtrType: string;

    // 1. Get Context Pointer (this)
    if (expr.object.kind === "Call") {
      const callType = expr.object.resolvedType as AST.BasicTypeNode;
      const llvmObjType = this.resolveType(callType);

      if (callType.pointerDepth > 0) {
        valPtr = this.generateExpression(expr.object);
        valPtrType = llvmObjType;
      } else {
        // Result is value. Store in alloca.
        valPtr = this.newRegister();
        this.emit(`  ${valPtr} = alloca ${llvmObjType}`);
        const val = this.generateExpression(expr.object);
        this.emit(`  store ${llvmObjType} ${val}, ${llvmObjType}* ${valPtr}`);
        valPtrType = llvmObjType + "*";
      }
    } else if (objType.pointerDepth > 0) {
      // Logic for L-values or simple expressions
      valPtr = this.generateExpression(expr.object);
      valPtrType = this.resolveType(objType);
    } else {
      const llvmObjType = this.resolveType(objType);
      try {
        valPtr = this.generateAddress(expr.object);
        valPtrType = llvmObjType + "*";
      } catch {
        // Not an l-value (e.g. struct literal)
        const val = this.generateExpression(expr.object);
        valPtr = this.newRegister();
        this.emit(`  ${valPtr} = alloca ${llvmObjType}`);
        this.emit(`  store ${llvmObjType} ${val}, ${llvmObjType}* ${valPtr}`);
        valPtrType = llvmObjType + "*";
      }
    }

    // 2. Resolve Function Name (Mangled)
    const funcType: AST.FunctionTypeNode = {
      // Shim for mangling
      kind: "FunctionType",
      returnType: methodDecl.returnType,
      paramTypes: methodDecl.params.map((p) => p.type),
      isVariadic: methodDecl.params.some((p) => p.isVariadic),
      location: methodDecl.location,
    };

    let structName = objType.name;
    if (
      methodDecl.params.length > 0 &&
      methodDecl.params[0]!.name === "this" &&
      methodDecl.params[0]!.type.kind === "BasicType"
    ) {
      structName = (methodDecl.params[0]!.type as AST.BasicTypeNode).name;
    }

    const fullMethodName = `${structName}_${methodDecl.name}`;
    const funcName = this.getMangledName(fullMethodName, funcType);

    // 3. Create Lambda Struct
    const lambdaType = expr.resolvedType as AST.LambdaTypeNode;
    const closureType = this.resolveType(lambdaType);

    // Target lambda function pointer type: ret (i8*, args...)*
    const retTypeStr = this.resolveType(lambdaType.returnType);
    const paramTypesStr = lambdaType.paramTypes
      .map((p) => this.resolveType(p))
      .join(", ");
    const genericFuncPtrType = `${retTypeStr} (i8*${paramTypesStr ? ", " + paramTypesStr : ""})*`;

    // Existing function pointer type
    const specificRetTypeStr = this.resolveType(methodDecl.returnType);
    const specificParamTypesStr = methodDecl.params
      .map((p) => this.resolveType(p.type))
      .join(", ");
    const specificFuncPtrType = `${specificRetTypeStr} (${specificParamTypesStr})*`;

    // Bitcast the function
    const castFuncPtr = this.newRegister();
    this.emit(
      `  ${castFuncPtr} = bitcast ${specificFuncPtrType} @${funcName} to ${genericFuncPtrType}`,
    );

    const undef = this.newRegister();
    this.emit(
      `  ${undef} = insertvalue ${closureType} undef, ${genericFuncPtrType} ${castFuncPtr}, 0`,
    );

    // Bitcast the context
    const ctxVoidPtr = this.newRegister();
    this.emit(`  ${ctxVoidPtr} = bitcast ${valPtrType} ${valPtr} to i8*`);

    const closure = this.newRegister();
    this.emit(
      `  ${closure} = insertvalue ${closureType} ${undef}, i8* ${ctxVoidPtr}, 1`,
    );

    return closure;
  }

  protected generateIndex(expr: AST.IndexExpr): string {
    // Check for operator overload (__get__)
    if (expr.operatorOverload) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const objectRaw = this.generateExpression(expr.object);
      const indexRaw = this.generateExpression(expr.index);

      // Get the struct name from the target type
      const targetType = overload.targetType as AST.BasicTypeNode;
      let structName = targetType.name;
      let methodType = method.resolvedType as AST.FunctionTypeNode;

      // Handle generic struct method calls
      if (targetType.genericArgs && targetType.genericArgs.length > 0) {
        const structDecl = this.structMap.get(targetType.name);
        if (structDecl && structDecl.genericParams.length > 0) {
          // Force generation of the monomorphized struct and its methods
          const substitutedArgs = targetType.genericArgs.map((arg) =>
            this.substituteType(arg, this.currentTypeMap),
          );
          this.resolveMonomorphizedType(structDecl, substitutedArgs);

          // Build context map for generic substitution
          const contextMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < structDecl.genericParams.length; i++) {
            contextMap.set(
              structDecl.genericParams[i]!.name,
              targetType.genericArgs[i]!,
            );
          }

          // Build monomorphized struct name using mangleType
          const argNames = targetType.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          structName = `${targetType.name}_${argNames}`;

          // Substitute types in method signature
          methodType = this.substituteType(
            methodType,
            contextMap,
          ) as AST.FunctionTypeNode;

          // Update the expression's resolved type to the substituted type
          // This ensures that subsequent consumers (like generateCall) see the concrete type
          expr.resolvedType = methodType.returnType;
        }
      }

      // Build the method name with struct prefix
      const fullMethodName = `${structName}_${method.name}`;
      const mangledName = this.getMangledName(fullMethodName, methodType);

      // Prepare arguments: this (object) + index
      const objectType = this.resolveType(expr.object.resolvedType!);
      const indexType = this.resolveType(expr.index.resolvedType!);

      // Get address of object (this pointer)
      let thisPtr: string;
      try {
        thisPtr = this.generateAddress(expr.object);
      } catch {
        // If we can't get address, spill to stack
        const spillAddr = this.allocateStack(
          `op_spill_${this.labelCount++}`,
          objectType,
        );
        this.emit(
          `  store ${objectType} ${objectRaw}, ${objectType}* ${spillAddr}`,
        );
        thisPtr = spillAddr;
      }

      // Call the __get__ method
      const returnType = this.resolveType(methodType.returnType);
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(${objectType}* ${thisPtr}, ${indexType} ${indexRaw})`,
      );
      return resultReg;
    }

    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  protected generateTernary(expr: AST.TernaryExpr): string {
    const cond = this.generateExpression(expr.condition);
    const thenLabel = this.newLabel("then");
    const elseLabel = this.newLabel("else");
    const mergeLabel = this.newLabel("merge");

    this.emit(`  br i1 ${cond}, label %${thenLabel}, label %${elseLabel}`);

    this.emit(`${thenLabel}:`);
    const thenVal = this.generateExpression(expr.trueExpr);
    const thenEndLabel = this.getCurrentLabel();
    this.emit(`  br label %${mergeLabel}`);

    this.emit(`${elseLabel}:`);
    const elseVal = this.generateExpression(expr.falseExpr);
    const elseEndLabel = this.getCurrentLabel();
    this.emit(`  br label %${mergeLabel}`);

    this.emit(`${mergeLabel}:`);
    const type = this.resolveType(expr.resolvedType!);
    const phi = this.newRegister();
    this.emit(
      `  ${phi} = phi ${type} [ ${thenVal}, %${thenEndLabel} ], [ ${elseVal}, %${elseEndLabel} ]`,
    );
    return phi;
  }

  protected getCurrentLabel(): string {
    // Find the last emitted label by scanning backwards
    for (let i = this.output.length - 1; i >= 0; i--) {
      const line = this.output[i]!.trim();
      if (line.endsWith(":") && !line.includes(" ")) {
        return line.slice(0, -1); // Remove the ':'
      }
    }
    return "entry"; // fallback
  }

  protected getTargetTypeFromTuple(
    tupleType: AST.TypeNode,
    indexPath: number[],
  ): string {
    const typeNode = this.getTargetTypeNodeFromTuple(tupleType, indexPath);
    if (!typeNode) return "i32";
    return this.resolveType(typeNode);
  }

  protected getTargetTypeNodeFromTuple(
    tupleType: AST.TypeNode,
    indexPath: number[],
  ): AST.TypeNode | null {
    let currentType = tupleType;
    for (const idx of indexPath) {
      if (currentType.kind === "TupleType") {
        currentType = (currentType as AST.TupleTypeNode).types[idx]!;
      } else {
        return null; // fallback
      }
    }
    return currentType;
  }

  protected generateArrayLiteral(expr: AST.ArrayLiteralExpr): string {
    const type = this.resolveType(expr.resolvedType!);
    let arrayVal = "undef";

    for (let i = 0; i < expr.elements.length; i++) {
      const elemExpr = expr.elements[i]!;
      const elemVal = this.generateExpression(elemExpr);
      const elemType = this.resolveType(elemExpr.resolvedType!);
      const nextVal = this.newRegister();
      this.emit(
        `  ${nextVal} = insertvalue ${type} ${arrayVal}, ${elemType} ${elemVal}, ${i}`,
      );
      arrayVal = nextVal;
    }

    return arrayVal;
  }

  protected generateStructLiteral(expr: AST.StructLiteralExpr): string {
    const type = this.resolveType(expr.resolvedType!);
    let structVal = "undef";

    const basicType = expr.resolvedType as AST.BasicTypeNode;
    // Handle monomorphized names
    let structName = basicType.name;
    if (basicType.genericArgs.length > 0) {
      // We need the mangled name without parameters to look up layout
      const resolved = this.resolveType(basicType);
      // resolved is %struct.Box_i32
      if (resolved.startsWith("%struct.")) {
        structName = resolved.substring(8);
      }
    }

    // Try to find layout
    const layout = this.structLayouts.get(structName);
    if (!layout) {
      // Maybe we haven't generated the layout yet?
      // generateStructLiteral should happen inside a function, so types should be resolved.
      throw new CompilerError(
        `Layout for struct ${structName} not found`,
        "Internal compiler error: struct layout missing.",
        expr.location,
      );
    }

    let fieldValues: Map<string, AST.Expression> | undefined = undefined;
    if (expr.fields.length > STRUCT_LITERAL_FIELD_MAP_THRESHOLD) {
      fieldValues = new Map<string, AST.Expression>();
      for (const field of expr.fields) {
        fieldValues.set(field.name, field.value);
      }
    }

    const sortedFields = this.getSortedStructLayoutEntries(structName, layout);

    // Get struct definition for field type info
    const baseStructName = expr.structName;
    const baseStructDef = this.structMap.get(baseStructName);
    let genericContextMap: Map<string, AST.TypeNode> | undefined = undefined;
    if (baseStructDef && basicType.genericArgs.length > 0) {
      genericContextMap = new Map<string, AST.TypeNode>();
      const typeParams = baseStructDef.genericParams || [];
      for (let i = 0; i < typeParams.length; i++) {
        genericContextMap.set(typeParams[i]!.name, basicType.genericArgs[i]!);
      }
    }

    for (const [fieldName, fieldIndex] of sortedFields) {
      if (fieldName === "__vtable__") {
        const vtableGlobal = this.vtableGlobalNames.get(structName);
        if (vtableGlobal) {
          const methods = this.vtableLayouts.get(structName)!;
          const arrayType = `[${methods.length} x i8*]`;
          const nextVal = this.newRegister();
          this.emit(
            `  ${nextVal} = insertvalue ${type} ${structVal}, i8* bitcast (${arrayType}* ${vtableGlobal} to i8*), ${fieldIndex}`,
          );
          structVal = nextVal;
        }
        continue;
      }

      let valExpr = fieldValues?.get(fieldName);
      if (!fieldValues) {
        for (const field of expr.fields) {
          if (field.name === fieldName) {
            valExpr = field.value;
            break;
          }
        }
      }
      if (valExpr) {
        let val = this.generateExpression(valExpr);
        const fieldType = this.resolveType(valExpr.resolvedType!);

        // Handle null assignment to closure struct (function pointer)
        if (
          (val === "null" || val === "0") &&
          fieldType.startsWith("{") &&
          fieldType.endsWith("}")
        ) {
          val = "zeroinitializer";
        }

        // Get expected field type from struct definition for type checking
        let expectedFieldType = fieldType; // Default to expression type
        if (baseStructDef) {
          const fieldDef = this.getStructFieldByName(
            baseStructDef,
            fieldName,
          );
          if (fieldDef) {
            // Resolve the field's declared type (may be generic)
            let fieldTypeNode = fieldDef.type;

            // Handle generic type substitution
            if (genericContextMap) {
              fieldTypeNode = this.substituteType(
                fieldTypeNode,
                genericContextMap,
              );
            }

            expectedFieldType = this.resolveType(fieldTypeNode);
          }
        }

        // Truncate if necessary (e.g., i32 -> i8)
        if (fieldType !== expectedFieldType) {
          const valSize = getIntegerBitWidth(fieldType);
          const expectedSize = getIntegerBitWidth(expectedFieldType);
          if (valSize > expectedSize) {
            const truncReg = this.newRegister();
            this.emit(
              `  ${truncReg} = trunc ${fieldType} ${val} to ${expectedFieldType}`,
            );
            val = truncReg;
          }
        }

        const nextVal = this.newRegister();
        this.emit(
          `  ${nextVal} = insertvalue ${type} ${structVal}, ${expectedFieldType} ${val}, ${fieldIndex}`,
        );
        structVal = nextVal;
      }
    }

    return structVal;
  }

  protected generateTupleLiteral(expr: AST.TupleLiteralExpr): string {
    const type = this.resolveType(expr.resolvedType!);
    let tupleVal = "undef";

    // Generate each element and insert into the tuple struct
    for (let i = 0; i < expr.elements.length; i++) {
      const elemExpr = expr.elements[i]!;
      const elemVal = this.generateExpression(elemExpr);
      const elemType = this.resolveType(elemExpr.resolvedType!);
      const nextVal = this.newRegister();
      this.emit(
        `  ${nextVal} = insertvalue ${type} ${tupleVal}, ${elemType} ${elemVal}, ${i}`,
      );
      tupleVal = nextVal;
    }

    return tupleVal;
  }

  protected generateTupleLiteralForTarget(
    expr: AST.TupleLiteralExpr,
    targetTypeNode: AST.TupleTypeNode,
  ): string {
    if (expr.elements.length !== targetTypeNode.types.length) {
      throw this.createError(
        `Tuple literal has ${expr.elements.length} elements, but target tuple has ${targetTypeNode.types.length}`,
        expr,
        "This is an internal compiler error. Tuple literal arity should be checked before code generation.",
      );
    }

    const tupleType = this.resolveType(targetTypeNode);
    let tupleVal = "undef";

    for (let i = 0; i < expr.elements.length; i++) {
      const elemExpr = expr.elements[i]!;
      const targetElemTypeNode = targetTypeNode.types[i]!;
      const targetElemType = this.resolveType(targetElemTypeNode);
      let elemVal: string;

      if (
        elemExpr.kind === "TupleLiteral" &&
        targetElemTypeNode.kind === "TupleType"
      ) {
        elemVal = this.generateTupleLiteralForTarget(
          elemExpr as AST.TupleLiteralExpr,
          targetElemTypeNode,
        );
      } else {
        const sourceElemTypeNode = elemExpr.resolvedType!;
        elemVal = this.generateExpression(elemExpr);
        elemVal = this.emitCast(
          elemVal,
          this.resolveType(sourceElemTypeNode),
          targetElemType,
          sourceElemTypeNode,
          targetElemTypeNode,
        );
      }

      const nextVal = this.newRegister();
      this.emit(
        `  ${nextVal} = insertvalue ${tupleType} ${tupleVal}, ${targetElemType} ${elemVal}, ${i}`,
      );
      tupleVal = nextVal;
    }

    return tupleVal;
  }

  protected generateEnumStructVariant(expr: AST.EnumStructVariantExpr): string {
    // Get the enum variant info from type checker
    const enumVariantInfo = (expr as any).enumVariantInfo;
    if (!enumVariantInfo) {
      throw new CompilerError(
        "Missing enum variant info for struct variant construction",
        "Internal compiler error: variant info missing.",
        expr.location,
      );
    }

    const _enumDecl = enumVariantInfo.enumDecl as AST.EnumDecl;
    const variant = enumVariantInfo.variant as AST.EnumVariant;
    const variantIndex = enumVariantInfo.variantIndex as number;

    // Generate code to construct the enum value
    const enumType = this.resolveType(expr.resolvedType!);

    // Allocate space on stack to build the enum value
    const enumPtr = this.newRegister();
    this.emit(`  ${enumPtr} = alloca ${enumType}`);

    // Get pointer to tag field and store the discriminant
    const tagPtr = this.newRegister();
    this.emit(
      `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 0`,
    );
    this.emit(`  store i32 ${variantIndex}, i32* ${tagPtr}`);

    // Handle struct data if present
    if (
      variant.dataType &&
      variant.dataType.kind === "EnumVariantStruct" &&
      expr.fields.length > 0
    ) {
      // Get pointer to data field
      const dataPtr = this.newRegister();
      this.emit(
        `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 1`,
      );

      const structVariant = variant.dataType as AST.EnumVariantStruct;
      const typeMap = new Map<string, AST.TypeNode>();
      if (
        expr.resolvedType?.kind === "BasicType" &&
        expr.resolvedType.genericArgs.length > 0 &&
        _enumDecl.genericParams.length > 0
      ) {
        for (
          let i = 0;
          i < _enumDecl.genericParams.length &&
          i < expr.resolvedType.genericArgs.length;
          i++
        ) {
          typeMap.set(
            _enumDecl.genericParams[i]!.name,
            expr.resolvedType.genericArgs[i]!,
          );
        }
      }
      const fieldTypes = structVariant.fields.map((field) =>
        typeMap.size > 0
          ? this.substituteType(field.type, typeMap)
          : field.type,
      );
      const enumName = enumType.substring(6);
      const dataArraySize = this.enumDataSizes.get(enumName) || 64;
      const bytePtr = this.newRegister();
      this.emit(
        `  ${bytePtr} = bitcast [${dataArraySize} x i8]* ${dataPtr} to i8*`,
      );
      this.usedLlvmMemIntrinsics.add("memset");
      this.emit(
        `  call void @llvm.memset.p0i8.i64(i8* ${bytePtr}, i8 0, i64 ${dataArraySize}, i1 false)`,
      );

      // Store each field in sequence in the data array
      for (let i = 0; i < expr.fields.length; i++) {
        const field = expr.fields[i]!;
        const fieldValue = this.generateExpression(field.value);
        const sourceTypeNode = field.value.resolvedType!;
        const sourceType = this.resolveType(sourceTypeNode);

        // Find the field index in the variant definition
        const fieldIndex = structVariant.fields.findIndex(
          (f) => f.name === field.name,
        );
        if (fieldIndex === -1) {
          throw new CompilerError(
            `Field ${field.name} not found in variant ${variant.name}`,
            "Check the enum variant definition.",
            expr.location,
          );
        }
        const fieldTypeNode = fieldTypes[fieldIndex]!;
        const fieldType = this.resolveType(fieldTypeNode);
        const storeValue = this.emitCast(
          fieldValue,
          sourceType,
          fieldType,
          sourceTypeNode,
          fieldTypeNode,
        );

        const byteOffset = this.getEnumDataFieldByteOffset(
          fieldTypes,
          fieldIndex,
        );
        let fieldBytePtr = bytePtr;
        if (byteOffset > 0) {
          fieldBytePtr = this.newRegister();
          this.emit(
            `  ${fieldBytePtr} = getelementptr i8, i8* ${bytePtr}, i32 ${byteOffset}`,
          );
        }

        const storePtr = this.newRegister();
        this.emit(
          `  ${storePtr} = bitcast i8* ${fieldBytePtr} to ${fieldType}*`,
        );

        // Store the value
        this.emit(
          `  store ${fieldType} ${storeValue}, ${fieldType}* ${storePtr}, align 1`,
        );
      }
    }

    // Load the constructed enum value
    const result = this.newRegister();
    this.emit(`  ${result} = load ${enumType}, ${enumType}* ${enumPtr}`);

    return result;
  }

  protected generateSizeof(expr: AST.SizeofExpr): string {
    let type: AST.TypeNode;
    const target = expr.target as AST.ASTNode;

    if (
      target.kind === "BasicType" ||
      target.kind === "TupleType" ||
      target.kind === "FunctionType" ||
      target.kind === "LambdaType" ||
      target.kind === "MetaType"
    ) {
      type = target as AST.TypeNode;
    } else {
      type = (target as AST.Expression).resolvedType!;
    }

    if (type.kind === "MetaType") {
      type = (type as any).type;
    }

    const llvmType = this.resolveType(type);
    const ptrReg = this.newRegister();
    this.emit(
      `  ${ptrReg} = getelementptr ${llvmType}, ${llvmType}* null, i32 1`,
    );
    const intReg = this.newRegister();
    this.emit(`  ${intReg} = ptrtoint ${llvmType}* ${ptrReg} to i64`);
    return intReg;
  }

  protected generateOffsetOf(expr: AST.OffsetOfExpr): string {
    const targetType = expr.targetType;
    // We assume checkOffsetOf verified it's a struct and member exists

    const llvmType = this.resolveType(targetType);

    // Find field index
    const basicType = targetType as AST.BasicTypeNode;
    // resolvedDeclaration should be present
    const structDecl = basicType.resolvedDeclaration as AST.StructDecl;

    // We iterate to find the index
    // Note: We need to match the backend's view of fields (which matches AST usually)
    let fieldIndex = -1;
    let currentIdx = 0;
    for (const member of structDecl.members) {
      if (member.kind === "StructField") {
        if (member.name === expr.member) {
          fieldIndex = currentIdx;
          break;
        }
        currentIdx++;
      }
    }

    if (fieldIndex === -1) {
      throw new CompilerError(
        `Field ${expr.member} not found in struct during codegen`,
        "This assumes TypeCheck passed.",
        expr.location,
      );
    }

    // Use structLayouts to determine the correct field index, accounting for potential hidden fields like vtables.
    let lookupName = structDecl.name;
    if (basicType.genericArgs.length > 0) {
      // Mangle name
      lookupName = this.mangleType(basicType).replace("%struct.", "");
    }

    const realLayout = this.structLayouts.get(lookupName);
    if (realLayout && realLayout.has(expr.member)) {
      fieldIndex = realLayout.get(expr.member)!;
    } else if (
      this.vtableLayouts.has(lookupName) &&
      this.vtableLayouts.get(lookupName)!.length > 0
    ) {
      fieldIndex += 1; // Shift for vtable
    }

    const ptrReg = this.newRegister();
    this.emit(
      `  ${ptrReg} = getelementptr ${llvmType}, ${llvmType}* null, i32 0, i32 ${fieldIndex}`,
    );
    const intReg = this.newRegister();
    this.emit(`  ${intReg} = ptrtoint ${llvmType}* ${ptrReg} to i64`);
    return intReg;
  }
}
