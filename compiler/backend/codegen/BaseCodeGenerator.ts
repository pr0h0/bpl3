import { CompilerError, type AST } from "../..";
import type { SourceLocation } from "../../common/CompilerError";
import { DebugInfoGenerator } from "./DebugInfoGenerator";
import {
  createIndexOutOfBoundsErrorDecl,
  createDivisionByZeroErrorDecl,
  createNullAccessErrorDecl,
} from "../../middleend/BuiltinTypes";

export class BaseCodeGenerator {
  protected stdLibPath?: string;
  protected useLinkOnceOdrForStdLib: boolean = false;
  protected target?: string;
  protected generateDwarf: boolean = false;
  protected debugInfoGenerator: DebugInfoGenerator;

  constructor(
    options: {
      stdLibPath?: string;
      useLinkOnceOdrForStdLib?: boolean;
      target?: string;
      dwarf?: boolean;
    } = {},
  ) {
    this.stdLibPath = options.stdLibPath;
    this.useLinkOnceOdrForStdLib = options.useLinkOnceOdrForStdLib || false;
    this.target = options.target;
    this.generateDwarf = options.dwarf || false;
    this.debugInfoGenerator = new DebugInfoGenerator("unknown.bpl", ".");

    // Register built-in struct layouts
    this.registerBuiltinLayouts();
  }

  protected registerBuiltinLayouts() {
    this.registerBuiltinLayout(createIndexOutOfBoundsErrorDecl());
    this.registerBuiltinLayout(createDivisionByZeroErrorDecl());
    this.registerBuiltinLayout(createNullAccessErrorDecl());
  }

  protected registerBuiltinLayout(decl: AST.StructDecl) {
    const layout = new Map<string, number>();
    let index = 0;
    decl.members.forEach((m) => {
      if (m.kind === "StructField") {
        layout.set(m.name, index++);
      }
    });
    this.structLayouts.set(decl.name, layout);
    this.structMap.set(decl.name, decl);
  }

  protected output: string[] = [];
  protected declarationsOutput: string[] = []; // declarations like struct definitions
  protected currentFilePath: string = "unknown"; // Track current file for error reporting
  protected registerCount: number = 0;
  protected labelCount: number = 0;
  protected stackAllocCount: number = 0;
  protected stringLiterals: Map<string, string> = new Map(); // content -> global var name
  protected currentFunctionReturnType: AST.TypeNode | null = null;
  protected currentFunctionName: string | null = null;
  protected isMainWithVoidReturn: boolean = false;
  protected structLayouts: Map<string, Map<string, number>> = new Map();
  protected structMap: Map<string, AST.StructDecl> = new Map();
  protected specMap: Map<string, AST.SpecDecl> = new Map();
  protected loopStack: { continueLabel: string; breakLabel: string }[] = [];
  protected scopeStack: {
    deferred: AST.Statement[];
    isLoop: boolean;
    isFunction: boolean;
  }[] = [];
  protected declaredFunctions: Set<string> = new Set();
  protected globals: Set<string> = new Set();
  protected locals: Set<string> = new Set();
  protected localPointers: Map<string, string> = new Map(); // Track variable name -> pointer name mapping
  protected localNullFlags: Map<string, string> = new Map(); // Track struct locals -> null-flag pointer
  protected pointerToLocal: Map<string, string> = new Map(); // Track pointer variable -> source local for null checking
  protected generatedStructs: Set<string> = new Set(); // Track generated monomorphized structs
  protected skippedStructs: Set<string> = new Set(); // Track structs that were skipped during generation (e.g. pointers)
  protected onReturn?: () => void;
  protected typeIdMap: Map<string, number> = new Map(); // Type name -> Type ID
  protected nextTypeId: number = 10; // Start user types at 10
  protected currentTypeMap: Map<string, AST.TypeNode> = new Map(); // For generic function instantiation
  protected pendingGenerations: (() => void)[] = [];
  protected emittedMemIsZero: boolean = false;
  protected generatingFunctionBody: boolean = false; // Track if we're currently generating a function body
  protected deferMethodGeneration: boolean = false; // Defer method generation to avoid recursion
  protected resolvingMonomorphizedTypes: Set<string> = new Set(); // Track types currently being resolved to prevent re-entry
  protected enumVariants: Map<
    string,
    Map<string, { index: number; dataType?: AST.EnumVariantData }>
  > = new Map(); // Track enum variant info
  protected generatedEnums: Set<string> = new Set(); // Track generated monomorphized enums
  protected enumDeclMap: Map<string, AST.EnumDecl> = new Map(); // Track enum declarations
  protected enumDataSizes: Map<string, number> = new Map(); // Track enum data array sizes
  protected definedFunctions: Set<string> = new Set(); // Track functions defined in the current module
  protected emittedFunctions: Set<string> = new Set(); // Track functions actually emitted to LLVM
  protected typeAliasMap: Map<string, AST.TypeAliasDecl> = new Map(); // Track type aliases
  protected vtableLayouts: Map<string, string[]> = new Map(); // StructName -> [MethodName]
  protected vtableGlobalNames: Map<string, string> = new Map(); // StructName -> @StructName_vtable

  protected getStringLiteralPtr(content: string): string {
    if (!this.stringLiterals.has(content)) {
      const varName = `@.str.${this.stringLiterals.size}`;
      this.stringLiterals.set(content, varName);
    }
    const varName = this.stringLiterals.get(content)!;
    const len = content.length + 1;
    return `getelementptr inbounds ([${len} x i8], [${len} x i8]* ${varName}, i64 0, i64 0)`;
  }

  protected matchStack: {
    mergeLabel: string;
    resultType: string;
    resultTypeNode: AST.TypeNode;
    results: { value: string; label: string; type: string }[];
  }[] = [];
  protected pendingLambdas: {
    name: string;
    expr: AST.LambdaExpr;
    typeMap: Map<string, AST.TypeNode>;
  }[] = [];

  /**
   * Create a CompilerError with proper location information
   */
  protected createError(
    message: string,
    node?: AST.ASTNode,
    hint?: string,
  ): CompilerError {
    const location = node?.location || {
      file: this.currentFilePath,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    return new CompilerError(message, hint || "", location);
  }

  protected currentSubprogramId: number = -1;

  protected emit(line: string, node?: AST.ASTNode) {
    if (this.generateDwarf && this.currentSubprogramId !== -1) {
      // If node is provided, use its location.
      // If not, check if we have a "current statement" location set by generateStatement
      let locId = -1;

      if (node && node.location) {
        locId = this.debugInfoGenerator.createLocation(
          node.location.startLine,
          node.location.startColumn || 0,
          this.currentSubprogramId,
        );
      } else if (this.currentStatementLocation) {
        locId = this.debugInfoGenerator.createLocation(
          this.currentStatementLocation.startLine,
          this.currentStatementLocation.startColumn || 0,
          this.currentSubprogramId,
        );
      }

      if (locId !== -1) {
        // Only attach debug info to instructions, not labels or braces
        const trimmed = line.trim();
        if (
          trimmed.endsWith(":") ||
          trimmed.startsWith("}") ||
          trimmed.startsWith("{") ||
          trimmed.startsWith("define") ||
          trimmed === ""
        ) {
          this.output.push(line);
        } else {
          this.output.push(`${line}, !dbg !${locId}`);
        }
      } else {
        this.output.push(line);
      }
    } else {
      this.output.push(line);
    }
  }

  protected currentStatementLocation: SourceLocation | null = null;

  protected emitDeclaration(line: string) {
    this.declarationsOutput.push(line);
  }

  // Add a method to register external layouts (to be called by the driver/compiler)
  public registerStructLayout(name: string, layout: Map<string, number>) {
    this.structLayouts.set(name, layout);
  }

  protected newRegister(): string {
    return `%${this.registerCount++}`;
  }

  protected newLabel(name: string): string {
    return `${name}.${this.labelCount++}`;
  }

  protected emitNullObjectTrap(
    trapLabel: string,
    funcName: string,
    accessExpr: string,
  ): void {
    this.emit(`${trapLabel}:`);
    // Print error message to stderr using fprintf
    const msg = `\n*** NULL OBJECT ACCESS ***\nFunction: ${funcName}\nExpression: ${accessExpr}\nAttempted to access member/index of null object\n\n`;
    if (!this.stringLiterals.has(msg)) {
      this.stringLiterals.set(
        msg,
        `@.null_err_msg.${this.stringLiterals.size}`,
      );
    }
    const msgVar = this.stringLiterals.get(msg)!;
    const msgLen = msg.length + 1;

    // Load stderr (file descriptor 2) and print using fprintf
    // We use write syscall to avoid register issues with fprintf return value
    const stderrPtr = this.newRegister();
    this.emit(
      `  ${stderrPtr} = load %struct._IO_FILE*, %struct._IO_FILE** @stderr`,
    );
    this.emit(
      `  call i32 @fprintf(%struct._IO_FILE* ${stderrPtr}, i8* getelementptr inbounds ([${msgLen} x i8], [${msgLen} x i8]* ${msgVar}, i64 0, i64 0))`,
    );
    this.emit(`  call void @exit(i32 1)`);
    this.emit(`  unreachable`);
  }

  protected escapeString(str: string): string {
    let result = "";
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      if (char < 32 || char > 126 || char === 34 || char === 92) {
        result += "\\" + char.toString(16).toUpperCase().padStart(2, "0");
      } else {
        result += str[i];
      }
    }
    return result;
  }

  protected isTerminator(line: string): boolean {
    line = line.trim();
    return (
      line.startsWith("ret ") ||
      line.startsWith("br ") ||
      line.startsWith("switch ") ||
      line.startsWith("unreachable")
    );
  }
}
