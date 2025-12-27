import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { TokenType } from "../../frontend/TokenType";
import { PRIMITIVE_STRUCT_MAP } from "../../middleend/BuiltinTypes";
import { TypeGenerator } from "./TypeGenerator";
import { RTTI } from "../../middleend/RTTI";

export abstract class ExpressionGenerator extends TypeGenerator {
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
      default:
        console.warn(`Unhandled expression kind: ${expr.kind}`);
        return "0"; // Placeholder
    }
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
      console.error("Lambda expression has no resolved type!");
      throw new CompilerError(
        "Lambda expression has no resolved type",
        "",
        expr.location,
      );
    }
    const lambdaName = `lambda_L${expr.location.startLine}_C${expr.location.startColumn}`;
    this.pendingLambdas.push({ name: lambdaName, expr });

    const funcType = expr.resolvedType as AST.FunctionTypeNode;
    const mangledName = this.getMangledName(lambdaName, funcType);
    const closureType = this.resolveType(funcType); // { func*, i8* }

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
          console.log(`Failed to resolve type for ${decl.name}`);
          console.log(`Keys: ${Object.keys(decl)}`);
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
          console.log(`Missing resolvedType for captured variable ${varName}`);
          console.log(`Keys: ${Object.keys(decl)}`);
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
      // Handle zero initialization for non-primitive types
      if (expr.value == 0 && expr.resolvedType) {
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
          const str = expr.value.toString();
          return str.includes(".") ? str : `${str}.0`;
        }
      }

      // Use raw value for integers to preserve precision
      if (expr.raw) {
        try {
          const cleaned = expr.raw.replace(/_/g, "");
          // Only use BigInt if it doesn't look like a float
          if (!cleaned.includes(".")) {
            return BigInt(cleaned).toString();
          }
        } catch (e) {
          // Fallback to value.toString()
        }
      }

      return expr.value.toString();
    } else if (expr.type === "char") {
      return expr.value.toString().charCodeAt(0).toString();
    } else if (expr.type === "bool") {
      return expr.value ? "1" : "0";
    } else if (expr.type === "nullptr" || expr.type === "null") {
      return "null";
    } else if (expr.type === "string") {
      const content = expr.value;
      if (!this.stringLiterals.has(content)) {
        const varName = `@.str.${this.stringLiterals.size}`;
        this.stringLiterals.set(content, varName);
      }
      const varName = this.stringLiterals.get(content)!;
      const len = content.length + 1;
      // Get pointer to first element
      return `getelementptr inbounds ([${len} x i8], [${len} x i8]* ${varName}, i64 0, i64 0)`; // This returns i8*
    }
    return "0";
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
      let isExtern = false;

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
        isExtern = true;
      }

      if (isExtern) {
        return `@${funcName}`;
      }

      // Wrap in closure struct
      const closureType = this.resolveType(expr.resolvedType);
      const funcType = expr.resolvedType as AST.FunctionTypeNode;
      const retTypeStr = this.resolveType(funcType.returnType);
      const paramTypesStr = funcType.paramTypes
        .map((t) => this.resolveType(t))
        .join(", ");
      const rawFuncPtrType = `${retTypeStr} (i8*${paramTypesStr ? ", " + paramTypesStr : ""})*`;

      const undef = this.newRegister();
      this.emit(
        `  ${undef} = insertvalue ${closureType} undef, ${rawFuncPtrType} @${funcName}, 0`,
      );

      const closure = this.newRegister();
      this.emit(
        `  ${closure} = insertvalue ${closureType} ${undef}, i8* null, 1`,
      );

      return closure;
    }

    const type = this.resolveType(expr.resolvedType!);
    const addr = this.generateAddress(expr);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  protected generateAddress(
    expr: AST.Expression,
    skipNullObjectCheck: boolean = false,
  ): string {
    if (expr.kind === "Identifier") {
      const name = (expr as AST.IdentifierExpr).name;
      if (this.locals.has(name)) {
        // Look up the actual pointer name from our map
        const ptr = this.localPointers.get(name);
        if (ptr) {
          return ptr;
        }
        // Fallback to old format if not in map (shouldn't happen, but be defensive)
        return `%${name}_ptr`;
      } else if (this.globals.has(name)) {
        return `@${name}`;
      } else {
        // Check if it is an imported global variable
        const id = expr as AST.IdentifierExpr;
        if (
          id.resolvedDeclaration &&
          id.resolvedDeclaration.kind === "VariableDecl"
        ) {
          const decl = id.resolvedDeclaration as AST.VariableDecl;
          if (decl.isGlobal) {
            // It is a global variable, but not in this.globals (so not defined in this module)
            // We need to declare it as external
            // Use declaredFunctions to track external globals too to avoid duplicates
            // or just check if we already emitted it.
            // Actually, if we add it to this.globals, we won't come here again.

            const type = this.resolveType(
              decl.typeAnnotation || decl.resolvedType!,
            );
            // LLVM IR: @name = external global type
            // For constants: @name = external constant type
            const keyword = decl.isConst ? "constant" : "global";
            this.emitDeclaration(`@${name} = external ${keyword} ${type}`);
            this.globals.add(name);
            return `@${name}`;
          }
        }

        const ptr = this.localPointers.get(name);
        if (ptr) {
          return ptr;
        }

        // If it's a function type, it's likely a global function
        if (expr.resolvedType && expr.resolvedType.kind === "FunctionType") {
          return `@${name}`;
        }

        return `%${name}_ptr`;
      }
    } else if (expr.kind === "Member") {
      const memberExpr = expr as AST.MemberExpr;

      // Check for module access
      const objType = memberExpr.object.resolvedType;
      if (objType && (objType as any).kind === "ModuleType") {
        return `@${memberExpr.property}`;
      }

      const objectAddr = this.generateAddress(
        memberExpr.object,
        skipNullObjectCheck,
      );

      // We need the type of the object to know which struct layout to use
      // The object's resolvedType should be a BasicType with the struct name
      if (!objType || objType.kind !== "BasicType") {
        throw new CompilerError(
          "Member access on non-struct type",
          "Member access (.) is allowed only on struct types",
          expr.location,
        );
      }

      // Use resolved name for monomorphization lookup
      // resolveType returns e.g. %struct.Box_i32 or %struct.Point
      const llvmType = this.resolveType(objType);
      let structName = objType.name;

      if (llvmType.startsWith("%struct.")) {
        structName = llvmType.substring(8);
        // strip pointers
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
          "",
          expr.location,
        );
      }

      const fieldIndex = layout.get(memberExpr.property);
      if (fieldIndex === undefined) {
        throw new CompilerError(
          `Unknown field '${memberExpr.property}' in struct '${structName}'`,
          "Available fields: " + Array.from(layout.keys()).join(", "),
          expr.location,
        );
      }

      let baseAddr = objectAddr;
      // If the object is a call returning a pointer, use it directly as the base.
      if (memberExpr.object.kind === "Call") {
        const objLlvmType = this.resolveType(objType);
        if (objLlvmType.endsWith("*")) {
          baseAddr = objectAddr;
        }
      } else if (objType.pointerDepth > 0) {
        const ptrReg = this.newRegister();
        const ptrType = llvmType;
        this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);
        baseAddr = ptrReg;
      }

      // Runtime null check for pointer dereference
      if (objType.pointerDepth > 0 && !skipNullObjectCheck) {
        const isNull = this.newRegister();
        this.emit(`  ${isNull} = icmp eq ${llvmType} ${baseAddr}, null`);

        const throwLabel = this.newLabel("nullptr.throw");
        const passLabel = this.newLabel("nullptr.pass");
        this.emit(
          `  br i1 ${isNull}, label %${throwLabel}, label %${passLabel}`,
        );

        this.emit(`${throwLabel}:`);

        const funcName = this.currentFunctionName || "unknown";
        const exprStr = "pointer_dereference";
        const msg = "Attempted to access member of nullptr";

        // Create string literals
        if (!this.stringLiterals.has(msg)) {
          this.stringLiterals.set(
            msg,
            `@.null_err_msg.${this.stringLiterals.size}`,
          );
        }
        if (!this.stringLiterals.has(funcName)) {
          this.stringLiterals.set(
            funcName,
            `@.null_err_func.${this.stringLiterals.size}`,
          );
        }
        if (!this.stringLiterals.has(exprStr)) {
          this.stringLiterals.set(
            exprStr,
            `@.null_err_expr.${this.stringLiterals.size}`,
          );
        }

        const msgLen = msg.length + 1;
        const funcLen = funcName.length + 1;
        const exprLen = exprStr.length + 1;

        const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;
        const funcPtr = `getelementptr inbounds ([${funcLen} x i8], [${funcLen} x i8]* ${this.stringLiterals.get(funcName)}, i32 0, i32 0)`;
        const exprPtr = `getelementptr inbounds ([${exprLen} x i8], [${exprLen} x i8]* ${this.stringLiterals.get(exprStr)}, i32 0, i32 0)`;

        const nullLayout = this.structLayouts.get("NullAccessError");
        let currentStruct = "undef";

        if (nullLayout) {
          if (nullLayout.has("__vtable__")) {
            const vtableIndex = nullLayout.get("__vtable__");
            const vtablePtr = this.newRegister();
            this.emit(
              `  ${vtablePtr} = bitcast [3 x i8*]* @NullAccessError_vtable to i8*`,
            );
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("message")) {
            const idx = nullLayout.get("message");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("code")) {
            const idx = nullLayout.get("code");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i32 7, ${idx}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("function")) {
            const idx = nullLayout.get("function");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i8* ${funcPtr}, ${idx}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("expression")) {
            const idx = nullLayout.get("expression");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i8* ${exprPtr}, ${idx}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("line")) {
            const idx = nullLayout.get("line");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i32 ${memberExpr.location.startLine}, ${idx}`,
            );
            currentStruct = nextStruct;
          }
          if (nullLayout.has("column")) {
            const idx = nullLayout.get("column");
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.NullAccessError ${currentStruct}, i32 ${memberExpr.location.startColumn}, ${idx}`,
            );
            currentStruct = nextStruct;
          }
        } else {
          // Fallback
          let s = this.newRegister();
          this.emit(
            `  ${s} = insertvalue %struct.NullAccessError undef, i8* ${msgPtr}, 0`,
          );
          let s2 = this.newRegister();
          this.emit(
            `  ${s2} = insertvalue %struct.NullAccessError ${s}, i8* ${funcPtr}, 1`,
          );
          let s3 = this.newRegister();
          this.emit(
            `  ${s3} = insertvalue %struct.NullAccessError ${s2}, i8* ${exprPtr}, 2`,
          );
          let s4 = this.newRegister();
          this.emit(
            `  ${s4} = insertvalue %struct.NullAccessError ${s3}, i32 ${memberExpr.location.startLine}, 3`,
          );
          let s5 = this.newRegister();
          this.emit(
            `  ${s5} = insertvalue %struct.NullAccessError ${s4}, i32 ${memberExpr.location.startColumn}, 4`,
          );
          currentStruct = s5;
        }

        this.emitThrow(currentStruct, "%struct.NullAccessError");
        this.emit(`${passLabel}:`);
      }

      // Runtime null-object guard for pointer dereferences to tracked locals
      // Only check when we can trace the pointer back to &localVar
      // (Legacy null check removed)

      // Runtime null-object guard for struct locals with tracked flags
      // (Legacy null check removed)

      // General null-object guard for any struct value (not just identifiers)
      // (Legacy null check removed)

      const structBase = `%struct.${structName}`;

      const addr = this.newRegister();
      this.emit(
        `  ${addr} = getelementptr inbounds ${structBase}, ${structBase}* ${baseAddr}, i32 0, i32 ${fieldIndex}`,
      );
      return addr;
    } else if (expr.kind === "Index") {
      const indexExpr = expr as AST.IndexExpr;
      const objectAddr = this.generateAddress(
        indexExpr.object,
        skipNullObjectCheck,
      );
      const indexValRaw = this.generateExpression(indexExpr.index);

      // Cast index to i64 if needed
      const indexType = this.resolveType(indexExpr.index.resolvedType!);
      let indexVal = indexValRaw;
      if (indexType !== "i64") {
        const castReg = this.newRegister();
        if (this.isSigned(indexExpr.index.resolvedType!)) {
          this.emit(`  ${castReg} = sext ${indexType} ${indexValRaw} to i64`);
        } else {
          this.emit(`  ${castReg} = zext ${indexType} ${indexValRaw} to i64`);
        }
        indexVal = castReg;
      }

      const objType = indexExpr.object.resolvedType;
      if (!objType || objType.kind !== "BasicType") {
        throw new CompilerError("Indexing non-basic type", "", expr.location);
      }

      let addr: string;
      if (objType.arrayDimensions.length > 0) {
        const llvmType = this.resolveType(objType);

        // Bounds check for fixed-size arrays
        if (llvmType.startsWith("[")) {
          const match = llvmType.match(/^\[(\d+) x/);
          if (match) {
            const size = parseInt(match[1]!);

            // Check if index < size (unsigned comparison handles negative indices as large positive)
            const inBounds = this.newRegister();
            this.emit(`  ${inBounds} = icmp ult i64 ${indexVal}, ${size}`);

            const throwLabel = this.newLabel("bounds.throw");
            const passLabel = this.newLabel("bounds.pass");
            this.emit(
              `  br i1 ${inBounds}, label %${passLabel}, label %${throwLabel}`,
            );

            this.emit(`${throwLabel}:`);
            // Construct IndexOutOfBoundsError
            const msg = "Index out of bounds";
            if (!this.stringLiterals.has(msg)) {
              this.stringLiterals.set(
                msg,
                `@.index_oob_msg.${this.stringLiterals.size}`,
              );
            }
            const msgLen = msg.length + 1;
            const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;

            const layout = this.structLayouts.get("IndexOutOfBoundsError");
            let currentStruct = "undef";

            if (layout) {
              if (layout.has("__vtable__")) {
                const vtableIndex = layout.get("__vtable__");
                const vtablePtr = this.newRegister();
                this.emit(
                  `  ${vtablePtr} = bitcast [3 x i8*]* @IndexOutOfBoundsError_vtable to i8*`,
                );
                const nextStruct = this.newRegister();
                this.emit(
                  `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
                );
                currentStruct = nextStruct;
              }

              if (layout.has("message")) {
                const idx = layout.get("message");
                const nextStruct = this.newRegister();
                this.emit(
                  `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
                );
                currentStruct = nextStruct;
              }
              if (layout.has("code")) {
                const idx = layout.get("code");
                const nextStruct = this.newRegister();
                this.emit(
                  `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 5, ${idx}`,
                );
                currentStruct = nextStruct;
              }

              if (layout.has("index")) {
                const idx = layout.get("index");
                const indexValI32 = this.newRegister();
                this.emit(`  ${indexValI32} = trunc i64 ${indexVal} to i32`);
                const nextStruct = this.newRegister();
                this.emit(
                  `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 ${indexValI32}, ${idx}`,
                );
                currentStruct = nextStruct;
              }

              if (layout.has("size")) {
                const idx = layout.get("size");
                const nextStruct = this.newRegister();
                this.emit(
                  `  ${nextStruct} = insertvalue %struct.IndexOutOfBoundsError ${currentStruct}, i32 ${size}, ${idx}`,
                );
                currentStruct = nextStruct;
              }
            } else {
              // Fallback
              const indexValI32 = this.newRegister();
              this.emit(`  ${indexValI32} = trunc i64 ${indexVal} to i32`);
              const s1 = this.newRegister();
              this.emit(
                `  ${s1} = insertvalue %struct.IndexOutOfBoundsError undef, i32 ${indexValI32}, 0`,
              );
              const s2 = this.newRegister();
              this.emit(
                `  ${s2} = insertvalue %struct.IndexOutOfBoundsError ${s1}, i32 ${size}, 1`,
              );
              currentStruct = s2;
            }

            this.emitThrow(currentStruct, "%struct.IndexOutOfBoundsError");

            this.emit(`${passLabel}:`);
          }
        }

        addr = this.newRegister();
        if (llvmType.startsWith("[")) {
          this.emit(
            `  ${addr} = getelementptr inbounds ${llvmType}, ${llvmType}* ${objectAddr}, i64 0, i64 ${indexVal}`,
          );
        } else {
          // Pointer
          this.emit(
            `  ${addr} = getelementptr inbounds ${llvmType}, ${llvmType}* ${objectAddr}, i64 ${indexVal}`,
          );
        }
      } else if (objType.pointerDepth > 0) {
        const ptrReg = this.newRegister();
        const ptrType = this.resolveType(objType); // T*
        this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);

        const elemType = this.resolveType(indexExpr.resolvedType!);
        addr = this.newRegister();
        this.emit(
          `  ${addr} = getelementptr inbounds ${elemType}, ${ptrType} ${ptrReg}, i64 ${indexVal}`,
        );
      } else {
        throw new CompilerError(
          "Indexing non-array/non-pointer",
          "Only arrays and pointers can be indexed.",
          expr.location,
        );
      }

      // Runtime null-object guard for struct locals being indexed (if any)
      if (
        objType.pointerDepth === 0 &&
        indexExpr.object.kind === "Identifier" &&
        !skipNullObjectCheck
      ) {
        const idName = (indexExpr.object as AST.IdentifierExpr).name;
        const flagPtr = this.localNullFlags.get(idName);
        if (flagPtr) {
          const flagVal = this.newRegister();
          this.emit(`  ${flagVal} = load i1, i1* ${flagPtr}`);

          // Negate the flag: if it's 0 (null), we want to trap
          const negFlag = this.newRegister();
          this.emit(`  ${negFlag} = xor i1 ${flagVal}, 1`);

          const funcName = this.currentFunctionName || "unknown";
          const exprStr = `${idName}[...]`;
          const msg = "Attempted to access index of null object";

          // Create string literals for the error struct fields
          if (!this.stringLiterals.has(msg)) {
            this.stringLiterals.set(
              msg,
              `@.null_err_msg.${this.stringLiterals.size}`,
            );
          }
          if (!this.stringLiterals.has(funcName)) {
            this.stringLiterals.set(
              funcName,
              `@.null_err_func.${this.stringLiterals.size}`,
            );
          }
          if (!this.stringLiterals.has(exprStr)) {
            this.stringLiterals.set(
              exprStr,
              `@.null_err_expr.${this.stringLiterals.size}`,
            );
          }

          const throwLabel = this.newLabel("nullobj.throw");
          const passLabel = this.newLabel("nullobj.pass");
          this.emit(
            `  br i1 ${negFlag}, label %${throwLabel}, label %${passLabel}`,
          );

          // Throw NullAccessError
          this.emit(`${throwLabel}:`);
          const errorStruct = this.newRegister();
          const errorWithMsg = this.newRegister();
          const errorWithFunc = this.newRegister();
          const errorWithExpr = this.newRegister();
          const msgLen = msg.length + 1;
          const funcLen = funcName.length + 1;
          const exprLen = exprStr.length + 1;
          this.emit(
            `  ${errorStruct} = insertvalue %struct.NullAccessError undef, i8* getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(
              msg,
            )}, i64 0, i64 0), 0`,
          );
          this.emit(
            `  ${errorWithMsg} = insertvalue %struct.NullAccessError ${errorStruct}, i8* getelementptr inbounds ([${funcLen} x i8], [${funcLen} x i8]* ${this.stringLiterals.get(
              funcName,
            )}, i64 0, i64 0), 1`,
          );
          this.emit(
            `  ${errorWithExpr} = insertvalue %struct.NullAccessError ${errorWithMsg}, i8* getelementptr inbounds ([${exprLen} x i8], [${exprLen} x i8]* ${this.stringLiterals.get(
              exprStr,
            )}, i64 0, i64 0), 2`,
          );
          const errorWithLine = this.newRegister();
          this.emit(
            `  ${errorWithLine} = insertvalue %struct.NullAccessError ${errorWithExpr}, i32 ${indexExpr.location.startLine}, 3`,
          );
          const errorWithCol = this.newRegister();
          this.emit(
            `  ${errorWithCol} = insertvalue %struct.NullAccessError ${errorWithLine}, i32 ${indexExpr.location.startColumn}, 4`,
          );
          this.emitThrow(errorWithCol, "%struct.NullAccessError");

          // Continue normal path
          this.emit(`${passLabel}:`);
        }
      }

      return addr;
    } else if (expr.kind === "Call") {
      if (expr.resolvedType) {
        const llvmType = this.resolveType(expr.resolvedType);
        if (llvmType.endsWith("*")) {
          // Calls returning pointers can be used directly as addresses.
          return this.generateExpression(expr);
        }
      }
      throw new CompilerError(
        "Expression is not an lvalue: Call",
        "Function calls return rvalues and cannot be assigned to or have their address taken.",
        expr.location,
      );
    } else if (expr.kind === "ArrayLiteral") {
      const type = this.resolveType(expr.resolvedType!);
      const ptr = this.allocateStack(`array_lit_${this.labelCount++}`, type);
      const val = this.generateArrayLiteral(expr as AST.ArrayLiteralExpr);
      this.emit(`  store ${type} ${val}, ${type}* ${ptr}`);
      return ptr;
    } else if (expr.kind === "Unary") {
      const unaryExpr = expr as AST.UnaryExpr;
      if (unaryExpr.operator.type === TokenType.Star) {
        // Dereference: *x
        // The address is the value of x
        return this.generateExpression(unaryExpr.operand);
      }
      throw new CompilerError(
        "Address of non-lvalue unary expression",
        "This unary expression does not yield an lvalue.",
        expr.location,
      );
    }

    throw new CompilerError(
      `Expression is not an lvalue: ${expr.kind}`,
      "This expression cannot be assigned to or have its address taken.",
      expr.location,
    );
  }

  protected expressionToString(expr: AST.Expression): string {
    if (expr.kind === "Identifier") {
      return (expr as AST.IdentifierExpr).name;
    } else if (expr.kind === "Index") {
      const indexExpr = expr as AST.IndexExpr;
      return `${this.expressionToString(indexExpr.object)}[${this.expressionToString(
        indexExpr.index,
      )}]`;
    } else if (expr.kind === "Member") {
      const memberExpr = expr as AST.MemberExpr;
      return `${this.expressionToString(memberExpr.object)}.${memberExpr.property}`;
    } else if (expr.kind === "Literal") {
      const lit = expr as AST.LiteralExpr;
      return String(lit.value);
    } else {
      return "<expr>";
    }
  }

  protected emitThrow(value: string, type: string) {
    // Store the exception type ID
    const typeId = this.getTypeId(type);
    this.emit(`  store i32 ${typeId}, i32* @exception_type`);

    // Cast and store the exception value as i64
    const valueSize = this.newRegister();
    this.emit(`  ${valueSize} = ptrtoint ${type}* null to i64`);
    const allocSize = this.newRegister();
    this.emit(`  ${allocSize} = add i64 ${valueSize}, 0`);

    // Allocate memory for the exception value
    const exceptionMem = this.newRegister();
    this.emit(
      `  ${exceptionMem} = call i8* @malloc(i64 ptrtoint (${type}* getelementptr (${type}, ${type}* null, i32 1) to i64))`,
    );
    const exceptionPtr = this.newRegister();
    this.emit(`  ${exceptionPtr} = bitcast i8* ${exceptionMem} to ${type}*`);
    this.emit(`  store ${type} ${value}, ${type}* ${exceptionPtr}`);

    const castVal = this.newRegister();
    this.emit(`  ${castVal} = ptrtoint ${type}* ${exceptionPtr} to i64`);
    this.emit(`  store i64 ${castVal}, i64* @exception_value`);

    // Longjmp to the exception handler
    const framePtr = this.newRegister();
    this.emit(
      `  ${framePtr} = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top`,
    );

    const isNull = this.newRegister();
    this.emit(
      `  ${isNull} = icmp eq %struct.ExceptionFrame* ${framePtr}, null`,
    );

    const abortLabel = this.newLabel("throw.abort");
    const jumpLabel = this.newLabel("throw.jump");

    this.emit(`  br i1 ${isNull}, label %${abortLabel}, label %${jumpLabel}`);

    this.emit(`${abortLabel}:`);
    this.emit(`  call void @exit(i32 1)`);
    this.emit(`  unreachable`);

    this.emit(`${jumpLabel}:`);
    const bufFieldPtr = this.newRegister();
    this.emit(
      `  ${bufFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 0`,
    );

    const bufVoidPtr = this.newRegister();
    this.emit(`  ${bufVoidPtr} = bitcast [32 x i64]* ${bufFieldPtr} to i8*`);

    this.emit(`  call void @longjmp(i8* ${bufVoidPtr}, i32 1)`);
    this.emit(`  unreachable`);
  }

  protected allocateStack(name: string, type: string): string {
    // Use stack alloc count to ensure uniqueness, even if same variable name is used in different scopes
    const ptr = `%${name}_ptr.${this.stackAllocCount++}`;
    this.emit(`  ${ptr} = alloca ${type}`);
    this.locals.add(name);
    this.localPointers.set(name, ptr);
    return ptr;
  }

  protected isSigned(type: AST.TypeNode): boolean {
    if (type.kind === "BasicType") {
      return [
        "int",
        "i8",
        "i16",
        "i32",
        "i64",
        "char",
        "short",
        "long",
      ].includes((type as AST.BasicTypeNode).name);
    }
    return false;
  }

  protected isIntegerType(type: string): boolean {
    return ["i1", "i8", "i16", "i32", "i64"].includes(type);
  }

  protected getBitWidth(type: string): number {
    if (type === "i1") return 1;
    if (type === "i8") return 8;
    if (type === "i16") return 16;
    if (type === "i32") return 32;
    if (type === "i64") return 64;
    return 0;
  }

  protected generateBinary(expr: AST.BinaryExpr): string {
    // Check for operator overload
    if (expr.operatorOverload) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const leftRaw = this.generateExpression(expr.left);
      const rightRaw = this.generateExpression(expr.right);

      const targetType = overload.targetType as AST.BasicTypeNode;

      // Handle generic struct method calls
      let mangledName: string;
      let resolvedMethodType: AST.FunctionTypeNode;

      if (targetType.genericArgs && targetType.genericArgs.length > 0) {
        // Generic struct - need monomorphized method name
        const structDecl = this.structMap.get(targetType.name);
        const enumDecl = this.enumDeclMap.get(targetType.name);

        if (
          (structDecl && structDecl.genericParams.length > 0) ||
          (enumDecl && enumDecl.genericParams.length > 0)
        ) {
          const genericParams = structDecl
            ? structDecl.genericParams
            : enumDecl!.genericParams;

          // Build context map for generic substitution
          const contextMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < genericParams.length; i++) {
            contextMap.set(genericParams[i]!.name, targetType.genericArgs[i]!);
          }

          // Build monomorphized struct name using mangleType (avoids recursion)
          const argNames = targetType.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          const structName = `${targetType.name}_${argNames}`;

          // Build method name
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;

          // Get mangled name with substituted types
          const substitutedMethodType = this.substituteType(
            methodType,
            contextMap,
          ) as AST.FunctionTypeNode;

          mangledName = this.getMangledName(
            fullMethodName,
            substitutedMethodType,
          );
          resolvedMethodType = substitutedMethodType;
        } else {
          // Fallback: non-generic or already concrete
          const structName = targetType.name;
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;
          mangledName = this.getMangledName(fullMethodName, methodType);
          resolvedMethodType = methodType;
        }
      } else {
        // Non-generic struct
        const structName = targetType.name;
        const methodType = method.resolvedType as AST.FunctionTypeNode;
        const fullMethodName = `${structName}_${method.name}`;
        mangledName = this.getMangledName(fullMethodName, methodType);
        resolvedMethodType = methodType;
      }

      // Prepare arguments: this (left) + right
      const leftType = this.resolveType(expr.left.resolvedType!);
      const rightType = this.resolveType(expr.right.resolvedType!);

      let thisVal = leftRaw;
      let thisType = leftType;
      let otherVal = rightRaw;
      let otherType = rightType;
      let thisExpr = expr.left;
      let otherExpr = expr.right;

      if (overload.swapOperands) {
        thisVal = rightRaw;
        thisType = rightType;
        otherVal = leftRaw;
        otherType = leftType;
        thisExpr = expr.right;
        otherExpr = expr.left;
      }

      // For operator overloads on pointers (like &arr << value), pass the pointer value directly
      // The left expression type should match the method's first parameter type
      let thisArg: string;
      if (thisType.endsWith("*")) {
        // Left is a pointer - pass it directly as the 'this' parameter
        thisArg = `${thisType} ${thisVal}`;
      } else {
        // Left is a value - need to get its address
        let thisPtr: string;
        try {
          thisPtr = this.generateAddress(thisExpr);
        } catch {
          // If we can't get address, spill to stack
          const spillAddr = this.allocateStack(
            `op_spill_${this.labelCount++}`,
            thisType,
          );
          this.emit(
            `  store ${thisType} ${thisVal}, ${thisType}* ${spillAddr}`,
          );
          thisPtr = spillAddr;
        }
        thisArg = `${thisType}* ${thisPtr}`;
      }

      // Check if the second argument needs to be passed by pointer
      // This happens if the operator method expects a pointer (e.g. __eq__(this: *T, other: *T))
      // but the operand is a value
      if (resolvedMethodType.paramTypes.length >= 2) {
        const expectedTypeNode = resolvedMethodType.paramTypes[1]!;
        const expectedType = this.resolveType(expectedTypeNode);

        if (expectedType.endsWith("*") && !otherType.endsWith("*")) {
          // Expected pointer, got value. Pass address.
          let otherPtr: string;
          try {
            otherPtr = this.generateAddress(otherExpr);
          } catch {
            const spillAddr = this.allocateStack(
              `op_arg_spill_${this.labelCount++}`,
              otherType,
            );
            this.emit(
              `  store ${otherType} ${otherVal}, ${otherType}* ${spillAddr}`,
            );
            otherPtr = spillAddr;
          }
          otherVal = otherPtr;
          otherType = `${otherType}*`;
        }
      }

      // Call the operator method
      // Use the substituted method return type
      const returnType = this.resolveType(resolvedMethodType.returnType);
      // Update AST to ensure consumers see the concrete type
      expr.resolvedType = resolvedMethodType.returnType;

      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(i8* null, ${thisArg}, ${otherType} ${otherVal})`,
      );

      if (overload.negateResult) {
        const negated = this.newRegister();
        this.emit(`  ${negated} = xor i1 ${resultReg}, true`);
        return negated;
      }

      return resultReg;
    }

    const leftRaw = this.generateExpression(expr.left);
    const rightRaw = this.generateExpression(expr.right);
    const leftType = this.resolveType(expr.left.resolvedType!);
    const rightType = this.resolveType(expr.right.resolvedType!);

    // Special handling: struct/object value compared to null literal
    const isEqOp =
      expr.operator.type === TokenType.EqualEqual ||
      expr.operator.type === TokenType.BangEqual;
    const isNullLiteral = (e: AST.Expression) =>
      e.kind === "Literal" && (e as AST.LiteralExpr).type === "null";
    const isStructValue = (tNode: AST.TypeNode | undefined) => {
      if (!tNode) return false;
      if (tNode.kind !== "BasicType") return false;
      const b = tNode as AST.BasicTypeNode;
      if (b.pointerDepth > 0) return false;
      return this.structMap.has(b.name);
    };

    if (isEqOp) {
      // left struct vs null
      if (isStructValue(expr.left.resolvedType) && isNullLiteral(expr.right)) {
        const llvmT = leftType;
        // Get address of left
        let addr: string | undefined;
        try {
          addr = this.generateAddress(expr.left);
        } catch {
          const spill = this.allocateStack(
            `cmp_spill_${this.labelCount++}`,
            llvmT,
          );
          this.emit(`  store ${llvmT} ${leftRaw}, ${llvmT}* ${spill}`);
          addr = spill;
        }

        // Structs are value types and cannot be null
        // So struct == null is always false
        const res = "0";

        if (expr.operator.type === TokenType.EqualEqual) return res;
        const inv = this.newRegister();
        this.emit(`  ${inv} = xor i1 ${res}, true`);
        return inv;
      }
      // right struct vs null
      if (isStructValue(expr.right.resolvedType) && isNullLiteral(expr.left)) {
        // Structs are value types and cannot be null
        // So null == struct is always false
        const res = "0";

        if (expr.operator.type === TokenType.EqualEqual) return res;
        const inv = this.newRegister();
        this.emit(`  ${inv} = xor i1 ${res}, true`);
        return inv;
      }

      // Enum comparison (== or !=)
      const isEnumType = (llvmType: string) => llvmType.startsWith("%enum.");
      if (isEnumType(leftType) && isEnumType(rightType)) {
        // Both are enum types - compare tags and data
        const enumTypeName = leftType; // Both should be the same type
        // Extract just the enum name (without "%enum." prefix)
        const enumName = enumTypeName.substring(6);

        // Load both enum values (they might already be values, not pointers)
        let leftVal = leftRaw;
        let rightVal = rightRaw;

        // Extract tag fields (index 0)
        const leftTag = this.newRegister();
        this.emit(`  ${leftTag} = extractvalue ${enumTypeName} ${leftVal}, 0`);
        const rightTag = this.newRegister();
        this.emit(
          `  ${rightTag} = extractvalue ${enumTypeName} ${rightVal}, 0`,
        );

        // Compare tags
        const tagsEqual = this.newRegister();
        this.emit(`  ${tagsEqual} = icmp eq i32 ${leftTag}, ${rightTag}`);

        // Check if enum has data field by looking up the stored data size
        const dataSize = this.enumDataSizes.get(enumName) || 0;

        if (dataSize > 0) {
          // Need to compare data fields as well when tags are equal
          // First, spill both enums to stack to get their addresses
          const leftPtr = this.allocateStack(
            `enum_cmp_left_${this.labelCount}`,
            enumTypeName,
          );
          this.emit(
            `  store ${enumTypeName} ${leftVal}, ${enumTypeName}* ${leftPtr}`,
          );

          const rightPtr = this.allocateStack(
            `enum_cmp_right_${this.labelCount++}`,
            enumTypeName,
          );
          this.emit(
            `  store ${enumTypeName} ${rightVal}, ${enumTypeName}* ${rightPtr}`,
          );

          // Get pointer to data field (index 1) for both enums
          const leftDataPtr = this.newRegister();
          this.emit(
            `  ${leftDataPtr} = getelementptr inbounds ${enumTypeName}, ${enumTypeName}* ${leftPtr}, i32 0, i32 1`,
          );
          const leftDataI8Ptr = this.newRegister();
          this.emit(
            `  ${leftDataI8Ptr} = bitcast [${dataSize} x i8]* ${leftDataPtr} to i8*`,
          );

          const rightDataPtr = this.newRegister();
          this.emit(
            `  ${rightDataPtr} = getelementptr inbounds ${enumTypeName}, ${enumTypeName}* ${rightPtr}, i32 0, i32 1`,
          );
          const rightDataI8Ptr = this.newRegister();
          this.emit(
            `  ${rightDataI8Ptr} = bitcast [${dataSize} x i8]* ${rightDataPtr} to i8*`,
          );

          // Use memcmp to compare data bytes
          const memcmpResult = this.newRegister();
          this.emit(
            `  ${memcmpResult} = call i32 @memcmp(i8* ${leftDataI8Ptr}, i8* ${rightDataI8Ptr}, i64 ${dataSize})`,
          );

          const dataEqual = this.newRegister();
          this.emit(`  ${dataEqual} = icmp eq i32 ${memcmpResult}, 0`);

          // Both tags and data must be equal
          const result = this.newRegister();
          this.emit(`  ${result} = and i1 ${tagsEqual}, ${dataEqual}`);

          if (expr.operator.type === TokenType.BangEqual) {
            const notResult = this.newRegister();
            this.emit(`  ${notResult} = xor i1 ${result}, true`);
            return notResult;
          }
          return result;
        } else {
          // No data field, just compare tags
          if (expr.operator.type === TokenType.BangEqual) {
            const notResult = this.newRegister();
            this.emit(`  ${notResult} = xor i1 ${tagsEqual}, true`);
            return notResult;
          }
          return tagsEqual;
        }
      }

      // Struct comparison (== or !=)
      if (
        leftType.startsWith("%struct.") &&
        !leftType.endsWith("*") &&
        rightType.startsWith("%struct.") &&
        !rightType.endsWith("*")
      ) {
        const structName = leftType.substring(8);
        return this.generateStructComparison(
          structName,
          leftRaw,
          rightRaw,
          expr.operator.type === TokenType.EqualEqual,
        );
      }
    }

    // Pointer arithmetic
    if (leftType.endsWith("*") && this.isIntegerType(rightType)) {
      // ptr + int
      let right = rightRaw;
      if (rightType !== "i64") {
        const castReg = this.newRegister();
        if (this.isSigned(expr.right.resolvedType!)) {
          this.emit(`  ${castReg} = sext ${rightType} ${rightRaw} to i64`);
        } else {
          this.emit(`  ${castReg} = zext ${rightType} ${rightRaw} to i64`);
        }
        right = castReg;
      }

      if (expr.operator.type === TokenType.Plus) {
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = getelementptr inbounds ${leftType.slice(
            0,
            -1,
          )}, ${leftType} ${leftRaw}, i64 ${right}`,
        );
        return reg;
      } else if (expr.operator.type === TokenType.Minus) {
        // ptr - int -> ptr + (-int)
        const negRight = this.newRegister();
        this.emit(`  ${negRight} = sub i64 0, ${right}`);
        const reg = this.newRegister();
        this.emit(
          `  ${reg} = getelementptr inbounds ${leftType.slice(
            0,
            -1,
          )}, ${leftType} ${leftRaw}, i64 ${negRight}`,
        );
        return reg;
      }
    }

    // int + ptr (commutative)
    if (
      this.isIntegerType(leftType) &&
      rightType.endsWith("*") &&
      expr.operator.type === TokenType.Plus
    ) {
      let left = leftRaw;
      if (leftType !== "i64") {
        const castReg = this.newRegister();
        if (this.isSigned(expr.left.resolvedType!)) {
          this.emit(`  ${castReg} = sext ${leftType} ${leftRaw} to i64`);
        } else {
          this.emit(`  ${castReg} = zext ${leftType} ${leftRaw} to i64`);
        }
        left = castReg;
      }

      const reg = this.newRegister();
      this.emit(
        `  ${reg} = getelementptr inbounds ${rightType.slice(
          0,
          -1,
        )}, ${rightType} ${rightRaw}, i64 ${left}`,
      );
      return reg;
    }

    const left = leftRaw;
    const right = rightRaw;

    // Check if we're dealing with floating point types
    const isFloat = leftType === "double" || leftType === "float";
    const isUnsigned = !isFloat && !this.isSigned(expr.left.resolvedType!);

    let op = "";
    switch (expr.operator.type) {
      case TokenType.Plus:
        op = isFloat ? "fadd" : "add";
        break;
      case TokenType.Minus:
        op = isFloat ? "fsub" : "sub";
        break;
      case TokenType.Star:
        op = isFloat ? "fmul" : "mul";
        break;
      case TokenType.Slash:
        if (isFloat) {
          op = "fdiv";
        } else {
          op = isUnsigned ? "udiv" : "sdiv";
          // Check for zero
          const isZero = this.newRegister();
          this.emit(`  ${isZero} = icmp eq ${rightType} ${right}, 0`);
          const okLabel = this.newLabel("div_ok");
          const errLabel = this.newLabel("div_err");
          this.emit(`  br i1 ${isZero}, label %${errLabel}, label %${okLabel}`);

          this.emit(`${errLabel}:`);
          // Initialize DivisionByZeroError struct
          const msg = "Division by zero";
          if (!this.stringLiterals.has(msg)) {
            this.stringLiterals.set(
              msg,
              `@.div_zero_msg.${this.stringLiterals.size}`,
            );
          }
          const msgLen = msg.length + 1;
          const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;

          const divLayout = this.structLayouts.get("DivisionByZeroError");
          let currentStruct = "undef";

          if (divLayout) {
            if (divLayout.has("__vtable__")) {
              const vtableIndex = divLayout.get("__vtable__");
              const vtablePtr = this.newRegister();
              this.emit(
                `  ${vtablePtr} = bitcast [3 x i8*]* @DivisionByZeroError_vtable to i8*`,
              );
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
              );
              currentStruct = nextStruct;
            }

            if (divLayout.has("message")) {
              const idx = divLayout.get("message");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
              );
              currentStruct = nextStruct;
            }
            if (divLayout.has("code")) {
              const idx = divLayout.get("code");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i32 8, ${idx}`,
              );
              currentStruct = nextStruct;
            }

            if (divLayout.has("dummy")) {
              const dummyIndex = divLayout.get("dummy");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8 0, ${dummyIndex}`,
              );
              currentStruct = nextStruct;
            }
          } else {
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.DivisionByZeroError undef, i8 0, 0`,
            );
            currentStruct = nextStruct;
          }
          const errorStruct = currentStruct;
          this.emitThrow(errorStruct, "%struct.DivisionByZeroError");
          // this.emit("  unreachable");

          this.emit(`${okLabel}:`);
        }
        break;
      case TokenType.EqualEqual:
        op = isFloat ? "fcmp oeq" : "icmp eq";
        break;
      case TokenType.BangEqual:
        op = isFloat ? "fcmp one" : "icmp ne";
        break;
      case TokenType.Less:
        if (isFloat) op = "fcmp olt";
        else op = isUnsigned ? "icmp ult" : "icmp slt";
        break;
      case TokenType.LessEqual:
        if (isFloat) op = "fcmp ole";
        else op = isUnsigned ? "icmp ule" : "icmp sle";
        break;
      case TokenType.Greater:
        if (isFloat) op = "fcmp ogt";
        else op = isUnsigned ? "icmp ugt" : "icmp sgt";
        break;
      case TokenType.GreaterEqual:
        if (isFloat) op = "fcmp oge";
        else op = isUnsigned ? "icmp uge" : "icmp sge";
        break;
      case TokenType.Percent:
        if (isFloat) {
          op = "frem";
        } else {
          op = isUnsigned ? "urem" : "srem";
          // Check for zero
          const isZero = this.newRegister();
          this.emit(`  ${isZero} = icmp eq ${rightType} ${right}, 0`);
          const okLabel = this.newLabel("mod_ok");
          const errLabel = this.newLabel("mod_err");
          this.emit(`  br i1 ${isZero}, label %${errLabel}, label %${okLabel}`);

          this.emit(`${errLabel}:`);
          // Initialize DivisionByZeroError struct
          const msg = "Division by zero";
          if (!this.stringLiterals.has(msg)) {
            this.stringLiterals.set(
              msg,
              `@.div_zero_msg.${this.stringLiterals.size}`,
            );
          }
          const msgLen = msg.length + 1;
          const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i32 0, i32 0)`;

          const divLayout = this.structLayouts.get("DivisionByZeroError");
          let currentStruct = "undef";

          if (divLayout) {
            if (divLayout.has("__vtable__")) {
              const vtableIndex = divLayout.get("__vtable__");
              const vtablePtr = this.newRegister();
              this.emit(
                `  ${vtablePtr} = bitcast [3 x i8*]* @DivisionByZeroError_vtable to i8*`,
              );
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
              );
              currentStruct = nextStruct;
            }

            if (divLayout.has("message")) {
              const idx = divLayout.get("message");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
              );
              currentStruct = nextStruct;
            }
            if (divLayout.has("code")) {
              const idx = divLayout.get("code");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i32 8, ${idx}`,
              );
              currentStruct = nextStruct;
            }

            if (divLayout.has("dummy")) {
              const dummyIndex = divLayout.get("dummy");
              const nextStruct = this.newRegister();
              this.emit(
                `  ${nextStruct} = insertvalue %struct.DivisionByZeroError ${currentStruct}, i8 0, ${dummyIndex}`,
              );
              currentStruct = nextStruct;
            }
          } else {
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue %struct.DivisionByZeroError undef, i8 0, 0`,
            );
            currentStruct = nextStruct;
          }
          const errorStruct = currentStruct;
          this.emitThrow(errorStruct, "%struct.DivisionByZeroError");
          // this.emit("  unreachable");

          this.emit(`${okLabel}:`);
        }
        break;
      case TokenType.Ampersand:
        op = "and";
        break;
      case TokenType.Pipe:
        op = "or";
        break;
      case TokenType.Caret:
        op = "xor";
        break;
      case TokenType.LessLess:
        op = "shl";
        break;
      case TokenType.GreaterGreater:
        op = isUnsigned ? "lshr" : "ashr";
        break;
    }

    if (op) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = ${op} ${leftType} ${left}, ${right}`);
      return reg;
    }
    return "0";
  }

  protected generateLogicalAnd(expr: AST.BinaryExpr): string {
    const leftVal = this.generateExpression(expr.left);
    const resPtr = this.allocateStack(`and_res_${this.labelCount++}`, "i1");
    const falseLabel = this.newLabel("and.false");
    const trueLabel = this.newLabel("and.true");
    const endLabel = this.newLabel("and.end");

    this.emit(`  br i1 ${leftVal}, label %${trueLabel}, label %${falseLabel}`);

    this.emit(`${falseLabel}:`);
    this.emit(`  store i1 0, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${trueLabel}:`);
    const rightVal = this.generateExpression(expr.right);
    this.emit(`  store i1 ${rightVal}, i1* ${resPtr}`);
    this.emit(`  br label %${endLabel}`);

    this.emit(`${endLabel}:`);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load i1, i1* ${resPtr}`);
    return reg;
  }

  protected generateLogicalOr(expr: AST.BinaryExpr): string {
    const leftVal = this.generateExpression(expr.left);

    const resPtr = this.allocateStack(`or_res_${this.labelCount++}`, "i1");

    const trueLabel = this.newLabel("or.true");

    const evalRhsLabel = this.newLabel("or.eval_rhs");

    const endLabel = this.newLabel("or.end");

    this.emit(
      `  br i1 ${leftVal}, label %${trueLabel}, label %${evalRhsLabel}`,
    );

    this.emit(`${trueLabel}:`);

    this.emit(`  store i1 1, i1* ${resPtr}`);

    this.emit(`  br label %${endLabel}`);

    this.emit(`${evalRhsLabel}:`);

    const rightVal = this.generateExpression(expr.right);

    this.emit(`  store i1 ${rightVal}, i1* ${resPtr}`);

    this.emit(`  br label %${endLabel}`);

    this.emit(`${endLabel}:`);

    const reg = this.newRegister();

    this.emit(`  ${reg} = load i1, i1* ${resPtr}`);

    return reg;
  }

  protected generateStructComparison(
    structName: string,
    leftVal: string,
    rightVal: string,
    isEqualOp: boolean,
  ): string {
    const structDecl = this.structMap.get(structName);
    if (!structDecl) {
      // Fallback to memcmp if we can't find the struct definition (e.g. generic instance not in map)
      // This is risky due to padding but better than crashing
      const typeStr = `%struct.${structName}`;

      // Spill to stack
      const leftPtr = this.allocateStack(
        `cmp_fallback_left_${this.labelCount}`,
        typeStr,
      );
      this.emit(`  store ${typeStr} ${leftVal}, ${typeStr}* ${leftPtr}`);
      const rightPtr = this.allocateStack(
        `cmp_fallback_right_${this.labelCount}`,
        typeStr,
      );
      this.emit(`  store ${typeStr} ${rightVal}, ${typeStr}* ${rightPtr}`);

      // Bitcast to i8*
      const leftI8 = this.newRegister();
      this.emit(`  ${leftI8} = bitcast ${typeStr}* ${leftPtr} to i8*`);
      const rightI8 = this.newRegister();
      this.emit(`  ${rightI8} = bitcast ${typeStr}* ${rightPtr} to i8*`);

      // Size
      const sizePtr = this.newRegister();
      const sizeVal = this.newRegister();
      this.emit(
        `  ${sizePtr} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
      );
      this.emit(`  ${sizeVal} = ptrtoint ${typeStr}* ${sizePtr} to i64`);

      const res = this.newRegister();
      this.emit(
        `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${sizeVal})`,
      );
      const cmp = this.newRegister();
      this.emit(`  ${cmp} = icmp eq i32 ${res}, 0`);

      if (!isEqualOp) {
        const notCmp = this.newRegister();
        this.emit(`  ${notCmp} = xor i1 ${cmp}, true`);
        return notCmp;
      }
      return cmp;
    }

    const fields = this.getAllStructFields(structDecl);
    // Structs are value types, no null bit
    const allFields = [
      ...fields.map((f) => ({ type: this.resolveType(f.type) })),
    ];

    let resultReg = "true"; // Start with true (all equal)

    for (let i = 0; i < allFields.length; i++) {
      const fieldType = allFields[i]!.type;

      // Extract values
      const leftField = this.newRegister();
      this.emit(
        `  ${leftField} = extractvalue %struct.${structName} ${leftVal}, ${i}`,
      );

      const rightField = this.newRegister();
      this.emit(
        `  ${rightField} = extractvalue %struct.${structName} ${rightVal}, ${i}`,
      );

      let cmpReg: string;

      if (fieldType.startsWith("%struct.") && !fieldType.endsWith("*")) {
        // Recursive struct comparison
        const nestedStructName = fieldType.substring(8);
        cmpReg = this.generateStructComparison(
          nestedStructName,
          leftField,
          rightField,
          true,
        );
      } else if (fieldType.startsWith("%enum.")) {
        // Enum comparison - use memcmp for now as they are packed {i32, [N x i8]}
        // TODO: Implement field-by-field for enums to be safe against padding
        const typeStr = fieldType;
        const leftPtr = this.allocateStack(
          `enum_cmp_left_${this.labelCount}`,
          typeStr,
        );
        this.emit(`  store ${typeStr} ${leftField}, ${typeStr}* ${leftPtr}`);
        const rightPtr = this.allocateStack(
          `enum_cmp_right_${this.labelCount}`,
          typeStr,
        );
        this.emit(`  store ${typeStr} ${rightField}, ${typeStr}* ${rightPtr}`);

        const leftI8 = this.newRegister();
        this.emit(`  ${leftI8} = bitcast ${typeStr}* ${leftPtr} to i8*`);
        const rightI8 = this.newRegister();
        this.emit(`  ${rightI8} = bitcast ${typeStr}* ${rightPtr} to i8*`);

        const sizePtr = this.newRegister();
        const sizeVal = this.newRegister();
        this.emit(
          `  ${sizePtr} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
        );
        this.emit(`  ${sizeVal} = ptrtoint ${typeStr}* ${sizePtr} to i64`);

        const res = this.newRegister();
        this.emit(
          `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${sizeVal})`,
        );
        cmpReg = this.newRegister();
        this.emit(`  ${cmpReg} = icmp eq i32 ${res}, 0`);
      } else if (fieldType.startsWith("[") && fieldType.endsWith("]")) {
        // Array comparison - use memcmp
        const typeStr = fieldType;
        const leftPtr = this.allocateStack(
          `arr_cmp_left_${this.labelCount}`,
          typeStr,
        );
        this.emit(`  store ${typeStr} ${leftField}, ${typeStr}* ${leftPtr}`);
        const rightPtr = this.allocateStack(
          `arr_cmp_right_${this.labelCount}`,
          typeStr,
        );
        this.emit(`  store ${typeStr} ${rightField}, ${typeStr}* ${rightPtr}`);

        const leftI8 = this.newRegister();
        this.emit(`  ${leftI8} = bitcast ${typeStr}* ${leftPtr} to i8*`);
        const rightI8 = this.newRegister();
        this.emit(`  ${rightI8} = bitcast ${typeStr}* ${rightPtr} to i8*`);

        const sizePtr = this.newRegister();
        const sizeVal = this.newRegister();
        this.emit(
          `  ${sizePtr} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
        );
        this.emit(`  ${sizeVal} = ptrtoint ${typeStr}* ${sizePtr} to i64`);

        const res = this.newRegister();
        this.emit(
          `  ${res} = call i32 @memcmp(i8* ${leftI8}, i8* ${rightI8}, i64 ${sizeVal})`,
        );
        cmpReg = this.newRegister();
        this.emit(`  ${cmpReg} = icmp eq i32 ${res}, 0`);
      } else {
        // Primitive comparison
        if (fieldType === "float" || fieldType === "double") {
          cmpReg = this.newRegister();
          this.emit(
            `  ${cmpReg} = fcmp oeq ${fieldType} ${leftField}, ${rightField}`,
          );
        } else {
          cmpReg = this.newRegister();
          this.emit(
            `  ${cmpReg} = icmp eq ${fieldType} ${leftField}, ${rightField}`,
          );
        }
      }

      // Combine
      const newResult = this.newRegister();
      this.emit(`  ${newResult} = and i1 ${resultReg}, ${cmpReg}`);
      resultReg = newResult;
    }

    if (!isEqualOp) {
      const notResult = this.newRegister();
      this.emit(`  ${notResult} = xor i1 ${resultReg}, true`);
      return notResult;
    }
    return resultReg;
  }

  protected generateCall(expr: AST.CallExpr): string {
    // Handle intrinsics
    let calleeName = "";
    if (expr.callee.kind === "Identifier") {
      calleeName = (expr.callee as AST.IdentifierExpr).name;
    } else if (expr.callee.kind === "GenericInstantiation") {
      const genExpr = expr.callee as AST.GenericInstantiationExpr;
      if (genExpr.base.kind === "Identifier") {
        calleeName = (genExpr.base as AST.IdentifierExpr).name;
      }
    }

    if (calleeName === "__type_id") {
      let genericArgs = expr.genericArgs || [];
      if (
        genericArgs.length === 0 &&
        expr.callee.kind === "GenericInstantiation"
      ) {
        genericArgs = (expr.callee as AST.GenericInstantiationExpr).genericArgs;
      }

      if (genericArgs.length === 1) {
        let typeArg = genericArgs[0]!;
        if (this.currentTypeMap.size > 0) {
          typeArg = this.substituteType(typeArg, this.currentTypeMap);
        }
        const typeId = RTTI.getTypeId(typeArg);
        return `${typeId}`;
      }
    }

    let decl: any;
    // Check for enum variant constructor
    const enumVariantInfo = (expr as any).enumVariantInfo;
    if (enumVariantInfo) {
      // This is an enum variant constructor call
      const enumDecl = enumVariantInfo.enumDecl as AST.EnumDecl;
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

      // Handle tuple/struct data if present
      if (variant.dataType && expr.args.length > 0) {
        // Get pointer to data field
        const dataPtr = this.newRegister();
        this.emit(
          `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${enumPtr}, i32 0, i32 1`,
        );

        if (variant.dataType.kind === "EnumVariantTuple") {
          // Get enum name from type (strip "%enum." prefix)
          const enumName = enumType.substring(6);
          const dataSize = this.enumDataSizes.get(enumName) || 64;

          // Store each argument in sequence in the data array with proper byte offsets
          const bytePtr = this.newRegister();
          this.emit(
            `  ${bytePtr} = bitcast [${dataSize} x i8]* ${dataPtr} to i8*`,
          );

          let byteOffset = 0;
          for (let i = 0; i < expr.args.length; i++) {
            const argValue = this.generateExpression(expr.args[i]!);
            const argType = this.resolveType(expr.args[i]!.resolvedType!);
            const argSize = this.getTypeSize(argType);

            // Align the offset based on type size
            const alignment =
              argSize >= 8 ? 8 : argSize >= 4 ? 4 : argSize >= 2 ? 2 : 1;
            if (byteOffset % alignment !== 0) {
              byteOffset = Math.ceil(byteOffset / alignment) * alignment;
            }

            // Get pointer at the correct byte offset
            let storePtr: string;
            if (byteOffset === 0) {
              storePtr = this.newRegister();
              this.emit(
                `  ${storePtr} = bitcast i8* ${bytePtr} to ${argType}*`,
              );
            } else {
              const offsetPtr = this.newRegister();
              this.emit(
                `  ${offsetPtr} = getelementptr i8, i8* ${bytePtr}, i32 ${byteOffset}`,
              );
              storePtr = this.newRegister();
              this.emit(
                `  ${storePtr} = bitcast i8* ${offsetPtr} to ${argType}*`,
              );
            }

            // Store the value
            this.emit(
              `  store ${argType} ${argValue}, ${argType}* ${storePtr}`,
            );

            byteOffset += argSize;
          }
        }
        // TODO: Handle EnumVariantStruct similarly
      }

      // Load the constructed enum value
      const result = this.newRegister();
      this.emit(`  ${result} = load ${enumType}, ${enumType}* ${enumPtr}`);

      return result;
    }

    // Check for operator overload (__call__)
    if (expr.operatorOverload) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const calleeRaw = this.generateExpression(expr.callee);

      // Get the struct name from the target type
      const targetType = overload.targetType as AST.BasicTypeNode;
      const structName = targetType.name;

      // Build the method name with struct prefix
      const methodType = method.resolvedType as AST.FunctionTypeNode;
      const fullMethodName = `${structName}_${method.name}`;
      const mangledName = this.getMangledName(fullMethodName, methodType);

      // Get address of callee (this pointer)
      const calleeType = this.resolveType(expr.callee.resolvedType!);
      let thisPtr: string;
      try {
        thisPtr = this.generateAddress(expr.callee);
      } catch {
        // If we can't get address, spill to stack
        const spillAddr = this.allocateStack(
          `op_spill_${this.labelCount++}`,
          calleeType,
        );
        this.emit(
          `  store ${calleeType} ${calleeRaw}, ${calleeType}* ${spillAddr}`,
        );
        thisPtr = spillAddr;
      }

      // Generate arguments
      const argRegs: string[] = [];
      const argTypes: string[] = [];
      for (const arg of expr.args) {
        const argVal = this.generateExpression(arg);
        const argType = this.resolveType(arg.resolvedType!);
        argRegs.push(argVal);
        argTypes.push(argType);
      }

      // Build argument list for call: context + this pointer + actual args
      const callArgs = [`i8* null`, `${calleeType}* ${thisPtr}`];
      for (let i = 0; i < argRegs.length; i++) {
        callArgs.push(`${argTypes[i]} ${argRegs[i]}`);
      }

      // Call the __call__ method
      const returnType = this.resolveType(method.returnType);
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(${callArgs.join(", ")})`,
      );
      return resultReg;
    }

    let funcName = "";
    let argsToGenerate = expr.args;
    let isInstanceCall = false;
    let targetThisType: string | undefined;

    let callee = expr.callee;
    let genericArgs = expr.genericArgs || [];
    const callSubstitutionMap = new Map<string, AST.TypeNode>();

    // Handle generic instantiation expression
    if (callee.kind === "GenericInstantiation") {
      const genExpr = callee as AST.GenericInstantiationExpr;
      callee = genExpr.base;
      genericArgs = genExpr.genericArgs;
    }

    if (callee.kind === "Identifier") {
      const ident = callee as AST.IdentifierExpr;
      funcName = ident.name;

      // Handle generic function call
      if (genericArgs.length > 0) {
        // Find declaration
        // We rely on resolvedType having the declaration
        const funcType = ident.resolvedType as AST.FunctionTypeNode;
        if (funcType && funcType.declaration) {
          funcName = this.resolveMonomorphizedFunction(
            funcType.declaration,
            genericArgs,
          );
          if (
            funcType.declaration.genericParams.length === genericArgs.length
          ) {
            for (let k = 0; k < genericArgs.length; k++) {
              callSubstitutionMap.set(
                funcType.declaration.genericParams[k]!.name,
                genericArgs[k]!,
              );
            }
          }
        } else {
          // Maybe it's a struct constructor?
          // If 'resolvedType' is null or no declaration, we can't morph.
          // But let's assume valid typed AST.
        }
      } else if (expr.resolvedDeclaration) {
        const decl = expr.resolvedDeclaration;
        if (decl.kind === "Extern") {
          funcName = decl.name;
        } else {
          if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
            funcName = this.getMangledName(
              decl.name,
              decl.resolvedType as AST.FunctionTypeNode,
            );
          } else {
            funcName = decl.name;
          }
        }
      }
    } else if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType;

      if (!objType)
        throw new CompilerError(
          "Member access on unresolved type",
          "The type of the object could not be resolved.",
          memberExpr.location,
        );

      if ((objType as any).kind === "ModuleType") {
        funcName = memberExpr.property;
      } else {
        let structName = "";
        let contextMap: Map<string, AST.TypeNode> | undefined;
        let prefix: string | undefined;

        if (objType.kind === "BasicType") {
          // Use resolved type name to handle monomorphization
          const typeStr = this.resolveType(objType);
          // typeStr is %struct.Box_i32 or %struct.Box
          // we need the clean name

          let cleanType = typeStr;
          // Strip pointers
          while (cleanType.endsWith("*")) {
            cleanType = cleanType.slice(0, -1);
          }
          // Strip arrays [N x ...]
          while (cleanType.startsWith("[")) {
            // Extract inner type "x Inner]"
            const match = cleanType.match(/^\[\d+ x (.+)\]$/);
            if (match) {
              cleanType = match[1]!;
            } else {
              break;
            }
          }

          if (cleanType.startsWith("%struct.")) {
            structName = cleanType.substring(8);
          } else if (cleanType.startsWith("%enum.")) {
            structName = cleanType.substring(6);
          } else if (PRIMITIVE_STRUCT_MAP[objType.name]) {
            structName = PRIMITIVE_STRUCT_MAP[objType.name]!;
            targetThisType = `%struct.${structName}*`;
          } else if (PRIMITIVE_STRUCT_MAP[cleanType]) {
            structName = PRIMITIVE_STRUCT_MAP[cleanType]!;
            targetThisType = `%struct.${structName}*`;
          } else {
            structName = objType.name;
          }

          prefix = structName; // e.g. Box_double

          // Instance call: pass object as first argument
          argsToGenerate = [memberExpr.object, ...expr.args];
          isInstanceCall = true;

          // Prepare context if object is instantiated generic struct
          let structDecl = this.structMap.get(objType.name); // Original generic struct
          if (!structDecl) {
            structDecl = this.enumDeclMap.get(objType.name) as any;
          }

          if (
            structDecl &&
            structDecl.genericParams.length > 0 &&
            objType.genericArgs.length > 0
          ) {
            contextMap = new Map();
            for (let i = 0; i < structDecl.genericParams.length; i++) {
              if (i < objType.genericArgs.length) {
                let genericArg = objType.genericArgs[i]!;
                // Substitute any generic parameters in the argument using currentTypeMap
                // This handles cases like Array<Pair<K, V>> where K, V need to be resolved
                if (this.currentTypeMap.size > 0) {
                  genericArg = this.substituteType(
                    genericArg,
                    this.currentTypeMap,
                  );
                }
                contextMap.set(structDecl.genericParams[i]!.name, genericArg);
                callSubstitutionMap.set(
                  structDecl.genericParams[i]!.name,
                  genericArg,
                );
              }
            }
          }
        } else if (objType.kind === "MetaType") {
          const inner = (objType as any).type;
          if (inner.kind === "BasicType") {
            structName = inner.name;

            // Handle generic static calls - need monomorphized name
            if (inner.genericArgs && inner.genericArgs.length > 0) {
              // Resolve the monomorphized struct name
              let structDecl = this.structMap.get(inner.name);
              if (!structDecl) {
                // Check enum map
                const enumDecl = this.enumDeclMap.get(inner.name);
                if (enumDecl) {
                  // Treat enum as struct for generic param lookup
                  structDecl = enumDecl as any;
                }
              }

              if (structDecl && structDecl.genericParams.length > 0) {
                // Build contextMap for generic substitution
                contextMap = new Map();
                for (let i = 0; i < structDecl.genericParams.length; i++) {
                  if (i < inner.genericArgs.length) {
                    let genericArg = inner.genericArgs[i]!;
                    // Substitute any generic parameters in the argument using currentTypeMap
                    // This handles cases like Option<V> where V needs to be resolved to concrete type
                    if (this.currentTypeMap.size > 0) {
                      genericArg = this.substituteType(
                        genericArg,
                        this.currentTypeMap,
                      );
                    }
                    contextMap.set(
                      structDecl.genericParams[i]!.name,
                      genericArg,
                    );
                    callSubstitutionMap.set(
                      structDecl.genericParams[i]!.name,
                      genericArg,
                    );
                  }
                }

                // Mangle the struct name using the same approach as resolveMonomorphizedType
                // But first substitute any generic parameters
                const substitutedArgs = inner.genericArgs.map(
                  (arg: AST.TypeNode) =>
                    this.substituteType(arg, this.currentTypeMap),
                );
                const argNames = substitutedArgs
                  .map((arg: AST.TypeNode) => this.mangleType(arg))
                  .join("_");
                structName = `${inner.name}_${argNames}`;
                prefix = structName;
              }
            }
            // Static call: no extra argument
          } else {
            throw new CompilerError(
              "Static member access on non-struct type",
              "Static members can only be accessed on struct types.",
              memberExpr.location,
            );
          }
        } else {
          throw new CompilerError(
            "Member access on non-struct type",
            "Members can only be accessed on struct types.",
            memberExpr.location,
          );
        }

        // Check for inherited method
        const ownerDecl = this.findMethodOwner(structName, memberExpr.property);
        if (
          ownerDecl &&
          ownerDecl.name !== (objType as AST.BasicTypeNode).name
        ) {
          // Inherited method
          if (ownerDecl.genericParams.length === 0) {
            // Parent is not generic, use its name directly
            structName = ownerDecl.name;
            targetThisType = `%struct.${structName}*`;
          } else {
            // Generic parent inheritance
            const childDecl = this.structMap.get(
              (objType as AST.BasicTypeNode).name,
            );
            if (childDecl) {
              const parentType = this.findInstantiatedParentType(
                childDecl,
                objType as AST.BasicTypeNode,
                ownerDecl.name,
              );

              if (parentType) {
                const llvmType = this.resolveMonomorphizedType(
                  ownerDecl,
                  parentType.genericArgs,
                );
                structName = llvmType.substring(8); // Strip %struct.
                targetThisType = `${llvmType}*`;

                // Populate callSubstitutionMap for generic parent
                if (ownerDecl.genericParams.length > 0) {
                  for (let i = 0; i < ownerDecl.genericParams.length; i++) {
                    if (i < parentType.genericArgs.length) {
                      callSubstitutionMap.set(
                        ownerDecl.genericParams[i]!.name,
                        parentType.genericArgs[i]!,
                      );
                      // Also populate contextMap for mangling
                      if (!contextMap) contextMap = new Map();
                      contextMap.set(
                        ownerDecl.genericParams[i]!.name,
                        parentType.genericArgs[i]!,
                      );
                    }
                  }
                }
              }
            }
          }
        }

        funcName = `${structName}_${memberExpr.property}`;

        decl = expr.resolvedDeclaration;

        // If we found a concrete owner, try to find the method declaration there
        // This fixes issues where TypeChecker resolved to interface/parent method
        // but we are calling a concrete implementation with different signature (e.g. 'this' type)
        if (ownerDecl) {
          // Check if the resolved declaration is already in the owner
          // If it is, we respect the TypeChecker's choice (handles overloads)
          const isDeclaredInOwner =
            decl && ownerDecl.members.includes(decl as any);

          if (!isDeclaredInOwner) {
            const candidates = ownerDecl.members.filter(
              (m) =>
                m.kind === "FunctionDecl" && m.name === memberExpr.property,
            ) as AST.FunctionDecl[];

            if (candidates.length === 1) {
              decl = candidates[0];
            } else if (
              candidates.length > 1 &&
              decl &&
              decl.kind === "FunctionDecl"
            ) {
              // Multiple overloads in owner - try to match signature of original decl
              const targetParams = (decl as AST.FunctionDecl).params;
              // Skip 'this' (first param)
              const targetParamTypes = targetParams.slice(1).map((p) => p.type);

              const match = candidates.find((c) => {
                // Check generic params count match
                if (
                  c.genericParams.length !==
                  (decl as AST.FunctionDecl).genericParams.length
                )
                  return false;

                const cParams = c.params.slice(1).map((p) => p.type);
                if (cParams.length !== targetParamTypes.length) return false;
                // Compare resolved types
                return cParams.every(
                  (t, i) =>
                    this.resolveType(t) ===
                    this.resolveType(targetParamTypes[i]!),
                );
              });

              if (match) {
                decl = match;
              }
            }
          }
        }

        if (
          !decl &&
          callee.resolvedType &&
          (callee.resolvedType as any).declaration
        ) {
          decl = (callee.resolvedType as any).declaration;
        }

        if (decl) {
          if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
            let funcTypeToMangle = decl.resolvedType as AST.FunctionTypeNode;
            // Substitute generic types before mangling
            // Merge currentTypeMap and contextMap to handle nested generics
            // e.g., calling Array<Pair<K, V>>.destroy() needs both T->Pair and K,V mappings
            const substitutionMap = new Map<string, AST.TypeNode>();
            if (this.currentTypeMap.size > 0) {
              for (const [k, v] of this.currentTypeMap) {
                substitutionMap.set(k, v);
              }
            }
            if (contextMap) {
              for (const [k, v] of contextMap) {
                // contextMap takes precedence for the target type's generics
                substitutionMap.set(k, v);
              }
            }
            if (substitutionMap.size > 0) {
              funcTypeToMangle = this.substituteType(
                funcTypeToMangle,
                substitutionMap,
              ) as AST.FunctionTypeNode;
            }
            funcName = this.getMangledName(funcName, funcTypeToMangle);
          }
        }

        // Handle generic method call
        if (genericArgs.length > 0) {
          const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
          if (funcType && funcType.declaration) {
            funcName = this.resolveMonomorphizedFunction(
              funcType.declaration,
              genericArgs,
              contextMap,
              prefix,
            );
            if (
              funcType.declaration.genericParams.length === genericArgs.length
            ) {
              for (let k = 0; k < genericArgs.length; k++) {
                callSubstitutionMap.set(
                  funcType.declaration.genericParams[k]!.name,
                  genericArgs[k]!,
                );
              }
            }
          }
        }
      }
    }
    let callTarget = "";
    let closureCtx = "null";
    let isIndirectCall = false;

    // If identifier and local, indirect call
    if (callee.kind === "Identifier") {
      const ident = callee as AST.IdentifierExpr;
      if (this.locals.has(ident.name)) {
        // Indirect call (closure)
        isIndirectCall = true;
        const closureType = this.resolveType(ident.resolvedType!);
        const addr = this.generateAddress(ident);
        const closureVal = this.newRegister();
        // addr is closureType*
        this.emit(
          `  ${closureVal} = load ${closureType}, ${closureType}* ${addr}`,
        );

        const funcPtr = this.newRegister();
        this.emit(
          `  ${funcPtr} = extractvalue ${closureType} ${closureVal}, 0`,
        );
        callTarget = funcPtr;

        const ctxPtr = this.newRegister();
        this.emit(`  ${ctxPtr} = extractvalue ${closureType} ${closureVal}, 1`);
        closureCtx = ctxPtr;
      } else {
        callTarget = `@${funcName}`;
      }
    } else if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType as AST.BasicTypeNode;
      if (objType && objType.kind === "BasicType") {
        let structName = objType.name;
        if (this.currentTypeMap.has(structName)) {
          const typeStr = this.resolveType(objType); // %struct.Name
          if (typeStr.startsWith("%struct.")) {
            structName = typeStr.substring(8);
            while (structName.endsWith("*"))
              structName = structName.slice(0, -1);
          }
        }

        // Check layout
        const layout = this.structLayouts.get(structName);
        if (layout && layout.has(memberExpr.property)) {
          // It IS a field! Indirect call.
          // We should generate the member access to get the closure struct.
          const closureVal = this.generateMember(memberExpr); // Get closure struct value
          isIndirectCall = true;
          const closureType = this.resolveType(memberExpr.resolvedType!);

          const funcPtr = this.newRegister();
          this.emit(
            `  ${funcPtr} = extractvalue ${closureType} ${closureVal}, 0`,
          );
          callTarget = funcPtr;

          const ctxPtr = this.newRegister();
          this.emit(
            `  ${ctxPtr} = extractvalue ${closureType} ${closureVal}, 1`,
          );
          closureCtx = ctxPtr;

          // Reset args (remove "this" injection done for methods)
          if (isInstanceCall) {
            argsToGenerate = expr.args; // Revert to original args
            isInstanceCall = false;
          }
        } else {
          // Method call
          const vtableMethods = this.vtableLayouts.get(structName)!;
          let useVirtualCall = false;

          if (
            isInstanceCall &&
            vtableMethods &&
            vtableMethods.includes(memberExpr.property) &&
            genericArgs.length === 0
          ) {
            useVirtualCall = true;
            // Verify overload match - only the first non-generic overload is in the vtable
            // If we are calling a different overload, we must use direct call
            const owner = this.findMethodOwner(structName, memberExpr.property);
            if (owner && decl) {
              const vtableDecl = owner.members.find(
                (m) =>
                  m.kind === "FunctionDecl" &&
                  m.name === memberExpr.property &&
                  (m as AST.FunctionDecl).genericParams.length === 0,
              );
              if (vtableDecl !== decl) {
                useVirtualCall = false;
              }
            }
          }

          if (useVirtualCall) {
            // Generate indirect call via vtable
            const objExpr = argsToGenerate[0]!;
            let objPtr: string;
            const objTypeStr = this.resolveType(objExpr.resolvedType!);
            if (objTypeStr.endsWith("*")) {
              objPtr = this.generateExpression(objExpr);
            } else {
              try {
                objPtr = this.generateAddress(objExpr);
              } catch {
                // Spill to stack
                const val = this.generateExpression(objExpr);
                const spill = this.allocateStack(
                  `vcall_spill_${this.labelCount++}`,
                  objTypeStr,
                );
                this.emit(
                  `  store ${objTypeStr} ${val}, ${objTypeStr}* ${spill}`,
                );
                objPtr = spill;
              }
            }

            const vtableIndex = this.structLayouts
              .get(structName)
              ?.get("__vtable__");

            if (vtableIndex !== undefined) {
              const vptrPtr = this.newRegister();
              const structType = objTypeStr.endsWith("*")
                ? objTypeStr.slice(0, -1)
                : objTypeStr;

              this.emit(
                `  ${vptrPtr} = getelementptr inbounds ${structType}, ${structType}* ${objPtr}, i32 0, i32 ${vtableIndex}`,
              );

              const vptr = this.newRegister();
              this.emit(`  ${vptr} = load i8*, i8** ${vptrPtr}`);

              const vtableArrayPtr = this.newRegister();
              this.emit(`  ${vtableArrayPtr} = bitcast i8* ${vptr} to i8**`);

              const methodIndex = vtableMethods.indexOf(memberExpr.property);
              const funcPtrPtr = this.newRegister();
              this.emit(
                `  ${funcPtrPtr} = getelementptr inbounds i8*, i8** ${vtableArrayPtr}, i64 ${methodIndex}`,
              );

              const funcPtrI8 = this.newRegister();
              this.emit(`  ${funcPtrI8} = load i8*, i8** ${funcPtrPtr}`);

              const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
              // Fix: resolveType returns closure struct type, but we need raw function pointer type
              const retType = this.resolveType(funcType.returnType);
              const paramTypes = funcType.paramTypes.map((p) =>
                this.resolveType(p),
              );
              const paramsStr =
                paramTypes.length > 0 ? `, ${paramTypes.join(", ")}` : "";
              const targetFuncType = `${retType} (i8*${paramsStr})*`;

              const funcPtr = this.newRegister();
              this.emit(
                `  ${funcPtr} = bitcast i8* ${funcPtrI8} to ${targetFuncType}`,
              );

              callTarget = funcPtr;
            } else {
              callTarget = `@${funcName}`;
            }
          } else {
            callTarget = `@${funcName}`;
          }
        }
      } else {
        callTarget = `@${funcName}`;
      }
    } else {
      // Other expressions (Index, Call, etc) evaluating to closure struct
      // e.g. arr[0]()
      isIndirectCall = true;
      const closureType = this.resolveType(callee.resolvedType!);
      const closureVal = this.generateExpression(callee);

      const funcPtr = this.newRegister();
      this.emit(`  ${funcPtr} = extractvalue ${closureType} ${closureVal}, 0`);
      callTarget = funcPtr;

      const ctxPtr = this.newRegister();
      this.emit(`  ${ctxPtr} = extractvalue ${closureType} ${closureVal}, 1`);
      closureCtx = ctxPtr;
    }

    const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
    if (!funcType) {
      throw new CompilerError(
        `Function call '${funcName}' has no resolved type`,
        "Internal compiler error: function type not resolved.",
        expr.location,
      );
    }

    if (
      funcType.declaration &&
      (funcType.declaration as any).kind === "SpecMethod"
    ) {
      if (isInstanceCall) {
        const memberExpr = callee as AST.MemberExpr;
        const objType = memberExpr.object.resolvedType;
        if (objType) {
          callSubstitutionMap.set("Self", objType);
        }
      }
    }

    // Try to find the actual method declaration in the owner struct (for inheritance)
    let targetMethodDecl: AST.FunctionDecl | undefined;
    if (callee.kind === "Member") {
      const memberExpr = callee as AST.MemberExpr;
      const objType = memberExpr.object.resolvedType;
      if (objType && objType.kind === "BasicType") {
        let structName = objType.name;
        // Handle monomorphized name resolution if needed
        if (this.currentTypeMap.has(structName)) {
          const typeStr = this.resolveType(objType);
          if (typeStr.startsWith("%struct.")) {
            structName = typeStr.substring(8);
            while (structName.endsWith("*"))
              structName = structName.slice(0, -1);
          }
        }

        const ownerDecl = this.findMethodOwner(structName, memberExpr.property);
        if (ownerDecl) {
          const m = ownerDecl.members.find(
            (m) => m.kind === "FunctionDecl" && m.name === memberExpr.property,
          );
          if (m) targetMethodDecl = m as AST.FunctionDecl;
        }
      }
    }

    const generateArg = (arg: AST.Expression, i: number): string => {
      let targetTypeNode: AST.TypeNode | undefined;

      if (isInstanceCall) {
        if (i === 0) {
          if (targetMethodDecl && targetMethodDecl.params.length > 0) {
            targetTypeNode = targetMethodDecl.params[0]!.type;
          } else if (
            funcType.declaration &&
            funcType.declaration.params.length > 0
          ) {
            targetTypeNode = funcType.declaration.params[0]!.type;
          } else {
            targetTypeNode = arg.resolvedType;
          }
        } else {
          if (i - 1 < funcType.paramTypes.length) {
            targetTypeNode = funcType.paramTypes[i - 1];
          }
        }
      } else {
        if (i < funcType.paramTypes.length) {
          targetTypeNode = funcType.paramTypes[i];
        }
      }

      if (targetTypeNode) {
        // Apply substitution
        if (callSubstitutionMap.size > 0) {
          targetTypeNode = this.substituteType(
            targetTypeNode,
            callSubstitutionMap,
          );
        }

        const destType = this.resolveType(targetTypeNode);
        const srcType = this.resolveType(arg.resolvedType!);

        // Handle 'this' pointer cast for inherited methods
        if (
          isInstanceCall &&
          i === 0 &&
          targetThisType &&
          srcType !== targetThisType
        ) {
          // Check if we are casting a primitive to its wrapper struct
          // e.g. i32 -> %struct.Int*
          let wrapperStructName = "";
          if (
            targetThisType.startsWith("%struct.") &&
            targetThisType.endsWith("*")
          ) {
            wrapperStructName = targetThisType.substring(
              8,
              targetThisType.length - 1,
            );
          }

          // Check if this is a primitive wrapper cast
          let isMatch = false;
          if (wrapperStructName) {
            if (PRIMITIVE_STRUCT_MAP[srcType] === wrapperStructName) {
              isMatch = true;
            } else {
              // Check reverse mapping for unsigned types etc.
              for (const [key, val] of Object.entries(PRIMITIVE_STRUCT_MAP)) {
                if (val === wrapperStructName) {
                  let keyLLVM = "";
                  switch (key) {
                    case "i8":
                    case "u8":
                    case "char":
                    case "uchar":
                      keyLLVM = "i8";
                      break;
                    case "i16":
                    case "u16":
                    case "short":
                    case "ushort":
                      keyLLVM = "i16";
                      break;
                    case "i32":
                    case "u32":
                    case "int":
                    case "uint":
                      keyLLVM = "i32";
                      break;
                    case "i64":
                    case "u64":
                    case "long":
                    case "ulong":
                      keyLLVM = "i64";
                      break;
                    case "float":
                    case "double":
                      keyLLVM = "double";
                      break;
                    case "bool":
                    case "i1":
                      keyLLVM = "i1";
                      break;
                  }
                  if (keyLLVM === srcType) {
                    isMatch = true;
                    break;
                  }
                }
              }
            }
          }

          if (isMatch) {
            // Construct temporary wrapper struct
            const structType = `%struct.${wrapperStructName}`;
            const tempStructPtr = this.allocateStack(
              `primitive_wrapper_${this.labelCount++}`,
              structType,
            );

            // Initialize struct
            const layout = this.structLayouts.get(wrapperStructName);
            if (layout) {
              // Set value
              const valueIndex = layout.get("value");
              if (valueIndex !== undefined) {
                const val = this.generateExpression(arg);
                const valPtr = this.newRegister();
                this.emit(
                  `  ${valPtr} = getelementptr inbounds ${structType}, ${structType}* ${tempStructPtr}, i32 0, i32 ${valueIndex}`,
                );
                this.emit(`  store ${srcType} ${val}, ${srcType}* ${valPtr}`);
              }

              // Set vtable if needed
              const vtableIndex = layout.get("__vtable__");
              if (vtableIndex !== undefined) {
                const vtableGlobal =
                  this.vtableGlobalNames.get(wrapperStructName);
                if (vtableGlobal) {
                  const methods = this.vtableLayouts.get(wrapperStructName)!;
                  const arrayType = `[${methods.length} x i8*]`;

                  const vtablePtr = this.newRegister();
                  this.emit(
                    `  ${vtablePtr} = getelementptr inbounds ${structType}, ${structType}* ${tempStructPtr}, i32 0, i32 ${vtableIndex}`,
                  );

                  const vtableCast = this.newRegister();
                  this.emit(
                    `  ${vtableCast} = bitcast ${arrayType}* ${vtableGlobal} to i8*`,
                  );
                  this.emit(`  store i8* ${vtableCast}, i8** ${vtablePtr}`);
                }
              }
            }

            return `${targetThisType} ${tempStructPtr}`;
          }

          let ptrVal: string;
          let ptrType: string;

          if (srcType.endsWith("*")) {
            ptrVal = this.generateExpression(arg);
            ptrType = srcType;
          } else {
            // Try to get address
            try {
              ptrVal = this.generateAddress(arg);
              ptrType = srcType + "*";
            } catch {
              // Spill to stack
              const val = this.generateExpression(arg);
              const spill = this.allocateStack(
                `spill_${this.labelCount++}`,
                srcType,
              );
              this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);
              ptrVal = spill;
              ptrType = srcType + "*";
            }
          }

          const castReg = this.newRegister();
          this.emit(
            `  ${castReg} = bitcast ${ptrType} ${ptrVal} to ${targetThisType}`,
          );

          // Check if the function expects a value or a pointer
          if (destType === targetThisType) {
            return `${targetThisType} ${castReg}`;
          } else if (targetThisType === destType + "*") {
            // Function expects value, load it from the casted pointer
            const loaded = this.newRegister();
            this.emit(
              `  ${loaded} = load ${destType}, ${targetThisType} ${castReg}`,
            );
            return `${destType} ${loaded}`;
          }
          // Fallback: return casted pointer (might be wrong if types don't match, but better than nothing)
          return `${targetThisType} ${castReg}`;
        }

        // Optimize for L-values passing to pointer: take address directly (T -> *T)
        if (destType === srcType + "*") {
          try {
            const addr = this.generateAddress(arg as any);
            return `${destType} ${addr}`;
          } catch {
            // R-value passed where pointer expected: spill to stack
            const val = this.generateExpression(arg);
            const spill = this.allocateStack(
              `arg_spill_${this.labelCount++}`,
              srcType,
            );
            this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);
            return `${destType} ${spill}`;
          }
        }

        if (srcType.startsWith("[") && destType.endsWith("*")) {
          if (
            arg.kind === "Identifier" ||
            arg.kind === "Member" ||
            arg.kind === "Index"
          ) {
            const addr = this.generateAddress(arg as any);

            const decayReg = this.newRegister();
            this.emit(
              `  ${decayReg} = getelementptr inbounds ${srcType}, ${srcType}* ${addr}, i64 0, i64 0`,
            );
            return `${destType} ${decayReg}`;
          } else {
            // Handle R-value arrays (ArrayLiteral) by spilling to stack
            const val = this.generateExpression(arg);
            const spill = this.allocateStack(
              `array_lit_${this.labelCount++}`,
              srcType,
            );
            this.emit(`  store ${srcType} ${val}, ${srcType}* ${spill}`);

            const decayReg = this.newRegister();
            this.emit(
              `  ${decayReg} = getelementptr inbounds ${srcType}, ${srcType}* ${spill}, i64 0, i64 0`,
            );
            return `${destType} ${decayReg}`;
          }
        }

        const val = this.generateExpression(arg);
        const castVal = this.emitCast(
          val,
          srcType,
          destType,
          arg.resolvedType!,
          targetTypeNode,
        );
        return `${destType} ${castVal}`;
      }

      const val = this.generateExpression(arg);
      const srcType = this.resolveType(arg.resolvedType!);

      // For variadic arguments, promote i1 to i32 (C convention)
      if (srcType === "i1" && funcType.isVariadic) {
        const promoted = this.newRegister();
        this.emit(`  ${promoted} = zext i1 ${val} to i32`);
        return `i32 ${promoted}`;
      }

      return `${srcType} ${val}`;
    };

    let args: string;
    const isVariadic = funcType.isVariadic === true;
    const isExtern =
      expr.resolvedDeclaration && expr.resolvedDeclaration.kind === "Extern";

    if (isVariadic && !isExtern && !(expr as any).variadicPacked) {
      // BPL Variadic Logic
      let fixedCount = 0;
      let variadicParamType: AST.TypeNode | undefined;

      if (funcType.declaration && (funcType.declaration as any).params) {
        const params = (funcType.declaration as any).params;
        const variadicIndex = params.findIndex((p: any) => p.isVariadic);
        if (variadicIndex !== -1) {
          fixedCount = variadicIndex;
          variadicParamType = params[variadicIndex].type;
        } else {
          // Fallback if isVariadic is true but no param marked (shouldn't happen)
          fixedCount = funcType.paramTypes.length - 1;
        }
      } else {
        // Fallback for function pointers etc.
        // Assume standard BPL variadic: (...args, count) -> 2 extra params in signature compared to fixed args
        // But wait, paramTypes includes fixed args.
        // If signature is (a, b, ...args, count), paramTypes is [a, b, args, count].
        // fixedCount should be 2. Length is 4. So length - 2.
        if (funcType.paramTypes.length >= 2) {
          fixedCount = funcType.paramTypes.length - 2;
          variadicParamType = funcType.paramTypes[fixedCount];
        } else {
          fixedCount = 0;
        }
      }

      const fixedArgs = argsToGenerate.slice(0, fixedCount);
      const varArgs = argsToGenerate.slice(fixedCount);

      const fixedArgStrs = fixedArgs.map((arg, i) => generateArg(arg, i));

      // Determine if homogeneous
      let isHomogeneous = false;
      let elementType = "%struct.Any";

      if (variadicParamType) {
        if (
          variadicParamType.kind === "BasicType" &&
          variadicParamType.name === "Any"
        ) {
          isHomogeneous = false;
        } else {
          isHomogeneous = true;
          elementType = this.resolveType(variadicParamType);
        }
      }

      // Pack varArgs
      const count = varArgs.length;
      const arrayType = `[${count} x ${elementType}]`;
      const arrayPtr = this.allocateStack(
        `varargs_${this.labelCount++}`,
        arrayType,
      );

      for (let i = 0; i < count; i++) {
        const arg = varArgs[i]!;
        const val = this.generateExpression(arg);
        const srcType = this.resolveType(arg.resolvedType!);

        if (!isHomogeneous) {
          const anyVal = this.generateAnyConstruction(
            val,
            srcType,
            arg.resolvedType!,
          );

          const elemPtr = this.newRegister();
          this.emit(
            `  ${elemPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 ${i}`,
          );
          this.emit(`  store %struct.Any ${anyVal}, %struct.Any* ${elemPtr}`);
        } else {
          // Homogeneous packing
          // Implicit cast if needed (e.g. i32 to i64, or upcast)
          // For now, assume types match or are compatible enough for bitcast/zext
          // TODO: Use proper cast generation logic if types differ

          let finalVal = val;
          if (srcType !== elementType) {
            // Simple promotion for primitives
            if (
              elementType === "double" &&
              (srcType === "i32" || srcType === "i64")
            ) {
              const conv = this.newRegister();
              this.emit(`  ${conv} = sitofp ${srcType} ${val} to double`);
              finalVal = conv;
            } else if (elementType === "i64" && srcType === "i32") {
              const conv = this.newRegister();
              this.emit(`  ${conv} = sext i32 ${val} to i64`);
              finalVal = conv;
            } else if (srcType !== elementType) {
              // Try bitcast as last resort
              const cast = this.newRegister();
              this.emit(
                `  ${cast} = bitcast ${srcType} ${val} to ${elementType}`,
              );
              finalVal = cast;
            }
          }

          const elemPtr = this.newRegister();
          this.emit(
            `  ${elemPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 ${i}`,
          );
          this.emit(
            `  store ${elementType} ${finalVal}, ${elementType}* ${elemPtr}`,
          );
        }
      }

      const anyPtr = this.newRegister();
      this.emit(
        `  ${anyPtr} = getelementptr inbounds ${arrayType}, ${arrayType}* ${arrayPtr}, i32 0, i32 0`,
      );

      fixedArgStrs.push(`${elementType}* ${anyPtr}`);
      fixedArgStrs.push(`i64 ${count}`);

      args = fixedArgStrs.join(", ");
    } else {
      args = argsToGenerate.map((arg, i) => generateArg(arg, i)).join(", ");
    }

    // Prepend closure context if needed
    let finalArgs = args;
    const isMain = funcName === "main";

    if (!isExtern && !isMain) {
      if (finalArgs.length > 0) {
        finalArgs = `i8* ${closureCtx}, ${finalArgs}`;
      } else {
        finalArgs = `i8* ${closureCtx}`;
      }
    }

    const retType = this.resolveType(expr.resolvedType!);

    // Ensure external function is declared
    if (callTarget.startsWith("@") && isExtern) {
      const targetName = callTarget.substring(1);
      if (
        !this.declaredFunctions.has(targetName) &&
        !this.definedFunctions.has(targetName) &&
        !this.globals.has(targetName) &&
        !this.locals.has(targetName)
      ) {
        // Emit declaration
        const paramTypes: string[] = [];

        if (isInstanceCall) {
          const memberExpr = callee as AST.MemberExpr;
          const objType = memberExpr.object.resolvedType!;
          let thisType = this.resolveType(objType);

          // Check if the function expects a pointer or value for 'this'
          const funcDecl = expr.resolvedDeclaration as AST.FunctionDecl;
          let expectsPointer = true; // Default to pointer

          if (
            funcDecl &&
            funcDecl.params.length > 0 &&
            funcDecl.params[0]!.name === "this"
          ) {
            let thisParamType = funcDecl.params[0]!.type;
            if (callSubstitutionMap.size > 0) {
              thisParamType = this.substituteType(
                thisParamType,
                callSubstitutionMap,
              );
            }
            const resolvedThisParamType = this.resolveType(thisParamType);
            expectsPointer = resolvedThisParamType.endsWith("*");
          }

          if (expectsPointer) {
            // Pass struct by pointer
            if (!thisType.endsWith("*")) {
              thisType += "*";
            }
          }
          paramTypes.push(thisType);
        }

        paramTypes.push(
          ...funcType.paramTypes.map((t, i) => {
            let resolved = t;
            if (callSubstitutionMap.size > 0) {
              resolved = this.substituteType(t, callSubstitutionMap);
            }

            if (
              resolved.kind === "BasicType" &&
              resolved.genericArgs.length > 0
            ) {
              const structDecl = this.structMap.get(resolved.name);
              if (structDecl) {
                let ret = this.resolveMonomorphizedType(
                  structDecl,
                  resolved.genericArgs,
                );
                for (let i = 0; i < resolved.pointerDepth; i++) ret += "*";

                // Handle BPL variadic signature
                if (funcType.isVariadic && !isExtern) {
                  return `${ret}*, i32`;
                }
                return ret;
              }
            }

            const typeStr = this.resolveType(resolved);
            // Handle BPL variadic signature
            if (funcType.isVariadic && !isExtern) {
              return `${typeStr}*, i32`;
            }
            return typeStr;
          }),
        );

        const substitutedRet =
          callSubstitutionMap.size > 0
            ? this.substituteType(funcType.returnType, callSubstitutionMap)
            : funcType.returnType;

        let retTypeStr: string;
        if (
          substitutedRet.kind === "BasicType" &&
          substitutedRet.genericArgs.length > 0
        ) {
          // Try to resolve monomorphized type directly to avoid resolveType issues with empty map
          const structDecl = this.structMap.get(substitutedRet.name);
          if (structDecl) {
            retTypeStr = this.resolveMonomorphizedType(
              structDecl,
              substitutedRet.genericArgs,
            );
            // Add pointer depth
            for (let i = 0; i < substitutedRet.pointerDepth; i++)
              retTypeStr += "*";
          } else {
            retTypeStr = this.resolveType(substitutedRet);
          }
        } else {
          retTypeStr = this.resolveType(substitutedRet);
        }

        // Check if function is already declared or defined
        if (
          !this.declaredFunctions.has(targetName) &&
          !this.definedFunctions.has(targetName)
        ) {
          let decl = `declare ${retTypeStr} @${targetName}(${paramTypes.join(", ")}`;
          if (funcType.isVariadic && isExtern) {
            if (paramTypes.length > 0) decl += ", ...";
            else decl += "...";
          }
          decl += ")";

          // Check if this is a method of Type struct, which is defined internally
          if (!targetName.startsWith("Type_")) {
            this.emitDeclaration(decl);
            this.declaredFunctions.add(targetName);
          }
        }
      }
    }

    if (retType === "void") {
      if (isVariadic) {
        // Build the full signature for variadic functions
        let paramTypesStr = funcType.paramTypes
          .map((t) => this.resolveType(t))
          .join(", ");

        if (!isExtern && !isMain) {
          if (paramTypesStr.length > 0) {
            paramTypesStr = `i8*, ${paramTypesStr}`;
          } else {
            paramTypesStr = `i8*`;
          }
        }

        if (isExtern) {
          this.emit(
            `  call void (${paramTypesStr}, ...) ${callTarget}(${finalArgs})`,
          );
        } else {
          this.emit(
            `  call void (${paramTypesStr}) ${callTarget}(${finalArgs})`,
          );
        }
      } else {
        this.emit(`  call void ${callTarget}(${finalArgs})`);
      }
      return "";
    } else {
      const reg = this.newRegister();
      if (isVariadic) {
        // Build the full signature for variadic functions
        let paramTypesStr = funcType.paramTypes
          .map((t) => this.resolveType(t))
          .join(", ");

        if (!isExtern && !isMain) {
          if (paramTypesStr.length > 0) {
            paramTypesStr = `i8*, ${paramTypesStr}`;
          } else {
            paramTypesStr = `i8*`;
          }
        }

        if (isExtern) {
          this.emit(
            `  ${reg} = call ${retType} (${paramTypesStr}, ...) ${callTarget}(${finalArgs})`,
          );
        } else {
          this.emit(
            `  ${reg} = call ${retType} (${paramTypesStr}) ${callTarget}(${finalArgs})`,
          );
        }
      } else {
        this.emit(`  ${reg} = call ${retType} ${callTarget}(${finalArgs})`);
      }
      return reg;
    }
  }

  protected findInstantiatedParentType(
    childDecl: AST.StructDecl,
    childType: AST.BasicTypeNode,
    parentName: string,
  ): AST.BasicTypeNode | undefined {
    if (childDecl.name === parentName) return childType;

    if (!childDecl.inheritanceList || childDecl.inheritanceList.length === 0)
      return undefined;

    const parentType = childDecl.inheritanceList[0] as AST.BasicTypeNode;

    // Substitute if child is generic
    let instantiatedParent = parentType;
    if (
      childDecl.genericParams.length > 0 &&
      childType.genericArgs.length > 0
    ) {
      const map = new Map<string, AST.TypeNode>();
      for (let i = 0; i < childDecl.genericParams.length; i++) {
        if (i < childType.genericArgs.length) {
          map.set(childDecl.genericParams[i]!.name, childType.genericArgs[i]!);
        }
      }
      instantiatedParent = this.substituteType(
        parentType,
        map,
      ) as AST.BasicTypeNode;
    }

    if (instantiatedParent.name === parentName) return instantiatedParent;

    const parentDecl = this.structMap.get(instantiatedParent.name);
    if (!parentDecl) return undefined;

    return this.findInstantiatedParentType(
      parentDecl,
      instantiatedParent,
      parentName,
    );
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
              const structDecl = this.structMap.get(objectType.name);
              if (structDecl && structDecl.genericParams.length > 0) {
                // Build context map for generic substitution
                const contextMap = new Map<string, AST.TypeNode>();
                for (let i = 0; i < structDecl.genericParams.length; i++) {
                  contextMap.set(
                    structDecl.genericParams[i]!.name,
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
                `  ${resultReg} = call ${returnType} @${mangledName}(i8* null, ${objectTypeStr}* ${thisPtr}, ${indexType} ${indexRaw}, ${valueType} ${valueRaw})`,
              );
              return resultReg;
            } else {
              this.emit(
                `  call void @${mangledName}(i8* null, ${objectTypeStr}* ${thisPtr}, ${indexType} ${indexRaw}, ${valueType} ${valueRaw})`,
              );
              return valueRaw; // Return the assigned value
            }
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

        const elemType = this.resolveType(target.resolvedType!);
        const elemVal = this.newRegister();
        this.emit(`  ${elemVal} = extractvalue ${tupleType} ${tupleVal}, ${i}`);
        this.emit(`  store ${elemType} ${elemVal}, ${elemType}* ${addr}`);
      }

      return tupleVal;
    }

    // Don't skip null check if assignee is a member access through pointer
    const skipCheck =
      expr.assignee.kind === "Member"
        ? false // Always check member access (including pointers)
        : true; // Skip for direct identifiers to avoid double-checking

    const addr = this.generateAddress(expr.assignee, skipCheck);
    const destType = this.resolveType(expr.assignee.resolvedType!);

    if (expr.operator.type === TokenType.Equal) {
      const val = this.generateExpression(expr.value);
      const srcType = this.resolveType(expr.value.resolvedType!);
      const castVal = this.emitCast(
        val,
        srcType,
        destType,
        expr.value.resolvedType!,
        expr.assignee.resolvedType!,
      );
      this.emit(`  store ${destType} ${castVal}, ${destType}* ${addr}`);

      // Update null flag for struct locals
      if (expr.assignee.kind === "Identifier") {
        const id = expr.assignee as AST.IdentifierExpr;
        const flagPtr = this.localNullFlags.get(id.name);
        if (flagPtr) {
          let flagVal = "1"; // Default: struct is not null (valid)

          // If assigning a null literal, set flag to 0
          if (
            expr.value.kind === "Literal" &&
            (expr.value as AST.LiteralExpr).type === "null"
          ) {
            flagVal = "0"; // null means the struct is null
          }
          // If assigning from another struct local with a flag, propagate
          else if (expr.value.kind === "Identifier") {
            const srcId = expr.value as AST.IdentifierExpr;
            const srcFlag = this.localNullFlags.get(srcId.name);
            if (srcFlag) {
              const loaded = this.newRegister();
              this.emit(`  ${loaded} = load i1, i1* ${srcFlag}`);
              flagVal = loaded;
            }
          }
          // For all other cases (struct literals, function calls, etc), assume not null (1)
          // Zero values in fields are valid data, not null

          this.emit(`  store i1 ${flagVal}, i1* ${flagPtr}`);
        }

        // Track pointer-to-local in variable declarations: e.g., local y: *X = &x;
        // This allows us to check the null flag when dereferencing the pointer
        if (
          expr.value.kind === "Unary" &&
          (expr.value as AST.UnaryExpr).operator.type === TokenType.Ampersand
        ) {
          const unaryExpr = expr.value as AST.UnaryExpr;
          if (unaryExpr.operand.kind === "Identifier") {
            const sourceLocal = (unaryExpr.operand as AST.IdentifierExpr).name;
            // Track that this pointer points to sourceLocal
            this.pointerToLocal.set(id.name, sourceLocal);
          }
        }
      }

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

    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
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
        `  ${resultReg} = call ${returnType} @${mangledName}(i8* null, ${objectType}* ${thisPtr}, ${indexType} ${indexRaw})`,
      );
      return resultReg;
    }

    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  protected generateUnary(expr: AST.UnaryExpr): string {
    // Check for operator overload (only for prefix operators)
    if (expr.operatorOverload && expr.isPrefix) {
      const overload = expr.operatorOverload;
      const method = overload.methodDeclaration;
      const operandRaw = this.generateExpression(expr.operand);

      const targetType = overload.targetType as AST.BasicTypeNode;

      // Handle generic struct method calls
      let mangledName: string;
      if (targetType.genericArgs && targetType.genericArgs.length > 0) {
        // Generic struct - need monomorphized method name
        const structDecl = this.structMap.get(targetType.name);
        if (structDecl && structDecl.genericParams.length > 0) {
          // Build context map for generic substitution
          const contextMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < structDecl.genericParams.length; i++) {
            contextMap.set(
              structDecl.genericParams[i]!.name,
              targetType.genericArgs[i]!,
            );
          }

          // Build monomorphized struct name using mangleType (avoids recursion)
          const argNames = targetType.genericArgs
            .map((arg) => this.mangleType(arg))
            .join("_");
          const structName = `${targetType.name}_${argNames}`;

          // Build method name
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;

          // Get mangled name with substituted types
          const substitutedMethodType = this.substituteType(
            methodType,
            contextMap,
          ) as AST.FunctionTypeNode;

          mangledName = this.getMangledName(
            fullMethodName,
            substitutedMethodType,
          );
        } else {
          // Fallback: non-generic or already concrete
          const structName = targetType.name;
          const methodType = method.resolvedType as AST.FunctionTypeNode;
          const fullMethodName = `${structName}_${method.name}`;
          mangledName = this.getMangledName(fullMethodName, methodType);
        }
      } else {
        // Non-generic struct
        const structName = targetType.name;
        const methodType = method.resolvedType as AST.FunctionTypeNode;
        const fullMethodName = `${structName}_${method.name}`;
        mangledName = this.getMangledName(fullMethodName, methodType);
      }

      // Get address of operand (this pointer)
      const operandType = this.resolveType(expr.operand.resolvedType!);
      let thisPtr: string;
      try {
        thisPtr = this.generateAddress(expr.operand);
      } catch {
        // If we can't get address, spill to stack
        const spillAddr = this.allocateStack(
          `op_spill_${this.labelCount++}`,
          operandType,
        );
        this.emit(
          `  store ${operandType} ${operandRaw}, ${operandType}* ${spillAddr}`,
        );
        thisPtr = spillAddr;
      }

      // Call the operator method
      const returnType = this.resolveType(method.returnType);
      const resultReg = this.newRegister();
      this.emit(
        `  ${resultReg} = call ${returnType} @${mangledName}(i8* null, ${operandType}* ${thisPtr})`,
      );
      return resultReg;
    }

    if (
      expr.operator.type === TokenType.PlusPlus ||
      expr.operator.type === TokenType.MinusMinus
    ) {
      const addr = this.generateAddress(expr.operand);
      const type = this.resolveType(expr.operand.resolvedType!);
      const isFloat = type === "double";
      const one = isFloat ? "1.0" : "1";

      const currentValue = this.newRegister();
      this.emit(`  ${currentValue} = load ${type}, ${type}* ${addr}`);

      let op = "";
      if (expr.operator.type === TokenType.PlusPlus) {
        op = isFloat ? "fadd" : "add";
      } else {
        op = isFloat ? "fsub" : "sub";
      }

      const newValue = this.newRegister();
      this.emit(`  ${newValue} = ${op} ${type} ${currentValue}, ${one}`);
      this.emit(`  store ${type} ${newValue}, ${type}* ${addr}`);

      return expr.isPrefix ? newValue : currentValue;
    }

    if (expr.operator.type === TokenType.Ampersand) {
      return this.generateAddress(expr.operand);
    } else if (expr.operator.type === TokenType.Star) {
      const ptr = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      this.emit(`  ${reg} = load ${type}, ${type}* ${ptr}`);
      return reg;
    } else if (expr.operator.type === TokenType.Minus) {
      const val = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      if (type === "double") {
        this.emit(`  ${reg} = fsub double 0.0, ${val}`);
      } else {
        this.emit(`  ${reg} = sub ${type} 0, ${val}`);
      }
      return reg;
    } else if (expr.operator.type === TokenType.Bang) {
      const val = this.generateExpression(expr.operand);
      const reg = this.newRegister();
      this.emit(`  ${reg} = xor i1 ${val}, true`);
      return reg;
    } else if (expr.operator.type === TokenType.Tilde) {
      const val = this.generateExpression(expr.operand);
      const type = this.resolveType(expr.resolvedType!);
      const reg = this.newRegister();
      this.emit(`  ${reg} = xor ${type} ${val}, -1`);
      return reg;
    }
    return "0";
  }

  protected generateCast(expr: AST.CastExpr): string {
    const val = this.generateExpression(expr.expression);
    const srcType = this.resolveType(expr.expression.resolvedType!);
    const destType = this.resolveType(expr.targetType);
    return this.emitCast(
      val,
      srcType,
      destType,
      expr.expression.resolvedType!,
      expr.targetType,
    );
  }

  protected generateAnyConstruction(
    val: string,
    srcType: string,
    srcTypeNode: AST.TypeNode,
  ): string {
    // Ensure Any struct is defined
    if (!this.generatedStructs.has("Any")) {
      this.declarationsOutput.push(`%struct.Any = type { i8*, i64, i64 }`);
      this.generatedStructs.add("Any");
    }

    const anyType = `%struct.Any`;
    const typeId = RTTI.getTypeId(srcTypeNode).toString();

    // Pack data
    let dataVal = "0";
    if (
      srcType === "i64" ||
      srcType === "u64" ||
      srcType === "double" ||
      srcType.endsWith("*") ||
      srcType === "ptr" ||
      srcType.startsWith("%struct.")
    ) {
      if (srcType === "double") {
        const cast = this.newRegister();
        this.emit(`  ${cast} = bitcast double ${val} to i64`);
        dataVal = cast;
      } else if (
        srcType.endsWith("*") ||
        srcType === "ptr" ||
        srcType.startsWith("%struct.")
      ) {
        const cast = this.newRegister();
        let type = srcType;
        if (srcType.startsWith("%struct.")) type += "*";
        this.emit(`  ${cast} = ptrtoint ${type} ${val} to i64`);
        dataVal = cast;
      } else {
        dataVal = val;
      }
    } else {
      // Extend to 64-bit
      const cast = this.newRegister();
      if (srcType === "float") {
        const i32val = this.newRegister();
        this.emit(`  ${i32val} = bitcast float ${val} to i32`);
        this.emit(`  ${cast} = zext i32 ${i32val} to i64`);
      } else {
        // Integer types
        this.emit(`  ${cast} = zext ${srcType} ${val} to i64`);
      }
      dataVal = cast;
    }

    const anyVal = this.newRegister();
    this.emit(`  ${anyVal} = insertvalue ${anyType} undef, i8* null, 0`);
    const anyVal2 = this.newRegister();
    this.emit(
      `  ${anyVal2} = insertvalue ${anyType} ${anyVal}, i64 ${typeId}, 1`,
    );
    const finalAny = this.newRegister();
    this.emit(
      `  ${finalAny} = insertvalue ${anyType} ${anyVal2}, i64 ${dataVal}, 2`,
    );

    return finalAny;
  }

  protected emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string {
    if (srcType === destType) return val;

    // Case: Cast to Any
    if (destType === "%struct.Any") {
      return this.generateAnyConstruction(val, srcType, srcTypeNode);
    }

    // Special: casting literal null to a struct/object value should become zeroinitializer
    // Detect by value literal and destination being a non-pointer struct type
    if (
      val === "null" &&
      destType.startsWith("%struct.") &&
      !destType.endsWith("*")
    ) {
      return "zeroinitializer";
    }

    // Implicit address-of (T -> *T)
    if (destType === srcType + "*") {
      const ptr = this.newRegister();
      this.emit(`  ${ptr} = alloca ${srcType}`);
      this.emit(`  store ${srcType} ${val}, ${srcType}* ${ptr}`);
      return ptr;
    }

    // Implicit dereference (*T -> T) - copy
    if (srcType === destType + "*") {
      const reg = this.newRegister();
      this.emit(`  ${reg} = load ${destType}, ${srcType} ${val}`);
      return reg;
    }

    // Struct <-> Primitive inheritance casts
    if (
      srcTypeNode.kind === "BasicType" &&
      destTypeNode.kind === "BasicType" &&
      srcTypeNode.pointerDepth === 0 &&
      destTypeNode.pointerDepth === 0
    ) {
      // Case 1: Struct -> Primitive (Unwrap)
      if (srcType.startsWith("%struct.") && !destType.startsWith("%struct.")) {
        // We assume TypeChecker has validated that this is a valid inheritance cast
        // Extract the field corresponding to the primitive base
        const structName = srcTypeNode.name;
        const layout = this.structLayouts.get(structName);
        let baseIdx = 0;
        if (layout && layout.has("__base__")) {
          baseIdx = layout.get("__base__")!;
        }

        const extracted = this.newRegister();
        this.emit(
          `  ${extracted} = extractvalue ${srcType} ${val}, ${baseIdx}`,
        );
        return extracted;
      }

      // Case 2: Primitive -> Struct (Wrap)
      if (!srcType.startsWith("%struct.") && destType.startsWith("%struct.")) {
        // We assume TypeChecker has validated that this is a valid inheritance cast
        // Insert the primitive value into the base field
        const structName = destTypeNode.name;
        const layout = this.structLayouts.get(structName);
        let baseIdx = 0;
        if (layout && layout.has("__base__")) {
          baseIdx = layout.get("__base__")!;
        }

        let structReg = this.newRegister();
        this.emit(
          `  ${structReg} = insertvalue ${destType} undef, ${srcType} ${val}, ${baseIdx}`,
        );

        // Initialize VTable if present
        if (layout && layout.has("__vtable__")) {
          const vtableIdx = layout.get("__vtable__")!;
          const vtablePtr = this.newRegister();
          // We don't know the exact size of the vtable array here easily,
          // but we can bitcast the global directly if we know its name.
          // The global is named @StructName_vtable.
          // We can try to bitcast from [...] to i8*.
          // But we need the type.
          // Alternatively, we can look up the vtable definition if we tracked it.
          // Or we can just assume it's a pointer and we are storing it.

          // For now, let's try to find the vtable size from vtableLayouts
          const vtableEntries = this.vtableLayouts.get(structName);
          const size = vtableEntries ? vtableEntries.length : 0;

          if (size > 0) {
            this.emit(
              `  ${vtablePtr} = bitcast [${size} x i8*]* @${structName}_vtable to i8*`,
            );
            const nextStruct = this.newRegister();
            this.emit(
              `  ${nextStruct} = insertvalue ${destType} ${structReg}, i8* ${vtablePtr}, ${vtableIdx}`,
            );
            structReg = nextStruct;
          }
        }

        return structReg;
      }
    }

    const reg = this.newRegister();

    // Void pointer compatibility: i8* (void*) <-> any pointer type
    // Allow bidirectional casting between void* and any other pointer
    if (srcType === "i8*" && destType.endsWith("*")) {
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }
    if (srcType.endsWith("*") && destType === "i8*") {
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Pointer casts
    if (srcType.endsWith("*") && destType.endsWith("*")) {
      this.emit(`  ${reg} = bitcast ${srcType} ${val} to ${destType}`);
      return reg;
    }
    if (srcType.startsWith("i") && destType.endsWith("*")) {
      this.emit(`  ${reg} = inttoptr ${srcType} ${val} to ${destType}`);
      return reg;
    }
    if (srcType.endsWith("*") && destType.startsWith("i")) {
      this.emit(`  ${reg} = ptrtoint ${srcType} ${val} to ${destType}`);
      return reg;
    }

    // Float casts
    if (srcType === "double" && destType.startsWith("i")) {
      const op = this.isSigned(destTypeNode) ? "fptosi" : "fptoui";
      this.emit(`  ${reg} = ${op} double ${val} to ${destType}`);
      return reg;
    }
    if (srcType.startsWith("i") && destType === "double") {
      const op = this.isSigned(srcTypeNode) ? "sitofp" : "uitofp";
      this.emit(`  ${reg} = ${op} ${srcType} ${val} to double`);
      return reg;
    }

    // Integer casts
    if (srcType.startsWith("i") && destType.startsWith("i")) {
      const srcWidth = this.getBitWidth(srcType);
      const destWidth = this.getBitWidth(destType);

      if (srcWidth > destWidth) {
        this.emit(`  ${reg} = trunc ${srcType} ${val} to ${destType}`);
        return reg;
      } else if (srcWidth < destWidth) {
        // For implicit conversions (like literal to variable), we might not have explicit cast.
        // But here we are generating code.
        // If we are extending, we need to know if source is signed.
        // If source is a literal (e.g. -10), it might be typed as 'int' (i32) but we want to assign to 'i8'.
        // Wait, if we assign -10 (i32) to i8, that's truncation, not extension.
        // If we assign 10 (i32) to i64, that's extension.

        const op = this.isSigned(srcTypeNode) ? "sext" : "zext";
        this.emit(`  ${reg} = ${op} ${srcType} ${val} to ${destType}`);
        return reg;
      } else {
        // Widths are equal, but types might differ (e.g. i32 vs u32) - no-op in LLVM
        // But we allocated a register!
        // We should have returned earlier if srcType === destType.
        // If srcType is i32 and destType is i32, we returned.
        // If srcType is i32 and destType is u32 (which is also i32 in LLVM), we returned.
        // So this block is unreachable if widths are equal.
        // But let's be safe.
        return val;
      }
    }

    // Enum/Struct casts (e.g. Option -> Option<i32>)
    if (
      (srcType.startsWith("%enum.") || srcType.startsWith("%struct.")) &&
      (destType.startsWith("%enum.") || destType.startsWith("%struct."))
    ) {
      // Extract tag (index 0) from source
      const tag = this.newRegister();
      this.emit(`  ${tag} = extractvalue ${srcType} ${val}, 0`);

      // Create destination value with the same tag
      const destWithTag = this.newRegister();
      this.emit(
        `  ${destWithTag} = insertvalue ${destType} undef, i32 ${tag}, 0`,
      );

      return destWithTag;
    }

    throw new CompilerError(
      `Unsupported cast from ${srcType} to ${destType}`,
      "CastError",
      srcTypeNode.location,
    );
  }

  protected generateMatchExpr(expr: AST.MatchExpr): string {
    // Generate the value to match on
    const matchValue = this.generateExpression(expr.value);
    const matchType = expr.value.resolvedType as AST.BasicTypeNode;

    if (!matchType || matchType.kind !== "BasicType") {
      throw this.createError(
        "Match expression value must have a basic type",
        expr.value,
      );
    }

    // Get enum information - handle generic instantiation
    let enumName = matchType.name;

    // Substitute types in matchType if we are in a generic context
    const substitutedMatchType = this.substituteType(
      matchType,
      this.currentTypeMap,
    ) as AST.BasicTypeNode;

    // If this is a generic enum, instantiate it
    if (
      substitutedMatchType.genericArgs &&
      substitutedMatchType.genericArgs.length > 0
    ) {
      enumName = this.instantiateGenericEnum(
        matchType.name,
        substitutedMatchType.genericArgs,
      );
    }

    const variantInfo = this.enumVariants.get(enumName);

    // Handle Type Matching on Any (or other structs if we support them later)
    if (!variantInfo) {
      // Check if it's Any
      if (matchType.name === "Any") {
        return this.generateAnyMatch(expr, matchValue, matchType);
      }

      throw this.createError(
        `Cannot match on non-enum type '${matchType.name}'`,
        expr.value,
      );
    }

    // Allocate space for match value and extract discriminant
    const enumType = `%enum.${enumName}`;
    const matchPtr = this.newRegister();
    this.emit(`  ${matchPtr} = alloca ${enumType}`);
    this.emit(`  store ${enumType} ${matchValue}, ${enumType}* ${matchPtr}`);

    const tagPtr = this.newRegister();
    this.emit(
      `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${matchPtr}, i32 0, i32 0`,
    );
    const tag = this.newRegister();
    this.emit(`  ${tag} = load i32, i32* ${tagPtr}`);

    // Create labels for each arm and merge point
    const armLabels: string[] = [];
    const mergeLabel = this.newLabel("match_merge");
    const defaultLabel = this.newLabel("match_default");

    for (let i = 0; i < expr.arms.length; i++) {
      armLabels.push(this.newLabel(`match_arm${i}`));
    }

    // Build a map from variant index to first arm index for that variant
    // This avoids duplicate switch cases when multiple arms match the same variant (with guards)
    const variantToFirstArm = new Map<number, number>();

    // Generate switch statement
    const cases: string[] = [];
    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i]!;
      const pattern = arm.pattern;

      // Handle enum patterns
      if (
        pattern.kind === "PatternEnum" ||
        pattern.kind === "PatternEnumTuple" ||
        pattern.kind === "PatternEnumStruct"
      ) {
        const enumPattern = pattern as
          | AST.PatternEnum
          | AST.PatternEnumTuple
          | AST.PatternEnumStruct;
        const variant = variantInfo.get(enumPattern.variantName);
        if (variant) {
          // Only add switch case for the FIRST arm with this variant
          if (!variantToFirstArm.has(variant.index)) {
            variantToFirstArm.set(variant.index, i);
            cases.push(`i32 ${variant.index}, label %${armLabels[i]}`);
          }
        }
      } else if (pattern.kind === "PatternWildcard") {
        // Wildcard handled as default case
      }
    }

    // Emit switch
    this.emit(
      `  switch i32 ${tag}, label %${defaultLabel} [${cases.join("\n    ")}]`,
    );

    const resultType = this.resolveType(expr.resolvedType!);

    // Push new match context to stack
    this.matchStack.push({
      mergeLabel,
      resultType,
      resultTypeNode: expr.resolvedType!,
      results: [],
    });

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i]!;
      this.emit(`${armLabels[i]}:`);

      // Extract pattern bindings if this is a tuple or struct pattern
      if (arm.pattern.kind === "PatternEnumTuple") {
        this.generatePatternTupleBindings(
          arm.pattern as AST.PatternEnumTuple,
          matchPtr,
          enumType,
          variantInfo,
        );
      } else if (arm.pattern.kind === "PatternEnumStruct") {
        this.generatePatternStructBindings(
          arm.pattern as AST.PatternEnumStruct,
          matchPtr,
          enumType,
          variantInfo,
        );
      }

      // Check guard condition if present
      if (arm.guard) {
        const guardValue = this.generateExpression(arm.guard);
        const guardPassLabel = this.newLabel(`guard_pass${i}`);

        // Find next arm: try next arm with same variant first, then default
        let nextLabel = defaultLabel;
        if (i + 1 < expr.arms.length) {
          // Check if next arm is for the same variant
          const currentPattern = arm.pattern;
          const nextPattern = expr.arms[i + 1]!.pattern;

          if (
            (currentPattern.kind === "PatternEnum" ||
              currentPattern.kind === "PatternEnumTuple" ||
              currentPattern.kind === "PatternEnumStruct") &&
            (nextPattern.kind === "PatternEnum" ||
              nextPattern.kind === "PatternEnumTuple" ||
              nextPattern.kind === "PatternEnumStruct")
          ) {
            const currentVariant = (currentPattern as any).variantName;
            const nextVariant = (nextPattern as any).variantName;

            // If same variant, jump to next arm; otherwise jump to default
            if (currentVariant === nextVariant) {
              nextLabel = armLabels[i + 1]!;
            }
          }
        }

        this.emit(
          `  br i1 ${guardValue}, label %${guardPassLabel}, label %${nextLabel}`,
        );
        this.emit(`${guardPassLabel}:`);
      }

      // Generate arm body
      const armValue = this.generateMatchArmBody(arm.body);

      // If armValue is not null, it was an expression arm.
      // If it is null, it was a block arm, and generateReturn handled the result.
      if (armValue !== null) {
        const currentLabel = this.getCurrentLabel();
        this.matchStack[this.matchStack.length - 1]!.results.push({
          value: armValue,
          label: currentLabel,
          type: resultType,
        });
        this.emit(`  br label %${mergeLabel}`);
      } else {
        // Block arm - check if terminated
        const lastLine = this.output[this.output.length - 1]?.trim();
        const isTerminated =
          lastLine &&
          (lastLine.startsWith("ret ") ||
            lastLine.startsWith("br ") ||
            lastLine.startsWith("switch ") ||
            lastLine.startsWith("unreachable"));

        if (!isTerminated) {
          this.emit(`  br label %${mergeLabel}`);
        }
      }
    }

    // Default case (should not be reached if exhaustive, but needed for LLVM)
    this.emit(`${defaultLabel}:`);

    const wildcardArmIndex = expr.arms.findIndex(
      (a) => a.pattern.kind === "PatternWildcard",
    );

    if (wildcardArmIndex !== -1) {
      this.emit(`  br label %${armLabels[wildcardArmIndex]}`);
    } else {
      // Assume exhaustive match (checked by TypeChecker)
      // If we reach here, it's a runtime error or undefined behavior
      // For safety, we emit unreachable
      this.emit(`  unreachable`);
    }

    // Pop match context and generate phi
    const matchContext = this.matchStack.pop()!;
    const armResults = matchContext.results;

    this.emit(`${mergeLabel}:`);

    if (resultType === "void") {
      return "";
    }

    const result = this.newRegister();
    const phiEntries = armResults
      .map((r) => `[ ${r.value}, %${r.label} ]`)
      .join(", ");
    this.emit(`  ${result} = phi ${resultType} ${phiEntries}`);

    return result;
  }

  protected generateMatchArmBody(
    body: AST.Expression | AST.BlockStmt,
  ): string | null {
    if (body.kind === "Block") {
      // Generate block. Returns are handled by generateReturn via matchStack.
      const blockStmt = body as AST.BlockStmt;
      this.generateBlock(blockStmt);
      // Implicit return from block is not yet supported in AST
      return null;
    } else {
      // Expression - generate and return
      return this.generateExpression(body as AST.Expression);
    }
  }

  protected llvmTypeToBplType(llvmType: string): string {
    let ptrDepth = 0;
    let base = llvmType;
    while (base.endsWith("*")) {
      ptrDepth++;
      base = base.slice(0, -1);
    }

    if (base.startsWith("%struct.")) {
      base = base.substring(8);
    } else if (base.startsWith("%enum.")) {
      base = base.substring(6);
    }

    return "*".repeat(ptrDepth) + base;
  }

  protected generateAnyMatch(
    expr: AST.MatchExpr,
    matchValue: string,
    matchType: AST.BasicTypeNode,
  ): string {
    // Any struct: { type_id: u64, data: u64 }
    const anyType = `%struct.Any`;

    // Allocate space for Any value to extract fields
    const anyPtr = this.newRegister();
    this.emit(`  ${anyPtr} = alloca ${anyType}`);
    this.emit(`  store ${anyType} ${matchValue}, ${anyType}* ${anyPtr}`);

    // Extract type_id
    const typeIdPtr = this.newRegister();
    this.emit(
      `  ${typeIdPtr} = getelementptr inbounds ${anyType}, ${anyType}* ${anyPtr}, i32 0, i32 1`,
    );
    const typeId = this.newRegister();
    this.emit(`  ${typeId} = load i64, i64* ${typeIdPtr}`);

    // Extract data
    const dataPtr = this.newRegister();
    this.emit(
      `  ${dataPtr} = getelementptr inbounds ${anyType}, ${anyType}* ${anyPtr}, i32 0, i32 2`,
    );
    const data = this.newRegister();
    this.emit(`  ${data} = load i64, i64* ${dataPtr}`);

    // Create labels
    const mergeLabel = this.newLabel("match_any_merge");
    const armLabels: string[] = [];
    for (let i = 0; i < expr.arms.length; i++) {
      armLabels.push(this.newLabel(`match_any_arm${i}`));
    }
    const nextLabels: string[] = [];
    for (let i = 0; i < expr.arms.length; i++) {
      nextLabels.push(this.newLabel(`match_any_next${i}`));
    }

    const resultType = this.resolveType(expr.resolvedType!);
    this.matchStack.push({
      mergeLabel,
      results: [],
      resultType,
      resultTypeNode: expr.resolvedType!,
    });

    // Generate checks for each arm
    let currentLabel = this.newLabel("match_any_start");
    this.emit(`  br label %${currentLabel}`);
    this.emit(`${currentLabel}:`);

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i]!;
      const pattern = arm.pattern;
      const armLabel = armLabels[i]!;
      const nextLabel = nextLabels[i]!;

      if (pattern.kind === "PatternWildcard") {
        // Wildcard matches everything
        this.emit(`  br label %${armLabel}`);
      } else if (pattern.kind === "PatternEnumTuple") {
        // Type(var) pattern
        // Check type_id
        const typeName = pattern.variantName;

        // Resolve type alias to match RTTI ID generation
        const dummyType: AST.BasicTypeNode = {
          kind: "BasicType",
          name: typeName,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: expr.location,
        };
        const llvmType = this.resolveType(dummyType);
        const bplType = this.llvmTypeToBplType(llvmType);

        // We need to get the type ID for this type
        // This requires a helper to get type ID constant or hash
        const targetTypeId = this.getRttiTypeId(bplType);

        const typeCheck = this.newRegister();
        this.emit(`  ${typeCheck} = icmp eq i64 ${typeId}, ${targetTypeId}`);
        this.emit(
          `  br i1 ${typeCheck}, label %${armLabel}, label %${nextLabel}`,
        );
      } else {
        // Unsupported pattern for Any
        this.emit(`  br label %${nextLabel}`);
      }

      // Generate Arm Body
      this.emit(`${armLabel}:`);

      // Save state to handle scoping
      const savedLocalPointers = new Map(this.localPointers);
      const savedLocals = new Set(this.locals);

      // Bind variable if needed
      if (pattern.kind === "PatternEnumTuple" && pattern.bindings.length > 0) {
        const bindingName = pattern.bindings[0]!;
        const typeName = pattern.variantName;
        const bindingType = this.resolveType({
          kind: "BasicType",
          name: typeName,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: pattern.location,
        });

        // Cast data (u64) to target type
        // If target type is smaller than 64-bit, truncate
        // If target type is pointer, inttoptr
        // If target type is float/double, bitcast

        const castVal = this.newRegister();

        if (bindingType === "double") {
          this.emit(`  ${castVal} = bitcast i64 ${data} to double`);
        } else if (bindingType === "float") {
          // float is 32-bit, so we need to truncate first? Or bitcast lower 32 bits?
          // Assuming data stores bits directly.
          // For float, we might need to trunc to i32 then bitcast
          const trunc = this.newRegister();
          this.emit(`  ${trunc} = trunc i64 ${data} to i32`);
          this.emit(`  ${castVal} = bitcast i32 ${trunc} to float`);
        } else if (bindingType.endsWith("*")) {
          this.emit(`  ${castVal} = inttoptr i64 ${data} to ${bindingType}`);
        } else {
          // Integer types
          // Check size
          // For now assume int/i64
          if (bindingType === "i64" || bindingType === "u64") {
            // No cast needed, just bitcast to be safe if signedness differs in LLVM (it doesn't)
            // But we need to assign to a new register name
            this.emit(`  ${castVal} = bitcast i64 ${data} to ${bindingType}`);
          } else {
            // Truncate
            this.emit(`  ${castVal} = trunc i64 ${data} to ${bindingType}`);
          }
        }

        // Store in variable
        const varAddr = this.allocateStack(bindingName, bindingType);
        this.emit(
          `  store ${bindingType} ${castVal}, ${bindingType}* ${varAddr}`,
        );
      }

      const result = this.generateMatchArmBody(arm.body);

      // Restore state
      this.localPointers = savedLocalPointers;
      this.locals = savedLocals;

      // Handle result
      if (result !== null) {
        const currentLabel = this.getCurrentLabel();
        this.matchStack[this.matchStack.length - 1]!.results.push({
          value: result,
          label: currentLabel,
          type: resultType,
        });
        this.emit(`  br label %${mergeLabel}`);
      } else if (
        !this.isTerminator(this.output[this.output.length - 1] || "")
      ) {
        // If block didn't return, jump to merge (for void)
        this.emit(`  br label %${mergeLabel}`);
      }

      // Start next block
      this.emit(`${nextLabel}:`);
    }

    // If we fall through all checks (no match), it's a runtime error or unreachable if exhaustive
    this.emit(`  unreachable`);

    const matchContext = this.matchStack.pop()!;
    const armResults = matchContext.results;

    this.emit(`${mergeLabel}:`);

    if (resultType === "void") {
      return "";
    }

    const resultReg = this.newRegister();
    if (armResults.length > 0) {
      const phiEntries = armResults
        .map((r) => `[ ${r.value}, %${r.label} ]`)
        .join(", ");
      this.emit(`  ${resultReg} = phi ${resultType} ${phiEntries}`);
    } else {
      this.emit(`  ${resultReg} = undef`);
    }

    return resultReg;
  }

  // Helper to get type ID (hash of type name)
  // This should match how Any is constructed
  protected getRttiTypeId(typeName: string): string {
    return RTTI.getTypeIdFromName(typeName).toString();
  }

  protected generateTypeMatch(expr: AST.TypeMatchExpr): string {
    // Generate code for match<Type>(value)
    // This checks:
    // 1. If enum value is of a specific variant: match<Option.Some>(opt)
    // 2. If value matches a specific type: match<int>(arg) in generic context

    // The value should be an expression
    if (!("kind" in expr.value) || (expr.value as any).kind === "BasicType") {
      throw this.createError(
        "TypeMatch value must be an expression",
        expr as any,
      );
    }

    const valueExpr = expr.value as AST.Expression;
    const matchValue = this.generateExpression(valueExpr);
    const valueType = valueExpr.resolvedType;

    if (!valueType) {
      throw this.createError("TypeMatch value has no resolved type", valueExpr);
    }

    const targetType = expr.targetType as AST.BasicTypeNode;
    const fullTypeName = targetType.name;

    // Check if this is an enum variant pattern (contains a dot)
    if (fullTypeName.includes(".")) {
      return this.generateEnumVariantTypeMatch(
        matchValue,
        valueType as AST.BasicTypeNode,
        fullTypeName,
        expr,
      );
    } else {
      // Regular type checking for non-enum types
      return this.generateRegularTypeMatch(
        matchValue,
        valueType,
        targetType,
        expr,
      );
    }
  }

  protected generateEnumVariantTypeMatch(
    matchValue: string,
    valueType: AST.BasicTypeNode,
    fullTypeName: string,
    expr: AST.TypeMatchExpr,
  ): string {
    // Split enum name and variant name
    const parts = fullTypeName.split(".");
    const enumName = parts[0]!;
    const variantName = parts.slice(1).join("."); // Handle nested dots if any

    // Substitute types in valueType if we are in a generic context
    const substitutedValueType = this.substituteType(
      valueType,
      this.currentTypeMap,
    ) as AST.BasicTypeNode;

    // Get enum information - handle generic instantiation
    let resolvedEnumName = enumName;
    if (
      substitutedValueType.genericArgs &&
      substitutedValueType.genericArgs.length > 0
    ) {
      resolvedEnumName = this.instantiateGenericEnum(
        enumName,
        substitutedValueType.genericArgs,
      );
    }

    const variantInfo = this.enumVariants.get(resolvedEnumName);
    if (!variantInfo) {
      throw this.createError(`Cannot find enum '${enumName}'`, expr as any);
    }

    const variant = variantInfo.get(variantName);
    if (!variant) {
      throw this.createError(
        `Cannot find variant '${variantName}' in enum '${enumName}'`,
        expr as any,
      );
    }

    // Allocate space for the enum value and extract discriminant
    const enumType = `%enum.${resolvedEnumName}`;
    const matchPtr = this.newRegister();
    this.emit(`  ${matchPtr} = alloca ${enumType}`);
    this.emit(`  store ${enumType} ${matchValue}, ${enumType}* ${matchPtr}`);

    const tagPtr = this.newRegister();
    this.emit(
      `  ${tagPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${matchPtr}, i32 0, i32 0`,
    );
    const tag = this.newRegister();
    this.emit(`  ${tag} = load i32, i32* ${tagPtr}`);

    // Compare tag with variant index
    const result = this.newRegister();
    this.emit(`  ${result} = icmp eq i32 ${tag}, ${variant.index}`);

    return result;
  }

  protected resolveCanonicalType(type: AST.TypeNode): AST.TypeNode {
    // 1. Substitute generics
    const substituted = this.substituteType(type, this.currentTypeMap);

    // 2. Resolve aliases
    if (substituted.kind === "BasicType") {
      if (this.typeAliasMap.has(substituted.name)) {
        const alias = this.typeAliasMap.get(substituted.name)!;
        if (
          alias.genericParams.length > 0 &&
          substituted.genericArgs.length > 0
        ) {
          const typeMap = new Map<string, AST.TypeNode>();
          for (let i = 0; i < alias.genericParams.length; i++) {
            if (i < substituted.genericArgs.length) {
              typeMap.set(
                alias.genericParams[i]!.name,
                substituted.genericArgs[i]!,
              );
            }
          }
          const aliasSubstituted = this.substituteType(alias.type, typeMap);
          return this.resolveCanonicalType(aliasSubstituted);
        } else if (alias.genericParams.length === 0) {
          return this.resolveCanonicalType(alias.type);
        }
      }
    }
    return substituted;
  }

  protected getCanonicalPrimitiveName(name: string): string {
    switch (name) {
      case "int":
        return "i32";
      case "i32":
        return "i32";
      case "uint":
        return "u32";
      case "u32":
        return "u32";
      case "long":
        return "i64";
      case "i64":
        return "i64";
      case "ulong":
        return "u64";
      case "u64":
        return "u64";
      case "short":
        return "i16";
      case "i16":
        return "i16";
      case "ushort":
        return "u16";
      case "u16":
        return "u16";
      case "char":
        return "i8";
      case "uchar":
        return "u8";
      case "u8":
        return "u8";
      case "i8":
        return "i8";
      case "bool":
        return "bool";
      case "i1":
        return "bool";
      default:
        return name;
    }
  }

  protected areTypesSemanticallyEqual(
    t1: AST.TypeNode,
    t2: AST.TypeNode,
  ): boolean {
    const ct1 = this.resolveCanonicalType(t1);
    const ct2 = this.resolveCanonicalType(t2);

    if (ct1.kind !== ct2.kind) return false;

    if (ct1.kind === "BasicType" && ct2.kind === "BasicType") {
      const name1 = this.getCanonicalPrimitiveName(ct1.name);
      const name2 = this.getCanonicalPrimitiveName(ct2.name);
      if (name1 !== name2) return false;
      if (ct1.pointerDepth !== ct2.pointerDepth) return false;
      if (ct1.arrayDimensions.length !== ct2.arrayDimensions.length)
        return false;
      for (let i = 0; i < ct1.arrayDimensions.length; i++) {
        if (ct1.arrayDimensions[i] !== ct2.arrayDimensions[i]) return false;
      }
      if (ct1.genericArgs.length !== ct2.genericArgs.length) return false;
      for (let i = 0; i < ct1.genericArgs.length; i++) {
        if (
          !this.areTypesSemanticallyEqual(
            ct1.genericArgs[i]!,
            ct2.genericArgs[i]!,
          )
        )
          return false;
      }
      return true;
    }

    if (ct1.kind === "FunctionType" && ct2.kind === "FunctionType") {
      if (!this.areTypesSemanticallyEqual(ct1.returnType, ct2.returnType))
        return false;
      if (ct1.paramTypes.length !== ct2.paramTypes.length) return false;
      for (let i = 0; i < ct1.paramTypes.length; i++) {
        if (
          !this.areTypesSemanticallyEqual(
            ct1.paramTypes[i]!,
            ct2.paramTypes[i]!,
          )
        )
          return false;
      }
      return true;
    }

    if (ct1.kind === "TupleType" && ct2.kind === "TupleType") {
      if (ct1.types.length !== ct2.types.length) return false;
      for (let i = 0; i < ct1.types.length; i++) {
        if (!this.areTypesSemanticallyEqual(ct1.types[i]!, ct2.types[i]!))
          return false;
      }
      return true;
    }

    return false;
  }

  protected generateRegularTypeMatch(
    matchValue: string,
    valueType: AST.TypeNode,
    targetType: AST.BasicTypeNode,
    expr: AST.TypeMatchExpr,
  ): string {
    // Check if valueType is Any or *Any
    const canonVal = this.resolveCanonicalType(valueType);
    let isAny = false;
    let isPtrAny = false;

    if (canonVal.kind === "BasicType" && canonVal.name === "Any") {
      if (canonVal.pointerDepth === 0) isAny = true;
      else if (canonVal.pointerDepth === 1) isPtrAny = true;
    }

    if (isAny || isPtrAny) {
      // Generate runtime check
      // 1. Get type_id from Any
      let typeIdVal = "";
      if (isAny) {
        // Extract from struct
        // Any layout: { base, type_id, data } -> index 1
        // We assume Any has Type as base, so type_id is at index 1
        const typeIdReg = this.newRegister();
        this.emit(`  ${typeIdReg} = extractvalue %struct.Any ${matchValue}, 1`);
        typeIdVal = typeIdReg;
      } else {
        // Load from pointer
        // getelementptr %struct.Any, %struct.Any* %ptr, i32 0, i32 1
        const typeIdPtr = this.newRegister();
        this.emit(
          `  ${typeIdPtr} = getelementptr inbounds %struct.Any, %struct.Any* ${matchValue}, i32 0, i32 1`,
        );
        const typeIdReg = this.newRegister();
        this.emit(`  ${typeIdReg} = load i64, i64* ${typeIdPtr}`);
        typeIdVal = typeIdReg;
      }

      // 2. Get target type ID
      const targetTypeId = RTTI.getTypeId(targetType);

      // 3. Compare
      const result = this.newRegister();
      this.emit(`  ${result} = icmp eq i64 ${typeIdVal}, ${targetTypeId}`);
      return result;
    }

    // For regular type matching, compare the resolved LLVM types
    // Since generics are monomorphized, we know the concrete types at compile time.

    // Check semantic equality instead of LLVM type equality
    if (this.areTypesSemanticallyEqual(valueType, targetType)) {
      const result = this.newRegister();
      this.emit(`  ${result} = icmp eq i1 1, 1`);
      return result;
    }

    const canonicalValue = this.resolveCanonicalType(valueType);
    const canonicalTarget = this.resolveCanonicalType(targetType);

    // Inheritance checking
    if (
      canonicalValue.kind === "BasicType" &&
      canonicalTarget.kind === "BasicType"
    ) {
      const valueBasic = canonicalValue as AST.BasicTypeNode;
      const targetBasic = canonicalTarget as AST.BasicTypeNode;

      // Only check inheritance if pointer depth matches
      if (valueBasic.pointerDepth === targetBasic.pointerDepth) {
        if (this.checkInheritance(valueBasic.name, targetBasic.name)) {
          const result = this.newRegister();
          this.emit(`  ${result} = icmp eq i1 1, 1`);
          return result;
        }
      }
    }

    const result = this.newRegister();
    this.emit(`  ${result} = icmp eq i1 0, 1`);
    return result;
  }

  protected generateIs(expr: AST.IsExpr): string {
    const typeMatchExpr: AST.TypeMatchExpr = {
      kind: "TypeMatch",
      targetType: expr.type,
      value: expr.expression,
      location: expr.location,
    };
    return this.generateTypeMatch(typeMatchExpr);
  }

  protected generateAs(expr: AST.AsExpr): string {
    const castExpr: AST.CastExpr = {
      kind: "Cast",
      targetType: expr.type,
      expression: expr.expression,
      location: expr.location,
    };
    return this.generateCast(castExpr);
  }

  protected generatePatternTupleBindings(
    pattern: AST.PatternEnumTuple,
    matchPtr: string,
    enumType: string,
    variantInfo: Map<string, { index: number; dataType?: AST.EnumVariantData }>,
  ): void {
    const variant = variantInfo.get(pattern.variantName);
    if (
      !variant ||
      !variant.dataType ||
      variant.dataType.kind !== "EnumVariantTuple"
    ) {
      return; // No data to extract
    }

    // Get pointer to data field (index 1) - this is an array of bytes
    const dataPtr = this.newRegister();
    this.emit(
      `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${matchPtr}, i32 0, i32 1`,
    );

    // Get enum name from type (strip "%enum." prefix)
    const enumName = enumType.substring(6);
    const dataArraySize = this.enumDataSizes.get(enumName) || 64;

    // Cast to i8* for easier manipulation
    const bytePtr = this.newRegister();
    this.emit(
      `  ${bytePtr} = bitcast [${dataArraySize} x i8]* ${dataPtr} to i8*`,
    );

    // For each binding, extract the value from the data array with proper byte offsets
    let byteOffset = 0;
    for (let i = 0; i < pattern.bindings.length; i++) {
      const bindingName = pattern.bindings[i]!;
      const bindingType = variant.dataType.types[i]!;
      const llvmType = this.resolveType(bindingType);
      const typeSize = this.getTypeSize(llvmType);

      // Align the offset based on type size
      const alignment =
        typeSize >= 8 ? 8 : typeSize >= 4 ? 4 : typeSize >= 2 ? 2 : 1;
      if (byteOffset % alignment !== 0) {
        byteOffset = Math.ceil(byteOffset / alignment) * alignment;
      }

      // Skip wildcard bindings (but still account for offset)
      if (bindingName === "_") {
        byteOffset += typeSize;
        continue;
      }

      // Get pointer at the correct byte offset
      let elementPtr: string;
      if (byteOffset === 0) {
        elementPtr = this.newRegister();
        this.emit(`  ${elementPtr} = bitcast i8* ${bytePtr} to ${llvmType}*`);
      } else {
        const offsetPtr = this.newRegister();
        this.emit(
          `  ${offsetPtr} = getelementptr i8, i8* ${bytePtr}, i32 ${byteOffset}`,
        );
        elementPtr = this.newRegister();
        this.emit(`  ${elementPtr} = bitcast i8* ${offsetPtr} to ${llvmType}*`);
      }

      // Load the value
      const value = this.newRegister();
      this.emit(`  ${value} = load ${llvmType}, ${llvmType}* ${elementPtr}`);

      // Allocate stack space and store the value
      const ptr = `%pattern_${bindingName}_${this.stackAllocCount++}`;
      this.emit(`  ${ptr} = alloca ${llvmType}`);
      this.emit(`  store ${llvmType} ${value}, ${llvmType}* ${ptr}`);

      // Register the binding so it can be used in the arm body
      this.locals.add(bindingName);
      this.localPointers.set(bindingName, ptr);

      byteOffset += typeSize;
    }
  }

  protected generatePatternStructBindings(
    pattern: AST.PatternEnumStruct,
    matchPtr: string,
    enumType: string,
    variantInfo: Map<string, { index: number; dataType?: AST.EnumVariantData }>,
  ): void {
    const variant = variantInfo.get(pattern.variantName);
    if (
      !variant ||
      !variant.dataType ||
      variant.dataType.kind !== "EnumVariantStruct"
    ) {
      return; // No data to extract
    }

    // Get pointer to data field (index 1)
    const dataPtr = this.newRegister();
    this.emit(
      `  ${dataPtr} = getelementptr inbounds ${enumType}, ${enumType}* ${matchPtr}, i32 0, i32 1`,
    );

    // For each field binding, extract the value
    for (const field of pattern.fields) {
      const bindingName = field.binding;

      // Skip wildcard bindings
      if (bindingName === "_") {
        continue;
      }

      // Find the field in the variant
      const fieldIndex = variant.dataType.fields.findIndex(
        (f) => f.name === field.fieldName,
      );
      if (fieldIndex === -1) {
        continue;
      }

      const fieldType = variant.dataType.fields[fieldIndex]!.type;
      const llvmType = this.resolveType(fieldType);

      // Cast the data pointer to i8* to work with byte offsets
      const bytePtr = this.newRegister();
      this.emit(
        `  ${bytePtr} = bitcast [${
          this.structLayouts.get(enumType.substring(6))?.get("__data__") || 0
        } x i8]* ${dataPtr} to i8*`,
      );

      // Cast to the field type pointer
      const fieldPtr = this.newRegister();
      this.emit(`  ${fieldPtr} = bitcast i8* ${bytePtr} to ${llvmType}*`);

      // If this is not the first field, offset the pointer
      let targetPtr = fieldPtr;
      if (fieldIndex > 0) {
        targetPtr = this.newRegister();
        this.emit(
          `  ${targetPtr} = getelementptr ${llvmType}, ${llvmType}* ${fieldPtr}, i32 ${fieldIndex}`,
        );
      }

      // Load the value
      const value = this.newRegister();
      this.emit(`  ${value} = load ${llvmType}, ${llvmType}* ${targetPtr}`);

      // Allocate stack space and store the value
      const ptr = `%pattern_${bindingName}_${this.stackAllocCount++}`;
      this.emit(`  ${ptr} = alloca ${llvmType}`);
      this.emit(`  store ${llvmType} ${value}, ${llvmType}* ${ptr}`);

      // Register the binding so it can be used in the arm body
      this.locals.add(bindingName);
      this.localPointers.set(bindingName, ptr);
    }
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
    let layout = this.structLayouts.get(structName);
    if (!layout) {
      // Maybe we haven't generated the layout yet?
      // generateStructLiteral should happen inside a function, so types should be resolved.
      throw new CompilerError(
        `Layout for struct ${structName} not found`,
        "Internal compiler error: struct layout missing.",
        expr.location,
      );
    }

    const fieldValues = new Map<string, AST.Expression>();
    for (const field of expr.fields) {
      fieldValues.set(field.name, field.value);
    }

    const sortedFields = Array.from(layout.entries()).sort(
      (a, b) => a[1] - b[1],
    );

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

      const valExpr = fieldValues.get(fieldName);
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

        const nextVal = this.newRegister();
        this.emit(
          `  ${nextVal} = insertvalue ${type} ${structVal}, ${fieldType} ${val}, ${fieldIndex}`,
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

    const enumDecl = enumVariantInfo.enumDecl as AST.EnumDecl;
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

      // Store each field in sequence in the data array
      for (let i = 0; i < expr.fields.length; i++) {
        const field = expr.fields[i]!;
        const fieldValue = this.generateExpression(field.value);
        const fieldType = this.resolveType(field.value.resolvedType!);

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

        // Cast data pointer to the field type
        const typedPtr = this.newRegister();
        this.emit(
          `  ${typedPtr} = bitcast [${this.getTypeSize(
            fieldType,
          )} x i8]* ${dataPtr} to ${fieldType}*`,
        );

        // If there are multiple fields, we need to offset the pointer
        let storePtr = typedPtr;
        if (fieldIndex > 0) {
          storePtr = this.newRegister();
          this.emit(
            `  ${storePtr} = getelementptr ${fieldType}, ${fieldType}* ${typedPtr}, i32 ${fieldIndex}`,
          );
        }

        // Store the value
        this.emit(
          `  store ${fieldType} ${fieldValue}, ${fieldType}* ${storePtr}`,
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
    if ("kind" in expr.target && (expr.target.kind as string) !== "BasicType") {
      type = (expr.target as AST.Expression).resolvedType!;
    } else {
      type = expr.target as AST.TypeNode;
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
}
