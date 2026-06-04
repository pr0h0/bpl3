/**
 * Handles control flow statement code generation.
 *
 * Generates code for:
 * - If/else statements
 * - Loop statements (for, while, infinite loop)
 * - Switch/case statements
 * - Return statements
 * - Variable declarations (local)
 * - Block statements with scope management
 * - Break/continue statements
 * - Expression statements
 *
 * @extends AsmGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { walkAST } from "../../common/ASTTraversal";
import { CompilerError } from "../../common/CompilerError";
import { codeGenLog } from "../../common/Logger";
import { TokenType } from "../../frontend/TokenType";
import { lowerImplicitConversion } from "../../middleend/lowering/ImplicitConversions";
import { AsmGenerator } from "./AsmGenerator";

const OPTIMIZED_NATIVE_STACK_LIMIT_BYTES = 1024 * 1024;
const LLVM_FRAME_ADDRESS_INTRINSIC = "llvm.frameaddress.p0i8";
const EMPTY_POINTER_EXPRESSION_PROOFS: readonly string[] = [];

type NullGuardProof = {
  expressionKey: string;
  nonNullWhenCondition: boolean;
};

export abstract class StatementGenerator extends AsmGenerator {
  protected switchStack: { labels: string[]; activeIndex: number }[] = [];
  protected currentFunctionEmitsStackFrameHooks = true;
  protected currentFunctionUsesAllocaStackLimitProbe = false;
  private structDefaultInitializationRequiredCache: Map<string, boolean> =
    new Map();

  protected clearDefaultValueCaches(): void {
    this.structDefaultInitializationRequiredCache.clear();
  }

  protected noteGeneratedMainArgcStore(): void {}

  protected noteGeneratedMainArgvStore(): void {}

  private getStructDeclForAutoDestroy(
    typeNode: AST.TypeNode | undefined,
  ): AST.StructDecl | undefined {
    if (!typeNode || typeNode.kind !== "BasicType") return undefined;
    if (typeNode.pointerDepth !== 0 || typeNode.arrayDimensions.length > 0) {
      return undefined;
    }

    if (
      typeNode.resolvedDeclaration &&
      typeNode.resolvedDeclaration.kind === "StructDecl"
    ) {
      return typeNode.resolvedDeclaration as AST.StructDecl;
    }

    return this.structMap.get(typeNode.name);
  }

  private findAutoDestroyMethod(
    typeNode: AST.TypeNode | undefined,
  ): AST.FunctionDecl | undefined {
    const structDecl = this.getStructDeclForAutoDestroy(typeNode);
    if (!structDecl) return undefined;

    return structDecl.members.find((member): member is AST.FunctionDecl => {
      if (member.kind !== "FunctionDecl" || member.name !== "destroy") {
        return false;
      }
      if (!member.attributes.some((attr) => attr.name === "auto_destroy")) {
        return false;
      }
      const thisParam = member.params[0];
      if (!thisParam || thisParam.name !== "this") return false;
      if (thisParam.type.kind !== "BasicType") return false;
      return (
        thisParam.type.name === structDecl.name &&
        thisParam.type.pointerDepth === 1
      );
    });
  }

  private getAutoDestroyMethodType(
    method: AST.FunctionDecl,
    typeNode: AST.TypeNode,
  ): AST.FunctionTypeNode {
    let methodType = method.resolvedType as AST.FunctionTypeNode;
    const structDecl = this.getStructDeclForAutoDestroy(typeNode);

    if (
      structDecl &&
      typeNode.kind === "BasicType" &&
      structDecl.genericParams.length > 0 &&
      typeNode.genericArgs.length > 0
    ) {
      const typeMap = new Map<string, AST.TypeNode>();
      for (let i = 0; i < structDecl.genericParams.length; i++) {
        const arg = typeNode.genericArgs[i];
        if (arg) {
          typeMap.set(structDecl.genericParams[i]!.name, arg);
        }
      }
      methodType = this.substituteType(
        methodType,
        typeMap,
      ) as AST.FunctionTypeNode;
    }

    return methodType;
  }

  private registerAutoDestroy(
    name: string,
    address: string,
    typeNode: AST.TypeNode | undefined,
    location: AST.ASTNode["location"],
  ): void {
    if (this.scopeStack.length === 0 || !typeNode) return;

    const method = this.findAutoDestroyMethod(typeNode);
    if (!method) return;

    this.scopeStack[this.scopeStack.length - 1]!.deferred.push({
      kind: "AutoDestroy",
      name,
      address,
      type: typeNode,
      method,
      location,
    } as AST.AutoDestroyStmt);
  }

  private getMovedAutoDestroyAddress(
    expr: AST.Expression | undefined,
    destTypeNode: AST.TypeNode,
  ): string | undefined {
    if (!expr) return undefined;
    if (expr.kind === "Group") {
      return this.getMovedAutoDestroyAddress(
        (expr as AST.GroupExpr).expression,
        destTypeNode,
      );
    }
    if (expr.kind !== "Identifier") return undefined;

    const identifier = expr as AST.IdentifierExpr;
    const address = this.localPointers.get(identifier.name);
    const localType = this.localTypes.get(identifier.name);
    if (!address || !localType || !this.findAutoDestroyMethod(localType)) {
      return undefined;
    }

    if (this.resolveType(localType) !== this.resolveType(destTypeNode)) {
      return undefined;
    }

    return address;
  }

  private shouldEmitStackFrameHooksForFunction(
    decl: AST.FunctionDecl,
    emittedName: string,
  ): boolean {
    if (decl.name === "main" || emittedName === "main") {
      return !this.isRuntimeFreeOptimizedNativeMain(decl);
    }

    return !this.isTrivialLeafReturnFunction(decl);
  }

  private isRuntimeFreeOptimizedNativeMain(decl: AST.FunctionDecl): boolean {
    if (!this.shouldUseStackLimitProbe()) return false;

    return decl.body.statements.every((stmt) =>
      this.isRuntimeFreeMainStatement(stmt),
    );
  }

  private isRuntimeFreeMainStatement(stmt: AST.Statement): boolean {
    if (stmt.kind === "Return") {
      const value = (stmt as AST.ReturnStmt).value;
      return !value || this.isLeafExpression(value);
    }

    if (stmt.kind === "ExpressionStmt") {
      return this.isRuntimeFreeExternCallExpression(
        (stmt as AST.ExpressionStmt).expression,
      );
    }

    return false;
  }

  private isRuntimeFreeExternCallExpression(expr: AST.Expression): boolean {
    if (expr.kind === "Group") {
      return this.isRuntimeFreeExternCallExpression(
        (expr as AST.GroupExpr).expression,
      );
    }
    if (expr.kind !== "Call") return false;

    const call = expr as AST.CallExpr;
    if (call.operatorOverload) return false;
    if (call.resolvedDeclaration?.kind !== "Extern") return false;
    return call.args.every((arg) => this.isLeafExpression(arg));
  }

  private shouldInlineStackFrameChecks(): boolean {
    if (this.generateDwarf || this.optimizationLevel < 2) return false;
    return !this.target?.toLowerCase().includes("wasm");
  }

  private shouldUseStackLimitProbe(): boolean {
    return (
      this.shouldInlineStackFrameChecks() && this.optimizationLevel >= 3
    );
  }

  private emitStackFrameEnter(): void {
    if (!this.currentFunctionEmitsStackFrameHooks) return;

    if (this.shouldUseStackLimitProbe()) {
      this.emitStackLimitProbe();
      return;
    }

    if (!this.shouldInlineStackFrameChecks()) {
      this.emit(`  call void @__bpl_enter_stack_frame()`);
      return;
    }

    const depth = this.newRegister();
    const nextDepth = this.newRegister();
    const overflow = this.newRegister();
    const overflowLabel = this.newLabel("stack.check.overflow");
    const continueLabel = this.newLabel("stack.check.cont");
    this.emit(`  ${depth} = load i32, i32* @__bpl_stack_depth`);
    this.emit(`  ${nextDepth} = add i32 ${depth}, 1`);
    this.emit(`  store i32 ${nextDepth}, i32* @__bpl_stack_depth`);
    this.emit(`  ${overflow} = icmp ugt i32 ${nextDepth}, 10000`);
    this.emit(
      `  br i1 ${overflow}, label %${overflowLabel}, label %${continueLabel}`,
    );
    this.emit(`${overflowLabel}:`);
    this.emit(`  call void @__bpl_throw_stack_overflow()`);
    this.emit(`  unreachable`);
    this.emit(`${continueLabel}:`);
  }

  private emitStackLimitProbe(): void {
    const probe = this.newRegister();
    const limit = this.newRegister();
    const checkLabel = this.newLabel("stack.limit.check");
    const overflowLabel = this.newLabel("stack.limit.overflow");
    const continueLabel = this.newLabel("stack.limit.cont");

    if (this.currentFunctionUsesAllocaStackLimitProbe) {
      this.emit(`  ${probe} = alloca i8`);
    } else {
      if (!this.declaredFunctions.has(LLVM_FRAME_ADDRESS_INTRINSIC)) {
        this.emitDeclaration(
          `declare i8* @${LLVM_FRAME_ADDRESS_INTRINSIC}(i32)`,
        );
        this.declaredFunctions.add(LLVM_FRAME_ADDRESS_INTRINSIC);
      }
      this.emit(
        `  ${probe} = call i8* @${LLVM_FRAME_ADDRESS_INTRINSIC}(i32 0)`,
      );
    }
    this.emit(`  ${limit} = load i8*, i8** @__bpl_stack_limit`);

    let effectiveLimit = limit;
    if (this.currentFunctionName === "main") {
      const computedLimit = this.newRegister();
      const limitUnset = this.newRegister();
      const initLimitLabel = this.newLabel("stack.limit.init");
      effectiveLimit = this.newRegister();
      this.emit(
        `  ${computedLimit} = getelementptr i8, i8* ${probe}, i64 -${OPTIMIZED_NATIVE_STACK_LIMIT_BYTES}`,
      );
      this.emit(`  ${limitUnset} = icmp eq i8* ${limit}, null`);
      this.emit(
        `  ${effectiveLimit} = select i1 ${limitUnset}, i8* ${computedLimit}, i8* ${limit}`,
      );
      this.emit(
        `  br i1 ${limitUnset}, label %${initLimitLabel}, label %${checkLabel}`,
      );
      this.emit(`${initLimitLabel}:`);
      this.emit(`  store i8* ${computedLimit}, i8** @__bpl_stack_limit`);
      this.emit(`  br label %${checkLabel}`);
      this.emit(`${checkLabel}:`);
    }

    // Supported native targets use downward-growing stacks, so crossing the
    // cached lower-limit pointer means the stack guard has been exhausted.
    const overflow = this.newRegister();
    this.emit(`  ${overflow} = icmp ult i8* ${probe}, ${effectiveLimit}`);
    this.emit(
      `  br i1 ${overflow}, label %${overflowLabel}, label %${continueLabel}`,
    );
    this.emit(`${overflowLabel}:`);
    this.emit(`  call void @__bpl_throw_stack_overflow()`);
    this.emit(`  unreachable`);
    this.emit(`${continueLabel}:`);
  }

  private emitStackFrameExit(): void {
    if (!this.currentFunctionEmitsStackFrameHooks) return;

    if (this.shouldUseStackLimitProbe()) return;

    if (!this.shouldInlineStackFrameChecks()) {
      this.emit(`  call void @__bpl_exit_stack_frame()`);
      return;
    }

    const depth = this.newRegister();
    const nextDepth = this.newRegister();
    this.emit(`  ${depth} = load i32, i32* @__bpl_stack_depth`);
    this.emit(`  ${nextDepth} = sub i32 ${depth}, 1`);
    this.emit(`  store i32 ${nextDepth}, i32* @__bpl_stack_depth`);
  }

  private isTrivialLeafReturnFunction(decl: AST.FunctionDecl): boolean {
    if (decl.body.statements.length !== 1) return false;

    const stmt = decl.body.statements[0]!;
    if (stmt.kind !== "Return") return false;

    const value = (stmt as AST.ReturnStmt).value;
    return !value || this.isLeafExpression(value);
  }

  private hasDirectTailRecursiveReturn(decl: AST.FunctionDecl): boolean {
    const scanStatement = (stmt: AST.Statement): boolean => {
      switch (stmt.kind) {
        case "Return":
          return this.isDirectSelfCallExpression(
            (stmt as AST.ReturnStmt).value,
            decl,
          );
        case "Block":
          return (stmt as AST.BlockStmt).statements.some(scanStatement);
        case "If": {
          const ifStmt = stmt as AST.IfStmt;
          return (
            scanStatement(ifStmt.thenBranch) ||
            (ifStmt.elseBranch ? scanStatement(ifStmt.elseBranch) : false)
          );
        }
        case "Loop": {
          const loop = stmt as AST.LoopStmt;
          return (
            (loop.init ? scanStatement(loop.init) : false) ||
            scanStatement(loop.body)
          );
        }
        case "Defer":
          return scanStatement((stmt as AST.DeferStmt).statement);
        case "Try": {
          const tryStmt = stmt as AST.TryStmt;
          return (
            scanStatement(tryStmt.tryBlock) ||
            tryStmt.catchClauses.some((clause) => scanStatement(clause.body))
          );
        }
        case "Switch": {
          const switchStmt = stmt as AST.SwitchStmt;
          return (
            switchStmt.cases.some((switchCase) =>
              scanStatement(switchCase.body),
            ) ||
            (switchStmt.defaultCase
              ? scanStatement(switchStmt.defaultCase)
              : false)
          );
        }
        default:
          return false;
      }
    };

    return decl.body.statements.some(scanStatement);
  }

  private hasDirectRecursiveCall(decl: AST.FunctionDecl): boolean {
    let found = false;
    walkAST(decl.body, (node) => {
      if (
        node.kind === "Call" &&
        this.isDirectSelfCallExpression(node as AST.CallExpr, decl)
      ) {
        found = true;
        return false;
      }
    });
    return found;
  }

  private isDirectSelfCallExpression(
    expr: AST.Expression | undefined,
    decl: AST.FunctionDecl,
  ): boolean {
    if (!expr) return false;
    if (expr.kind === "Group") {
      return this.isDirectSelfCallExpression(
        (expr as AST.GroupExpr).expression,
        decl,
      );
    }
    if (expr.kind !== "Call") return false;

    const call = expr as AST.CallExpr;
    if (call.operatorOverload) return false;
    if (call.resolvedDeclaration === decl) return true;
    return (
      call.callee.kind === "Identifier" &&
      (call.callee as AST.IdentifierExpr).name === decl.name
    );
  }

  private isLeafExpression(expr: AST.Expression): boolean {
    switch (expr.kind) {
      case "Literal":
      case "Identifier":
      case "OffsetOf":
        return true;
      case "Group":
        return this.isLeafExpression((expr as AST.GroupExpr).expression);
      case "Binary": {
        const binary = expr as AST.BinaryExpr;
        return (
          !binary.operatorOverload &&
          this.isLeafExpression(binary.left) &&
          this.isLeafExpression(binary.right)
        );
      }
      case "Unary": {
        const unary = expr as AST.UnaryExpr;
        return !unary.operatorOverload && this.isLeafExpression(unary.operand);
      }
      case "Cast":
        return this.isLeafExpression((expr as AST.CastExpr).expression);
      case "Is":
        return this.isLeafExpression((expr as AST.IsExpr).expression);
      case "As":
        return this.isLeafExpression((expr as AST.AsExpr).expression);
      case "Member":
        return this.isLeafExpression((expr as AST.MemberExpr).object);
      case "Index": {
        const index = expr as AST.IndexExpr;
        return (
          !index.operatorOverload &&
          this.isLeafExpression(index.object) &&
          this.isLeafExpression(index.index)
        );
      }
      case "ArrayLiteral":
        return (expr as AST.ArrayLiteralExpr).elements.every((element) =>
          this.isLeafExpression(element),
        );
      case "TupleLiteral":
        return (expr as AST.TupleLiteralExpr).elements.every((element) =>
          this.isLeafExpression(element),
        );
      case "Ternary": {
        const ternary = expr as AST.TernaryExpr;
        return (
          this.isLeafExpression(ternary.condition) &&
          this.isLeafExpression(ternary.trueExpr) &&
          this.isLeafExpression(ternary.falseExpr)
        );
      }
      case "Sizeof":
      case "TypeOf":
        return true;
      default:
        return false;
    }
  }

  private getConstrainedGenericParamName(
    type: AST.TypeNode,
    constrainedNames: Set<string>,
  ): string | undefined {
    if (type.kind !== "BasicType") return undefined;

    const basic = type as AST.BasicTypeNode;
    if (!constrainedNames.has(basic.name)) return undefined;
    if (basic.genericArgs.length > 0) return undefined;
    if (basic.arrayDimensions.length > 0) return undefined;

    return basic.name;
  }

  private getRuntimeStructCheckInfo(
    type: AST.TypeNode,
  ): { llvmType: string; structName: string; isPointer: boolean } | undefined {
    const llvmType = this.resolveType(type);
    const pointerMatch = llvmType.match(/\*+$/);
    const pointerDepth = pointerMatch ? pointerMatch[0].length : 0;
    if (pointerDepth > 1) return undefined;

    const baseType =
      pointerDepth === 0 ? llvmType : llvmType.slice(0, -pointerDepth);
    if (!baseType.startsWith("%struct.")) return undefined;

    const structName = baseType.slice("%struct.".length);
    if (!this.hasRuntimeVTable(structName)) return undefined;

    return {
      llvmType,
      structName,
      isPointer: pointerDepth === 1,
    };
  }

  private hasRuntimeVTable(structName: string): boolean {
    const layout = this.vtableLayouts.get(structName);
    if (!layout || layout.length === 0) return false;

    if (!this.vtableGlobalNames.has(structName)) {
      this.vtableGlobalNames.set(structName, `@${structName}_vtable`);
    }

    return true;
  }

  private getAllowedRuntimeStructNames(expectedStructName: string): string[] {
    const names = new Set<string>();
    names.add(expectedStructName);

    for (const candidateName of this.structMap.keys()) {
      if (this.checkInheritance(candidateName, expectedStructName)) {
        names.add(candidateName);
      }
    }

    return Array.from(names).filter((name) => this.hasRuntimeVTable(name));
  }

  private emitRuntimeGenericConstraintChecks(
    decl: AST.FunctionDecl,
    effectiveFuncType: AST.FunctionTypeNode,
  ): void {
    if (decl.genericParams.length === 0) return;

    const constrainedNames = new Set(
      decl.genericParams
        .filter((param) => param.constraint)
        .map((param) => param.name),
    );
    if (constrainedNames.size === 0) return;

    for (let i = 0; i < decl.params.length; i++) {
      const param = decl.params[i]!;
      if (param.isVariadic) continue;

      const genericName = this.getConstrainedGenericParamName(
        param.type,
        constrainedNames,
      );
      if (!genericName) continue;
      if (!this.currentTypeMap.has(genericName)) continue;

      const concreteParamType = effectiveFuncType.paramTypes[i];
      if (!concreteParamType) continue;

      const checkInfo = this.getRuntimeStructCheckInfo(concreteParamType);
      if (!checkInfo) continue;

      const stackAddr = this.localPointers.get(param.name);
      if (!stackAddr) continue;

      const allowedStructNames = this.getAllowedRuntimeStructNames(
        checkInfo.structName,
      );
      if (allowedStructNames.length === 0) continue;

      this.emitRuntimeGenericConstraintCheck(
        decl.name,
        param.name,
        stackAddr,
        checkInfo,
        allowedStructNames,
      );
    }
  }

  private emitRuntimeGenericConstraintCheck(
    functionName: string,
    parameterName: string,
    stackAddr: string,
    checkInfo: { llvmType: string; structName: string; isPointer: boolean },
    allowedStructNames: string[],
  ): void {
    const okLabel = this.newLabel(`generic_constraint_ok_${parameterName}`);
    const failLabel = this.newLabel(`generic_constraint_fail_${parameterName}`);
    const checkLabel = this.newLabel(
      `generic_constraint_check_${parameterName}`,
    );

    let objectPtr = stackAddr;

    if (checkInfo.isPointer) {
      objectPtr = this.newRegister();
      this.emit(
        `  ${objectPtr} = load ${checkInfo.llvmType}, ${checkInfo.llvmType}* ${stackAddr}`,
      );

      const isNull = this.newRegister();
      this.emit(
        `  ${isNull} = icmp eq ${checkInfo.llvmType} ${objectPtr}, null`,
      );
      this.emit(
        `  br i1 ${isNull}, label %${okLabel}, label %${checkLabel}`,
      );
      this.emit(`${checkLabel}:`);
    }

    const vtablePtrPtr = this.newRegister();
    const structPtrType = `%struct.${checkInfo.structName}*`;
    this.emit(
      `  ${vtablePtrPtr} = bitcast ${structPtrType} ${objectPtr} to i8**`,
    );

    const actualVtable = this.newRegister();
    this.emit(`  ${actualVtable} = load i8*, i8** ${vtablePtrPtr}`);

    let aggregateMatch: string | undefined;
    for (const allowedStructName of allowedStructNames) {
      const vtableGlobal = this.vtableGlobalNames.get(allowedStructName);
      const vtableLayout = this.vtableLayouts.get(allowedStructName);
      if (!vtableGlobal || !vtableLayout || vtableLayout.length === 0) {
        continue;
      }

      const expectedVtable = this.newRegister();
      const vtableType = `[${vtableLayout.length} x i8*]`;
      this.emit(
        `  ${expectedVtable} = bitcast ${vtableType}* ${vtableGlobal} to i8*`,
      );

      const matchesThisType = this.newRegister();
      this.emit(
        `  ${matchesThisType} = icmp eq i8* ${actualVtable}, ${expectedVtable}`,
      );

      if (!aggregateMatch) {
        aggregateMatch = matchesThisType;
      } else {
        const combined = this.newRegister();
        this.emit(
          `  ${combined} = or i1 ${aggregateMatch}, ${matchesThisType}`,
        );
        aggregateMatch = combined;
      }
    }

    if (!aggregateMatch) {
      this.emit(`  br label %${okLabel}`);
    } else {
      this.emit(
        `  br i1 ${aggregateMatch}, label %${okLabel}, label %${failLabel}`,
      );
    }

    this.emit(`${failLabel}:`);
    const message =
      "\n*** GENERIC CONSTRAINT CHECK FAILED ***\n" +
      `Function: ${functionName}\n` +
      `Parameter: ${parameterName}\n` +
      `Expected runtime type: ${checkInfo.structName}\n\n`;
    const messagePtr = this.getStringLiteralPtr(message);
    const stderrPtr = this.newRegister();
    this.emit(
      `  ${stderrPtr} = load %struct._IO_FILE*, %struct._IO_FILE** @stderr`,
    );
    const fprintfResult = this.newRegister();
    this.emit(
      `  ${fprintfResult} = call i32 @fprintf(%struct._IO_FILE* ${stderrPtr}, i8* ${messagePtr})`,
    );
    this.emit("  call void @exit(i32 1)");
    this.emit("  unreachable");

    this.emit(`${okLabel}:`);
  }

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

    let declaredInBlock: Set<string> | undefined;

    const collectDeclaredNames = (
      name: string | any[] | { name: string; type?: AST.TypeNode }[],
    ) => {
      if (typeof name === "string") {
        const declaredNames = (declaredInBlock ??= new Set<string>());
        declaredNames.add(name);
      } else if (Array.isArray(name)) {
        for (const item of name) {
          if (Array.isArray(item)) {
            collectDeclaredNames(item);
          } else if (item && typeof item.name === "string") {
            const declaredNames = (declaredInBlock ??= new Set<string>());
            declaredNames.add(item.name);
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
    let savedPointers: Map<string, string> | undefined;
    let savedTypes: Map<string, AST.TypeNode> | undefined;

    if (declaredInBlock) {
      savedPointers = new Map<string, string>();
      savedTypes = new Map<string, AST.TypeNode>();

      for (const name of declaredInBlock) {
        if (this.localPointers.has(name)) {
          savedPointers.set(name, this.localPointers.get(name)!);
        }
        if (this.localTypes.has(name)) {
          savedTypes.set(name, this.localTypes.get(name)!);
        }
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
    if (declaredInBlock) {
      const blockSavedPointers = savedPointers!;
      const blockSavedTypes = savedTypes!;

      for (const name of declaredInBlock) {
        // Restore pointer
        if (blockSavedPointers.has(name)) {
          this.localPointers.set(name, blockSavedPointers.get(name)!);
        } else {
          this.localPointers.delete(name);
        }

        // Restore type
        if (blockSavedTypes.has(name)) {
          this.localTypes.set(name, blockSavedTypes.get(name)!);
        } else {
          this.localTypes.delete(name);
        }
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
      case "AutoDestroy":
        this.generateAutoDestroy(stmt as AST.AutoDestroyStmt);
        break;
      case "LambdaCall":
        this.generateLambdaCall(stmt as any);
        break;
      case "FreeCaptureStruct":
        this.generateFreeCaptureStruct(stmt as any);
        break;
      case "Extern":
        // Just to remove warning since its handled elsewhere
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

  protected generateAutoDestroy(stmt: AST.AutoDestroyStmt) {
    if (this.movedAutoDestroyAddresses?.has(stmt.address)) {
      return;
    }

    const type = this.resolveType(stmt.type);
    if (!type.startsWith("%struct.") || type.endsWith("*")) {
      return;
    }

    const methodType = this.getAutoDestroyMethodType(stmt.method, stmt.type);
    const returnType = this.resolveType(methodType.returnType);
    const thisType = this.resolveType(methodType.paramTypes[0]!);
    let structName = type.substring(8);
    while (structName.endsWith("*")) {
      structName = structName.slice(0, -1);
    }

    const methodName = `${structName}_${stmt.method.name}`;
    const destroyName = this.getMangledName(methodName, methodType);

    if (returnType === "void") {
      this.emit(`  call void @${destroyName}(${thisType} ${stmt.address})`);
    } else {
      const result = this.newRegister();
      this.emit(
        `  ${result} = call ${returnType} @${destroyName}(${thisType} ${stmt.address})`,
      );
    }
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

  private structNeedsDefaultInitialization(
    structName: string,
    seen: Set<string> = new Set(),
  ): boolean {
    const cached = this.structDefaultInitializationRequiredCache.get(structName);
    if (cached !== undefined) return cached;

    const layout = this.structLayouts.get(structName);
    if (!layout) return false;

    if (layout.has("__vtable__")) {
      this.structDefaultInitializationRequiredCache.set(structName, true);
      return true;
    }

    if (seen.has(structName)) return false;

    const decl = this.structMap.get(structName);
    if (!decl) return false;

    seen.add(structName);
    for (const field of this.getAllStructFields(decl)) {
      const fieldType = field.resolvedType || field.type;
      const fieldLlvmType = this.resolveType(fieldType);

      if (fieldLlvmType.startsWith("%enum.") && !fieldLlvmType.endsWith("*")) {
        seen.delete(structName);
        this.structDefaultInitializationRequiredCache.set(structName, true);
        return true;
      }

      if (
        fieldLlvmType.startsWith("%struct.") &&
        !fieldLlvmType.endsWith("*") &&
        this.structNeedsDefaultInitialization(fieldLlvmType.substring(8), seen)
      ) {
        seen.delete(structName);
        this.structDefaultInitializationRequiredCache.set(structName, true);
        return true;
      }
    }
    seen.delete(structName);

    this.structDefaultInitializationRequiredCache.set(structName, false);
    return false;
  }

  protected generateDefaultValue(type: AST.TypeNode): string {
    const llvmType = this.resolveType(type);

    if (llvmType.startsWith("%struct.") && !llvmType.endsWith("*")) {
      const structName = llvmType.substring(8);
      const layout = this.structLayouts.get(structName);
      if (!layout) return "undef";
      if (!this.structNeedsDefaultInitialization(structName)) return "undef";

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

            const sourceTypeNode = this.getTargetTypeNodeFromTuple(
              decl.initializer!.resolvedType!,
              [...indexPath, i],
            );
            const targetTypeNode = target.type || sourceTypeNode;
            const targetType = targetTypeNode
              ? this.resolveType(targetTypeNode)
              : this.getTargetTypeFromTuple(decl.initializer!.resolvedType!, [
                  ...indexPath,
                  i,
                ]);
            if (targetTypeNode) {
              this.localTypes.set(target.name, targetTypeNode);
            }

            const addr = this.allocateStack(target.name, targetType);

            // Extract the i-th element from the current tuple level (single index)
            const elemPtr = this.newRegister();
            this.emit(
              `  ${elemPtr} = extractvalue ${nestedTupleType} ${nestedTupleVal}, ${i}`,
            );

            const storeVal =
              sourceTypeNode && targetTypeNode
                ? this.emitCast(
                    elemPtr,
                    this.resolveType(sourceTypeNode),
                    targetType,
                    sourceTypeNode,
                    targetTypeNode,
                  )
                : elemPtr;

            // Store to the target variable
            this.emit(
              `  store ${targetType} ${storeVal}, ${targetType}* ${addr}`,
            );

            // DWARF: Variable declaration
            if (this.generateDwarf && this.currentSubprogramId !== -1) {
              const typeNode = targetTypeNode || {
                kind: "BasicType",
                name: "unknown",
              };

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

    // Initialize uninitialized array variables if elements need construction or vtable initialization
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
        } else {
          // No new() method, but if struct has vtable we still need to initialize it
          // Check if struct has any methods (which means it has a vtable)
          const hasMethods = structDecl.members.some(
            (m) => m.kind === "FunctionDecl",
          );
          if (hasMethods) {
            this.generateArrayVTableInitialization(
              addr,
              type,
              arrayTypeNode as AST.BasicTypeNode,
              structDecl,
            );
          }
        }
      }
    }

    if (decl.initializer) {
      const sourceTypeNode = decl.initializer.resolvedType!;
      const destTypeNode =
        decl.resolvedType || decl.typeAnnotation || sourceTypeNode;
      const srcType = this.resolveType(sourceTypeNode);
      const destType = type;
      let castVal: string;
      const conversion = lowerImplicitConversion(destTypeNode, sourceTypeNode);

      if (
        conversion.kind === "array-to-slice" &&
        this.isSliceTypeNode(destTypeNode) &&
        this.isFixedArrayTypeNode(sourceTypeNode)
      ) {
        try {
          const sourceAddr = this.generateAddress(decl.initializer);
          castVal = this.emitSliceFromArrayAddress(
            sourceAddr,
            sourceTypeNode,
            destTypeNode,
          );
        } catch {
          const val = this.generateExpression(decl.initializer);
          castVal = this.emitSliceFromArrayValue(
            val,
            sourceTypeNode,
            destTypeNode,
          );
        }
      } else if (
        conversion.kind === "array-to-pointer" &&
        this.isFixedArrayTypeNode(sourceTypeNode)
      ) {
        try {
          const sourceAddr = this.generateAddress(decl.initializer);
          castVal = this.emitPointerFromArrayAddress(
            sourceAddr,
            sourceTypeNode,
          );
        } catch {
          const val = this.generateExpression(decl.initializer);
          castVal = this.emitPointerFromArrayValue(val, sourceTypeNode);
        }
      } else if (
        decl.initializer.kind === "TupleLiteral" &&
        destTypeNode.kind === "TupleType"
      ) {
        castVal = this.generateTupleLiteralForTarget(
          decl.initializer as AST.TupleLiteralExpr,
          destTypeNode,
        );
      } else {
        const val = this.generateExpression(decl.initializer);
        castVal = this.emitCast(
          val,
          srcType,
          destType,
          sourceTypeNode,
          destTypeNode,
        );
      }
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

    this.registerAutoDestroy(
      decl.name as string,
      addr,
      typeNode,
      decl.location,
    );
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

    const movedAddress = !isMatchYield
      ? this.getMovedAutoDestroyAddress(stmt.value, destTypeNode)
      : undefined;

    let retVal: string | undefined;

    if (stmt.value) {
      retVal =
        stmt.value.kind === "TupleLiteral" && destTypeNode.kind === "TupleType"
          ? this.generateTupleLiteralForTarget(
              stmt.value as AST.TupleLiteralExpr,
              destTypeNode,
            )
          : this.emitCast(
              this.generateExpression(stmt.value),
              this.resolveType(stmt.value.resolvedType!),
              destType,
              stmt.value.resolvedType!,
              destTypeNode,
            );
    }

    // Only trigger function-level return hooks (like destructors) if not yielding from a match
    if (!isMatchYield) {
      if (movedAddress) {
        (this.movedAutoDestroyAddresses ??= new Set<string>()).add(
          movedAddress,
        );
      }

      // Run defers (LIFO)
      for (let i = this.scopeStack.length - 1; i >= 0; i--) {
        const scope = this.scopeStack[i]!;
        for (let j = scope.deferred.length - 1; j >= 0; j--) {
          this.generateStatement(scope.deferred[j]!);
        }
        if (scope.isFunction) break;
      }

      // Decrement stack depth
      this.emitStackFrameExit();

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
    const nullGuardProof = this.getTerminatingNullGuardProof(stmt.condition);
    const cond = this.generateExpression(stmt.condition);
    const thenLabel = this.newLabel("then");
    const elseLabel = this.newLabel("else");
    const mergeLabel = this.newLabel("merge");
    const incomingPointerExpressionProofs =
      this.basicBlockNonNullPointerExpressions.size === 0
        ? EMPTY_POINTER_EXPRESSION_PROOFS
        : this.getValidBasicBlockPointerExpressionProofKeys();
    const tracksPointerExpressionProofs =
      incomingPointerExpressionProofs.length > 0;
    const fallthroughPointerExpressionProofs:
      | (readonly string[])[]
      | undefined = tracksPointerExpressionProofs ? [] : undefined;

    const hasElse = !!stmt.elseBranch;
    const targetElse = hasElse ? elseLabel : mergeLabel;

    this.emit(`  br i1 ${cond}, label %${thenLabel}, label %${targetElse}`);

    this.emit(`${thenLabel}:`);
    if (tracksPointerExpressionProofs) {
      this.markBasicBlockPointerExpressionsNonNull(
        incomingPointerExpressionProofs,
      );
    }
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

    const thenTerminates = this.isTerminator(
      this.output[this.output.length - 1] || "",
    );
    if (!thenTerminates) {
      if (tracksPointerExpressionProofs) {
        fallthroughPointerExpressionProofs!.push(
          this.getValidBasicBlockPointerExpressionProofKeys(),
        );
      }
      this.emit(`  br label %${mergeLabel}`);
    }

    let elseTerminates = false;
    if (hasElse) {
      this.emit(`${elseLabel}:`);
      if (tracksPointerExpressionProofs) {
        this.markBasicBlockPointerExpressionsNonNull(
          incomingPointerExpressionProofs,
        );
      }
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

      elseTerminates = this.isTerminator(
        this.output[this.output.length - 1] || "",
      );
      if (!elseTerminates) {
        if (tracksPointerExpressionProofs) {
          fallthroughPointerExpressionProofs!.push(
            this.getValidBasicBlockPointerExpressionProofKeys(),
          );
        }
        this.emit(`  br label %${mergeLabel}`);
      }
    } else if (tracksPointerExpressionProofs) {
      fallthroughPointerExpressionProofs!.push(incomingPointerExpressionProofs);
    }

    this.emit(`${mergeLabel}:`);
    if (tracksPointerExpressionProofs) {
      this.markBasicBlockPointerExpressionsNonNull(
        this.intersectPointerExpressionProofs(
          fallthroughPointerExpressionProofs!,
        ),
      );
    }
    if (
      nullGuardProof &&
      this.nullGuardProvesNonNullAtMerge(
        nullGuardProof,
        thenTerminates,
        hasElse,
      )
    ) {
      this.markBasicBlockPointerExpressionNonNull(nullGuardProof.expressionKey);
    }
  }

  private intersectPointerExpressionProofs(
    proofSets: readonly (readonly string[])[],
  ): string[] {
    if (proofSets.length === 0) return [];
    if (proofSets.length === 1) return [...proofSets[0]!];

    const remainingSets = proofSets
      .slice(1)
      .map((proofSet) => new Set(proofSet));
    return proofSets[0]!.filter((proof) =>
      remainingSets.every((proofSet) => proofSet.has(proof)),
    );
  }

  private getTerminatingNullGuardProof(
    condition: AST.Expression,
  ): NullGuardProof | undefined {
    const expr = this.unwrapGroupExpression(condition);
    if (expr.kind !== "Binary") return undefined;

    const binary = expr as AST.BinaryExpr;
    if (binary.operatorOverload) return undefined;
    if (
      binary.operator.type !== TokenType.EqualEqual &&
      binary.operator.type !== TokenType.BangEqual
    ) {
      return undefined;
    }

    const leftKey = this.getGuardablePointerExpressionKey(binary.left);
    if (leftKey !== undefined && this.isNullptrLiteral(binary.right)) {
      return {
        expressionKey: leftKey,
        nonNullWhenCondition: binary.operator.type === TokenType.BangEqual,
      };
    }

    const rightKey = this.getGuardablePointerExpressionKey(binary.right);
    if (rightKey !== undefined && this.isNullptrLiteral(binary.left)) {
      return {
        expressionKey: rightKey,
        nonNullWhenCondition: binary.operator.type === TokenType.BangEqual,
      };
    }

    return undefined;
  }

  private nullGuardProvesNonNullAtMerge(
    proof: NullGuardProof,
    thenTerminates: boolean,
    hasElse: boolean,
  ): boolean {
    return !hasElse && !proof.nonNullWhenCondition && thenTerminates;
  }

  private getGuardablePointerExpressionKey(
    expr: AST.Expression,
  ): string | undefined {
    const unwrapped = this.unwrapGroupExpression(expr);
    if (unwrapped.kind !== "Identifier") return undefined;
    if (!this.isPointerTypeNode(unwrapped.resolvedType)) return undefined;
    return this.getBasicBlockPointerExpressionKey(unwrapped);
  }

  private isPointerTypeNode(type: AST.TypeNode | undefined): boolean {
    return type?.kind === "BasicType" && type.pointerDepth > 0;
  }

  private isNullptrLiteral(expr: AST.Expression): boolean {
    const unwrapped = this.unwrapGroupExpression(expr);
    return (
      unwrapped.kind === "Literal" &&
      (unwrapped as AST.LiteralExpr).type === "nullptr"
    );
  }

  private unwrapGroupExpression(expr: AST.Expression): AST.Expression {
    let current = expr;
    while (current.kind === "Group") {
      current = (current as AST.GroupExpr).expression;
    }
    return current;
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
    this.clearBasicBlockPointerFacts();
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

  private buildFunctionParameterList(
    params: AST.Parameter[],
    paramTypes: AST.TypeNode[],
  ): string {
    let result = "";

    for (let i = 0; i < params.length; i++) {
      const param = params[i]!;
      const type = this.resolveType(paramTypes[i]!);
      if (result.length > 0) {
        result += ", ";
      }
      result += `${type} %${param.name}`;
    }

    return result;
  }

  private getMethodBaseName(functionName: string): string {
    const lastUnderscore = functionName.lastIndexOf("_");
    return lastUnderscore === -1
      ? functionName
      : functionName.slice(lastUnderscore + 1);
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
    const prevLocals = this.locals;
    const prevLocalPointers = this.localPointers;
    const prevLocalTypes = this.localTypes;
    const prevLocalNullFlags = this.localNullFlags;
    const prevBasicBlockNonNullPointers = this.basicBlockNonNullPointers;
    const prevBasicBlockNonNullPointerExpressions =
      this.basicBlockNonNullPointerExpressions;
    const prevBasicBlockCallStableNonNullPointerExpressions =
      this.basicBlockCallStableNonNullPointerExpressions;
    const prevBasicBlockNonZeroIntegerExpressions =
      this.basicBlockNonZeroIntegerExpressions;
    const prevPointerToLocal = this.pointerToLocal;
    const prevCurrentFunctionAddressEscapedLocals =
      this.currentFunctionAddressEscapedLocals;
    const prevMovedAutoDestroyAddresses = this.movedAutoDestroyAddresses;
    const prevOnReturn = this.onReturn;
    const prevIsMainWithVoidReturn = this.isMainWithVoidReturn;
    const prevGeneratingFunctionBody = this.generatingFunctionBody;
    const prevSubprogramId = this.currentSubprogramId;
    const prevCurrentFunctionEmitsStackFrameHooks =
      this.currentFunctionEmitsStackFrameHooks;
    const prevCurrentFunctionUsesAllocaStackLimitProbe =
      this.currentFunctionUsesAllocaStackLimitProbe;

    try {
    this.registerCount = 0;
    this.labelCount = 0;
    this.stackAllocCount = 0;
    this.currentFunctionReturnType = decl.returnType;
    this.currentFunctionName = decl.name;
    this.locals = new Set();
    this.localPointers = new Map();
    this.localTypes = new Map();
    this.localNullFlags = new Map();
    this.basicBlockNonNullPointers = new Map();
    this.basicBlockNonNullPointerExpressions = new Map();
    this.basicBlockCallStableNonNullPointerExpressions = new Map();
    this.basicBlockNonZeroIntegerExpressions = undefined;
    this.pointerToLocal = new Map();
    this.currentFunctionAddressEscapedLocals = new Set();
    this.movedAutoDestroyAddresses = undefined;
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
      this.currentFunctionEmitsStackFrameHooks =
        this.shouldEmitStackFrameHooksForFunction(decl, name);
      const hasDirectRecursiveCall = this.hasDirectRecursiveCall(decl);
      this.currentFunctionUsesAllocaStackLimitProbe =
        this.shouldUseStackLimitProbe() &&
        (!hasDirectRecursiveCall || this.hasDirectTailRecursiveReturn(decl));

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

        const userParams = this.buildFunctionParameterList(
          decl.params,
          funcType.paramTypes,
        );

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

      const linkageParts: string[] = [];
      if (name.startsWith("Type_")) {
        linkageParts.push("linkonce_odr");
      } else if (
        this.useLinkOnceOdrForStdLib &&
        this.stdLibPath &&
        decl.location &&
        decl.location.file &&
        decl.location.file.startsWith(this.stdLibPath)
      ) {
        linkageParts.push("linkonce_odr");
      }
      if (this.optimizationLevel >= 2) {
        linkageParts.push("dso_local");
      }
      const linkage =
        linkageParts.length > 0 ? `${linkageParts.join(" ")} ` : "";
      let dbgSuffix = "";
      if (this.generateDwarf && this.currentSubprogramId !== -1) {
        dbgSuffix = ` !dbg !${this.currentSubprogramId}`;
      }
      const attrGroupId = this.getFunctionAttributeGroupId(decl);
      const attrSuffix = attrGroupId === undefined ? "" : ` #${attrGroupId}`;
      const alignSuffix = this.optimizationLevel >= 3 ? " align 64" : "";
      this.emit(
        `define ${linkage}${retType} @${name}(${params})${attrSuffix}${alignSuffix}${dbgSuffix} {`,
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
      this.emitStackFrameEnter();

      // Store argc/argv in global variables for main function
      if (name === "main") {
        this.emit(`  store i32 %argc, i32* @__bpl_argc_value`);
        this.noteGeneratedMainArgcStore();
        this.emit(`  store i8** %argv, i8*** @__bpl_argv_value`);
        this.noteGeneratedMainArgvStore();
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

      this.emitRuntimeGenericConstraintChecks(decl, effectiveFuncType);

      // BUG-136 FIX: For `init` instance methods on structs with vtables,
      // inject vtable initialization at the start of the method body.
      // This ensures heap-allocated structs (via malloc) have their vtable
      // set before any other methods are called through virtual dispatch.
      //
      // Note: `init` is an instance method that takes `this: *Struct` as first param.
      // This is different from `new()` which is a static factory method.
      // When methods are generated, their name is mangled to `StructName_methodName`,
      // so we need to check if the name ends with `_init` rather than equals `init`.
      const isInitMethod =
        parentStruct &&
        parentStruct.kind === "StructDecl" &&
        decl.params.length > 0 &&
        decl.params[0]!.name === "this" &&
        this.getMethodBaseName(decl.name) === "init";

      if (isInitMethod) {
        // Get the struct name (may be mangled for generics)
        let structName = parentStruct.name;
        if (
          parentStruct.genericParams.length > 0 &&
          this.currentTypeMap.size > 0
        ) {
          const genericArgs = parentStruct.genericParams.map(
            (p) => this.currentTypeMap.get(p.name)!,
          );
          const mangledType = this.resolveMonomorphizedType(
            parentStruct,
            genericArgs,
          );
          if (mangledType.startsWith("%struct.")) {
            structName = mangledType.substring(8);
          }
        }

        // Check if struct has a vtable
        const vtableGlobal = this.vtableGlobalNames.get(structName);
        const vtableLayout = this.vtableLayouts.get(structName);
        const structLayout = this.structLayouts.get(structName);
        const vtableIndex = structLayout?.get("__vtable__");

        if (vtableGlobal && vtableLayout && vtableIndex !== undefined) {
          const structTypeStr = `%struct.${structName}`;
          const arrayType = `[${vtableLayout.length} x i8*]`;

          // Load 'this' pointer from its stack slot
          const thisAddr = this.localPointers.get("this");
          if (thisAddr) {
            const thisPtr = this.newRegister();
            this.emit(
              `  ${thisPtr} = load ${structTypeStr}*, ${structTypeStr}** ${thisAddr}`,
            );

            // Get pointer to vtable field (field 0 or at vtableIndex)
            const vtableFieldPtr = this.newRegister();
            this.emit(
              `  ${vtableFieldPtr} = getelementptr inbounds ${structTypeStr}, ${structTypeStr}* ${thisPtr}, i32 0, i32 ${vtableIndex}`,
            );

            // Store vtable pointer
            const vtableCast = this.newRegister();
            this.emit(
              `  ${vtableCast} = bitcast ${arrayType}* ${vtableGlobal} to i8*`,
            );
            this.emit(`  store i8* ${vtableCast}, i8** ${vtableFieldPtr}`);
          }
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
        this.emitStackFrameExit();

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
      this.basicBlockNonNullPointers = prevBasicBlockNonNullPointers;
      this.basicBlockNonNullPointerExpressions =
        prevBasicBlockNonNullPointerExpressions;
      this.basicBlockCallStableNonNullPointerExpressions =
        prevBasicBlockCallStableNonNullPointerExpressions;
      this.basicBlockNonZeroIntegerExpressions =
        prevBasicBlockNonZeroIntegerExpressions;
      this.pointerToLocal = prevPointerToLocal;
      this.currentFunctionAddressEscapedLocals =
        prevCurrentFunctionAddressEscapedLocals;
      this.movedAutoDestroyAddresses = prevMovedAutoDestroyAddresses;
      this.onReturn = prevOnReturn;
      this.isMainWithVoidReturn = prevIsMainWithVoidReturn;
      this.generatingFunctionBody = prevGeneratingFunctionBody;
      this.currentFunctionEmitsStackFrameHooks =
        prevCurrentFunctionEmitsStackFrameHooks;
      this.currentFunctionUsesAllocaStackLimitProbe =
        prevCurrentFunctionUsesAllocaStackLimitProbe;
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

    // Get vtable info for initialization before constructor call
    const vtableGlobal = this.vtableGlobalNames.get(structName);
    const vtableLayout = this.vtableLayouts.get(structName);
    const structLayout = this.structLayouts.get(structName);
    const vtableIndex = structLayout?.get("__vtable__");
    const hasVtable = vtableGlobal && vtableLayout && vtableIndex !== undefined;

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

    // Initialize vtable BEFORE calling constructor (in case constructor uses virtual dispatch)
    if (hasVtable) {
      const vtableFieldPtr = this.newRegister();
      this.emit(
        `  ${vtableFieldPtr} = getelementptr inbounds ${structTypeStr}, ${structTypeStr}* ${currentElemPtr}, i32 0, i32 ${vtableIndex}`,
      );
      const arrayType = `[${vtableLayout!.length} x i8*]`;
      const vtableCast = this.newRegister();
      this.emit(
        `  ${vtableCast} = bitcast ${arrayType}* ${vtableGlobal} to i8*`,
      );
      this.emit(`  store i8* ${vtableCast}, i8** ${vtableFieldPtr}`);
    }

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

  /**
   * Initialize vtables for array elements when struct has methods but no new() constructor.
   * This ensures method dispatch works correctly even without explicit construction.
   */
  protected generateArrayVTableInitialization(
    baseAddr: string,
    arrayTypeStr: string,
    typeNode: AST.BasicTypeNode,
    structDecl: AST.StructDecl,
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

    // Resolve struct type
    let structName = structDecl.name;
    let structTypeStr = `%struct.${structName}`;

    // Handle generics
    if (typeNode.genericArgs.length > 0) {
      const match = arrayTypeStr.match(/%struct\.([a-zA-Z0-9_]+)/);
      if (match) {
        structName = match[1]!;
        structTypeStr = `%struct.${structName}`;
      }
    }

    // Get vtable info
    const vtableGlobal = this.vtableGlobalNames.get(structName);
    const vtableLayout = this.vtableLayouts.get(structName);
    const structLayout = this.structLayouts.get(structName);

    if (!vtableGlobal || !vtableLayout || !structLayout) {
      // No vtable for this struct
      return;
    }

    const vtableIndex = structLayout.get("__vtable__");
    if (vtableIndex === undefined) {
      return;
    }

    const arrayType = `[${vtableLayout.length} x i8*]`;

    // Cast array pointer to pointer to first element (flat)
    const elemPtr = this.newRegister();
    this.emit(
      `  ${elemPtr} = bitcast ${arrayTypeStr}* ${baseAddr} to ${structTypeStr}*`,
    );

    const loopHead = this.newLabel("vtable_init.head");
    const loopBody = this.newLabel("vtable_init.body");
    const loopEnd = this.newLabel("vtable_init.end");

    // Allocate loop counter
    const counterPtr = this.allocateStack("vtable_init_idx", "i32");
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

    // Get pointer to vtable field
    const vtableFieldPtr = this.newRegister();
    this.emit(
      `  ${vtableFieldPtr} = getelementptr inbounds ${structTypeStr}, ${structTypeStr}* ${currentElemPtr}, i32 0, i32 ${vtableIndex}`,
    );

    // Store vtable pointer
    const vtableCast = this.newRegister();
    this.emit(`  ${vtableCast} = bitcast ${arrayType}* ${vtableGlobal} to i8*`);
    this.emit(`  store i8* ${vtableCast}, i8** ${vtableFieldPtr}`);

    // Increment counter
    const nextCounter = this.newRegister();
    this.emit(`  ${nextCounter} = add i32 ${counter}, 1`);
    this.emit(`  store i32 ${nextCounter}, i32* ${counterPtr}`);

    this.emit(`  br label %${loopHead}`);

    this.emit(`${loopEnd}:`);
  }
}
