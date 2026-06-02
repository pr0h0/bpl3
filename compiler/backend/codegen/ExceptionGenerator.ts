/**
 * Handles exception handling code generation (try/catch/throw/defer).
 *
 * Generates code for:
 * - try/catch block compilation with LLVM landingpad
 * - throw statement code generation
 * - Exception type matching and dispatch
 * - catch-all handling (catch { })
 * - defer statement cleanup handlers
 * - Stack unwinding support
 *
 * @extends ExpressionGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { ExpressionGenerator } from "./ExpressionGenerator";

export abstract class ExceptionGenerator extends ExpressionGenerator {
  protected abstract generateBlock(
    block: AST.BlockStmt,
    skipEntryLabel?: boolean,
    skipTerminator?: boolean,
  ): void;
  protected abstract generateStatement(stmt: AST.Statement): void;

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

    // Save current defer_top
    const currentDeferTop = this.newRegister();
    this.emit(
      `  ${currentDeferTop} = load %struct.DeferNode*, %struct.DeferNode** @defer_top`,
    );
    const deferFieldPtr = this.newRegister();
    this.emit(
      `  ${deferFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 2`,
    );
    this.emit(
      `  store %struct.DeferNode* ${currentDeferTop}, %struct.DeferNode** ${deferFieldPtr}`,
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
    // catch { } (no type) is a catch-all

    // Find if there's a catch-all clause (clause with null type)
    const catchAllIndex = stmt.catchClauses.findIndex((c) => c.type === null);
    const _hasCatchAll = catchAllIndex !== -1;

    // Let's gather labels first.
    const clauseLabels = stmt.catchClauses.map((_, i) => ({
      check: this.newLabel(`catch.check.${i}`),
      body: this.newLabel(`catch.body.${i}`),
    }));

    // Jump to first check or end
    if (stmt.catchClauses.length > 0) {
      this.emit(`  br label %${clauseLabels[0]!.check}`);
    } else {
      // Rethrow if no handler
      this.emit(`  call void @exit(i32 1)`); // Unhandled
      this.emit(`  unreachable`);
    }

    for (let i = 0; i < stmt.catchClauses.length; i++) {
      const clause = stmt.catchClauses[i]!;
      const labels = clauseLabels[i]!;
      const isCatchAll = clause.type === null;

      let nextTarget: string;
      if (i < stmt.catchClauses.length - 1) {
        nextTarget = clauseLabels[i + 1]!.check;
      } else {
        nextTarget = endLabel;
      }

      this.emit(`${labels.check}:`);

      if (isCatchAll) {
        // Catch-all: unconditionally jump to body
        this.emit(`  br label %${labels.body}`);
      } else {
        const targetTypeId = this.getTypeIdFromNode(clause.type!);
        const typeMatch = this.newRegister();
        this.emit(
          `  ${typeMatch} = icmp eq i32 ${exceptionTypeReg}, ${targetTypeId}`,
        );
        this.emit(
          `  br i1 ${typeMatch}, label %${labels.body}, label %${nextTarget}`,
        );
      }

      this.emit(`${labels.body}:`);

      if (!isCatchAll) {
        // Bind variable for typed catch
        const targetTypeStr = this.resolveType(clause.type!);
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
          const localVar = this.allocateStack(clause.variable!, targetTypeStr);
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
            clause.type!,
          );

          // Allocate local
          const localVar = this.allocateStack(clause.variable!, targetTypeStr);
          this.emit(
            `  store ${targetTypeStr} ${convertedVal}, ${targetTypeStr}* ${localVar}`,
          );
        }
      }
      // For catch-all, no variable binding needed

      this.generateBlock(clause.body);
      if (!this.isTerminator(this.output[this.output.length - 1] || "")) {
        this.emit(`  br label %${endLabel}`);
      }
    }

    // If no catch-all was present, unhandled exceptions fall through to end
    // which means they are swallowed (acceptable for this MVP)

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

    // Check if it is an Error type (or inherits from it)
    let isError = false;
    if (type.kind === "BasicType") {
      const structName = (type as AST.BasicTypeNode).name;

      const checkInheritance = (name: string): boolean => {
        if (name === "Error") return true;
        const decl = this.structMap.get(name);
        if (!decl) return false;
        for (const parentType of decl.inheritanceList) {
          if (parentType.kind === "BasicType") {
            if (checkInheritance((parentType as AST.BasicTypeNode).name))
              return true;
          }
        }
        return false;
      };

      isError = checkInheritance(structName);
    }

    if (isError) {
      // Load the exception value (pointer to struct)
      const exVal = this.newRegister();
      this.emit(`  ${exVal} = load i64, i64* @exception_value`);

      // Cast to struct pointer
      const exPtr = this.newRegister();
      this.emit(`  ${exPtr} = inttoptr i64 ${exVal} to ${typeStr}*`);

      // Cast to Error*
      const errorPtr = this.newRegister();
      this.emit(
        `  ${errorPtr} = bitcast ${typeStr}* ${exPtr} to %struct.Error*`,
      );

      // Call printStack
      // Find mangled name
      let printStackName = "@Error_printStack_Error_ptr";
      const errorDecl = this.structMap.get("Error");
      if (errorDecl) {
        const method = errorDecl.members.find(
          (m) => m.kind === "FunctionDecl" && m.name === "printStack",
        );
        if (
          method &&
          method.resolvedType &&
          method.resolvedType.kind === "FunctionType"
        ) {
          printStackName =
            "@" +
            this.getMangledName(
              "Error_printStack",
              method.resolvedType as AST.FunctionTypeNode,
            );
        }
      }

      // Note: BPL functions do not take a closure context as first argument unless they are lambdas.
      // printStack is a struct method (frame), so it's a raw function pointer.
      this.emit(`  call void ${printStackName}(%struct.Error* ${errorPtr})`);

      // Exit
      this.emit(`  call void @exit(i32 1)`);
      this.emit(`  unreachable`);
    } else {
      const msgPtr = this.getStringLiteralPtr("Uncaught exception\n");
      const printfResult = this.newRegister();
      this.emit(
        `  ${printfResult} = call i32 (i8*, ...) @printf(i8* ${msgPtr})`,
      );
      this.emit(`  call void @exit(i32 1)`);
      this.emit(`  unreachable`);
    }

    this.emit(`${jumpLabel}:`);

    // Unwind defers
    const targetDeferTopPtr = this.newRegister();
    this.emit(
      `  ${targetDeferTopPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 2`,
    );
    const targetDeferTop = this.newRegister();
    this.emit(
      `  ${targetDeferTop} = load %struct.DeferNode*, %struct.DeferNode** ${targetDeferTopPtr}`,
    );

    const loopCondLabel = this.newLabel("defer.unwind.cond");
    const loopBodyLabel = this.newLabel("defer.unwind.body");
    const loopEndLabel = this.newLabel("defer.unwind.end");

    this.emit(`  br label %${loopCondLabel}`);
    this.emit(`${loopCondLabel}:`);

    const currentDefer = this.newRegister();
    this.emit(
      `  ${currentDefer} = load %struct.DeferNode*, %struct.DeferNode** @defer_top`,
    );

    const isDone = this.newRegister();
    this.emit(
      `  ${isDone} = icmp eq %struct.DeferNode* ${currentDefer}, ${targetDeferTop}`,
    );
    this.emit(
      `  br i1 ${isDone}, label %${loopEndLabel}, label %${loopBodyLabel}`,
    );

    this.emit(`${loopBodyLabel}:`);
    // Call defer function
    const funcPtrPtr = this.newRegister();
    this.emit(
      `  ${funcPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDefer}, i32 0, i32 0`,
    );
    const funcVoidPtr = this.newRegister();
    this.emit(`  ${funcVoidPtr} = load i8*, i8** ${funcPtrPtr}`);

    // Cast to function type void (*)(i8*)
    const funcPtr = this.newRegister();
    this.emit(`  ${funcPtr} = bitcast i8* ${funcVoidPtr} to void (i8*)*`);

    const ctxPtrPtr = this.newRegister();
    this.emit(
      `  ${ctxPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDefer}, i32 0, i32 1`,
    );
    const ctxPtr = this.newRegister();
    this.emit(`  ${ctxPtr} = load i8*, i8** ${ctxPtrPtr}`);

    this.emit(`  call void ${funcPtr}(i8* ${ctxPtr})`);

    // Move to next
    const nextPtrPtr = this.newRegister();
    this.emit(
      `  ${nextPtrPtr} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${currentDefer}, i32 0, i32 2`,
    );
    const nextPtr = this.newRegister();
    this.emit(
      `  ${nextPtr} = load %struct.DeferNode*, %struct.DeferNode** ${nextPtrPtr}`,
    );
    this.emit(
      `  store %struct.DeferNode* ${nextPtr}, %struct.DeferNode** @defer_top`,
    );

    this.emit(`  br label %${loopCondLabel}`);

    this.emit(`${loopEndLabel}:`);

    const bufFieldPtr = this.newRegister();
    this.emit(
      `  ${bufFieldPtr} = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* ${framePtr}, i32 0, i32 0`,
    );

    const bufVoidPtr = this.newRegister();
    this.emit(`  ${bufVoidPtr} = bitcast [32 x i64]* ${bufFieldPtr} to i8*`);

    this.emit(`  call void @longjmp(i8* ${bufVoidPtr}, i32 1)`);
    this.emit(`  unreachable`);
  }

  protected generateDefer(stmt: AST.DeferStmt) {
    if (this.scopeStack.length === 0) {
      throw this.createError(
        "Defer statement outside of scope",
        stmt,
        "Defer statements must be inside a block or function",
      );
    }

    // 1. Create Lambda AST from body
    // We wrap the body in a lambda to capture variables and create a function pointer
    // Modify location to ensure unique lambda name if multiple defers on same line (or if location is reused)
    const uniqueLoc = {
      ...stmt.location,
      startColumn: stmt.location.startColumn + this.registerCount,
    };

    // Analyze captures
    const captures = new Map<string, AST.TypeNode>();
    const visited = new Set<any>();
    const shadowedCaptureNames = new Set<string>();
    const withShadowedCaptureNames = (
      names: string[],
      visitBody: () => void,
    ) => {
      const added: string[] = [];
      for (const name of names) {
        if (!shadowedCaptureNames.has(name)) {
          shadowedCaptureNames.add(name);
          added.push(name);
        }
      }
      try {
        visitBody();
      } finally {
        for (const name of added) {
          shadowedCaptureNames.delete(name);
        }
      }
    };
    const collectPatternBindingNames = (pattern: AST.Pattern): string[] => {
      switch (pattern.kind) {
        case "PatternIdentifier":
          return pattern.name === "_" ? [] : [pattern.name];
        case "PatternEnumTuple":
          return pattern.bindings.flatMap((binding) =>
            collectPatternBindingNames(binding),
          );
        case "PatternEnumStruct":
          return pattern.fields
            .map((field) => field.binding)
            .filter((binding) => binding !== "_");
        case "PatternTuple":
          return pattern.patterns.flatMap((subPattern) =>
            collectPatternBindingNames(subPattern),
          );
        default:
          return [];
      }
    };
    const collectCaptures = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (visited.has(node)) return;
      visited.add(node);

      if (node.kind === "Identifier") {
        const name = node.name;
        if (shadowedCaptureNames.has(name)) return;
        if (this.locals.has(name) && !captures.has(name)) {
          captures.set(name, this.localTypes.get(name)!);
        }
      }

      // Explicitly traverse known AST properties to avoid walking into unknown/circular structures
      if (Array.isArray(node)) {
        for (const item of node) collectCaptures(item);
        return;
      }

      // Handle field objects that are not ASTNodes but contain expressions.
      if (
        typeof node.value === "object" &&
        (node.fieldName || node.name)
      ) {
        collectCaptures(node.value);
        return;
      }

      switch (node.kind) {
        case "Block":
          collectCaptures((node as AST.BlockStmt).statements);
          break;
        case "VariableDecl":
          collectCaptures((node as AST.VariableDecl).initializer);
          break;
        case "Return":
          collectCaptures((node as AST.ReturnStmt).value);
          break;
        case "If":
          collectCaptures((node as AST.IfStmt).condition);
          collectCaptures((node as AST.IfStmt).thenBranch);
          collectCaptures((node as AST.IfStmt).elseBranch);
          break;
        case "Loop":
          collectCaptures((node as AST.LoopStmt).init);
          collectCaptures((node as AST.LoopStmt).condition);
          collectCaptures((node as AST.LoopStmt).step);
          collectCaptures((node as AST.LoopStmt).body);
          break;
        case "Throw":
          collectCaptures((node as AST.ThrowStmt).expression);
          break;
        case "Try":
          collectCaptures((node as AST.TryStmt).tryBlock);
          for (const clause of (node as AST.TryStmt).catchClauses) {
            if (clause.variable && clause.type) {
              withShadowedCaptureNames([clause.variable], () => {
                collectCaptures(clause.body);
              });
            } else {
              collectCaptures(clause.body);
            }
          }
          break;
        case "Switch":
          collectCaptures((node as AST.SwitchStmt).expression);
          for (const switchCase of (node as AST.SwitchStmt).cases) {
            collectCaptures(switchCase.value);
            collectCaptures(switchCase.body);
          }
          collectCaptures((node as AST.SwitchStmt).defaultCase);
          break;
        case "ExpressionStmt":
          collectCaptures((node as AST.ExpressionStmt).expression);
          break;
        case "Defer":
          collectCaptures((node as AST.DeferStmt).statement);
          break;
        case "Binary":
          collectCaptures((node as AST.BinaryExpr).left);
          collectCaptures((node as AST.BinaryExpr).right);
          break;
        case "Unary":
          collectCaptures((node as AST.UnaryExpr).operand);
          break;
        case "InterpolatedString":
          collectCaptures((node as AST.InterpolatedStringExpr).parts);
          collectCaptures((node as AST.InterpolatedStringExpr).desugared);
          break;
        case "Call":
          collectCaptures((node as AST.CallExpr).callee);
          collectCaptures((node as AST.CallExpr).args);
          break;
        case "Member":
          collectCaptures((node as AST.MemberExpr).object);
          break;
        case "Index":
          collectCaptures((node as AST.IndexExpr).object);
          collectCaptures((node as AST.IndexExpr).index);
          break;
        case "Assignment":
          collectCaptures((node as AST.AssignmentExpr).assignee);
          collectCaptures((node as AST.AssignmentExpr).value);
          break;
        case "Cast":
          collectCaptures((node as AST.CastExpr).expression);
          break;
        case "Group":
          collectCaptures((node as AST.GroupExpr).expression);
          break;
        case "Is":
          collectCaptures((node as AST.IsExpr).expression);
          break;
        case "As":
          collectCaptures((node as AST.AsExpr).expression);
          break;
        case "Ternary":
          collectCaptures((node as AST.TernaryExpr).condition);
          collectCaptures((node as AST.TernaryExpr).trueExpr);
          collectCaptures((node as AST.TernaryExpr).falseExpr);
          break;
        case "GenericInstantiation":
          collectCaptures((node as AST.GenericInstantiationExpr).base);
          break;
        case "StructLiteral":
          collectCaptures((node as AST.StructLiteralExpr).fields);
          break;
        case "ArrayLiteral":
          collectCaptures((node as AST.ArrayLiteralExpr).elements);
          break;
        case "TupleLiteral":
          collectCaptures((node as AST.TupleLiteralExpr).elements);
          break;
        case "EnumStructVariant":
          collectCaptures((node as AST.EnumStructVariantExpr).fields);
          break;
        case "Sizeof":
          collectCaptures((node as AST.SizeofExpr).target);
          break;
        case "TypeOf":
          collectCaptures((node as AST.TypeOfExpr).target);
          break;
        case "TypeMatch":
          collectCaptures((node as AST.TypeMatchExpr).value);
          break;
        case "Match":
          collectCaptures((node as AST.MatchExpr).value);
          collectCaptures((node as AST.MatchExpr).arms);
          break;
        case "MatchArm":
          withShadowedCaptureNames(
            collectPatternBindingNames((node as AST.MatchArm).pattern),
            () => {
              collectCaptures((node as AST.MatchArm).guard);
              collectCaptures((node as AST.MatchArm).body);
            },
          );
          break;
        case "LambdaExpression":
          // For nested lambdas, we need to analyze their body for captures too.
          // Variables captured by nested lambdas that come from our scope need to be
          // captured by the defer block as well.
          // Skip the parameters (they shadow outer vars) but analyze the body.
          {
            const lambda = node as AST.LambdaExpr;
            const paramNames = new Set(lambda.params.map((p) => p.name));
            // Temporarily mark params as visited to avoid capturing them
            // We need a custom traversal that skips parameter identifiers
            const analyzeNestedLambda = (n: any) => {
              if (!n || typeof n !== "object") return;
              if (visited.has(n)) return;
              visited.add(n);

              if (n.kind === "Identifier") {
                const name = n.name;
                // Skip if this is a lambda parameter
                if (paramNames.has(name)) return;
                // Capture if it's a local from our scope
                if (this.locals.has(name) && !captures.has(name)) {
                  captures.set(name, this.localTypes.get(name)!);
                }
              }

              if (Array.isArray(n)) {
                for (const item of n) analyzeNestedLambda(item);
                return;
              }

              // Recursively traverse known AST nodes
              for (const key of Object.keys(n)) {
                if (key === "location" || key === "kind") continue;
                analyzeNestedLambda(n[key]);
              }
            };
            analyzeNestedLambda(lambda.body);
          }
          break;
        // Add other nodes as needed
      }
    };
    collectCaptures(stmt.statement);

    const capturedVariables: AST.VariableDecl[] = [];
    for (const [name, type] of captures) {
      capturedVariables.push({
        kind: "VariableDecl",
        isGlobal: false,
        isConst: false,
        name: name,
        typeAnnotation: type,
        location: uniqueLoc,
        initializer: undefined,
      } as AST.VariableDecl);
    }

    const lambdaExpr: AST.LambdaExpr = {
      kind: "LambdaExpression",
      params: [],
      returnType: {
        kind: "BasicType",
        name: "void",
        genericArgs: [],
        pointerDepth: 0,
        arrayDimensions: [],
        location: uniqueLoc,
      },
      body:
        stmt.statement.kind === "Block"
          ? (stmt.statement as AST.BlockStmt)
          : {
              kind: "Block",
              statements: [stmt.statement],
              location: uniqueLoc,
            },
      location: uniqueLoc,
      resolvedType: {
        kind: "LambdaType",
        returnType: {
          kind: "BasicType",
          name: "void",
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: uniqueLoc,
        },
        paramTypes: [],
        location: uniqueLoc,
      },
      capturedVariables: capturedVariables,
      captureStructName:
        capturedVariables.length > 0
          ? `struct.lambda_capture_${this.nextTypeId++}`
          : undefined,
    };

    // 2. Generate Lambda construction
    // This emits the function and returns the struct value (as a register string)
    const lambdaVal = this.generateExpression(lambdaExpr);
    this.emit(`; Lambda Value: ${lambdaVal}`);
    const lambdaType = this.resolveType(lambdaExpr.resolvedType!);

    // 3. Extract func and ctx
    const funcVal = this.newRegister();
    this.emit(`  ${funcVal} = extractvalue ${lambdaType} ${lambdaVal}, 0`);
    const ctxVal = this.newRegister();
    this.emit(`  ${ctxVal} = extractvalue ${lambdaType} ${lambdaVal}, 1`);

    // 4. Allocate DeferNode
    const nodeSize = 24; // 8 ptr + 8 ptr + 8 ptr
    const nodeVoidPtr = this.newRegister();
    this.emit(`  ${nodeVoidPtr} = call i8* @malloc(i64 ${nodeSize})`);
    const nodePtr = this.newRegister();
    this.emit(
      `  ${nodePtr} = bitcast i8* ${nodeVoidPtr} to %struct.DeferNode*`,
    );

    // 5. Fill DeferNode
    // func (cast to i8*)
    const funcVoid = this.newRegister();
    this.emit(`  ${funcVoid} = bitcast void (i8*)* ${funcVal} to i8*`);
    const funcField = this.newRegister();
    this.emit(
      `  ${funcField} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${nodePtr}, i32 0, i32 0`,
    );
    this.emit(`  store i8* ${funcVoid}, i8** ${funcField}`);

    // ctx
    const ctxField = this.newRegister();
    this.emit(
      `  ${ctxField} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${nodePtr}, i32 0, i32 1`,
    );
    this.emit(`  store i8* ${ctxVal}, i8** ${ctxField}`);

    // next
    const currentTop = this.newRegister();
    this.emit(
      `  ${currentTop} = load %struct.DeferNode*, %struct.DeferNode** @defer_top`,
    );
    const nextField = this.newRegister();
    this.emit(
      `  ${nextField} = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* ${nodePtr}, i32 0, i32 2`,
    );
    this.emit(
      `  store %struct.DeferNode* ${currentTop}, %struct.DeferNode** ${nextField}`,
    );

    // Update top
    this.emit(
      `  store %struct.DeferNode* ${nodePtr}, %struct.DeferNode** @defer_top`,
    );

    // 6. Push cleanup to scope.deferred
    // We push a block that pops the runtime node, frees it, and then executes the body via lambda call.
    // Using a lambda call ensures correct semantics (return in defer returns from lambda, not outer function).
    this.scopeStack[this.scopeStack.length - 1]!.deferred.push({
      kind: "Block",
      statements: [
        {
          kind: "RuntimeDeferCleanup",
          ctxVal: ctxVal,
          location: stmt.location,
        } as AST.RuntimeDeferCleanupStmt,
        {
          kind: "LambdaCall",
          funcVal: funcVal,
          ctxVal: ctxVal,
          location: stmt.location,
        } as any,
        {
          kind: "FreeCaptureStruct",
          ctxVal: ctxVal,
          location: stmt.location,
        } as any,
      ],
      location: stmt.location,
    });
  }
}
