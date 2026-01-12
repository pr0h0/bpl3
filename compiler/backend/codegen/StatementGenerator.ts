import * as AST from "../../common/AST";
import { CompilerError } from "../../common/CompilerError";
import { codeGenLog } from "../../common/Logger";
import { TokenType } from "../../frontend/TokenType";
import { AsmGenerator } from "./AsmGenerator";

export abstract class StatementGenerator extends AsmGenerator {
  protected switchStack: { labels: string[]; activeIndex: number }[] = [];

  protected generateBlock(
    block: AST.BlockStmt,
    isLoop: boolean = false,
    isFunction: boolean = false,
    isSwitch: boolean = false,
  ) {
    // Scope management:
    // We need to track variables declared in this block so we can restore their previous state (if any)
    // or remove them (if they were new) when the block exits.
    // This ensures that variables declared inside the block don't leak out or permanently shadow outer variables.

    // Push scope for defer
    this.scopeStack.push({ deferred: [], isLoop, isFunction, isSwitch });

    const declaredInBlock = new Set<string>();

    const collectDeclaredNames = (
      name: string | any[] | { name: string; type?: AST.TypeNode }[],
    ) => {
      if (typeof name === "string") {
        declaredInBlock.add(name);
      } else if (Array.isArray(name)) {
        for (const item of name) {
          if (Array.isArray(item)) {
            collectDeclaredNames(item);
          } else if (item && typeof item.name === "string") {
            declaredInBlock.add(item.name);
          }
        }
      }
    };

    // Scan for variable declarations in this block (shallow scan)
    for (const stmt of block.statements) {
      if (stmt.kind === "VariableDecl") {
        const decl = stmt as AST.VariableDecl;
        collectDeclaredNames(decl.name);
      }
    }

    // Save state of variables that will be modified
    const savedPointers = new Map<string, string>();
    const savedTypes = new Map<string, AST.TypeNode>();

    for (const name of declaredInBlock) {
      if (this.localPointers.has(name)) {
        savedPointers.set(name, this.localPointers.get(name)!);
      }
      if (this.localTypes.has(name)) {
        savedTypes.set(name, this.localTypes.get(name)!);
      }
    }

    // Generate statements
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

    // Restore state
    for (const name of declaredInBlock) {
      // Restore pointer
      if (savedPointers.has(name)) {
        this.localPointers.set(name, savedPointers.get(name)!);
      } else {
        this.localPointers.delete(name);
      }

      // Restore type
      if (savedTypes.has(name)) {
        this.localTypes.set(name, savedTypes.get(name)!);
      } else {
        this.localTypes.delete(name);
      }
    }

    // Generate deferred statements (LIFO)
    const scope = this.scopeStack.pop()!;
    // Only generate defers if we haven't terminated (or if we are falling through)
    if (
      this.output.length === 0 ||
      !this.isTerminator(this.output[this.output.length - 1] || "")
    ) {
      for (let i = scope.deferred.length - 1; i >= 0; i--) {
        this.generateStatement(scope.deferred[i]!);
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

    switch (stmt.kind as string) {
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
      case "Fallthrough":
        this.generateFallthrough(stmt as AST.FallthroughStmt);
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
      case "Defer":
        this.generateDefer(stmt as AST.DeferStmt);
        break;
      case "RuntimeDeferCleanup":
        this.generateRuntimeDeferCleanup(
          stmt as unknown as AST.RuntimeDeferCleanupStmt,
        );
        break;
      case "LambdaCall":
        this.generateLambdaCall(stmt as any);
        break;
      case "FreeCaptureStruct":
        this.generateFreeCaptureStruct(stmt as any);
        break;
      case "Extern":
        // Just to remove console log since its handled elsewhere
        break;
      default:
        codeGenLog.warn(`Unhandled statement kind: ${stmt.kind}`);
        break;
    }
  }

  protected generateRuntimeDeferCleanup(_stmt: AST.RuntimeDeferCleanupStmt) {
    const curr = this.newRegister();
    this.emit(
      `  ${curr} = load %struct.DeferNode*, %struct.DeferNode** @defer_top`,
    );

    const nextPtrPtr = this.newRegister();
    this.emit(
      `  ${nextPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${curr}, i32 0, i32 2`,
    );

    const next = this.newRegister();
    this.emit(
      `  ${next} = load %struct.DeferNode*, %struct.DeferNode** ${nextPtrPtr}`,
    );

    this.emit(
      `  store %struct.DeferNode* ${next}, %struct.DeferNode** @defer_top`,
    );

    const currVoid = this.newRegister();
    this.emit(`  ${currVoid} = bitcast %struct.DeferNode* ${curr} to i8*`);

    this.emit(`  call void @free(i8* ${currVoid})`);
  }

  protected generateFreeCaptureStruct(stmt: { ctxVal: string }) {
    this.emit(`  call void @free(i8* ${stmt.ctxVal})`);
  }

  protected generateLambdaCall(stmt: { funcVal: string; ctxVal: string }) {
    this.emit(`  call void ${stmt.funcVal}(i8* ${stmt.ctxVal})`);
  }

  protected generateBreak(stmt: AST.BreakStmt) {
    let targetLabel = "";
    let found = false;

    // Unwind scopes until loop or switch
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopeStack[i]!;
      for (let j = scope.deferred.length - 1; j >= 0; j--) {
        this.generateStatement(scope.deferred[j]!);
      }

      if (scope.isLoop) {
        if (this.loopStack.length === 0) {
          throw this.createError(
            "Internal error: Loop scope without loop stack",
            stmt,
          );
        }
        targetLabel = this.loopStack[this.loopStack.length - 1]!.breakLabel;
        found = true;
        break;
      }

      if (scope.isSwitch) {
        if (this.switchStack.length === 0) {
          throw this.createError(
            "Internal error: Switch scope without switch stack",
            stmt,
          );
        }
        const ctx = this.switchStack[this.switchStack.length - 1]!;
        // The last label in fallthroughLabels is the end label
        targetLabel = ctx.labels[ctx.labels.length - 1]!;
        found = true;
        break;
      }
    }

    if (!found) {
      throw this.createError(
        "Break statement outside of loop or switch",
        stmt,
        "Break statements can only be used inside loops or switch statements",
      );
    }

    this.emit(`  br label %${targetLabel}`);
  }

  protected generateContinue(stmt: AST.ContinueStmt) {
    if (this.loopStack.length === 0) {
      throw this.createError(
        "Continue statement outside of loop",
        stmt,
        "Continue statements can only be used inside loops (for, while, do-while)",
      );
    }

    // Unwind scopes until loop
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopeStack[i]!;
      for (let j = scope.deferred.length - 1; j >= 0; j--) {
        this.generateStatement(scope.deferred[j]!);
      }
      if (scope.isLoop) break;
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
        nestedTargets: any[],
        nestedTupleVal: string,
        nestedTupleType: string,
        indexPath: number[] = [],
      ) => {
        for (let i = 0; i < nestedTargets.length; i++) {
          const target = nestedTargets[i];

          if (Array.isArray(target)) {
            // Nested tuple destructuring - extract the nested tuple first
            const nestedVal = this.newRegister();

            // Extract the nested tuple from the current level (single index)
            this.emit(
              `  ${nestedVal} = extractvalue ${nestedTupleType} ${nestedTupleVal}, ${i}`,
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
              `  ${elemPtr} = extractvalue ${nestedTupleType} ${nestedTupleVal}, ${i}`,
            );

            // Store to the target variable
            this.emit(
              `  store ${targetType} ${elemPtr}, ${targetType}* ${addr}`,
            );

            // DWARF: Variable declaration
            if (this.generateDwarf && this.currentSubprogramId !== -1) {
              const typeNode = target.type ||
                this.getTargetTypeNodeFromTuple(
                  decl.initializer!.resolvedType!,
                  [...indexPath, i],
                ) || { kind: "BasicType", name: "unknown" };

              const typeId = this.getDwarfTypeId(typeNode as AST.TypeNode);
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
              const _locId = this.debugInfoGenerator.createLocation(
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

    const typeNode =
      decl.resolvedType ||
      decl.typeAnnotation ||
      decl.initializer?.resolvedType;
    if (typeNode) {
      this.localTypes.set(decl.name as string, typeNode);
    }

    if (!decl.typeAnnotation && !decl.initializer?.resolvedType) {
      // If type inference is working, resolvedType should be on the initializer or we need to infer it.
      // But VariableDecl doesn't have resolvedType on itself usually, it relies on typeAnnotation or initializer.
      // Let's assume typeAnnotation is present or we can get it from initializer.
    }

    let type: string;
    if (decl.resolvedType) {
      type = this.resolveType(decl.resolvedType);
    } else if (decl.typeAnnotation) {
      type = this.resolveType(decl.typeAnnotation);
    } else {
      type = this.resolveType(decl.initializer!.resolvedType!);
    }
    const addr = this.allocateStack(decl.name as string, type);

    // DWARF: Variable declaration
    if (this.generateDwarf && this.currentSubprogramId !== -1) {
      const dwarfTypeNode =
        decl.typeAnnotation ||
        decl.initializer?.resolvedType ||
        decl.resolvedType;
      if (dwarfTypeNode) {
        const typeId = this.getDwarfTypeId(dwarfTypeNode);
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

        const _locId = this.debugInfoGenerator.createLocation(
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
      const structTypeNode = decl.resolvedType || decl.typeAnnotation!;
      const defaultVal = this.generateDefaultValue(structTypeNode);
      if (defaultVal !== "undef") {
        this.emit(`  store ${type} ${defaultVal}, ${type}* ${addr}`);
      }

      // Implicit constructor call
      // Check if the struct has a 'new(this)' method
      if (
        structTypeNode.kind === "BasicType" &&
        structTypeNode.resolvedDeclaration &&
        structTypeNode.resolvedDeclaration.kind === "StructDecl"
      ) {
        const structDecl = structTypeNode.resolvedDeclaration as AST.StructDecl;
        const newMethod = structDecl.members.find(
          (m) => m.kind === "FunctionDecl" && m.name === "new",
        ) as AST.FunctionDecl | undefined;

        if (
          newMethod &&
          newMethod.params.length === 1 &&
          newMethod.params[0]!.name === "this"
        ) {
          let structName = structDecl.name;
          let methodType = newMethod.resolvedType as AST.FunctionTypeNode;

          // Handle generics
          if (
            structTypeNode.kind === "BasicType" &&
            (structTypeNode as AST.BasicTypeNode).genericArgs.length > 0
          ) {
            // 1. Get mangled struct name from 'type' string
            // type is like "%struct.Point_i32"
            const match = type.match(/%struct\.([a-zA-Z0-9_]+)/);
            if (match) {
              structName = match[1]!;
            }

            // 2. Substitute types in method signature
            const typeMap = new Map<string, AST.TypeNode>();
            const basicStructTypeNode = structTypeNode as AST.BasicTypeNode;
            for (let i = 0; i < structDecl.genericParams.length; i++) {
              if (i < basicStructTypeNode.genericArgs.length) {
                typeMap.set(
                  structDecl.genericParams[i]!.name,
                  basicStructTypeNode.genericArgs[i]!,
                );
              }
            }
            methodType = this.substituteType(
              methodType,
              typeMap,
            ) as AST.FunctionTypeNode;
          }

          const methodName = `${structName}_new`;
          const ctorName = this.getMangledName(methodName, methodType);

          // Generate call
          // Constructors are definitionally Func type (raw ptr) so no context arg
          this.emit(`  call void @${ctorName}(${type}* ${addr})`);
        }
      }
    }

    // Initialize uninitialized array variables if elements need construction
    if (!decl.initializer && type.startsWith("[")) {
      const arrayTypeNode = decl.resolvedType || decl.typeAnnotation!;
      if (
        arrayTypeNode.kind === "BasicType" &&
        arrayTypeNode.arrayDimensions.length > 0 &&
        arrayTypeNode.resolvedDeclaration &&
        arrayTypeNode.resolvedDeclaration.kind === "StructDecl"
      ) {
        const structDecl = arrayTypeNode.resolvedDeclaration as AST.StructDecl;
        const newMethods = structDecl.members.filter(
          (m) => m.kind === "FunctionDecl" && m.name === "new",
        ) as AST.FunctionDecl[];

        const matchingNew = newMethods.find((newMethod) => {
          if (
            newMethod &&
            ((newMethod.params.length === 1 &&
              newMethod.params[0]!.name === "this") ||
              newMethod.params.length === 0)
          ) {
            return newMethod;
          }
        });
        if (matchingNew) {
          this.generateArrayInitialization(
            addr,
            type,
            arrayTypeNode as AST.BasicTypeNode,
            structDecl,
            matchingNew,
          );
        }
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

    let retVal: string | undefined;

    if (stmt.value) {
      const rawVal = this.generateExpression(stmt.value);
      const srcTypeNode = stmt.value.resolvedType!;
      const srcType = this.resolveType(srcTypeNode);

      retVal = this.emitCast(
        rawVal,
        srcType,
        destType,
        srcTypeNode,
        destTypeNode,
      );
    }

    // Only trigger function-level return hooks (like destructors) if not yielding from a match
    if (!isMatchYield) {
      // Run defers (LIFO)
      for (let i = this.scopeStack.length - 1; i >= 0; i--) {
        const scope = this.scopeStack[i]!;
        for (let j = scope.deferred.length - 1; j >= 0; j--) {
          this.generateStatement(scope.deferred[j]!);
        }
        if (scope.isFunction) break;
      }

      // Decrement stack depth
      if (this.optimizationLevel < 2) {
        this.emit(`  call void @__bpl_exit_stack_frame()`);
      }

      if (this.onReturn) this.onReturn();
    }

    if (isMatchYield) {
      const matchContext = this.matchStack[this.matchStack.length - 1]!;
      if (retVal) {
        matchContext.results.push({
          value: retVal,
          label: this.getCurrentLabel(),
          type: destType,
        });
      }
      this.emit(`  br label %${matchContext.mergeLabel}`);
    } else if (retVal) {
      this.emit(`  ret ${destType} ${retVal}`);
    } else if (this.isMainWithVoidReturn) {
      this.emit("  ret i32 0");
    } else {
      this.emit("  ret void");
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
    if (stmt.thenBranch.kind === "Block") {
      this.generateBlock(stmt.thenBranch as AST.BlockStmt);
    } else {
      const block: AST.BlockStmt = {
        kind: "Block",
        statements: [stmt.thenBranch],
        location: stmt.thenBranch.location,
      };
      this.generateBlock(block);
    }

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
        const block: AST.BlockStmt = {
          kind: "Block",
          statements: [stmt.elseBranch!],
          location: stmt.elseBranch!.location,
        };
        this.generateBlock(block);
      }

      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${mergeLabel}`);
      }
    }

    this.emit(`${mergeLabel}:`);
  }

  protected generateLoop(stmt: AST.LoopStmt) {
    // Generate init
    if (stmt.init) {
      this.generateStatement(stmt.init);
    }

    const condLabel = this.newLabel("cond");
    const bodyLabel = this.newLabel("body");
    const stepLabel = this.newLabel("step");
    const endLabel = this.newLabel("end");

    // If we have a step, continue jumps to step. Otherwise it jumps to condition.
    const continueTarget = stmt.step ? stepLabel : condLabel;

    this.loopStack.push({
      continueLabel: continueTarget,
      breakLabel: endLabel,
    });

    this.emit(`  br label %${condLabel}`);
    this.emit(`${condLabel}:`);

    if (stmt.condition) {
      const cond = this.generateExpression(stmt.condition);
      this.emit(`  br i1 ${cond}, label %${bodyLabel}, label %${endLabel}`);
    } else {
      this.emit(`  br label %${bodyLabel}`);
    }

    this.emit(`${bodyLabel}:`);
    if (stmt.body.kind === "Block") {
      this.generateBlock(stmt.body as AST.BlockStmt, true);
    } else {
      const block: AST.BlockStmt = {
        kind: "Block",
        statements: [stmt.body],
        location: stmt.body.location,
      };
      this.generateBlock(block, true);
    }

    if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
      this.emit(`  br label %${continueTarget}`);
    }

    // Generate step
    if (stmt.step) {
      this.emit(`${stepLabel}:`);
      this.generateExpression(stmt.step);
      this.emit(`  br label %${condLabel}`);
    }

    this.loopStack.pop();
    this.emit(`${endLabel}:`);
  }

  protected generateSwitch(stmt: AST.SwitchStmt) {
    let cond = this.generateExpression(stmt.expression);
    let condType = this.resolveType(stmt.expression.resolvedType!);

    // Check if we are switching on an Enum
    if (condType.startsWith("%enum.")) {
      const tagReg = this.newRegister();
      this.emit(`  ${tagReg} = extractvalue ${condType} ${cond}, 0`);
      cond = tagReg;
      condType = "i32";
    }

    // Handle string switch by converting to if-else chain with strcmp
    if (condType === "i8*") {
      this.generateStringSwitch(stmt, cond);
      return;
    }

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

    // Use raw output push to avoid attaching !dbg to the middle of the instruction
    this.output.push(`  switch ${condType} ${cond}, label %${defaultLabel} [`);
    for (const c of caseLabels) {
      this.output.push(`    ${condType} ${c.value}, label %${c.label}`);
    }
    // Attach debug info to the end of the switch instruction
    this.emit(`  ]`);

    // push stack
    const fallthroughLabels = caseLabels.map((c) => c.label);
    if (stmt.defaultCase) {
      fallthroughLabels.push(defaultLabel);
    }
    fallthroughLabels.push(endLabel); // Fallthrough from last case goes to end
    this.switchStack.push({ labels: fallthroughLabels, activeIndex: -1 });

    for (let i = 0; i < caseLabels.length; i++) {
      const c = caseLabels[i]!;
      this.switchStack[this.switchStack.length - 1]!.activeIndex = i;
      this.emit(`${c.label}:`);
      this.generateBlock(c.body, false, false, true);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    if (stmt.defaultCase) {
      this.switchStack[this.switchStack.length - 1]!.activeIndex =
        caseLabels.length;
      this.emit(`${defaultLabel}:`);
      this.generateBlock(stmt.defaultCase, false, false, true);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    this.switchStack.pop();

    this.emit(`${endLabel}:`);
  }

  protected generateFallthrough(stmt: AST.FallthroughStmt) {
    if (this.switchStack.length === 0) {
      throw this.createError("Fallthrough statement outside of switch", stmt);
    }
    const ctx = this.switchStack[this.switchStack.length - 1]!;
    const nextIndex = ctx.activeIndex + 1;
    if (nextIndex >= ctx.labels.length) {
      // Should effectively break if there is nowhere to fall through to
      // But usually this means falling out of switch
      // In our setup, ctx.labels includes endLabel as the last element if we added it
    }
    const target = ctx.labels[nextIndex];
    if (target) {
      this.emit(`  br label %${target}`);
    } else {
      // Fallback? Should exist due to endLabel
      // If activeIndex was -1 (logic error), or labels empty (impossible)
      throw this.createError("Invalid fallthrough target", stmt);
    }
  }

  /**
   * Generate string switch as if-else chain with strcmp
   */
  private generateStringSwitch(stmt: AST.SwitchStmt, cond: string) {
    const endLabel = this.newLabel("switch.end");
    const caseLabels: { value: string; label: string; body: AST.BlockStmt }[] =
      [];

    // Generate case labels and values
    for (const caseStmt of stmt.cases) {
      if (caseStmt.value.kind !== "Literal") {
        throw this.createError("Switch case values must be literals", caseStmt);
      }
      const val = this.generateLiteral(caseStmt.value as AST.LiteralExpr);
      const label = this.newLabel("switch.case");
      caseLabels.push({ value: val, label, body: caseStmt.body });
    }

    const defaultLabel = stmt.defaultCase
      ? this.newLabel("switch.default")
      : endLabel;

    // push stack
    const fallthroughLabels = caseLabels.map((c) => c.label);
    if (stmt.defaultCase) {
      fallthroughLabels.push(defaultLabel);
    }
    fallthroughLabels.push(endLabel);
    this.switchStack.push({ labels: fallthroughLabels, activeIndex: -1 });

    // Generate if-else chain
    for (let i = 0; i < caseLabels.length; i++) {
      const c = caseLabels[i]!;
      const nextLabel =
        i < caseLabels.length - 1
          ? this.newLabel("switch.check")
          : defaultLabel;

      // Call strcmp
      const cmpReg = this.newRegister();
      this.emit(`  ${cmpReg} = call i32 @strcmp(i8* ${cond}, i8* ${c.value})`);

      // Check if equal (strcmp returns 0 for equal)
      const eqReg = this.newRegister();
      this.emit(`  ${eqReg} = icmp eq i32 ${cmpReg}, 0`);

      // Branch to case body or next check
      this.emit(`  br i1 ${eqReg}, label %${c.label}, label %${nextLabel}`);

      // Generate case body
      this.switchStack[this.switchStack.length - 1]!.activeIndex = i;
      this.emit(`${c.label}:`);
      this.generateBlock(c.body, false, false, true);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }

      // Continue with next check if not the last case
      if (i < caseLabels.length - 1) {
        this.emit(`${nextLabel}:`);
      }
    }

    // Generate default case
    if (stmt.defaultCase) {
      this.switchStack[this.switchStack.length - 1]!.activeIndex =
        caseLabels.length;
      this.emit(`${defaultLabel}:`);
      this.generateBlock(stmt.defaultCase, false, false, true);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    this.switchStack.pop();

    this.emit(`${endLabel}:`);
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

    // Save state for re-entrancy (e.g. when resolving types triggers monomorphization)
    const prevRegisterCount = this.registerCount;
    const prevLabelCount = this.labelCount;
    const prevStackAllocCount = this.stackAllocCount;
    const prevCurrentFunctionReturnType = this.currentFunctionReturnType;
    const prevCurrentFunctionName = this.currentFunctionName;
    const prevLocals = new Set(this.locals);
    const prevLocalPointers = new Map(this.localPointers);
    const prevLocalTypes = new Map(this.localTypes);
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
    this.localTypes.clear();
    this.localNullFlags.clear();
    this.pointerToLocal.clear();
    this.generatingFunctionBody = true;

    let name = decl.name;
    const funcType = decl.resolvedType as AST.FunctionTypeNode;
    let effectiveFuncType = funcType;

    if (
      decl.resolvedType &&
      (decl.resolvedType.kind === "FunctionType" ||
        decl.resolvedType.kind === "LambdaType")
    ) {
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
        // Add implicit context parameter ONLY for lambdas/closures
        // Functions (Func<T>) are raw pointers and do not take extra context args
        let ctxParam = "";

        // This check detects if we are generating a lambda body (from expression)
        // vs a distinct named function (frame)
        const isLambda = !!captureInfo || decl.name.startsWith("lambda_L");

        if (isLambda) {
          ctxParam = "i8* %__closure_ctx";
        }

        const userParams = decl.params
          .map((p, i) => {
            const type = this.resolveType(funcType.paramTypes[i]!);
            const paramName = `%${p.name}`;

            if (p.isVariadic) {
              // Variadic parameter: pass as pointer to array AND count
              return `${type} ${paramName}`;
            }

            return `${type} ${paramName}`;
          })
          .join(", ");

        if (isLambda) {
          params = userParams ? `${ctxParam}, ${userParams}` : ctxParam;
        } else {
          params = userParams;
        }
      }

      // Built-in runtime functions are now external (linked from runtime.ll)
      // So we just declare them and skip body generation
      if (decl.location && decl.location.file === "internal") {
        this.emitDeclaration(`declare ${retType} @${name}(${params})`);
        return;
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
        `define ${linkage}${retType} @${name}(${params}) #0${dbgSuffix} {`,
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
      // For optimization levels >= 2, we skip the runtime call for performance
      if (this.optimizationLevel < 2) {
        this.emit(`  call void @__bpl_enter_stack_frame()`);
      }

      /*
      // Stack overflow check details moved to runtime.ll for performance/size
      */
      const stackOk = this.newLabel("stack_ok");
      this.emit(`  br label %${stackOk}`);
      this.emit(`${stackOk}:`);

      // StackOverflowError construction and throw logic removed
      // (Handled by runtime check)

      // Store argc/argv in global variables for main function
      if (name === "main") {
        this.emit(`  store i32 %argc, i32* @__bpl_argc_value`);
        this.emit(`  store i8** %argv, i8*** @__bpl_argv_value`);
      }

      // Allocate stack space for parameters to make them mutable
      for (let i = 0; i < decl.params.length; i++) {
        const param = decl.params[i]!;
        this.locals.add(param.name);
        this.localTypes.set(param.name, effectiveFuncType.paramTypes[i]!);
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

      this.generateBlock(decl.body, false, true);

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
        if (this.optimizationLevel < 2) {
          this.emit(`  call void @__bpl_exit_stack_frame()`);
        }

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
      this.localTypes = prevLocalTypes;
      this.localNullFlags = prevLocalNullFlags;
      this.pointerToLocal = prevPointerToLocal;
      this.onReturn = prevOnReturn;
      this.isMainWithVoidReturn = prevIsMainWithVoidReturn;
      this.generatingFunctionBody = prevGeneratingFunctionBody;
    }
  }

  protected generateArrayInitialization(
    baseAddr: string,
    arrayTypeStr: string,
    typeNode: AST.BasicTypeNode,
    structDecl: AST.StructDecl,
    newMethod: AST.FunctionDecl,
  ) {
    // Calculate total elements
    let totalElements = 1;
    for (const dim of typeNode.arrayDimensions) {
      if (dim === null) {
        // Should not happen for stack-allocated arrays
        return;
      }
      totalElements *= dim;
    }

    // Resolve struct type and constructor name
    let structName = structDecl.name;
    let methodType = newMethod.resolvedType as AST.FunctionTypeNode;
    let structTypeStr = `%struct.${structName}`;

    // Handle generics
    if (typeNode.genericArgs.length > 0) {
      // 1. Get mangled struct name from 'type' string
      // type is like "[3 x %struct.Point_i32]"
      const match = arrayTypeStr.match(/%struct\.([a-zA-Z0-9_]+)/);
      if (match) {
        structName = match[1]!;
        structTypeStr = `%struct.${structName}`;
      }

      // 2. Substitute types in method signature
      const typeMap = new Map<string, AST.TypeNode>();
      for (let i = 0; i < structDecl.genericParams.length; i++) {
        if (i < typeNode.genericArgs.length) {
          typeMap.set(
            structDecl.genericParams[i]!.name,
            typeNode.genericArgs[i]!,
          );
        }
      }
      methodType = this.substituteType(
        methodType,
        typeMap,
      ) as AST.FunctionTypeNode;
    }

    const methodName = `${structName}_new`;
    const ctorName = this.getMangledName(methodName, methodType);

    const isInstanceInit =
      newMethod.params.length === 1 && newMethod.params[0]!.name === "this";

    // Cast array pointer to pointer to first element (flat)
    const elemPtr = this.newRegister();
    this.emit(
      `  ${elemPtr} = bitcast ${arrayTypeStr}* ${baseAddr} to ${structTypeStr}*`,
    );

    const loopHead = this.newLabel("array_init.head");
    const loopBody = this.newLabel("array_init.body");
    const loopEnd = this.newLabel("array_init.end");

    // Allocate loop counter
    const counterPtr = this.allocateStack("init_idx", "i32");
    this.emit(`  store i32 0, i32* ${counterPtr}`);

    this.emit(`  br label %${loopHead}`);
    this.emit(`${loopHead}:`);

    const counter = this.newRegister();
    this.emit(`  ${counter} = load i32, i32* ${counterPtr}`);

    const cmp = this.newRegister();
    this.emit(`  ${cmp} = icmp slt i32 ${counter}, ${totalElements}`);
    this.emit(`  br i1 ${cmp}, label %${loopBody}, label %${loopEnd}`);

    this.emit(`${loopBody}:`);

    // Get pointer to current element
    const currentElemPtr = this.newRegister();
    this.emit(
      `  ${currentElemPtr} = getelementptr ${structTypeStr}, ${structTypeStr}* ${elemPtr}, i32 ${counter}`,
    );

    if (isInstanceInit) {
      // Call constructor
      this.emit(
        `  call void @${ctorName}(${structTypeStr}* ${currentElemPtr})`,
      );
    } else {
      // Call static factory
      const val = this.newRegister();
      this.emit(`  ${val} = call ${structTypeStr} @${ctorName}()`);
      this.emit(
        `  store ${structTypeStr} ${val}, ${structTypeStr}* ${currentElemPtr}`,
      );
    }

    // Increment counter
    const nextCounter = this.newRegister();
    this.emit(`  ${nextCounter} = add i32 ${counter}, 1`);
    this.emit(`  store i32 ${nextCounter}, i32* ${counterPtr}`);

    this.emit(`  br label %${loopHead}`);

    this.emit(`${loopEnd}:`);
  }
}
