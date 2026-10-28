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
import { formatFloatingPointLiteral } from "./FloatingPointLiteral";
import { lowerImplicitConversion } from "../../middleend/lowering/ImplicitConversions";
import { loadVTableMethod } from "./calls/VirtualCallEmitter";

const STRUCT_LITERAL_FIELD_MAP_THRESHOLD = 4;
const COMPOUND_BINARY_OPERATORS: Partial<Record<TokenType, TokenType>> = {
  [TokenType.PlusEqual]: TokenType.Plus,
  [TokenType.MinusEqual]: TokenType.Minus,
  [TokenType.StarEqual]: TokenType.Star,
  [TokenType.SlashEqual]: TokenType.Slash,
  [TokenType.PercentEqual]: TokenType.Percent,
  [TokenType.AmpersandEqual]: TokenType.Ampersand,
  [TokenType.PipeEqual]: TokenType.Pipe,
  [TokenType.CaretEqual]: TokenType.Caret,
};

export abstract class ExpressionGenerator extends UnaryExpressionGenerator {
  protected abstract generateBlock(block: AST.BlockStmt): void;
  protected abstract generateThrow(stmt: AST.ThrowStmt): void;

  protected guardAllocation(
    pointer: string,
    node: AST.ASTNode,
    message: string,
    cleanupPointer?: string,
  ): void {
    const failed = this.newRegister();
    const failureLabel = this.newLabel("allocation.failed");
    const successLabel = this.newLabel("allocation.ready");
    this.emit(`  ${failed} = icmp eq i8* ${pointer}, null`);
    this.emit(
      `  br i1 ${failed}, label %${failureLabel}, label %${successLabel}`,
    );
    this.emit(`${failureLabel}:`);
    if (cleanupPointer) {
      this.emit(`  call void @free(i8* ${cleanupPointer})`);
    }
    this.generateThrow({
      kind: "Throw",
      location: node.location,
      expression: {
        kind: "Literal",
        type: "string",
        value: message,
        raw: JSON.stringify(message),
        location: node.location,
        resolvedType: {
          kind: "BasicType",
          name: "string",
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: node.location,
        },
      },
    });
    this.emit(`${successLabel}:`);
  }

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
      this.guardAllocation(mallocReg, expr, "Cannot allocate lambda capture");
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
          return formatFloatingPointLiteral(Number(expr.value), "double");
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
    if (
      expr.resolvedType.kind === "FunctionType" &&
      !this.locals.has(name) &&
      expr.resolvedDeclaration?.kind !== "VariableDecl"
    ) {
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
        funcName =
          this.getCAbiExternWrapper(expr.resolvedDeclaration) ??
          expr.resolvedDeclaration.name;
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
    if (
      expr.assignee.kind === "Index" &&
      expr.assignee.operatorOverload?.methodName === "__set__"
    ) {
      const index = expr.assignee;
      const overload = index.operatorOverload!;
      let methodType = overload.methodType;
      if (!methodType || methodType.paramTypes.length !== 3) {
        throw this.createError(
          "Index setter is missing its checked signature",
          expr,
        );
      }
      methodType = this.substituteType(
        methodType,
        this.currentTypeMap,
      ) as AST.FunctionTypeNode;
      const thisType = this.resolveType(methodType.paramTypes[0]!);
      const structName = thisType.replace(/^%struct\./, "").replace(/\*+$/, "");
      const name = this.getMangledName(
        `${structName}_${overload.methodDeclaration.name}`,
        methodType,
      );
      const receiver = this.generateCheckedIndexArgument(
        index.object,
        methodType.paramTypes[0]!,
      );
      const key = this.generateCheckedIndexArgument(
        index.index,
        methodType.paramTypes[1]!,
      );
      const value = this.generateCheckedIndexArgument(
        expr.value,
        methodType.paramTypes[2]!,
        true,
      );
      const returnType = this.resolveType(methodType.returnType);
      const args = `${thisType} ${receiver.value}, ${this.resolveType(methodType.paramTypes[1]!)} ${key.value}, ${this.resolveType(methodType.paramTypes[2]!)} ${value.value}`;
      if (returnType !== "void") {
        const result = this.newRegister();
        this.emit(`  ${result} = call ${returnType} @${name}(${args})`);
        return this.emitCast(
          result,
          returnType,
          this.resolveType(expr.resolvedType!),
          methodType.returnType,
          expr.resolvedType!,
        );
      }
      this.emit(`  call void @${name}(${args})`);
      return this.emitCast(
        value.originalValue!,
        this.resolveType(expr.value.resolvedType!),
        this.resolveType(expr.resolvedType!),
        expr.value.resolvedType!,
        expr.resolvedType!,
      );
    }

    // Handle tuple destructuring assignment: (a, b) = expr
    if (expr.assignee.kind === "TupleLiteral") {
      const tupleLit = expr.assignee as AST.TupleLiteralExpr;
      const tupleVal = this.generateExpression(expr.value);
      const tupleType = this.resolveType(expr.value.resolvedType!);

      // Extract each element and assign to the corresponding target
      for (let i = 0; i < tupleLit.elements.length; i++) {
        const target = tupleLit.elements[i]!;
        const addr = this.generateAddress(target);

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
        // A store can replace a later target's base or an aliased value.
        // Do not reuse pointer or integer proofs across tuple stores.
        this.clearBasicBlockPointerFacts();
      }

      return tupleVal;
    }

    const addr = this.generateAddress(expr.assignee);
    const destType = this.resolveType(expr.assignee.resolvedType!);

    if (expr.operator.type === TokenType.Equal) {
      const destTypeNode = expr.assignee.resolvedType!;
      const sourceTypeNode = expr.value.resolvedType!;
      let castVal: string;
      if (
        lowerImplicitConversion(destTypeNode, sourceTypeNode).kind ===
          "array-to-slice" &&
        this.isSliceTypeNode(destTypeNode) &&
        this.isFixedArrayTypeNode(sourceTypeNode)
      ) {
        try {
          const sourceAddr = this.generateAddress(expr.value);
          castVal = this.emitSliceFromArrayAddress(
            sourceAddr,
            sourceTypeNode,
            destTypeNode,
          );
        } catch {
          castVal = this.emitSliceFromArrayValue(
            this.generateExpression(expr.value),
            sourceTypeNode,
            destTypeNode,
          );
        }
      } else {
        castVal =
          expr.value.kind === "TupleLiteral" &&
          destTypeNode.kind === "TupleType"
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
      }
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

    // `p += n` / `p -= n` step the pointer by elements, like `p + n`; the
    // integer offset must not be converted to the pointer type.
    if (destType.endsWith("*") && this.isIntegerType(srcType)) {
      const operator = COMPOUND_BINARY_OPERATORS[expr.operator.type];
      const stepped =
        operator === TokenType.Plus || operator === TokenType.Minus
          ? this.handlePointerArithmetic(
              {
                kind: "Binary",
                left: expr.assignee,
                right: expr.value,
                operator: { ...expr.operator, type: operator },
                location: expr.location,
              },
              currentValue,
              val,
              destType,
              srcType,
            )
          : null;
      if (stepped === null) {
        throw new CompilerError(
          `Operator '${expr.operator.lexeme}' is not supported on pointers`,
          "Only '+=' and '-=' with an integer offset apply to pointers.",
          expr.location,
        );
      }
      this.emit(`  store ${destType} ${stepped}, ${destType}* ${addr}`);
      this.clearBasicBlockPointerExpressionFact(
        this.exprToDescription(expr.assignee),
      );
      return stepped;
    }
    const castVal = this.emitCast(
      val,
      srcType,
      destType,
      expr.value.resolvedType!,
      expr.assignee.resolvedType!,
    );

    const operator = COMPOUND_BINARY_OPERATORS[expr.operator.type];
    if (operator === undefined) {
      throw new CompilerError(
        `Unsupported compound assignment operator: ${expr.operator.lexeme}`,
        "This operator is not supported for compound assignment.",
        expr.location,
      );
    }

    // Reuse binary arithmetic after evaluating the address and operands once.
    // Keep narrowing visible so constant-divisor checks use the stored width.
    const right: AST.Expression =
      srcType === destType
        ? expr.value
        : {
            kind: "Cast",
            expression: expr.value,
            targetType: expr.assignee.resolvedType!,
            resolvedType: expr.assignee.resolvedType!,
            location: expr.value.location,
          };
    const result = this.generateStandardBinaryOp(
      {
        kind: "Binary",
        left: expr.assignee,
        right,
        operator: { ...expr.operator, type: operator },
        location: expr.location,
      },
      currentValue,
      castVal,
      destType,
    );
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

    // Bound methods on temporary values must be recognized before ordinary
    // aggregate field extraction; the receiver is evaluated once by the binder.
    const boundDeclaration = (
      expr.resolvedType as
        (AST.LambdaTypeNode & { declaration?: AST.FunctionDecl }) | undefined
    )?.declaration;
    if (
      expr.resolvedType?.kind === "LambdaType" &&
      boundDeclaration?.kind === "FunctionDecl"
    ) {
      return this.generateBoundMethod(expr, boundDeclaration);
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

    let memberBase = expr.object;
    while (memberBase.kind === "Group") memberBase = memberBase.expression;
    const isPointerBase =
      expr.object.resolvedType?.kind === "BasicType" &&
      expr.object.resolvedType.pointerDepth > 0;
    if (
      !isPointerBase &&
      (memberBase.kind === "Call" ||
        !this.isAddressableAggregateSource(expr.object))
    ) {
      const callType = expr.object.resolvedType as
        AST.BasicTypeNode | undefined;
      if (!callType || callType.kind !== "BasicType") {
        throw new CompilerError(
          "Member access on non-struct type",
          "Members can only be accessed on struct types.",
          expr.location,
        );
      }

      // Owned struct values need temporary storage. Pointer field reads use
      // the checked member-address path below, including computed receivers.
      const llvmObjType = this.resolveType(callType);
      const basePtr = this.allocateStackSlot(llvmObjType);
      const valueReg = this.generateExpression(expr.object);
      this.emit(
        `  store ${llvmObjType} ${valueReg}, ${llvmObjType}* ${basePtr}`,
      );

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

  /** Bind the checked virtual entry or direct method to borrowed receiver storage. */
  protected generateBoundMethod(
    expr: AST.MemberExpr,
    methodDecl: AST.FunctionDecl,
  ): string {
    const objType = this.resolveInstantiatedValueType(
      expr.object.resolvedType!,
    ) as AST.BasicTypeNode;
    const ownerBindings = new Map<string, AST.TypeNode>();
    const declaration = objType.resolvedDeclaration;
    if (
      declaration?.kind === "StructDecl" ||
      declaration?.kind === "EnumDecl"
    ) {
      declaration.genericParams.forEach((parameter, index) => {
        const argument = objType.genericArgs[index];
        if (argument) {
          ownerBindings.set(
            parameter.name,
            this.substituteType(argument, this.currentTypeMap),
          );
        }
      });
      if (declaration.kind === "StructDecl" && objType.genericArgs.length) {
        this.resolveMonomorphizedType(
          declaration,
          objType.genericArgs.map((argument) =>
            this.substituteType(argument, this.currentTypeMap),
          ),
        );
      }
    }
    let valPtr: string;
    let valPtrType: string;

    // 1. Get Context Pointer (this)
    if (expr.object.kind === "Call") {
      const callType = objType;
      const llvmObjType = this.resolveType(callType);

      if (callType.pointerDepth > 0) {
        valPtr = this.generateExpression(expr.object);
        valPtrType = llvmObjType;
      } else {
        // Result is value. Store in alloca.
        valPtr = this.allocateStackSlot(llvmObjType);
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
        valPtr = this.allocateStackSlot(llvmObjType);
        this.emit(`  store ${llvmObjType} ${val}, ${llvmObjType}* ${valPtr}`);
        valPtrType = llvmObjType + "*";
      }
    }

    // Use the concrete copy of the checked declaration for generic receivers.
    const receiverName = this.resolveType(objType)
      .replace(/^%struct\./, "")
      .replace(/\*+$/, "");
    const owner = this.findMethodOwner(receiverName, methodDecl.name);
    const concreteMethod = owner?.members.find(
      (member): member is AST.FunctionDecl =>
        member.kind === "FunctionDecl" &&
        (member === methodDecl ||
          (member.resolvedType?.kind === "FunctionType" &&
            member.resolvedType.declaration === methodDecl)),
    );
    if (concreteMethod) methodDecl = concreteMethod;

    // 2. Resolve Function Name (Mangled)
    const checkedType = methodDecl.resolvedType;
    let funcType: AST.FunctionTypeNode = {
      // Preserve checked parameter and return types for the callable ABI
      kind: "FunctionType",
      returnType:
        checkedType?.kind === "FunctionType"
          ? checkedType.returnType
          : methodDecl.returnType,
      paramTypes:
        checkedType?.kind === "FunctionType"
          ? checkedType.paramTypes
          : methodDecl.params.map((p) => p.type),
      isVariadic: methodDecl.params.some((p) => p.isVariadic),
      location: methodDecl.location,
    };
    // Enum instantiations keep their template method declarations. Apply their
    // owner arguments before resolving any remaining names or mangling symbols.
    if (ownerBindings.size) {
      funcType = this.substituteType(
        funcType,
        ownerBindings,
      ) as AST.FunctionTypeNode;
    }

    const receiverType = this.resolveType(funcType.paramTypes[0]!);
    const structName = receiverType
      .replace(/^%(?:struct|enum)\./, "")
      .replace(/\*+$/, "");

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
    const specificRetTypeStr = this.resolveType(funcType.returnType);
    const specificParamTypes = funcType.paramTypes.map((type) =>
      this.resolveType(type),
    );
    const specificParamTypesStr = specificParamTypes.join(", ");
    const specificFuncPtrType = `${specificRetTypeStr} (${specificParamTypesStr})*`;

    const valueReceiver =
      methodDecl.params[0]?.name === "this" &&
      !specificParamTypes[0]!.endsWith("*");
    if (valueReceiver && funcType.isVariadic) {
      throw new CompilerError(
        "Cannot bind a variadic value-receiver method",
        "Use a non-variadic method signature for binding callbacks.",
        expr.location,
      );
    }

    // Virtual value-receiver entries already contain the adapter that copies
    // the derived layout. Bind the selected entry with the borrowed context.
    const layout = this.vtableLayouts.get(receiverName);
    const methodKey = this.getVTableMethodName({
      ...methodDecl,
      resolvedType: funcType,
    });
    const methodIndex = layout?.indexOf(methodKey) ?? -1;
    const directLifecycleMethod = [
      "new",
      "init",
      "destroy",
      "cleanup",
    ].includes(methodDecl.name);
    let castFuncPtr: string;
    if (methodIndex >= 0 && !directLifecycleMethod) {
      if (objType.pointerDepth > 0) {
        this.emitNullPointerCheck(
          valPtr,
          valPtrType,
          expr.location,
          this.exprToDescription(expr.object),
          "Attempted to bind a method through nullptr",
        );
      }
      const methodPointer = loadVTableMethod(
        {
          newRegister: () => this.newRegister(),
          emit: (line) => this.emit(line),
        },
        valPtr,
        valPtrType,
        methodIndex,
      );
      castFuncPtr = this.newRegister();
      this.emit(
        `  ${castFuncPtr} = bitcast i8* ${methodPointer} to ${genericFuncPtrType}`,
      );
    } else if (valueReceiver) {
      if (objType.pointerDepth > 0) {
        this.emitNullPointerCheck(
          valPtr,
          valPtrType,
          expr.location,
          this.exprToDescription(expr.object),
          "Attempted to bind a value receiver through nullptr",
        );
      }
      castFuncPtr = `@${this.requestValueReceiverThunk(funcName, funcType)}`;
    } else {
      castFuncPtr = this.newRegister();
      this.emit(
        `  ${castFuncPtr} = bitcast ${specificFuncPtrType} @${funcName} to ${genericFuncPtrType}`,
      );
    }

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

  protected override generateCast(expr: AST.CastExpr): string {
    const rawSource = expr.expression.resolvedType!;
    if (
      rawSource.kind === "BasicType" &&
      rawSource.pointerDepth > 0 &&
      rawSource.arrayDimensions.length === 0
    )
      return super.generateCast(expr);
    const sourceType = this.resolveInstantiatedValueType(rawSource);
    if (
      !this.isFixedArrayTypeNode(sourceType) ||
      !this.resolveType(sourceType).startsWith("[") ||
      !this.isAddressableAggregateSource(expr.expression)
    )
      return super.generateCast(expr);
    const targetType = this.resolveInstantiatedValueType(
      expr.resolvedType ?? expr.targetType,
    );
    const conversion = lowerImplicitConversion(targetType, sourceType);
    if (
      this.isFixedArrayTypeNode(sourceType) &&
      this.isAddressableAggregateSource(expr.expression)
    ) {
      if (
        conversion.kind === "array-to-slice" &&
        this.isSliceTypeNode(targetType)
      ) {
        return this.emitSliceFromArrayAddress(
          this.generateAddress(expr.expression),
          sourceType,
          targetType,
        );
      }
      if (conversion.kind === "array-to-pointer") {
        return this.emitPointerFromArrayAddress(
          this.generateAddress(expr.expression),
          sourceType,
        );
      }
    }
    return super.generateCast(expr);
  }

  /** Lower an index operator argument once, retaining an assignment value when needed. */
  private generateCheckedIndexArgument(
    expression: AST.Expression,
    target: AST.TypeNode,
    captureOriginal = false,
  ): { value: string; originalValue?: string } {
    const source = this.resolveInstantiatedValueType(expression.resolvedType!);
    target = this.resolveInstantiatedValueType(target);
    const sourceType = this.resolveType(source);
    const targetType = this.resolveType(target);
    const conversion = lowerImplicitConversion(target, source);
    const addressesValue =
      source.kind === "BasicType" &&
      target.kind === "BasicType" &&
      target.pointerDepth === source.pointerDepth + 1 &&
      lowerImplicitConversion(
        { ...target, pointerDepth: target.pointerDepth - 1 },
        source,
      ).kind === "identity";
    const borrowsArray =
      conversion.kind === "array-to-slice" ||
      conversion.kind === "array-to-pointer";
    let storageExpression = expression;
    while (storageExpression.kind === "Group") {
      storageExpression = storageExpression.expression;
    }
    let address: string | undefined;
    let originalValue: string | undefined;
    if (
      (addressesValue || borrowsArray) &&
      storageExpression.kind !== "Call" &&
      this.isAddressableAggregateSource(expression)
    ) {
      address = this.generateAddress(expression);
      if (captureOriginal) {
        originalValue = this.newRegister();
        this.emit(
          `  ${originalValue} = load ${sourceType}, ${sourceType}* ${address}`,
        );
      }
    } else {
      originalValue = this.generateExpression(expression);
    }
    if (addressesValue) {
      if (address === undefined) {
        address = this.allocateStack(
          `setter_arg_${this.labelCount++}`,
          sourceType,
        );
        this.emit(
          `  store ${sourceType} ${originalValue}, ${sourceType}* ${address}`,
        );
      }
      const pointerType: AST.TypeNode =
        source.kind === "BasicType"
          ? {
              ...source,
              pointerDepth: source.pointerDepth + 1,
              isPointerToArray: source.arrayDimensions.length > 0,
            }
          : source;
      const value = this.emitCast(
        address,
        `${sourceType}*`,
        targetType,
        pointerType,
        target,
      );
      return { value, originalValue };
    }
    if (address !== undefined && this.isFixedArrayTypeNode(source)) {
      if (
        conversion.kind === "array-to-slice" &&
        this.isSliceTypeNode(target)
      ) {
        return {
          value: this.emitSliceFromArrayAddress(address, source, target),
          originalValue,
        };
      }
      const pointer = this.emitPointerFromArrayAddress(address, source);
      const pointerType = `${this.resolveType(this.getArrayElementTypeNode(source))}*`;
      const element = this.getArrayElementTypeNode(source);
      const pointerNode: AST.TypeNode =
        element.kind === "BasicType"
          ? {
              ...element,
              pointerDepth: element.pointerDepth + 1,
              isPointerToArray: element.arrayDimensions.length > 0,
            }
          : element;
      return {
        value: this.emitCast(
          pointer,
          pointerType,
          targetType,
          pointerNode,
          target,
        ),
        originalValue,
      };
    }
    return {
      value: this.emitCast(
        originalValue!,
        sourceType,
        targetType,
        source,
        target,
      ),
      originalValue,
    };
  }

  /** Lower checked getter calls or load an element from built-in indexed storage. */
  protected generateIndex(expr: AST.IndexExpr): string {
    // Check for operator overload (__get__)
    if (expr.operatorOverload) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;

      // Get the struct name from the target type
      const targetType = overload.targetType as AST.BasicTypeNode;
      let methodType =
        overload.methodType ?? (method.resolvedType as AST.FunctionTypeNode);

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

      methodType = this.substituteType(
        methodType,
        this.currentTypeMap,
      ) as AST.FunctionTypeNode;
      const receiverType = this.resolveType(methodType.paramTypes[0]!);
      const structName = receiverType
        .replace(/^%struct\./, "")
        .replace(/\*+$/, "");
      const mangledName = this.getMangledName(
        `${structName}_${method.name}`,
        methodType,
      );
      const receiver = this.generateCheckedIndexArgument(
        expr.object,
        methodType.paramTypes[0]!,
      );
      const index = this.generateCheckedIndexArgument(
        expr.index,
        methodType.paramTypes[1]!,
      );
      const indexType = this.resolveType(methodType.paramTypes[1]!);

      // Call the __get__ method
      const returnType = this.resolveType(methodType.returnType);
      if (returnType === "void") {
        this.emit(
          `  call void @${mangledName}(${receiverType} ${receiver.value}, ${indexType} ${index.value})`,
        );
        return "0";
      }
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(${receiverType} ${receiver.value}, ${indexType} ${index.value})`,
      );
      return resultReg;
    }

    // Indexing reads its base from a slot, even when the expression produces
    // an array, slice or pointer value. Keep this spill in the read path: it
    // must not make temporary elements assignable or addressable.
    let objectAddress: string | undefined;
    if (!this.isAddressableAggregateSource(expr.object)) {
      const objectType = this.resolveInstantiatedValueType(
        expr.object.resolvedType!,
      );
      const llvmType = this.resolveType(objectType);
      const value = this.generateExpression(expr.object);
      objectAddress = this.allocateStack(
        `index_value_${this.labelCount++}`,
        llvmType,
      );
      this.emit(`  store ${llvmType} ${value}, ${llvmType}* ${objectAddress}`);
    }
    const addr = this.generateIndexAddress(expr, false, objectAddress);
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

    const type = this.resolveType(expr.resolvedType!);
    // Convert each branch to the unified result type inside its own block so
    // the phi joins values of one LLVM type (BUG-425).
    const generateBranch = (branch: AST.Expression): string => {
      const value = this.generateExpression(branch);
      if (!branch.resolvedType) return value;
      return this.emitCast(
        value,
        this.resolveType(branch.resolvedType),
        type,
        branch.resolvedType,
        expr.resolvedType!,
      );
    };

    this.emit(`${thenLabel}:`);
    const thenVal = generateBranch(expr.trueExpr);
    const thenEndLabel = this.getCurrentLabel();
    this.emit(`  br label %${mergeLabel}`);

    this.emit(`${elseLabel}:`);
    const elseVal = generateBranch(expr.falseExpr);
    const elseEndLabel = this.getCurrentLabel();
    this.emit(`  br label %${mergeLabel}`);

    this.emit(`${mergeLabel}:`);
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

    const arrayTypeNode = expr.resolvedType!;
    if (!("arrayDimensions" in arrayTypeNode)) {
      throw new CompilerError(
        "Array literal is missing its array type",
        "",
        expr.location,
      );
    }
    const targetTypeNode = {
      ...arrayTypeNode,
      arrayDimensions: arrayTypeNode.arrayDimensions!.slice(1),
    };
    const elemType = this.resolveType(targetTypeNode);
    for (let i = 0; i < expr.elements.length; i++) {
      const elemExpr = expr.elements[i]!;
      const sourceTypeNode = elemExpr.resolvedType!;
      const elemVal = this.emitCast(
        this.generateExpression(elemExpr),
        this.resolveType(sourceTypeNode),
        elemType,
        sourceTypeNode,
        targetTypeNode,
      );
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

    // The checker requires every field declared directly on the struct, but
    // inherited fields may be omitted. Omitted fields are zero-initialized
    // instead of being left undefined.
    const omitsField = sortedFields.some(
      ([fieldName]) =>
        fieldName !== "__vtable__" &&
        !(fieldValues
          ? fieldValues.has(fieldName)
          : expr.fields.some((field) => field.name === fieldName)),
    );
    if (omitsField) {
      structVal = "zeroinitializer";
    }

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
        let fieldTypeNode = valExpr.resolvedType!;
        if (baseStructDef) {
          const fieldDef = this.getStructFieldByName(baseStructDef, fieldName);
          if (fieldDef) {
            fieldTypeNode = genericContextMap
              ? this.substituteType(fieldDef.type, genericContextMap)
              : fieldDef.type;
          }
        }
        const expectedFieldType = this.resolveType(fieldTypeNode);
        const val = this.generateAggregateElementForTarget(
          valExpr,
          fieldTypeNode,
        );

        const nextVal = this.newRegister();
        this.emit(
          `  ${nextVal} = insertvalue ${type} ${structVal}, ${expectedFieldType} ${val}, ${fieldIndex}`,
        );
        structVal = nextVal;
      }
    }

    return structVal;
  }

  /** Borrow addressable arrays instead of creating views of value copies. */
  private generateAggregateElementForTarget(
    expression: AST.Expression,
    targetType: AST.TypeNode,
  ): string {
    const sourceType = this.resolveInstantiatedValueType(
      expression.resolvedType!,
    );
    const resolvedTarget = this.resolveInstantiatedValueType(targetType);
    const conversion = lowerImplicitConversion(resolvedTarget, sourceType);
    if (
      conversion.kind === "array-to-slice" &&
      this.isSliceTypeNode(resolvedTarget) &&
      this.isFixedArrayTypeNode(sourceType)
    ) {
      if (this.isAddressableAggregateSource(expression)) {
        return this.emitSliceFromArrayAddress(
          this.generateAddress(expression),
          sourceType,
          resolvedTarget,
        );
      }
      return this.emitSliceFromArrayValue(
        this.generateExpression(expression),
        sourceType,
        resolvedTarget,
      );
    }
    let value = expression;
    while (value.kind === "Group") value = value.expression;
    if (value.kind === "TupleLiteral" && resolvedTarget.kind === "TupleType") {
      return this.generateTupleLiteralForTarget(value, resolvedTarget);
    }
    const destination = this.resolveType(resolvedTarget);
    const converted = this.emitCast(
      this.generateExpression(expression),
      this.resolveType(sourceType),
      destination,
      sourceType,
      resolvedTarget,
    );
    // Null closure values use an aggregate zero, just as struct fields did.
    return (converted === "null" || converted === "0") &&
      destination.startsWith("{") &&
      destination.endsWith("}")
      ? "zeroinitializer"
      : converted;
  }

  private isAddressableAggregateSource(expression: AST.Expression): boolean {
    switch (expression.kind) {
      case "Identifier":
        return true;
      case "Group":
        return this.isAddressableAggregateSource(expression.expression);
      case "Member":
        return this.isAddressableAggregateSource(expression.object);
      case "Index":
        return (
          !expression.operatorOverload &&
          this.isAddressableAggregateSource(expression.object)
        );
      case "Unary":
        return (
          !expression.operatorOverload &&
          expression.operator.type === TokenType.Star
        );
      case "Call":
        return (
          expression.resolvedType?.kind === "BasicType" &&
          this.resolveType(expression.resolvedType).endsWith("*")
        );
      default:
        return false;
    }
  }

  protected generateTupleLiteral(expr: AST.TupleLiteralExpr): string {
    if (expr.resolvedType?.kind === "TupleType") {
      return this.generateTupleLiteralForTarget(expr, expr.resolvedType);
    }
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
      const elemVal = this.generateAggregateElementForTarget(
        elemExpr,
        targetElemTypeNode,
      );

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
    const enumPtr = this.allocateStackSlot(enumType);

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
        `  ${bytePtr} = bitcast ${this.getEnumDataType(enumName)}* ${dataPtr} to i8*`,
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
