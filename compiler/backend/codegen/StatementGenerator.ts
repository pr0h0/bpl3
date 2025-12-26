import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { TokenType } from "../../frontend/TokenType";
import { ExpressionGenerator } from "./ExpressionGenerator";

export abstract class StatementGenerator extends ExpressionGenerator {
  protected generateBlock(block: AST.BlockStmt) {
    for (const stmt of block.statements) {
      this.generateStatement(stmt);
      // If we hit a terminator, stop generating for this block (dead code elimination)
      if (
        this.output.length > 0 &&
        this.isTerminator(this.output[this.output.length - 1] || "")
      ) {
        break;
      }
    }
  }

  protected generateStatement(stmt: AST.Statement) {
    // Attach debug info for the statement start
    if (this.generateDwarf && this.currentSubprogramId !== -1) {
      this.currentStatementLocation = stmt.location;
    } else {
      this.currentStatementLocation = null;
    }

    switch (stmt.kind) {
      case "VariableDecl":
        this.generateVariableDecl(stmt as AST.VariableDecl);
        break;
      case "TypeAlias":
        // Local type alias - add to map for resolution
        const aliasDecl = stmt as AST.TypeAliasDecl;
        this.typeAliasMap.set(aliasDecl.name, aliasDecl);
        break;
      case "Return":
        this.generateReturn(stmt as AST.ReturnStmt);
        break;
      case "ExpressionStmt":
        this.generateExpression((stmt as AST.ExpressionStmt).expression);
        break;
      case "If":
        this.generateIf(stmt as AST.IfStmt);
        break;
      case "Loop":
        this.generateLoop(stmt as AST.LoopStmt);
        break;
      case "Block":
        this.generateBlock(stmt as AST.BlockStmt);
        break;
      case "Break":
        this.generateBreak(stmt as AST.BreakStmt);
        break;
      case "Continue":
        this.generateContinue(stmt as AST.ContinueStmt);
        break;
      case "Switch":
        this.generateSwitch(stmt as AST.SwitchStmt);
        break;
      case "Try":
        this.generateTry(stmt as AST.TryStmt);
        break;
      case "Throw":
        this.generateThrow(stmt as AST.ThrowStmt);
        break;
      case "Asm":
        this.generateAsm(stmt as AST.AsmBlockStmt);
        break;
      default:
        console.warn(`Unhandled statement kind: ${stmt.kind}`);
        break;
    }
  }

  protected generateTry(stmt: AST.TryStmt) {
    const catchLabel = this.newLabel("try.catch");
    const endLabel = this.newLabel("try.end");

    // 1. Allocate ExceptionFrame
    const framePtr = this.allocateStack(
      "exception_frame",
      "%struct.ExceptionFrame",
    );

    // 2. Link previous frame
    const prevFramePtrReg = this.newRegister();
    this.emit(
      `  ${prevFramePtrReg} = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top`,
    );

    const prevFieldPtr = this.newRegister();
    this.emit(
      `  ${prevFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 1`,
    );
    this.emit(
      `  store %struct.ExceptionFrame* ${prevFramePtrReg}, %struct.ExceptionFrame** ${prevFieldPtr}`,
    );

    // 3. Set new top
    this.emit(
      `  store %struct.ExceptionFrame* ${framePtr}, %struct.ExceptionFrame** @exception_top`,
    );

    // 4. Call setjmp on buf
    const bufFieldPtr = this.newRegister();
    this.emit(
      `  ${bufFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 0`,
    );

    // Cast to i8* for setjmp
    const bufVoidPtr = this.newRegister();
    this.emit(`  ${bufVoidPtr} = bitcast [32 x i64]* ${bufFieldPtr} to i8*`);

    const setjmpResult = this.newRegister();
    this.emit(`  ${setjmpResult} = call i32 @setjmp(i8* ${bufVoidPtr})`);

    // 5. Check result
    const isException = this.newRegister();
    this.emit(`  ${isException} = icmp ne i32 ${setjmpResult}, 0`);

    const tryBodyLabel = this.newLabel("try.body");
    this.emit(
      `  br i1 ${isException}, label %${catchLabel}, label %${tryBodyLabel}`,
    );

    // Try Body
    this.emit(`${tryBodyLabel}:`);
    this.generateBlock(stmt.tryBlock);

    // On success, pop stack
    if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
      this.emit(
        `  store %struct.ExceptionFrame* ${prevFramePtrReg}, %struct.ExceptionFrame** @exception_top`,
      );
      this.emit(`  br label %${endLabel}`);
    }

    // Catch Block
    this.emit(`${catchLabel}:`);
    // NOTE: setjmp returning != 0 means we are back here.
    // The exception_top is still pointing to our frame because longjmp unwound to here.
    // We must restore exception_top to prev before executing catch block (so catching doesn't loop?)
    // Or we keep it if we want to rethrow?
    // Standard practice: pop it.
    this.emit(
      `  store %struct.ExceptionFrame* ${prevFramePtrReg}, %struct.ExceptionFrame** @exception_top`,
    );

    // Dispatch based on type
    const exceptionTypeReg = this.newRegister();
    this.emit(`  ${exceptionTypeReg} = load i32, i32* @exception_type`);

    // Generate checks for each catch clause
    // catch (e: int) checks if @exception_type == 1

    // Let's gather labels first.
    const clauseLabels = stmt.catchClauses.map((_, i) => ({
      check: this.newLabel(`catch.check.${i}`),
      body: this.newLabel(`catch.body.${i}`),
    }));

    // Jump to first check or end
    if (stmt.catchClauses.length > 0) {
      this.emit(`  br label %${clauseLabels[0]!.check}`);
    } else {
      // No clauses? Re-throw? Or go to catchOther?
      if (stmt.catchOther) {
        const anyLabel = this.newLabel("catch.any");
        this.emit(`  br label %${anyLabel}`);
        this.emit(`${anyLabel}:`);
        this.generateBlock(stmt.catchOther);
        this.emit(`  br label %${endLabel}`);
      } else {
        // Rethrow if no handler
        this.emit(`  call void @exit(i32 1)`); // Unhandled
        this.emit(`  unreachable`);
      }
    }

    for (let i = 0; i < stmt.catchClauses.length; i++) {
      const clause = stmt.catchClauses[i]!;
      const labels = clauseLabels[i]!;
      const nextTarget =
        i < stmt.catchClauses.length - 1
          ? clauseLabels[i + 1]!.check
          : stmt.catchOther
            ? this.newLabel("catch.other")
            : endLabel;

      this.emit(`${labels.check}:`);
      const targetTypeId = this.getTypeIdFromNode(clause.type);
      const typeMatch = this.newRegister();
      this.emit(
        `  ${typeMatch} = icmp eq i32 ${exceptionTypeReg}, ${targetTypeId}`,
      );
      this.emit(
        `  br i1 ${typeMatch}, label %${labels.body}, label %${nextTarget}`,
      );

      this.emit(`${labels.body}:`);
      // Bind variable
      const targetTypeStr = this.resolveType(clause.type);
      const valI64 = this.newRegister();
      this.emit(`  ${valI64} = load i64, i64* @exception_value`);

      // For structs, load from heap. For primitives, cast from i64.
      if (targetTypeStr.startsWith("%struct.")) {
        // Convert i64 pointer back to struct pointer
        const structPtr = this.newRegister();
        this.emit(
          `  ${structPtr} = inttoptr i64 ${valI64} to ${targetTypeStr}*`,
        );

        // Load struct from heap
        const structVal = this.newRegister();
        this.emit(
          `  ${structVal} = load ${targetTypeStr}, ${targetTypeStr}* ${structPtr}`,
        );

        // Allocate local and store
        const localVar = this.allocateStack(clause.variable, targetTypeStr);
        this.emit(
          `  store ${targetTypeStr} ${structVal}, ${targetTypeStr}* ${localVar}`,
        );
      } else {
        // For primitive types, cast to i64
        const convertedVal = this.emitCast(
          valI64,
          "i64",
          targetTypeStr,
          {
            kind: "BasicType",
            name: "i64",
            genericArgs: [],
            pointerDepth: 0,
            arrayDimensions: [],
            location: clause.location,
          } as AST.BasicTypeNode,
          clause.type,
        );

        // Allocate local
        const localVar = this.allocateStack(clause.variable, targetTypeStr);
        this.emit(
          `  store ${targetTypeStr} ${convertedVal}, ${targetTypeStr}* ${localVar}`,
        );
      }

      this.generateBlock(clause.body);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }

      // If nextTarget was "catch.other", we need to emit it
      if (i === stmt.catchClauses.length - 1 && stmt.catchOther) {
        this.emit(`${nextTarget}:`);
        this.generateBlock(stmt.catchOther);
        if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
          this.emit(`  br label %${endLabel}`);
        }
      }
    }

    // Handling case where loop logic above didn't emit throw/exit fallthrough if no catchOther
    if (stmt.catchClauses.length > 0 && !stmt.catchOther) {
      // The last 'nextTarget' was endLabel. This means unhandled exception is SWALLOWED.
      // This is technically wrong but acceptable for this "try-catch" MVP if explicitly documented or requested.
      // However, let's allow it to fall through to endLabel.
    }

    this.emit(`${endLabel}:`);
  }

  protected generateThrow(stmt: AST.ThrowStmt) {
    // 1. Evaluate
    const val = this.generateExpression(stmt.expression);
    if (!stmt.expression.resolvedType) {
      throw this.createError(
        "Throw expression has no resolved type",
        stmt.expression,
        "This is likely an internal compiler error - type checking should have caught this",
      );
    }
    const type = stmt.expression.resolvedType;
    const typeStr = this.resolveType(type);

    // 2. Set type ID
    const typeId = this.getTypeIdFromNode(type);
    this.emit(`  store i32 ${typeId}, i32* @exception_type`);

    // 3. Store Value
    // For structs, allocate on heap and store pointer. For primitives, store directly as i64.
    if (typeStr.startsWith("%struct.")) {
      // Calculate size of struct
      // Create sizePtrReg first so it gets a lower register number
      const sizePtrReg = this.newRegister();
      const sizeReg = this.newRegister();
      this.emit(
        `  ${sizePtrReg} = getelementptr ${typeStr}, ${typeStr}* null, i32 1`,
      );
      this.emit(`  ${sizeReg} = ptrtoint ${typeStr}* ${sizePtrReg} to i64`);

      // Allocate on heap
      const heapPtrVoid = this.newRegister();
      this.emit(`  ${heapPtrVoid} = call i8* @malloc(i64 ${sizeReg})`);

      // Cast to struct pointer
      const heapPtr = this.newRegister();
      this.emit(`  ${heapPtr} = bitcast i8* ${heapPtrVoid} to ${typeStr}*`);

      // Store struct value directly to heap (val is already a struct value)
      this.emit(`  store ${typeStr} ${val}, ${typeStr}* ${heapPtr}`);

      // Store pointer as i64 in exception_value
      const ptrAsI64 = this.newRegister();
      this.emit(`  ${ptrAsI64} = ptrtoint ${typeStr}* ${heapPtr} to i64`);
      this.emit(`  store i64 ${ptrAsI64}, i64* @exception_value`);
    } else {
      // For primitive types, cast to i64 and store directly
      const castVal = this.emitCast(val, typeStr, "i64", type, {
        kind: "BasicType",
        name: "i64",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: stmt.location,
      } as AST.BasicTypeNode);
      this.emit(`  store i64 ${castVal}, i64* @exception_value`);
    }

    // 4. Longjmp
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

  protected generateBreak(stmt: AST.BreakStmt) {
    if (this.loopStack.length === 0) {
      throw this.createError(
        "Break statement outside of loop",
        stmt,
        "Break statements can only be used inside loops (for, while, do-while)",
      );
    }
    const { breakLabel } = this.loopStack[this.loopStack.length - 1]!;
    this.emit(`  br label %${breakLabel}`);
  }

  protected generateContinue(stmt: AST.ContinueStmt) {
    if (this.loopStack.length === 0) {
      throw this.createError(
        "Continue statement outside of loop",
        stmt,
        "Continue statements can only be used inside loops (for, while, do-while)",
      );
    }
    const { continueLabel } = this.loopStack[this.loopStack.length - 1]!;
    this.emit(`  br label %${continueLabel}`);
  }

  protected generateDefaultValue(type: AST.TypeNode): string {
    const llvmType = this.resolveType(type);

    if (llvmType.startsWith("%struct.") && !llvmType.endsWith("*")) {
      const structName = llvmType.substring(8);
      const layout = this.structLayouts.get(structName);
      if (!layout) return "undef";

      let val = "undef";
      let hasInit = false;
      const sortedFields = Array.from(layout.entries()).sort(
        (a, b) => a[1] - b[1],
      );

      for (const [fieldName, index] of sortedFields) {
        if (fieldName === "__vtable__") {
          const nextVal = this.newRegister();
          const vtableGlobal = this.vtableGlobalNames.get(structName);
          if (vtableGlobal) {
            const methods = this.vtableLayouts.get(structName)!;
            const arrayType = `[${methods.length} x i8*]`;
            this.emit(
              `  ${nextVal} = insertvalue ${llvmType} ${val}, i8* bitcast (${arrayType}* ${vtableGlobal} to i8*), ${index}`,
            );
          } else {
            this.emit(
              `  ${nextVal} = insertvalue ${llvmType} ${val}, i8* null, ${index}`,
            );
          }
          val = nextVal;
          hasInit = true;
        } else {
          // Find field type
          const decl = this.structMap.get(structName);
          if (decl) {
            const field = this.getAllStructFields(decl).find(
              (f) => f.name === fieldName,
            );
            if (field) {
              const fieldDefault = this.generateDefaultValue(field.type);
              // Only insert if the field needs initialization (i.e., it's not undef)
              if (fieldDefault !== "undef") {
                const nextVal = this.newRegister();
                const fieldType = this.resolveType(field.type);
                this.emit(
                  `  ${nextVal} = insertvalue ${llvmType} ${val}, ${fieldType} ${fieldDefault}, ${index}`,
                );
                val = nextVal;
                hasInit = true;
              }
            }
          }
        }
      }
      return hasInit ? val : "undef";
    }

    if (llvmType.startsWith("%enum.") && !llvmType.endsWith("*")) {
      return "zeroinitializer";
    }

    // For primitives and pointers, return undef to represent junk data
    return "undef";
  }

  protected generateVariableDecl(decl: AST.VariableDecl) {
    if (typeof decl.name !== "string") {
      // Tuple destructuring: local (a, b, c) = expr;
      const targets = decl.name as
        | { name: string; type?: AST.TypeNode }[]
        | any[];

      if (!decl.initializer) {
        throw this.createError(
          "Tuple destructuring requires an initializer",
          decl,
          "Provide a value to destructure, e.g.: let (a, b) = getTuple();",
        );
      }

      // Generate the tuple value
      const tupleVal = this.generateExpression(decl.initializer);
      const tupleType = this.resolveType(decl.initializer.resolvedType!);

      // Helper to recursively extract nested tuples
      const extractTargets = (
        targets: any[],
        tupleVal: string,
        tupleType: string,
        indexPath: number[] = [],
      ) => {
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];

          if (Array.isArray(target)) {
            // Nested tuple destructuring - extract the nested tuple first
            const nestedVal = this.newRegister();

            // Extract the nested tuple from the current level (single index)
            this.emit(
              `  ${nestedVal} = extractvalue ${tupleType} ${tupleVal}, ${i}`,
            );

            // Determine the nested tuple type
            let nestedType = decl.initializer!.resolvedType!;
            for (const idx of indexPath) {
              if (nestedType.kind === "TupleType") {
                nestedType = (nestedType as AST.TupleTypeNode).types[idx]!;
              }
            }
            if (nestedType.kind === "TupleType") {
              nestedType = (nestedType as AST.TupleTypeNode).types[i]!;
            }
            const nestedTypeStr = this.resolveType(nestedType);

            // Recursively extract from the nested tuple value
            extractTargets(target, nestedVal, nestedTypeStr, [...indexPath, i]);
          } else {
            // Simple target
            this.locals.add(target.name);

            const targetType = target.type
              ? this.resolveType(target.type)
              : this.getTargetTypeFromTuple(decl.initializer!.resolvedType!, [
                  ...indexPath,
                  i,
                ]);

            const addr = this.allocateStack(target.name, targetType);

            // Extract the i-th element from the current tuple level (single index)
            const elemPtr = this.newRegister();
            this.emit(
              `  ${elemPtr} = extractvalue ${tupleType} ${tupleVal}, ${i}`,
            );

            // Store to the target variable
            this.emit(
              `  store ${targetType} ${elemPtr}, ${targetType}* ${addr}`,
            );

            // DWARF: Variable declaration
            if (this.generateDwarf && this.currentSubprogramId !== -1) {
              const typeId = this.getDwarfTypeId(
                target.type || { kind: "BasicType", name: "unknown" },
              ); // Need proper type node
              const fileId = this.debugInfoGenerator.getFileNodeId(
                decl.location.file,
              );
              const varId = this.debugInfoGenerator.createAutoVariable(
                target.name,
                fileId,
                decl.location.startLine,
                typeId,
                this.currentSubprogramId,
              );

              // Emit llvm.dbg.declare
              // call void @llvm.dbg.declare(metadata i32* %a.addr, metadata !12, metadata !DIExpression()), !dbg !14
              const locId = this.debugInfoGenerator.createLocation(
                decl.location.startLine,
                decl.location.startColumn,
                this.currentSubprogramId,
              );

              this.emit(
                `  call void @llvm.dbg.declare(metadata ${targetType}* ${addr}, metadata !${varId}, metadata !DIExpression())`,
              );
            }
          }
        }
      };

      extractTargets(targets, tupleVal, tupleType);
      return;
    }

    this.locals.add(decl.name);

    if (!decl.typeAnnotation && !decl.initializer?.resolvedType) {
      // If type inference is working, resolvedType should be on the initializer or we need to infer it.
      // But VariableDecl doesn't have resolvedType on itself usually, it relies on typeAnnotation or initializer.
      // Let's assume typeAnnotation is present or we can get it from initializer.
    }

    const type = decl.resolvedType
      ? this.resolveType(decl.resolvedType)
      : decl.typeAnnotation
        ? this.resolveType(decl.typeAnnotation)
        : this.resolveType(decl.initializer!.resolvedType!);
    const addr = this.allocateStack(decl.name as string, type);

    // DWARF: Variable declaration
    if (this.generateDwarf && this.currentSubprogramId !== -1) {
      const typeNode =
        decl.typeAnnotation ||
        decl.initializer?.resolvedType ||
        decl.resolvedType;
      if (typeNode) {
        const typeId = this.getDwarfTypeId(typeNode);
        const fileId = this.debugInfoGenerator.getFileNodeId(
          decl.location.file,
        );
        const varId = this.debugInfoGenerator.createAutoVariable(
          decl.name as string,
          fileId,
          decl.location.startLine,
          typeId,
          this.currentSubprogramId,
        );

        const locId = this.debugInfoGenerator.createLocation(
          decl.location.startLine,
          decl.location.startColumn,
          this.currentSubprogramId,
        );

        this.emit(
          `  call void @llvm.dbg.declare(metadata ${type}* ${addr}, metadata !${varId}, metadata !DIExpression())`,
        );
      }
    }

    // Initialize uninitialized struct variables with default values (only if needed, e.g. vtables)
    if (
      !decl.initializer &&
      type.startsWith("%struct.") &&
      !type.endsWith("*")
    ) {
      const typeNode = decl.resolvedType || decl.typeAnnotation!;
      const defaultVal = this.generateDefaultValue(typeNode);
      if (defaultVal !== "undef") {
        this.emit(`  store ${type} ${defaultVal}, ${type}* ${addr}`);
      }
    }

    if (decl.initializer) {
      const val = this.generateExpression(decl.initializer);
      const srcType = this.resolveType(decl.initializer.resolvedType!);
      const destType = type;
      const castVal = this.emitCast(
        val,
        srcType,
        destType,
        decl.initializer.resolvedType!,
        decl.resolvedType ||
          decl.typeAnnotation ||
          decl.initializer.resolvedType!,
      );
      this.emit(`  store ${type} ${castVal}, ${type}* ${addr}`);

      // Update null flag for struct locals
      const flagPtr = this.localNullFlags.get(decl.name as string);
      if (flagPtr) {
        let flagVal = "1"; // Default: struct is not null (valid)

        // If assigning a null literal, set flag to 0
        if (
          decl.initializer.kind === "Literal" &&
          (decl.initializer as AST.LiteralExpr).type === "null"
        ) {
          flagVal = "0"; // null means the struct is null
        }
        // If assigning from another struct local with a flag, propagate
        else if (decl.initializer.kind === "Identifier") {
          const srcId = decl.initializer as AST.IdentifierExpr;
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
      if (
        decl.initializer.kind === "Unary" &&
        (decl.initializer as AST.UnaryExpr).operator.type ===
          TokenType.Ampersand
      ) {
        const unaryExpr = decl.initializer as AST.UnaryExpr;
        if (unaryExpr.operand.kind === "Identifier") {
          const sourceLocal = (unaryExpr.operand as AST.IdentifierExpr).name;
          this.pointerToLocal.set(decl.name as string, sourceLocal);
        }
      }
    }
  }

  protected generateReturn(stmt: AST.ReturnStmt) {
    // Determine target type and context
    let destTypeNode = this.currentFunctionReturnType!;
    let destType = this.resolveType(destTypeNode);
    let isMatchYield = false;

    if (this.matchStack.length > 0) {
      const matchContext = this.matchStack[this.matchStack.length - 1]!;
      destTypeNode = matchContext.resultTypeNode;
      destType = matchContext.resultType;
      isMatchYield = true;
    }

    // Only trigger function-level return hooks (like destructors) if not yielding from a match
    if (!isMatchYield) {
      // Decrement stack depth
      const depth = this.newRegister();
      this.emit(`  ${depth} = load i32, i32* @__bpl_stack_depth`);
      const newDepth = this.newRegister();
      this.emit(`  ${newDepth} = sub i32 ${depth}, 1`);
      this.emit(`  store i32 ${newDepth}, i32* @__bpl_stack_depth`);

      if (this.onReturn) this.onReturn();
    }

    if (stmt.value) {
      const rawVal = this.generateExpression(stmt.value);
      const srcTypeNode = stmt.value.resolvedType!;
      const srcType = this.resolveType(srcTypeNode);

      let castVal = this.emitCast(
        rawVal,
        srcType,
        destType,
        srcTypeNode,
        destTypeNode,
      );

      if (isMatchYield) {
        const matchContext = this.matchStack[this.matchStack.length - 1]!;
        matchContext.results.push({
          value: castVal,
          label: this.getCurrentLabel(),
          type: destType,
        });
        this.emit(`  br label %${matchContext.mergeLabel}`);
        return;
      }

      this.emit(`  ret ${destType} ${castVal}`);
    } else {
      if (isMatchYield) {
        // Handle void yield from match
        const matchContext = this.matchStack[this.matchStack.length - 1]!;
        this.emit(`  br label %${matchContext.mergeLabel}`);
        return;
      }

      // For void returns, check if this is main with modified return type
      if (this.isMainWithVoidReturn) {
        this.emit("  ret i32 0");
      } else {
        this.emit("  ret void");
      }
    }
  }

  protected generateIf(stmt: AST.IfStmt) {
    const cond = this.generateExpression(stmt.condition);
    const thenLabel = this.newLabel("then");
    const elseLabel = this.newLabel("else");
    const mergeLabel = this.newLabel("merge");

    const hasElse = !!stmt.elseBranch;
    const targetElse = hasElse ? elseLabel : mergeLabel;

    this.emit(`  br i1 ${cond}, label %${thenLabel}, label %${targetElse}`);

    this.emit(`${thenLabel}:`);
    this.generateBlock(stmt.thenBranch);
    if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
      this.emit(`  br label %${mergeLabel}`);
    }

    if (hasElse) {
      this.emit(`${elseLabel}:`);
      if (stmt.elseBranch!.kind === "Block") {
        this.generateBlock(stmt.elseBranch as AST.BlockStmt);
      } else if (stmt.elseBranch!.kind === "If") {
        this.generateIf(stmt.elseBranch as AST.IfStmt);
      } else {
        // Single statement else? AST says elseBranch is Statement.
        this.generateStatement(stmt.elseBranch!);
      }

      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${mergeLabel}`);
      }
    }

    this.emit(`${mergeLabel}:`);
  }

  protected generateLoop(stmt: AST.LoopStmt) {
    const condLabel = this.newLabel("cond");
    const bodyLabel = this.newLabel("body");
    const endLabel = this.newLabel("end");

    this.loopStack.push({ continueLabel: condLabel, breakLabel: endLabel });

    this.emit(`  br label %${condLabel}`);
    this.emit(`${condLabel}:`);

    if (stmt.condition) {
      const cond = this.generateExpression(stmt.condition);
      this.emit(`  br i1 ${cond}, label %${bodyLabel}, label %${endLabel}`);
    } else {
      this.emit(`  br label %${bodyLabel}`);
    }

    this.emit(`${bodyLabel}:`);
    this.generateBlock(stmt.body);
    if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
      this.emit(`  br label %${condLabel}`);
    }

    this.loopStack.pop();
    this.emit(`${endLabel}:`);
  }

  protected generateSwitch(stmt: AST.SwitchStmt) {
    const cond = this.generateExpression(stmt.expression);
    const endLabel = this.newLabel("switch.end");
    const defaultLabel = stmt.defaultCase
      ? this.newLabel("switch.default")
      : endLabel;

    const caseLabels: { value: string; label: string; body: AST.BlockStmt }[] =
      [];
    for (const caseStmt of stmt.cases) {
      if (caseStmt.value.kind !== "Literal") {
        throw this.createError("Switch case values must be literals", caseStmt);
      }
      const val = this.generateLiteral(caseStmt.value as AST.LiteralExpr);
      const label = this.newLabel("switch.case");
      caseLabels.push({ value: val, label, body: caseStmt.body });
    }

    const condType = this.resolveType(stmt.expression.resolvedType!);

    // Use raw output push to avoid attaching !dbg to the middle of the instruction
    this.output.push(`  switch ${condType} ${cond}, label %${defaultLabel} [`);
    for (const c of caseLabels) {
      this.output.push(`    ${condType} ${c.value}, label %${c.label}`);
    }
    // Attach debug info to the end of the switch instruction
    this.emit(`  ]`);

    for (const c of caseLabels) {
      this.emit(`${c.label}:`);
      this.generateBlock(c.body);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    if (stmt.defaultCase) {
      this.emit(`${defaultLabel}:`);
      this.generateBlock(stmt.defaultCase);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    this.emit(`${endLabel}:`);
  }

  protected generateAsm(stmt: AST.AsmBlockStmt) {
    const lines = stmt.content.split("\n");
    for (const line of lines) {
      // Replace {variable} with %variable (register) or value
      // This is a simple substitution. For more complex asm, we might need better parsing.
      // But for now, we assume the user knows what they are doing in the asm block.
      // We just emit the lines directly to LLVM IR.
      // However, we should probably support variable substitution.

      let processedLine = line;
      // Regex to find (name)
      processedLine = processedLine.replace(/\((\w+)\)/g, (match, name) => {
        // Check if it's a local variable
        if (this.locals.has(name)) {
          const ptr = this.localPointers.get(name);
          if (ptr) {
            // We need to load the value? Or return the pointer?
            // Usually inline asm wants values.
            // But we can't easily inject load instructions here without breaking the flow if it's a single string.
            // So we assume the user wants the pointer or we just return the pointer name.
            return ptr;
          }
        }
        return match;
      });

      this.emit(`  ${processedLine}`);
    }
  }

  protected generateFunction(
    decl: AST.FunctionDecl,
    parentStruct?: AST.StructDecl | AST.EnumDecl,
    captureInfo?: { name: string; fields: { name: string; type: string }[] },
  ) {
    // Skip generic templates unless we are instantiating them (map is populated)
    if (decl.genericParams.length > 0) {
      const isInstantiating = decl.genericParams.every((p) => {
        const pName = p.name.trim();
        if (!this.currentTypeMap.has(pName)) return false;
        const mapped = this.currentTypeMap.get(pName)!;
        // Check if mapped type is a placeholder (maps to itself)
        if (mapped.kind === "BasicType" && (mapped as any).name === pName) {
          return false; // Treat as not instantiated
        }
        return true;
      });
      if (!isInstantiating) return;
    }

    // Also skip methods of generic structs/enums unless instantiated
    if (parentStruct && parentStruct.genericParams.length > 0) {
      const isInstantiating = parentStruct.genericParams.every((p) => {
        const pName = p.name.trim();
        if (!this.currentTypeMap.has(pName)) {
          console.log(
            `[DEBUG] Skipping ${decl.name}: Type map missing ${pName}`,
          );
          return false;
        }
        const mapped = this.currentTypeMap.get(pName)!;
        // Check if mapped type is a placeholder (maps to itself)
        if (mapped.kind === "BasicType" && (mapped as any).name === pName) {
          return false; // Treat as not instantiated
        }
        return true;
      });
      if (!isInstantiating) {
        return;
      }
    }

    if (this.currentFunctionName) {
      // console.log(`[DEBUG] RECURSIVE generateFunction detected!`);
      // console.log(`[DEBUG] Outer: ${this.currentFunctionName}`);
      // console.log(`[DEBUG] Inner: ${decl.name}`);
    }

    // Save state for re-entrancy (e.g. when resolving types triggers monomorphization)
    const prevRegisterCount = this.registerCount;
    const prevLabelCount = this.labelCount;
    const prevStackAllocCount = this.stackAllocCount;
    const prevCurrentFunctionReturnType = this.currentFunctionReturnType;
    const prevCurrentFunctionName = this.currentFunctionName;
    const prevLocals = new Set(this.locals);
    const prevLocalPointers = new Map(this.localPointers);
    const prevLocalNullFlags = new Map(this.localNullFlags);
    const prevPointerToLocal = new Map(this.pointerToLocal);
    const prevOnReturn = this.onReturn;
    const prevIsMainWithVoidReturn = this.isMainWithVoidReturn;
    const prevGeneratingFunctionBody = this.generatingFunctionBody;
    const prevSubprogramId = this.currentSubprogramId;

    this.registerCount = 0;
    this.labelCount = 0;
    this.stackAllocCount = 0;
    this.currentFunctionReturnType = decl.returnType;
    this.currentFunctionName = decl.name;
    this.locals.clear();
    this.localPointers.clear();
    this.localNullFlags.clear();
    this.pointerToLocal.clear();
    this.generatingFunctionBody = true;

    let name = decl.name;
    const funcType = decl.resolvedType as AST.FunctionTypeNode;
    let effectiveFuncType = funcType;

    if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
      let genericArgs: AST.TypeNode[] = [];
      if (decl.genericParams.length > 0) {
        genericArgs = decl.genericParams.map(
          (p) => this.currentTypeMap.get(p.name)!,
        );
      }
      // Substitute generic types in function signature before mangling
      const substitutedFuncType = this.substituteType(
        funcType,
        this.currentTypeMap,
      ) as AST.FunctionTypeNode;
      effectiveFuncType = substitutedFuncType;

      name = this.getMangledName(
        decl.name,
        substitutedFuncType,
        false,
        genericArgs,
      );
    }

    // Update currentFunctionReturnType to use the resolved/substituted return type
    this.currentFunctionReturnType = effectiveFuncType.returnType;

    if (this.definedFunctions.has(name)) {
      return;
    }
    this.definedFunctions.add(name);

    // DWARF: Create subprogram
    if (this.generateDwarf) {
      const file = decl.location.file || this.currentFilePath;
      const returnTypeId = this.getDwarfTypeId(effectiveFuncType.returnType);
      const paramTypeIds = effectiveFuncType.paramTypes.map((t) =>
        this.getDwarfTypeId(t),
      );
      const subroutineTypeId = this.debugInfoGenerator.createSubroutineType(
        returnTypeId,
        paramTypeIds,
      );

      this.currentSubprogramId = this.debugInfoGenerator.createSubprogram(
        decl.name,
        decl.location.startLine,
        file,
        subroutineTypeId,
      );
    }

    try {
      // Setup destructor chaining
      let parentStructType: AST.TypeNode | undefined;
      if (
        parentStruct &&
        parentStruct.kind === "StructDecl" &&
        parentStruct.inheritanceList
      ) {
        for (const t of parentStruct.inheritanceList) {
          if (t.kind === "BasicType" && this.structMap.has(t.name)) {
            parentStructType = t;
            break;
          }
        }
      }

      if (
        parentStruct &&
        parentStruct.kind === "StructDecl" &&
        decl.name === `${parentStruct.name}_destroy` &&
        parentStructType
      ) {
        this.onReturn = () => {
          this.emitParentDestroy(parentStruct as AST.StructDecl, decl);
        };
      } else {
        this.onReturn = undefined;
      }

      // Prevent duplicate generation
      if (this.emittedFunctions.has(name)) {
        return;
      }
      this.emittedFunctions.add(name);

      let retType = this.resolveType(effectiveFuncType.returnType);

      // Special case: if this is main with void return, change to i32 for exit code
      this.isMainWithVoidReturn = decl.name === "main" && retType === "void";
      if (this.isMainWithVoidReturn) {
        retType = "i32";
      }

      // Special handling for main function to accept argc/argv
      let params: string;
      if (decl.name === "main") {
        params = "i32 %argc, i8** %argv";
      } else {
        // Add implicit context parameter for closures
        const ctxParam = "i8* %__closure_ctx";
        const userParams = decl.params
          .map((p, i) => {
            const type = this.resolveType(funcType.paramTypes[i]!);
            const name = `%${p.name}`;

            if (p.isVariadic) {
              // Variadic parameter: pass as pointer to array AND count
              return `${type} ${name}`;
            }

            return `${type} ${name}`;
          })
          .join(", ");
        params = userParams ? `${ctxParam}, ${userParams}` : ctxParam;
      }

      let linkage = "";
      if (name.startsWith("Type_")) {
        linkage = "linkonce_odr ";
      } else if (
        this.useLinkOnceOdrForStdLib &&
        this.stdLibPath &&
        decl.location &&
        decl.location.file &&
        decl.location.file.startsWith(this.stdLibPath)
      ) {
        linkage = "linkonce_odr ";
      }
      let dbgSuffix = "";
      if (this.generateDwarf && this.currentSubprogramId !== -1) {
        dbgSuffix = ` !dbg !${this.currentSubprogramId}`;
      }
      this.emit(
        `define ${linkage}${retType} @${name}(${params})${dbgSuffix} {`,
      );
      this.emit("entry:");

      // Unpack closure context if present
      if (captureInfo) {
        const structType = `%struct.${captureInfo.name}`;
        const ctxPtr = this.newRegister();
        this.emit(`  ${ctxPtr} = bitcast i8* %__closure_ctx to ${structType}*`);

        captureInfo.fields.forEach((field, index) => {
          const fieldPtr = this.newRegister();
          this.emit(
            `  ${fieldPtr} = getelementptr inbounds ${structType}, ${structType}* ${ctxPtr}, i32 0, i32 ${index}`,
          );

          const val = this.newRegister();
          this.emit(
            `  ${val} = load ${field.type}, ${field.type}* ${fieldPtr}`,
          );

          const alloca = this.allocateStack(field.name, field.type);
          this.emit(`  store ${field.type} ${val}, ${field.type}* ${alloca}`);

          this.locals.add(field.name);
          this.localPointers.set(field.name, alloca);
        });
      }

      // Stack overflow check
      const depth = this.newRegister();
      this.emit(`  ${depth} = load i32, i32* @__bpl_stack_depth`);
      const newDepth = this.newRegister();
      this.emit(`  ${newDepth} = add i32 ${depth}, 1`);
      this.emit(`  store i32 ${newDepth}, i32* @__bpl_stack_depth`);

      const isOverflow = this.newRegister();
      this.emit(`  ${isOverflow} = icmp ugt i32 ${newDepth}, 10000`);

      const stackOk = this.newLabel("stack_ok");
      const stackErr = this.newLabel("stack_err");

      this.emit(`  br i1 ${isOverflow}, label %${stackErr}, label %${stackOk}`);

      this.emit(`${stackErr}:`);

      // Initialize StackOverflowError struct
      // We need to handle both the internal fallback (just i8) and the stdlib version (vtable + i8)
      const msg = "Stack overflow";
      if (!this.stringLiterals.has(msg)) {
        this.stringLiterals.set(
          msg,
          `@.stack_overflow_msg.${this.stringLiterals.size}`,
        );
      }
      const msgLen = msg.length + 1;
      const msgPtr = `getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${this.stringLiterals.get(msg)}, i64 0, i64 0)`;

      const soLayout = this.structLayouts.get("StackOverflowError");
      let currentStruct = "undef";

      if (soLayout) {
        // Initialize vtable if present
        if (soLayout.has("__vtable__")) {
          const vtableIndex = soLayout.get("__vtable__");
          const vtablePtr = this.newRegister();
          // Assuming standard vtable size of 3 (getTypeName, toString, destroy)
          this.emit(
            `  ${vtablePtr} = bitcast [3 x i8*]* @StackOverflowError_vtable to i8*`,
          );
          const nextStruct = this.newRegister();
          this.emit(
            `  ${nextStruct} = insertvalue %struct.StackOverflowError ${currentStruct}, i8* ${vtablePtr}, ${vtableIndex}`,
          );
          currentStruct = nextStruct;
        }

        if (soLayout.has("message")) {
          const idx = soLayout.get("message");
          const nextStruct = this.newRegister();
          this.emit(
            `  ${nextStruct} = insertvalue %struct.StackOverflowError ${currentStruct}, i8* ${msgPtr}, ${idx}`,
          );
          currentStruct = nextStruct;
        }
        if (soLayout.has("code")) {
          const idx = soLayout.get("code");
          const nextStruct = this.newRegister();
          this.emit(
            `  ${nextStruct} = insertvalue %struct.StackOverflowError ${currentStruct}, i32 9, ${idx}`,
          );
          currentStruct = nextStruct;
        }

        // Initialize dummy field
        if (soLayout.has("dummy")) {
          const dummyIndex = soLayout.get("dummy");
          const nextStruct = this.newRegister();
          this.emit(
            `  ${nextStruct} = insertvalue %struct.StackOverflowError ${currentStruct}, i8 0, ${dummyIndex}`,
          );
          currentStruct = nextStruct;
        }
      } else {
        // Fallback for internal definition
        const nextStruct = this.newRegister();
        this.emit(
          `  ${nextStruct} = insertvalue %struct.StackOverflowError undef, i8 0, 0`,
        );
        currentStruct = nextStruct;
      }

      const errorStruct = currentStruct;
      this.emitThrow(errorStruct, "%struct.StackOverflowError");
      // this.emit("  unreachable");

      this.emit(`${stackOk}:`);

      // Store argc/argv in global variables for main function
      if (name === "main") {
        this.emit(`  store i32 %argc, i32* @__bpl_argc_value`);
        this.emit(`  store i8** %argv, i8*** @__bpl_argv_value`);
      }

      // Allocate stack space for parameters to make them mutable
      for (let i = 0; i < decl.params.length; i++) {
        const param = decl.params[i]!;
        this.locals.add(param.name);
        const type = this.resolveType(effectiveFuncType.paramTypes[i]!);
        const paramReg = `%${param.name}`;
        let stackAddr: string;

        if (param.isVariadic) {
          // Variadic parameter is passed as pointer (already handled by TypeChecker)
          stackAddr = this.allocateStack(param.name, type);
          this.emit(`  store ${type} ${paramReg}, ${type}* ${stackAddr}`);

          const nameOfCountArg = decl.params[i + 1];
          if (!nameOfCountArg || i + 2 !== decl.params.length) {
            throw new CompilerError(
              "Last argument must be count:int that will contain number of variadic arguments, it's passed implicitly",
              "have ...args: Type, count: int",
              decl.params[i]?.location!,
            );
          }

          // Store the implicit count
          const countName = nameOfCountArg.name;
          const countReg = `%${countName}`;
          const countAddr = this.allocateStack(countName, "i32");
          this.emit(`  store i32 ${countReg}, i32* ${countAddr}`);

          // Register as local variable so it can be resolved
          this.locals.add(countName);
          this.localPointers.set(countName, countAddr);
        } else {
          stackAddr = this.allocateStack(param.name, type);
          this.emit(`  store ${type} ${paramReg}, ${type}* ${stackAddr}`);
        }

        // DWARF: Parameter debug info
        if (this.generateDwarf && this.currentSubprogramId) {
          const paramType = effectiveFuncType.paramTypes[i]!;
          const dwarfTypeId = this.getDwarfTypeId(paramType);
          const fileId = this.debugInfoGenerator.getFileNodeId(
            this.currentFilePath,
          );
          const paramVarId = this.debugInfoGenerator.createParameterVariable(
            param.name,
            i + 1, // arg index (1-based)
            fileId,
            decl.location.startLine,
            dwarfTypeId,
            this.currentSubprogramId,
          );

          // Emit llvm.dbg.declare
          // call void @llvm.dbg.declare(metadata i32* %a.addr, metadata !13, metadata !DIExpression()), !dbg !14
          const locationId = this.debugInfoGenerator.createLocation(
            decl.location.startLine,
            decl.location.startColumn || 0,
            this.currentSubprogramId,
          );

          // For variadic, stackAddr is type** (pointer to array pointer)
          // For normal, stackAddr is type* (pointer to value)
          const addrType = param.isVariadic ? `${type}**` : `${type}*`;

          this.emit(
            `  call void @llvm.dbg.declare(metadata ${addrType} ${stackAddr}, metadata !${paramVarId}, metadata !DIExpression()), !dbg !${locationId}`,
          );
        }
      }

      this.generateBlock(decl.body);

      // Add implicit return for void functions if missing
      let lastLine = "";
      for (let i = this.output.length - 1; i >= 0; i--) {
        if (this.output[i]!.trim() !== "") {
          lastLine = this.output[i]!.trim();
          break;
        }
      }

      // Handle implicit returns based on function type
      // Don't emit implicit return if the block is already terminated
      const isTerminator =
        lastLine.startsWith("ret") ||
        lastLine.startsWith("br") ||
        lastLine.startsWith("unreachable");

      if (!isTerminator) {
        // Decrement stack depth
        const depth = this.newRegister();
        this.emit(`  ${depth} = load i32, i32* @__bpl_stack_depth`);
        const newDepth = this.newRegister();
        this.emit(`  ${newDepth} = sub i32 ${depth}, 1`);
        this.emit(`  store i32 ${newDepth}, i32* @__bpl_stack_depth`);

        if (this.onReturn) this.onReturn();

        if (this.isMainWithVoidReturn) {
          // Main was declared void but we changed it to i32, return 0
          this.emit("  ret i32 0");
        } else if (retType === "void") {
          this.emit("  ret void");
        } else if (retType.endsWith("*")) {
          // Pointer type - return null
          this.emit(`  ret ${retType} null`);
        } else if (retType === "i32" || retType === "i64") {
          // Non-void function without explicit return, return 0 as default
          this.emit(`  ret ${retType} 0`);
        } else {
          this.emit("  unreachable");
        }
      }

      this.emit("}");
      this.emit("");
    } finally {
      // Restore state
      this.registerCount = prevRegisterCount;
      this.labelCount = prevLabelCount;
      this.stackAllocCount = prevStackAllocCount;
      this.currentFunctionReturnType = prevCurrentFunctionReturnType;
      this.currentFunctionName = prevCurrentFunctionName;
      this.locals = prevLocals;
      this.currentSubprogramId = prevSubprogramId;
      this.localPointers = prevLocalPointers;
      this.localNullFlags = prevLocalNullFlags;
      this.pointerToLocal = prevPointerToLocal;
      this.onReturn = prevOnReturn;
      this.isMainWithVoidReturn = prevIsMainWithVoidReturn;
      this.generatingFunctionBody = prevGeneratingFunctionBody;
    }
  }
}
