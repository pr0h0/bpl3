import * as AST from "../common/AST";
import { Token } from "../frontend/Token";
import { TokenType } from "../frontend/TokenType";

export class CodeGenerator {
  private output: string[] = [];
  private declarationsOutput: string[] = []; // declarations like struct definitions
  private registerCount: number = 0;
  private labelCount: number = 0;
  private stackAllocCount: number = 0;
  private stringLiterals: Map<string, string> = new Map(); // content -> global var name
  private currentFunctionReturnType: AST.TypeNode | null = null;
  private currentFunctionName: string | null = null;
  private isMainWithVoidReturn: boolean = false;
  private structLayouts: Map<string, Map<string, number>> = new Map();
  private structMap: Map<string, AST.StructDecl> = new Map();
  private loopStack: { continueLabel: string; breakLabel: string }[] = [];
  private declaredFunctions: Set<string> = new Set();
  private globals: Set<string> = new Set();
  private locals: Set<string> = new Set();
  private localPointers: Map<string, string> = new Map(); // Track variable name -> pointer name mapping
  private generatedStructs: Set<string> = new Set(); // Track generated monomorphized structs
  private onReturn?: () => void;
  private typeIdMap: Map<string, number> = new Map(); // Type name -> Type ID
  private nextTypeId: number = 10; // Start user types at 10
  private currentTypeMap: Map<string, AST.TypeNode> = new Map(); // For generic function instantiation
  private pendingGenerations: (() => void)[] = [];

  generate(program: AST.Program): string {
    this.output = [];
    this.declarationsOutput = [];
    this.stringLiterals.clear();
    this.structLayouts.clear();
    this.structMap.clear();
    this.loopStack = [];
    this.declaredFunctions.clear();
    this.globals.clear();
    this.locals.clear();
    this.generatedStructs.clear();
    this.typeIdMap.clear();

    // Index Structs for inheritance lookup
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        this.structMap.set(
          (stmt as AST.StructDecl).name,
          stmt as AST.StructDecl,
        );
      }
    }

    this.collectStructLayouts(program);

    // Standard library declarations
    this.emitDeclaration("declare i8* @malloc(i64)");
    this.declaredFunctions.add("malloc");
    this.emitDeclaration("declare void @free(i8*)");
    this.declaredFunctions.add("free");
    this.emitDeclaration("declare void @exit(i32)");
    this.declaredFunctions.add("exit");

    // Exception Handling Primitives
    // jmp_buf is platform dependent. [32 x i64] is 256 bytes, sufficient for x64.
    this.emitDeclaration(
      `%struct.ExceptionFrame = type { [32 x i64], %struct.ExceptionFrame* }`,
    );
    this.emitDeclaration(
      `@exception_top = global %struct.ExceptionFrame* null`,
    );
    this.emitDeclaration(`@exception_value = global i64 0`);
    this.emitDeclaration(`@exception_type = global i32 0`);

    // Global argc/argv for Args library
    this.emitDeclaration(`@__bpl_argc_value = global i32 0`);
    this.emitDeclaration(`@__bpl_argv_value = global i8** null`);

    this.emitDeclaration(`declare i32 @setjmp(i8*) returns_twice`);
    this.declaredFunctions.add("setjmp");
    this.emitDeclaration(`declare void @longjmp(i8*, i32) noreturn`);
    this.declaredFunctions.add("longjmp");

    // Helper functions for accessing argc/argv
    this.emitDeclaration(`define i32 @__bpl_argc() {`);
    this.emitDeclaration(`  %1 = load i32, i32* @__bpl_argc_value`);
    this.emitDeclaration(`  ret i32 %1`);
    this.emitDeclaration(`}`);
    this.emitDeclaration(``);
    this.emitDeclaration(`define i8* @__bpl_argv_get(i32 %index) {`);
    this.emitDeclaration(`  %1 = load i8**, i8*** @__bpl_argv_value`);
    this.emitDeclaration(`  %2 = getelementptr i8*, i8** %1, i32 %index`);
    this.emitDeclaration(`  %3 = load i8*, i8** %2`);
    this.emitDeclaration(`  ret i8* %3`);
    this.emitDeclaration(`}`);
    this.declaredFunctions.add("__bpl_argc");
    this.declaredFunctions.add("__bpl_argv_get");

    this.emitDeclaration("");

    for (const stmt of program.statements) {
      this.generateTopLevel(stmt);
    }

    // Process pending monomorphized functions
    while (this.pendingGenerations.length > 0) {
      const task = this.pendingGenerations.shift()!;
      task();
    }

    let header = "";
    for (const [content, varName] of this.stringLiterals) {
      const len = content.length + 1;
      const escaped = this.escapeString(content);
      header += `${varName} = private unnamed_addr constant [${len} x i8] c"${escaped}\\00", align 1\n`;
    }

    return (
      header +
      "\n" +
      this.declarationsOutput.join("\n") +
      "\n" +
      this.output.join("\n")
    );
  }

  private emit(line: string) {
    this.output.push(line);
  }

  private emitDeclaration(line: string) {
    this.declarationsOutput.push(line);
  }

  private getMangledName(
    name: string,
    type: AST.FunctionTypeNode,
    isExtern: boolean = false,
  ): string {
    if (name === "main" || isExtern) return name;
    return `${name}_${type.paramTypes.map((t) => this.mangleType(t)).join("_")}`;
  }

  private mangleType(type: AST.TypeNode): string {
    if (type.kind === "BasicType") {
      let s = type.name;
      if (type.pointerDepth > 0) s += "p".repeat(type.pointerDepth);
      return s;
    } else if (type.kind === "ArrayType") {
      return `arr${this.mangleType(type.elementType)}`;
    }
    return "unknown";
  }

  private getTypeId(type: AST.TypeNode): number {
    const typeName = this.resolveType(type); // Get LLVM type name as key

    // Primitives
    if (typeName === "i32") return 1;
    if (typeName === "i1") return 2;
    if (typeName === "double") return 3;
    if (typeName === "i8*") return 4;

    if (!this.typeIdMap.has(typeName)) {
      this.typeIdMap.set(typeName, this.nextTypeId++);
    }
    return this.typeIdMap.get(typeName)!;
  }

  private getAllStructFields(decl: AST.StructDecl): AST.StructField[] {
    let fields: AST.StructField[] = [];
    if (decl.parentType && decl.parentType.kind === "BasicType") {
      const parent = this.structMap.get(decl.parentType.name);
      if (parent) {
        fields = this.getAllStructFields(parent);
      }
    }
    const currentFields = decl.members.filter(
      (m) => m.kind === "StructField",
    ) as AST.StructField[];
    return fields.concat(currentFields);
  }

  private collectStructLayouts(program: AST.Program) {
    for (const stmt of program.statements) {
      if (stmt.kind === "StructDecl") {
        // Only collect non-generic structs initially
        // Generic structs are collected on demand
        // But we need to index layout for non-generic ones
        const decl = stmt as AST.StructDecl;
        if (decl.genericParams.length === 0) {
          const layout = new Map<string, number>();
          const fields = this.getAllStructFields(decl);
          fields.forEach((f, i) => layout.set(f.name, i));
          this.structLayouts.set(decl.name, layout);
        }
      }
    }
  }

  // Add a method to register external layouts (to be called by the driver/compiler)
  public registerStructLayout(name: string, layout: Map<string, number>) {
    this.structLayouts.set(name, layout);
  }

  private generateTopLevel(node: AST.ASTNode) {
    switch (node.kind) {
      case "FunctionDecl":
        this.generateFunction(node as AST.FunctionDecl);
        break;
      case "StructDecl":
        const structDecl = node as AST.StructDecl;
        // Only generate struct if it is NOT generic.
        // Generic structs are templates and generated on-demand.
        if (structDecl.genericParams.length === 0) {
          this.generateStruct(structDecl);
        }
        break;
      case "Extern":
        this.generateExtern(node as AST.ExternDecl);
        break;
      case "VariableDecl":
        this.generateGlobalVariable(node as AST.VariableDecl);
        break;
      case "TypeAlias":
        // Type aliases are handled by the TypeChecker and don't generate code directly
        break;
      case "Import":
        // Imports are resolved by ModuleResolver and don't generate code directly
        break;
      case "Export":
        // Exports are metadata for module resolution and don't generate code directly
        break;
      default:
        console.warn(`Unhandled top-level node kind: ${node.kind}`);
        break;
    }
  }

  private generateExtern(decl: AST.ExternDecl) {
    const name = decl.name;
    if (this.declaredFunctions.has(name)) return;
    this.declaredFunctions.add(name);

    const funcType = decl.resolvedType as AST.FunctionTypeNode;
    const retType = this.resolveType(funcType.returnType);

    const params = funcType.paramTypes.map((p) => this.resolveType(p));
    if (decl.isVariadic) {
      params.push("...");
    }

    const paramStr = params.join(", ");
    this.emitDeclaration(`declare ${retType} @${name}(${paramStr})`);
    this.emitDeclaration("");
  }

  private generateStruct(decl: AST.StructDecl, mangledName?: string) {
    const structName = mangledName || decl.name;

    // Avoid re-emitting
    if (this.generatedStructs.has(structName)) return;
    this.generatedStructs.add(structName);

    // %struct.Name = type { ... }
    const fields = this.getAllStructFields(decl);

    // We need to resolve field types.
    // If this is a monomorphized struct (generic instance), the fields might use generic types.
    // The 'decl' passed here should effectively be the instantiated version with types substituted.
    // However, for simplicity, 'resolveType' handles substitution if 'decl' is a virtual AST node?
    // No, standard resolveType relies on resolving AST nodes.
    // When we call generateStruct for Box<int>, we should have already substituted T with int in the fields.

    const fieldTypes = fields
      .map((f) => this.resolveType(f.resolvedType || f.type))
      .join(", ");

    this.emitDeclaration(`%struct.${structName} = type { ${fieldTypes} }`);
    this.emitDeclaration("");

    // Register layout
    const layout = new Map<string, number>();
    fields.forEach((f, i) => layout.set(f.name, i));
    this.structLayouts.set(structName, layout);

    // Generate methods
    // Only generate methods for non-generic structs (standard structs).
    // Generic struct methods require substitution which is not yet implemented.
    if (decl.genericParams.length === 0) {
      const methods = decl.members.filter(
        (m) => m.kind === "FunctionDecl",
      ) as AST.FunctionDecl[];

      for (const method of methods) {
        const originalName = method.name;
        method.name = `${structName}_${method.name}`;
        this.generateFunction(method, decl);
        method.name = originalName;
      }
    }
  }

  private mangleType(type: AST.TypeNode): string {
    if (type.kind === "BasicType") {
      let name = type.name;
      // Handle generic args in mangling
      if (type.genericArgs.length > 0) {
        const args = type.genericArgs.map((t) => this.mangleType(t)).join("_");
        name = `${name}_${args}`;
      }

      // Cleanup name similarly to before but on AST level names
      if (name.includes(".")) name = name.replace(/\./g, "_");

      // Basic type pointers/arrays
      let suffix = "";
      for (let i = 0; i < type.pointerDepth; i++) suffix += "_ptr";
      for (let d of type.arrayDimensions) suffix += `_arr_${d}_`;

      return `${name}${suffix}`;
    } else if (type.kind === "FunctionType") {
      return "fn"; // simplified mangling for fn types
    }
    return "unknown";
  }

  private resolveMonomorphizedType(
    baseStruct: AST.StructDecl,
    genericArgs: AST.TypeNode[],
  ): string {
    // 1. Mangle Name
    const argNames = genericArgs
      .map((arg) => {
        // Use lightweight mangling to avoid recursive resolveType for generic args
        return this.mangleType(arg);
      })
      .join("_");

    const mangledName = `${baseStruct.name}_${argNames}`;

    // 2. Check if exists
    if (this.generatedStructs.has(mangledName)) {
      return `%struct.${mangledName}`;
    }
    // Also check structMap in case it was created but not yet generated (e.g. recursive reference)
    if (this.structMap.has(mangledName)) {
      return `%struct.${mangledName}`;
    }

    // 3. Instantiate
    // Create a map of generic param names to concrete argument types
    const typeMap = new Map<string, AST.TypeNode>();
    if (baseStruct.genericParams.length !== genericArgs.length) {
      throw new Error(`Generic argument mismatch for ${baseStruct.name}`);
    }
    for (let i = 0; i < baseStruct.genericParams.length; i++) {
      typeMap.set(baseStruct.genericParams[i]!, genericArgs[i]!);
    }

    // Clone and substitute fields
    const instantiatedMembers = baseStruct.members.map((m) => {
      if (m.kind === "StructField") {
        const field = m as AST.StructField;
        return {
          ...field,
          type: this.substituteType(field.type, typeMap),
          resolvedType: undefined, // Force re-resolution
          typeMap,
        } as AST.StructField;
      }
      return m;
    });

    // Handle generic inheritance
    let instantiatedParentType = baseStruct.parentType;
    if (baseStruct.parentType) {
      // Substitute generics in parent type
      instantiatedParentType = this.substituteType(
        baseStruct.parentType,
        typeMap,
      );

      // Force resolution of parent to ensure it exists and we get the concrete name
      const parentLlvmType = this.resolveType(instantiatedParentType);

      // Update name in BasicType to match the mangled parent name
      if (instantiatedParentType.kind === "BasicType") {
        let parentName = parentLlvmType;
        if (parentName.startsWith("%struct.")) {
          parentName = parentName.substring(8);
          // remove pointers if any
          while (parentName.endsWith("*")) parentName = parentName.slice(0, -1);
        }
        instantiatedParentType = {
          ...instantiatedParentType,
          name: parentName,
          genericArgs: [], // Cleared because name is now concrete
        };
      }
    }

    const instantiatedStruct: AST.StructDecl = {
      ...baseStruct,
      name: mangledName, // Update name
      genericParams: [], // Concrete now
      parentType: instantiatedParentType,
      members: instantiatedMembers.filter((m) => m.kind === "StructField"), // Only fields in struct def
    };

    // Register in structMap so it can be looked up by name (for inheritance etc)
    this.structMap.set(mangledName, instantiatedStruct);

    this.generateStruct(instantiatedStruct, mangledName);

    // Queue generation of methods
    const methods = baseStruct.members.filter(
      (m) => m.kind === "FunctionDecl",
    ) as AST.FunctionDecl[];
    for (const method of methods) {
      // If method is not generic, generate it now (monomorphized)
      if (method.genericParams.length === 0) {
        this.pendingGenerations.push(() => {
          const oldName = method.name;
          method.name = `${mangledName}_${method.name}`;
          const prevMap = this.currentTypeMap;
          this.currentTypeMap = typeMap;

          // We pass instantiatedStruct as parent to generateFunction
          // This correctly sets up "this" type and destructor chaining
          this.generateFunction(method, instantiatedStruct);

          this.currentTypeMap = prevMap;
          method.name = oldName;
        });
      }
      // If method IS generic, we don't generate it here.
      // It will be generated when called, via resolveMonomorphizedFunction.
    }

    return `%struct.${mangledName}`;
  }

  private resolveMonomorphizedFunction(
    decl: AST.FunctionDecl,
    genericArgs: AST.TypeNode[],
    contextMap?: Map<string, AST.TypeNode>,
    namePrefix?: string,
  ): string {
    // 1. Substitute generic args in case they are also generic
    const concreteArgs = genericArgs.map((arg) =>
      this.substituteType(arg, this.currentTypeMap),
    );

    // 2. Create Instance Map
    const instanceMap = new Map<string, AST.TypeNode>(this.currentTypeMap);
    if (contextMap) {
      for (const [k, v] of contextMap) {
        instanceMap.set(k, v);
      }
    }
    if (decl.genericParams.length !== concreteArgs.length) {
      throw new Error(`Generic argument mismatch for function ${decl.name}`);
    }
    for (let i = 0; i < decl.genericParams.length; i++) {
      instanceMap.set(decl.genericParams[i]!, concreteArgs[i]!);
    }

    // 3. Substitute Function Type to get correct mangled name
    const substitutedType = this.substituteType(
      decl.resolvedType as AST.FunctionTypeNode,
      instanceMap,
    ) as AST.FunctionTypeNode;

    // 4. Calculate Mangled Name
    let mangledName = this.getMangledName(decl.name, substitutedType);
    if (namePrefix) {
      mangledName = `${namePrefix}_${this.getMangledName(decl.name, substitutedType)}`;
    }

    // 5. Check Cache
    if (this.declaredFunctions.has(mangledName)) {
      return mangledName;
    }
    this.declaredFunctions.add(mangledName);

    // 6. Queue Generation
    this.pendingGenerations.push(() => {
      // Create a specialized declaration
      const newDecl: AST.FunctionDecl = {
        ...decl,
        name: decl.name,
        resolvedType: substitutedType,
      };

      if (namePrefix) {
        newDecl.name = `${namePrefix}_${decl.name}`;
      }

      const prevMap = this.currentTypeMap;
      this.currentTypeMap = instanceMap;

      this.generateFunction(newDecl);

      this.currentTypeMap = prevMap;
    });

    return mangledName;
  }

  private substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode {
    if (type.kind === "BasicType") {
      if (map.has(type.name)) {
        const mapped = map.get(type.name)!;
        // Merge pointer depth and array dims
        if (mapped.kind === "BasicType") {
          return {
            ...mapped,
            pointerDepth: mapped.pointerDepth + type.pointerDepth,
            arrayDimensions: [
              ...mapped.arrayDimensions,
              ...type.arrayDimensions,
            ],
          };
        }
        return mapped;
      }
      // Recursively substitute generic args
      return {
        ...type,
        genericArgs: type.genericArgs.map((arg) =>
          this.substituteType(arg, map),
        ),
      };
    } else if (type.kind === "FunctionType") {
      return {
        ...type,
        returnType: this.substituteType(type.returnType, map),
        paramTypes: type.paramTypes.map((p) => this.substituteType(p, map)),
      };
    }
    return type;
  }

  private generateFunction(
    decl: AST.FunctionDecl,
    parentStruct?: AST.StructDecl,
  ) {
    // Skip generic templates unless we are instantiating them (map is populated)
    if (decl.genericParams.length > 0) {
      const isInstantiating = decl.genericParams.every((p) =>
        this.currentTypeMap.has(p),
      );
      if (!isInstantiating) return;
    }

    this.registerCount = 0;
    this.labelCount = 0;
    this.stackAllocCount = 0;
    this.currentFunctionReturnType = decl.returnType;
    this.currentFunctionName = decl.name;
    this.locals.clear();
    this.localPointers.clear();

    // Setup destructor chaining
    if (
      parentStruct &&
      decl.name === `${parentStruct.name}_destroy` &&
      parentStruct.parentType
    ) {
      this.onReturn = () => {
        this.emitParentDestroy(parentStruct, decl);
      };
    } else {
      this.onReturn = undefined;
    }

    let name = decl.name;
    const funcType = decl.resolvedType as AST.FunctionTypeNode;
    if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
      name = this.getMangledName(
        decl.name,
        decl.resolvedType as AST.FunctionTypeNode,
      );
    }
    let retType = this.resolveType(funcType.returnType);

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
      params = decl.params
        .map((p, i) => {
          const type = this.resolveType(funcType.paramTypes[i]!);
          const name = `%${p.name}`;
          return `${type} ${name}`;
        })
        .join(", ");
    }

    this.emit(`define ${retType} @${name}(${params}) {`);
    this.emit("entry:");

    // Store argc/argv in global variables for main function
    if (name === "main") {
      this.emit(`  store i32 %argc, i32* @__bpl_argc_value`);
      this.emit(`  store i8** %argv, i8*** @__bpl_argv_value`);
    }

    // Allocate stack space for parameters to make them mutable
    for (let i = 0; i < decl.params.length; i++) {
      const param = decl.params[i]!;
      this.locals.add(param.name);
      const type = this.resolveType(funcType.paramTypes[i]!);
      const paramReg = `%${param.name}`;
      const stackAddr = this.allocateStack(param.name, type);
      this.emit(`  store ${type} ${paramReg}, ${type}* ${stackAddr}`);
    }

    this.generateBlock(decl.body);

    // Add implicit return for void functions if missing
    const lastLine =
      this.output.length > 0 ? this.output[this.output.length - 1]! : "";

    // Handle implicit returns based on function type
    if (!lastLine.trim().startsWith("ret")) {
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
  }

  private generateBlock(block: AST.BlockStmt) {
    for (const stmt of block.statements) {
      this.generateStatement(stmt);
    }
  }

  private generateStatement(stmt: AST.Statement) {
    switch (stmt.kind) {
      case "VariableDecl":
        this.generateVariableDecl(stmt as AST.VariableDecl);
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
      default:
        // console.warn(`Unhandled statement kind: ${stmt.kind}`);
        break;
    }
  }

  private generateTry(stmt: AST.TryStmt) {
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
    this.emit(
      `  store %struct.ExceptionFrame* ${prevFramePtrReg}, %struct.ExceptionFrame** @exception_top`,
    );
    this.emit(`  br label %${endLabel}`);

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
      const targetTypeId = this.getTypeId(clause.type);
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
      this.emit(`  br label %${endLabel}`);

      // If nextTarget was "catch.other", we need to emit it
      if (i === stmt.catchClauses.length - 1 && stmt.catchOther) {
        this.emit(`${nextTarget}:`);
        this.generateBlock(stmt.catchOther);
        this.emit(`  br label %${endLabel}`);
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

  private generateThrow(stmt: AST.ThrowStmt) {
    // 1. Evaluate
    const val = this.generateExpression(stmt.expression);
    if (!stmt.expression.resolvedType) {
      throw new Error("Throw expression has no resolved type");
    }
    const type = stmt.expression.resolvedType;
    const typeStr = this.resolveType(type);

    // 2. Set type ID
    const typeId = this.getTypeId(type);
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

  private generateBreak(stmt: AST.BreakStmt) {
    if (this.loopStack.length === 0) {
      throw new Error("Break statement outside of loop");
    }
    const { breakLabel } = this.loopStack[this.loopStack.length - 1]!;
    this.emit(`  br label %${breakLabel}`);
  }

  private generateContinue(stmt: AST.ContinueStmt) {
    if (this.loopStack.length === 0) {
      throw new Error("Continue statement outside of loop");
    }
    const { continueLabel } = this.loopStack[this.loopStack.length - 1]!;
    this.emit(`  br label %${continueLabel}`);
  }

  private generateVariableDecl(decl: AST.VariableDecl) {
    if (typeof decl.name !== "string") {
      // Tuple destructuring: local (a, b, c) = expr;
      const targets = decl.name as
        | { name: string; type?: AST.TypeNode }[]
        | any[];

      if (!decl.initializer) {
        throw new Error("Tuple destructuring requires an initializer");
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
    }
  }

  private generateReturn(stmt: AST.ReturnStmt) {
    if (this.onReturn) this.onReturn();
    if (stmt.value) {
      const val = this.generateExpression(stmt.value);
      const type = this.resolveType(this.currentFunctionReturnType!);
      this.emit(`  ret ${type} ${val}`);
    } else {
      // For void returns, check if this is main with modified return type
      if (this.isMainWithVoidReturn) {
        this.emit("  ret i32 0");
      } else {
        this.emit("  ret void");
      }
    }
  }

  private generateIf(stmt: AST.IfStmt) {
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

  private generateLoop(stmt: AST.LoopStmt) {
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

  private generateExpression(expr: AST.Expression): string {
    switch (expr.kind) {
      case "Literal":
        return this.generateLiteral(expr as AST.LiteralExpr);
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
      case "Sizeof":
        return this.generateSizeof(expr as AST.SizeofExpr);
      case "Ternary":
        return this.generateTernary(expr as AST.TernaryExpr);
      default:
        // console.warn(`Unhandled expression kind: ${expr.kind}`);
        return "0"; // Placeholder
    }
  }

  private generateTernary(expr: AST.TernaryExpr): string {
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

  private getCurrentLabel(): string {
    // Find the last emitted label by scanning backwards
    for (let i = this.output.length - 1; i >= 0; i--) {
      const line = this.output[i]!.trim();
      if (line.endsWith(":") && !line.includes(" ")) {
        return line.slice(0, -1); // Remove the ':'
      }
    }
    return "entry"; // fallback
  }

  private getTargetTypeFromTuple(
    tupleType: AST.TypeNode,
    indexPath: number[],
  ): string {
    let currentType = tupleType;
    for (const idx of indexPath) {
      if (currentType.kind === "TupleType") {
        currentType = (currentType as AST.TupleTypeNode).types[idx]!;
      } else {
        return "i32"; // fallback
      }
    }
    return this.resolveType(currentType);
  }

  private generateLiteral(expr: AST.LiteralExpr): string {
    if (expr.type === "number") {
      // Check if this is a floating point type
      if (expr.resolvedType && expr.resolvedType.kind === "BasicType") {
        const typeName = (expr.resolvedType as AST.BasicTypeNode).name;
        if (typeName === "float" || typeName === "double") {
          // Ensure float literals have decimal point
          const str = expr.value.toString();
          return str.includes(".") ? str : `${str}.0`;
        }
      }
      return expr.value.toString();
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

  private generateIdentifier(expr: AST.IdentifierExpr): string {
    const name = expr.name;
    if (!expr.resolvedType) {
      throw new Error(`Identifier '${name}' has no resolved type`);
    }

    // Special case: function identifiers (not local variables) evaluate to their address directly
    if (expr.resolvedType.kind === "FunctionType" && !this.locals.has(name)) {
      if (
        expr.resolvedDeclaration &&
        expr.resolvedDeclaration.kind === "FunctionDecl"
      ) {
        const decl = expr.resolvedDeclaration as AST.FunctionDecl;
        // If it's a generic function, we might need to handle it, but usually identifiers refer to specific instances or non-generics
        // If it has a resolvedType that is a FunctionType, we can use that for mangling
        return `@${this.getMangledName(decl.name, expr.resolvedType as AST.FunctionTypeNode)}`;
      }
      return `@${name}`;
    }

    const type = this.resolveType(expr.resolvedType!);
    const addr = this.generateAddress(expr);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  private generateBinary(expr: AST.BinaryExpr): string {
    const leftRaw = this.generateExpression(expr.left);
    const rightRaw = this.generateExpression(expr.right);
    const leftType = this.resolveType(expr.left.resolvedType!);
    const rightType = this.resolveType(expr.right.resolvedType!);

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
        op = isFloat ? "fdiv" : "sdiv";
        break;
      case TokenType.EqualEqual:
        op = isFloat ? "fcmp oeq" : "icmp eq";
        break;
      case TokenType.BangEqual:
        op = isFloat ? "fcmp one" : "icmp ne";
        break;
      case TokenType.Less:
        op = isFloat ? "fcmp olt" : "icmp slt";
        break;
      case TokenType.LessEqual:
        op = isFloat ? "fcmp ole" : "icmp sle";
        break;
      case TokenType.Greater:
        op = isFloat ? "fcmp ogt" : "icmp sgt";
        break;
      case TokenType.GreaterEqual:
        op = isFloat ? "fcmp oge" : "icmp sge";
        break;
      case TokenType.Percent:
        op = isFloat ? "frem" : "srem";
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
        op = "ashr"; // Assuming arithmetic shift right
        break;
    }

    if (op) {
      const reg = this.newRegister();
      this.emit(`  ${reg} = ${op} ${leftType} ${left}, ${right}`);
      return reg;
    }
    return "0";
  }

  private generateCall(expr: AST.CallExpr): string {
    let funcName = "";
    let argsToGenerate = expr.args;
    let isInstanceCall = false;

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
                funcType.declaration.genericParams[k]!,
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

      if (!objType) throw new Error("Member access on unresolved type");

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
          } else {
            structName = objType.name;
          }

          prefix = structName; // e.g. Box_double

          // Instance call: pass object as first argument
          argsToGenerate = [memberExpr.object, ...expr.args];
          isInstanceCall = true;

          // Prepare context if object is instantiated generic struct
          const structDecl = this.structMap.get(objType.name); // Original generic struct
          if (
            structDecl &&
            structDecl.genericParams.length > 0 &&
            objType.genericArgs.length > 0
          ) {
            contextMap = new Map();
            for (let i = 0; i < structDecl.genericParams.length; i++) {
              if (i < objType.genericArgs.length) {
                contextMap.set(
                  structDecl.genericParams[i]!,
                  objType.genericArgs[i]!,
                );
                callSubstitutionMap.set(
                  structDecl.genericParams[i]!,
                  objType.genericArgs[i]!,
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
              const structDecl = this.structMap.get(inner.name);
              if (structDecl && structDecl.genericParams.length > 0) {
                // Build contextMap for generic substitution
                contextMap = new Map();
                for (let i = 0; i < structDecl.genericParams.length; i++) {
                  if (i < inner.genericArgs.length) {
                    contextMap.set(
                      structDecl.genericParams[i]!,
                      inner.genericArgs[i]!,
                    );
                    callSubstitutionMap.set(
                      structDecl.genericParams[i]!,
                      inner.genericArgs[i]!,
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
            throw new Error("Static member access on non-struct type");
          }
        } else {
          throw new Error("Member access on non-struct type");
        }

        funcName = `${structName}_${memberExpr.property}`;

        if (expr.resolvedDeclaration) {
          const decl = expr.resolvedDeclaration;
          if (decl.resolvedType && decl.resolvedType.kind === "FunctionType") {
            funcName = this.getMangledName(
              funcName,
              decl.resolvedType as AST.FunctionTypeNode,
            );
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
                  funcType.declaration.genericParams[k]!,
                  genericArgs[k]!,
                );
              }
            }
          }
        }
      }
    }
    let callTarget = "";
    // If identifier and local, indirect call
    if (callee.kind === "Identifier") {
      const ident = callee as AST.IdentifierExpr;
      if (this.locals.has(ident.name)) {
        // Indirect call
        const funcSig = this.resolveType(ident.resolvedType!);
        const addr = this.generateAddress(ident);
        const loadedPtr = this.newRegister();
        // addr is funcSig**
        this.emit(`  ${loadedPtr} = load ${funcSig}, ${funcSig}* ${addr}`);
        callTarget = loadedPtr;
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
          // We should generate the member access to get the pointer.
          const ptrToFuncPtr = this.generateMember(memberExpr); // Get address of field
          const funcSig = this.resolveType(callee.resolvedType!);
          const loadedPtr = this.newRegister();
          this.emit(
            `  ${loadedPtr} = load ${funcSig}, ${funcSig}* ${ptrToFuncPtr}`,
          );
          callTarget = loadedPtr;

          // Reset args (remove "this" injection done for methods)
          if (isInstanceCall) {
            argsToGenerate = expr.args; // Revert to original args
            isInstanceCall = false;
          }
        } else {
          callTarget = `@${funcName}`;
        }
      } else {
        callTarget = `@${funcName}`;
      }
    } else {
      // Other expressions (Index, Call, etc) evaluating to function pointer
      // e.g. arr[0]()
      const funcSig = this.resolveType(callee.resolvedType!);
      const ptrVal = this.generateExpression(callee);
      callTarget = ptrVal;
    }

    const funcType = expr.callee.resolvedType as AST.FunctionTypeNode;
    if (!funcType) {
      throw new Error(`Function call '${funcName}' has no resolved type`);
    }

    const args = argsToGenerate
      .map((arg, i) => {
        let targetTypeNode: AST.TypeNode | undefined;

        if (isInstanceCall) {
          if (i === 0) {
            if (
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

          // Optimize for L-values passing to pointer: take address directly (T -> *T)
          if (destType === srcType + "*") {
            if (
              arg.kind === "Identifier" ||
              arg.kind === "Member" ||
              arg.kind === "Index"
            ) {
              const addr = this.generateAddress(arg as any);
              return `${destType} ${addr}`;
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
        return `${srcType} ${val}`;
      })
      .join(", ");

    const retType = this.resolveType(expr.resolvedType!);
    const isVariadic = funcType.isVariadic === true;

    if (retType === "void") {
      if (isVariadic) {
        // Build the full signature for variadic functions
        const paramTypesStr = funcType.paramTypes
          .map((t) => this.resolveType(t))
          .join(", ");
        this.emit(`  call void (${paramTypesStr}, ...) ${callTarget}(${args})`);
      } else {
        this.emit(`  call void ${callTarget}(${args})`);
      }
      return "";
    } else {
      const reg = this.newRegister();
      if (isVariadic) {
        // Build the full signature for variadic functions
        const paramTypesStr = funcType.paramTypes
          .map((t) => this.resolveType(t))
          .join(", ");
        this.emit(
          `  ${reg} = call ${retType} (${paramTypesStr}, ...) ${callTarget}(${args})`,
        );
      } else {
        this.emit(`  ${reg} = call ${retType} ${callTarget}(${args})`);
      }
      return reg;
    }
  }

  private generateAddress(expr: AST.Expression): string {
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

      const objectAddr = this.generateAddress(memberExpr.object);

      // We need the type of the object to know which struct layout to use
      // The object's resolvedType should be a BasicType with the struct name
      if (!objType || objType.kind !== "BasicType") {
        throw new Error("Member access on non-struct type");
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
        throw new Error(`Unknown struct type: ${structName}`);
      }

      const fieldIndex = layout.get(memberExpr.property);
      if (fieldIndex === undefined) {
        throw new Error(
          `Unknown field '${memberExpr.property}' in struct '${structName}'`,
        );
      }

      let baseAddr = objectAddr;
      if (objType.pointerDepth > 0) {
        const ptrReg = this.newRegister();
        const ptrType = llvmType;
        this.emit(`  ${ptrReg} = load ${ptrType}, ${ptrType}* ${objectAddr}`);
        baseAddr = ptrReg;
      }

      const addr = this.newRegister();
      const structBase = `%struct.${structName}`;

      this.emit(
        `  ${addr} = getelementptr inbounds ${structBase}, ${structBase}* ${baseAddr}, i32 0, i32 ${fieldIndex}`,
      );
      return addr;
    } else if (expr.kind === "Index") {
      const indexExpr = expr as AST.IndexExpr;
      const objectAddr = this.generateAddress(indexExpr.object);
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
        throw new Error("Indexing non-basic type");
      }

      let addr: string;
      if (objType.arrayDimensions.length > 0) {
        const llvmType = this.resolveType(objType);
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
        throw new Error("Indexing non-array/non-pointer");
      }

      return addr;
    } else if (expr.kind === "Unary") {
      const unaryExpr = expr as AST.UnaryExpr;
      if (unaryExpr.operator.type === TokenType.Star) {
        // Dereference: *x
        // The address is the value of x
        return this.generateExpression(unaryExpr.operand);
      }
      throw new Error("Address of non-lvalue unary expression");
    }

    throw new Error(`Expression is not an lvalue: ${expr.kind}`);
  }

  private generateGlobalVariable(decl: AST.VariableDecl) {
    if (typeof decl.name !== "string") {
      throw new Error("Destructuring not supported for global variables");
    }
    this.globals.add(decl.name);

    const type = this.resolveType(decl.typeAnnotation!);
    let init = "zeroinitializer";
    if (decl.initializer) {
      if (decl.initializer.kind === "Literal") {
        init = this.generateLiteral(decl.initializer as AST.LiteralExpr);
      } else {
        throw new Error("Global variables must be initialized with literals");
      }
    } else {
      if (
        type === "i64" ||
        type === "i32" ||
        type === "i16" ||
        type === "i8" ||
        type === "i1"
      )
        init = "0";
      else if (type === "double") init = "0.0";
      else if (type.endsWith("*")) init = "null";
    }
    this.emitDeclaration(`@${decl.name} = global ${type} ${init}`);
    this.emitDeclaration("");
  }

  private generateSwitch(stmt: AST.SwitchStmt) {
    const cond = this.generateExpression(stmt.expression);
    const endLabel = this.newLabel("switch.end");
    const defaultLabel = stmt.defaultCase
      ? this.newLabel("switch.default")
      : endLabel;

    const caseLabels: { value: string; label: string; body: AST.BlockStmt }[] =
      [];
    for (const caseStmt of stmt.cases) {
      if (caseStmt.value.kind !== "Literal") {
        throw new Error("Switch case values must be literals");
      }
      const val = this.generateLiteral(caseStmt.value as AST.LiteralExpr);
      const label = this.newLabel("switch.case");
      caseLabels.push({ value: val, label, body: caseStmt.body });
    }

    const condType = this.resolveType(stmt.expression.resolvedType!);

    this.emit(`  switch ${condType} ${cond}, label %${defaultLabel} [`);
    for (const c of caseLabels) {
      this.emit(`    ${condType} ${c.value}, label %${c.label}`);
    }
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

  private emitCast(
    val: string,
    srcType: string,
    destType: string,
    srcTypeNode: AST.TypeNode,
    destTypeNode: AST.TypeNode,
  ): string {
    const reg = this.newRegister();

    if (srcType === destType) return val;

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
        return val;
      }
    }

    throw new Error(`Unsupported cast from ${srcType} to ${destType}`);
  }

  private generateLogicalAnd(expr: AST.BinaryExpr): string {
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

  private generateLogicalOr(expr: AST.BinaryExpr): string {
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

  private generateSizeof(expr: AST.SizeofExpr): string {
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

  private resolveType(type: AST.TypeNode): string {
    if (!type) {
      // Should not happen if TypeChecker did its job
      throw new Error("Cannot resolve undefined type");
    }
    if (type.kind === "BasicType") {
      const basicType = type as AST.BasicTypeNode;
      let llvmType = "";

      // Check currentTypeMap for generic substitutions
      if (this.currentTypeMap.has(basicType.name)) {
        let llvmType = this.resolveType(
          this.currentTypeMap.get(basicType.name)!,
        );

        for (let i = 0; i < basicType.pointerDepth; i++) {
          llvmType += "*";
        }

        for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
          llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
        }
        return llvmType;
      }

      // Check for generics usage
      if (basicType.genericArgs && basicType.genericArgs.length > 0) {
        // Substitute generic args first
        const instantiatedArgs = basicType.genericArgs.map((arg) =>
          this.substituteType(arg, this.currentTypeMap),
        );
        const structDecl = this.structMap.get(basicType.name);
        if (structDecl) {
          // Instantiate generic!
          llvmType = this.resolveMonomorphizedType(
            structDecl,
            instantiatedArgs,
          );
        } else {
          // Maybe a primitive like int<T>? Should not happen.
          llvmType = `%struct.${basicType.name}`; // Fallback
        }
      } else {
        switch (basicType.name) {
          case "int":
          case "i32":
          case "u32":
          case "uint":
            llvmType = "i32";
            break;
          case "i8":
          case "u8":
          case "char":
          case "uchar":
            llvmType = "i8";
            break;
          case "i16":
          case "u16":
          case "short":
          case "ushort":
            llvmType = "i16";
            break;
          case "i64":
          case "u64":
          case "long":
          case "ulong":
            llvmType = "i64";
            break;
          case "float":
          case "double":
            llvmType = "double";
            break;
          case "bool":
          case "i1":
            llvmType = "i1";
            break;
          case "void":
            llvmType = basicType.pointerDepth > 0 ? "i8" : "void";
            break;
          case "string":
            llvmType = "i8*";
            break;
          case "null":
          case "nullptr":
            llvmType = "i8*"; // Generic pointer type
            break;
          default:
            llvmType = `%struct.${basicType.name}`;
            break;
        }
      }

      for (let i = 0; i < basicType.pointerDepth; i++) {
        llvmType += "*";
      }

      for (let i = basicType.arrayDimensions.length - 1; i >= 0; i--) {
        llvmType = `[${basicType.arrayDimensions[i]} x ${llvmType}]`;
      }

      return llvmType;
    } else if (type.kind === "TupleType") {
      const tupleType = type as AST.TupleTypeNode;
      // Represent tuples as LLVM structs: { type0, type1, ... }
      const elementTypes = tupleType.types.map((t) => this.resolveType(t));
      return `{ ${elementTypes.join(", ")} }`;
    } else if (type.kind === "FunctionType") {
      const funcType = type as AST.FunctionTypeNode;
      const ret = this.resolveType(funcType.returnType);
      const params = funcType.paramTypes
        .map((p) => this.resolveType(p))
        .join(", ");
      return `${ret} (${params})*`;
    }
    return "void";
  }

  private newRegister(): string {
    return `%${this.registerCount++}`;
  }

  private newLabel(name: string): string {
    return `${name}.${this.labelCount++}`;
  }

  private isTerminator(line: string): boolean {
    line = line.trim();
    return (
      line.startsWith("ret ") ||
      line.startsWith("br ") ||
      line.startsWith("switch ") ||
      line.startsWith("unreachable")
    );
  }

  private allocateStack(name: string, type: string): string {
    // Use stack alloc count to ensure uniqueness, even if same variable name is used in different scopes
    const ptr = `%${name}_ptr.${this.stackAllocCount++}`;
    this.emit(`  ${ptr} = alloca ${type}`);
    this.locals.add(name);
    this.localPointers.set(name, ptr);
    return ptr;
  }

  private generateAssignment(expr: AST.AssignmentExpr): string {
    // Handle tuple destructuring assignment: (a, b) = expr
    if (expr.assignee.kind === "TupleLiteral") {
      const tupleLit = expr.assignee as AST.TupleLiteralExpr;
      const tupleVal = this.generateExpression(expr.value);
      const tupleType = this.resolveType(expr.value.resolvedType!);

      // Extract each element and assign to the corresponding target
      for (let i = 0; i < tupleLit.elements.length; i++) {
        const target = tupleLit.elements[i]!;
        const addr = this.generateAddress(target);

        const elemType = this.resolveType(target.resolvedType!);
        const elemVal = this.newRegister();
        this.emit(`  ${elemVal} = extractvalue ${tupleType} ${tupleVal}, ${i}`);
        this.emit(`  store ${elemType} ${elemVal}, ${elemType}* ${addr}`);
      }

      return tupleVal;
    }

    const addr = this.generateAddress(expr.assignee);
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
      throw new Error(
        `Unsupported compound assignment operator: ${expr.operator.lexeme}`,
      );
    }

    const result = this.newRegister();
    this.emit(`  ${result} = ${op} ${destType} ${currentValue}, ${castVal}`);
    this.emit(`  store ${destType} ${result}, ${destType}* ${addr}`);

    return result;
  }

  private generateMember(expr: AST.MemberExpr): string {
    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  private generateIndex(expr: AST.IndexExpr): string {
    const addr = this.generateAddress(expr);
    const type = this.resolveType(expr.resolvedType!);
    const reg = this.newRegister();
    this.emit(`  ${reg} = load ${type}, ${type}* ${addr}`);
    return reg;
  }

  private generateUnary(expr: AST.UnaryExpr): string {
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

  private generateCast(expr: AST.CastExpr): string {
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

  private generateArrayLiteral(expr: AST.ArrayLiteralExpr): string {
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

  private generateStructLiteral(expr: AST.StructLiteralExpr): string {
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
      throw new Error(`Layout for struct ${structName} not found`);
    }

    const fieldValues = new Map<string, AST.Expression>();
    for (const field of expr.fields) {
      fieldValues.set(field.name, field.value);
    }

    const sortedFields = Array.from(layout.entries()).sort(
      (a, b) => a[1] - b[1],
    );

    for (const [fieldName, fieldIndex] of sortedFields) {
      const valExpr = fieldValues.get(fieldName);
      if (valExpr) {
        const val = this.generateExpression(valExpr);
        const fieldType = this.resolveType(valExpr.resolvedType!);
        const nextVal = this.newRegister();
        this.emit(
          `  ${nextVal} = insertvalue ${type} ${structVal}, ${fieldType} ${val}, ${fieldIndex}`,
        );
        structVal = nextVal;
      }
    }

    return structVal;
  }

  private generateTupleLiteral(expr: AST.TupleLiteralExpr): string {
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

  private escapeString(str: string): string {
    return str
      .replace(/\\/g, "\\5C")
      .replace(/"/g, "\\22")
      .replace(/\n/g, "\\0A")
      .replace(/\t/g, "\\09")
      .replace(/\r/g, "\\0D");
  }

  private getBitWidth(type: string): number {
    if (type === "i1") return 1;
    if (type === "i8") return 8;
    if (type === "i16") return 16;
    if (type === "i32") return 32;
    if (type === "i64") return 64;
    return 0;
  }

  private isSigned(type: AST.TypeNode): boolean {
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

  private isIntegerType(type: string): boolean {
    return ["i1", "i8", "i16", "i32", "i64"].includes(type);
  }

  private emitParentDestroy(
    structDecl: AST.StructDecl,
    funcDecl: AST.FunctionDecl,
  ) {
    if (!structDecl.parentType) return;

    let parentName = "";
    if (structDecl.parentType.kind === "BasicType") {
      parentName = structDecl.parentType.name;
    } else {
      return;
    }

    const parentDestroy = `${parentName}_destroy`;

    const thisParam = funcDecl.params.find((p) => p.name === "this");
    if (!thisParam) return;

    const thisPtr = `%${thisParam.name}_ptr`;
    const thisType = this.resolveType(thisParam.type);

    const thisVal = this.newRegister();
    this.emit(`  ${thisVal} = load ${thisType}, ${thisType}* ${thisPtr}`);

    const parentTypeStr = this.resolveType(structDecl.parentType);
    const parentPtrType = `${parentTypeStr}*`;

    const parentPtr = this.newRegister();
    this.emit(
      `  ${parentPtr} = bitcast ${thisType} ${thisVal} to ${parentPtrType}`,
    );

    this.emit(`  call void @${parentDestroy}(${parentPtrType} ${parentPtr})`);
  }
}
