import { CompilerError, type AST } from "../..";
import type { SourceLocation } from "../../common/CompilerError";
import { DebugInfoGenerator } from "./DebugInfoGenerator";
import { FunctionAttributeGroups } from "./attributes/FunctionAttributeGroups";
import {
  createIndexOutOfBoundsErrorDecl,
  createDivisionByZeroErrorDecl,
  createNullAccessErrorDecl,
} from "../../middleend/BuiltinTypes";
import {
  parseTargetTriple,
  targetHasAnyComponent,
  targetHasComponent,
  type ParsedTargetTriple,
} from "../../common/TargetTriple";

/**
 * Get the LLVM datalayout string for a given target triple.
 * Rejects unknown target triples instead of silently using the host layout.
 */
type TargetDataLayout = {
  family: string;
  matches: (target: ParsedTargetTriple) => boolean;
  layout: string;
};

const X86_64_LINUX_DATA_LAYOUT =
  "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128";

const SUPPORTED_TARGET_DATA_LAYOUTS: TargetDataLayout[] = [
  {
    family: "x86_64 Linux",
    matches: (target) =>
      target.arch === "x86_64" && targetHasComponent(target, "linux"),
    layout: X86_64_LINUX_DATA_LAYOUT,
  },
  {
    family: "x86_64 macOS",
    matches: (target) =>
      target.arch === "x86_64" &&
      targetHasAnyComponent(target, ["darwin", "macos"]),
    layout:
      "e-m:o-p270:32:32-p271:32:32-p272:64:64-i64:64-f80:128-n8:16:32:64-S128",
  },
  {
    family: "AArch64 Linux",
    matches: (target) =>
      (target.arch === "aarch64" || target.arch === "arm64") &&
      targetHasComponent(target, "linux"),
    layout: "e-m:e-i8:8:32-i16:16:32-i64:64-i128:128-n32:64-S128",
  },
  {
    family: "AArch64 macOS",
    matches: (target) =>
      (target.arch === "aarch64" || target.arch === "arm64") &&
      targetHasAnyComponent(target, ["darwin", "macos"]),
    layout: "e-m:o-i64:64-i128:128-n32:64-S128",
  },
  {
    family: "i686 Linux",
    matches: (target) =>
      target.arch === "i686" && targetHasComponent(target, "linux"),
    layout:
      "e-m:e-p:32:32-p270:32:32-p271:32:32-p272:64:64-f64:32:64-f80:32-n8:16:32-S128",
  },
  {
    family: "x86_64 Windows",
    matches: (target) =>
      target.arch === "x86_64" && targetHasComponent(target, "windows"),
    layout:
      "e-m:w-p270:32:32-p271:32:32-p272:64:64-i64:64-f80:128-n8:16:32:64-S128",
  },
  {
    family: "wasm32",
    matches: (target) => target.arch === "wasm32",
    layout: "e-m:e-p:32:32-i64:64-n32:64-S128",
  },
  {
    family: "wasm64",
    matches: (target) => target.arch === "wasm64",
    layout: "e-m:e-p:64:64-i64:64-n32:64-S128",
  },
];

export function getSupportedCodegenTargetFamilies(): string[] {
  return SUPPORTED_TARGET_DATA_LAYOUTS.map((entry) => entry.family);
}

export function getSupportedCodegenTargetSummary(): string {
  return getSupportedCodegenTargetFamilies().join(", ");
}

function resolveDataLayoutForTarget(target?: string): string | undefined {
  if (target === undefined) {
    // Default to x86_64-linux-gnu
    return X86_64_LINUX_DATA_LAYOUT;
  }

  const parsedTarget = parseTargetTriple(target);
  if (!parsedTarget) return undefined;

  return SUPPORTED_TARGET_DATA_LAYOUTS.find((entry) =>
    entry.matches(parsedTarget),
  )?.layout;
}

export function isSupportedCodegenTarget(target?: string): boolean {
  return resolveDataLayoutForTarget(target) !== undefined;
}

export function getUnsupportedCodegenTargetMessage(target: string): string {
  return `Unsupported target triple "${target}". Supported target families: ${getSupportedCodegenTargetSummary()}.`;
}

export function getDataLayoutForTarget(target?: string): string {
  const layout = resolveDataLayoutForTarget(target);
  if (layout !== undefined) return layout;
  return raiseUnsupportedTarget(target!);
}

function raiseUnsupportedTarget(target: string): never {
  throw new Error(getUnsupportedCodegenTargetMessage(target));
}

/**
 * Base class for the LLVM IR code generator hierarchy.
 *
 * Provides core LLVM infrastructure including module/builder management,
 * struct field layouts, VTable tracking, and target-specific configuration.
 *
 * @see ARCHITECTURE.md for the full inheritance hierarchy documentation
 *
 * @remarks
 * This is the root of a 14-level inheritance chain. Each subclass adds
 * code generation capabilities for different AST node types:
 * - StructEnumGenerator: struct/enum types
 * - TypeGenerator: type conversions
 * - ReflectionGenerator: typeof/sizeof operators
 * - ...up to StatementGenerator and CodeGenerator
 */
export class BaseCodeGenerator {
  protected stdLibPath?: string;
  protected useLinkOnceOdrForStdLib: boolean = false;
  protected target?: string;
  protected generateDwarf: boolean = false;
  protected skipRuntime: boolean = false;
  protected optimizationLevel: number = 0;
  protected treeShakeTopLevelFunctions: boolean = false;
  protected debugIrPath: string | false = false;
  protected debugInfoGenerator: DebugInfoGenerator;

  constructor(
    options: {
      stdLibPath?: string;
      useLinkOnceOdrForStdLib?: boolean;
      target?: string;
      dwarf?: boolean;
      skipRuntime?: boolean;
      optimizationLevel?: number;
      treeShakeTopLevelFunctions?: boolean;
      debugIrPath?: string | false;
    } = {},
  ) {
    this.stdLibPath = options.stdLibPath;
    this.useLinkOnceOdrForStdLib = options.useLinkOnceOdrForStdLib || false;
    this.target = options.target;
    if (this.target !== undefined && !isSupportedCodegenTarget(this.target)) {
      raiseUnsupportedTarget(this.target);
    }
    this.generateDwarf = options.dwarf || false;
    this.skipRuntime = options.skipRuntime || false;
    const optimizationLevel = options.optimizationLevel ?? 0;
    if (![0, 1, 2, 3].includes(optimizationLevel)) {
      throw new Error(
        `Invalid optimization level "${optimizationLevel}". Use one of: 0, 1, 2, 3.`,
      );
    }
    this.optimizationLevel = optimizationLevel;
    this.treeShakeTopLevelFunctions =
      options.treeShakeTopLevelFunctions ?? false;
    this.debugIrPath =
      options.debugIrPath !== undefined
        ? options.debugIrPath
        : this.getDebugIrPathFromEnv();
    this.functionAttributeGroups = new FunctionAttributeGroups({
      preserveFramePointer: this.shouldPreserveFramePointers(),
    });
    this.debugInfoGenerator = new DebugInfoGenerator(
      "unknown.bpl",
      ".",
      this.target,
    );

    // Register built-in struct layouts
    this.registerBuiltinLayouts();
  }

  private getDebugIrPathFromEnv(): string | false {
    const value = process.env.BPL_DEBUG_IR;
    if (value === undefined) {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "0" || normalized === "false") {
      return false;
    }
    if (normalized === "1" || normalized === "true") {
      return "ir.ll";
    }
    return value;
  }

  protected shouldPreserveFramePointers(): boolean {
    return this.generateDwarf || this.optimizationLevel < 2;
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
  protected structFieldListCache: Map<AST.StructDecl, AST.StructField[]> =
    new Map();
  protected sortedStructLayoutEntriesCache: Map<string, [string, number][]> =
    new Map();
  protected structFieldByNameCache: Map<
    AST.StructDecl,
    Map<string, AST.StructField>
  > = new Map();
  protected specMap: Map<string, AST.SpecDecl> = new Map();
  protected thunks: Set<string> = new Set();
  protected loopStack: { continueLabel: string; breakLabel: string }[] = [];
  protected scopeStack: {
    deferred: AST.Statement[];
    isLoop: boolean;
    isFunction: boolean;
    isSwitch?: boolean;
  }[] = [];
  protected declaredFunctions: Set<string> = new Set();
  protected globals: Set<string> = new Set();
  protected locals: Set<string> = new Set();
  protected localPointers: Map<string, string> = new Map(); // Track variable name -> pointer name mapping
  protected localTypes: Map<string, AST.TypeNode> = new Map(); // Track variable name -> declared type
  protected localNullFlags: Map<string, string> = new Map(); // Track struct locals -> null-flag pointer
  protected basicBlockNonNullPointers: Map<string, number> = new Map();
  protected basicBlockNonNullPointerExpressions: Map<string, number> =
    new Map();
  protected pointerToLocal: Map<string, string> = new Map(); // Track pointer variable -> source local for null checking
  protected movedAutoDestroyAddresses?: Set<string>; // Locals returned by move should not be auto-destroyed
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
  protected functionAttributeGroups = new FunctionAttributeGroups();
  protected usedLlvmMemIntrinsics: Set<"memcpy" | "memmove" | "memset"> =
    new Set();

  protected resetLlvmAttributeGroups(): void {
    this.functionAttributeGroups.reset();
  }

  protected getFunctionAttributeGroupId(
    decl: AST.FunctionDecl,
  ): number | undefined {
    return this.functionAttributeGroups.getFunctionGroupId(decl);
  }

  protected getLlvmAttributeGroupOutput(): string {
    return this.functionAttributeGroups.render();
  }

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

  protected clearBasicBlockPointerFacts(): void {
    this.basicBlockNonNullPointers.clear();
    this.basicBlockNonNullPointerExpressions.clear();
  }

  protected clearBasicBlockPointerExpressionFact(expressionKey: string): void {
    const prefix = `${expressionKey}.`;
    const indexPrefix = `${expressionKey}[`;
    for (const key of Array.from(
      this.basicBlockNonNullPointerExpressions.keys(),
    )) {
      if (
        key === expressionKey ||
        key.startsWith(prefix) ||
        key.startsWith(indexPrefix)
      ) {
        this.basicBlockNonNullPointerExpressions.delete(key);
      }
    }
  }

  protected isBasicBlockPointerProvenNonNull(
    ptrVal: string,
    expressionKey?: string,
  ): boolean {
    const ptrProofIndex = this.basicBlockNonNullPointers.get(ptrVal);
    if (
      ptrProofIndex !== undefined &&
      !this.hasBasicBlockPointerBoundarySince(ptrProofIndex)
    ) {
      return true;
    }
    if (ptrProofIndex !== undefined) {
      this.basicBlockNonNullPointers.delete(ptrVal);
    }

    if (expressionKey === undefined) return false;
    const exprProofIndex =
      this.basicBlockNonNullPointerExpressions.get(expressionKey);
    if (
      exprProofIndex !== undefined &&
      !this.hasBasicBlockPointerBoundarySince(exprProofIndex)
    ) {
      return true;
    }
    if (exprProofIndex !== undefined) {
      this.basicBlockNonNullPointerExpressions.delete(expressionKey);
    }
    return false;
  }

  protected markBasicBlockPointerNonNull(
    ptrVal: string,
    expressionKey?: string,
  ): void {
    const proofIndex = this.output.length;
    this.basicBlockNonNullPointers.set(ptrVal, proofIndex);
    if (expressionKey !== undefined) {
      this.basicBlockNonNullPointerExpressions.set(expressionKey, proofIndex);
    }
  }

  protected markBasicBlockPointerExpressionNonNull(
    expressionKey: string,
  ): void {
    this.basicBlockNonNullPointerExpressions.set(
      expressionKey,
      this.output.length,
    );
  }

  protected markBasicBlockPointerExpressionsNonNull(
    expressionKeys: readonly string[],
  ): void {
    if (expressionKeys.length === 0) return;
    const proofIndex = this.output.length;
    for (const expressionKey of expressionKeys) {
      this.basicBlockNonNullPointerExpressions.set(expressionKey, proofIndex);
    }
  }

  protected getValidBasicBlockPointerExpressionProofKeys(): string[] {
    if (this.basicBlockNonNullPointerExpressions.size === 0) return [];

    const validKeys: string[] = [];
    for (const [
      expressionKey,
      proofIndex,
    ] of this.basicBlockNonNullPointerExpressions) {
      if (!this.hasBasicBlockPointerBoundarySince(proofIndex)) {
        validKeys.push(expressionKey);
      } else {
        this.basicBlockNonNullPointerExpressions.delete(expressionKey);
      }
    }
    return validKeys;
  }

  private hasBasicBlockPointerBoundarySince(startIndex: number): boolean {
    for (let i = startIndex; i < this.output.length; i++) {
      if (this.isBasicBlockPointerBoundaryLine(this.output[i]!)) {
        return true;
      }
    }
    return false;
  }

  private isBasicBlockPointerBoundaryLine(line: string): boolean {
    const length = line.length;
    if (length === 0) return false;

    const first = line.charCodeAt(0);
    if (first !== 32 && first !== 9) {
      return line.charCodeAt(length - 1) === 58;
    }

    let index = 0;
    while (index < length) {
      const code = line.charCodeAt(index);
      if (code !== 32 && code !== 9) break;
      index++;
    }
    if (index >= length) return false;

    const code = line.charCodeAt(index);
    return (
      (code === 98 && line.startsWith("br ", index)) ||
      (code === 114 && line.startsWith("ret ", index)) ||
      (code === 115 && line.startsWith("switch ", index)) ||
      (code === 99 && line.startsWith("call ", index)) ||
      (code === 117 && line.startsWith("unreachable", index)) ||
      (code === 37 && line.indexOf(" call ", index + 1) !== -1)
    );
  }

  protected emitDeclaration(line: string) {
    this.declarationsOutput.push(line);
  }

  // Add a method to register external layouts (to be called by the driver/compiler)
  public registerStructLayout(name: string, layout: Map<string, number>) {
    this.structLayouts.set(name, layout);
    this.sortedStructLayoutEntriesCache.delete(name);
  }

  protected getSortedStructLayoutEntries(
    structName: string,
    layout: Map<string, number>,
  ): [string, number][] {
    const cached = this.sortedStructLayoutEntriesCache.get(structName);
    if (cached) {
      return cached;
    }

    const sortedEntries = Array.from(layout.entries()).sort(
      (a, b) => a[1] - b[1],
    );
    this.sortedStructLayoutEntriesCache.set(structName, sortedEntries);
    return sortedEntries;
  }

  protected getStructFieldByName(
    decl: AST.StructDecl,
    fieldName: string,
  ): AST.StructField | undefined {
    let fieldByName = this.structFieldByNameCache.get(decl);
    if (!fieldByName) {
      fieldByName = new Map<string, AST.StructField>();
      for (const member of decl.members) {
        if (member.kind === "StructField") {
          fieldByName.set(member.name, member);
        }
      }
      this.structFieldByNameCache.set(decl, fieldByName);
    }

    return fieldByName.get(fieldName);
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
    // Process string character by character
    // All non-ASCII characters are encoded as UTF-8 bytes
    const encoder = new TextEncoder();
    let result = "";
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Printable ASCII (except " and \)
      if (code >= 32 && code <= 126 && code !== 34 && code !== 92) {
        result += str[i];
      } else if (code < 128) {
        // Non-printable ASCII - escape it as single byte
        result += "\\" + code.toString(16).toUpperCase().padStart(2, "0");
      } else {
        // Non-ASCII character - encode as UTF-8 bytes
        const bytes = encoder.encode(str[i]);
        for (let j = 0; j < bytes.length; j++) {
          const byte = bytes[j]!;
          result += "\\" + byte.toString(16).toUpperCase().padStart(2, "0");
        }
      }
    }
    return result;
  }

  // BUG-118: Calculate actual UTF-8 byte length for LLVM string constants
  // This needs to match what escapeString produces
  protected getUtf8ByteLength(str: string): number {
    const encoder = new TextEncoder();
    return encoder.encode(str).length;
  }

  protected isTerminator(line: string): boolean {
    let index = 0;
    while (index < line.length) {
      const code = line.charCodeAt(index);
      if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;
      index++;
    }

    return (
      line.startsWith("ret ", index) ||
      line.startsWith("br ", index) ||
      line.startsWith("switch ", index) ||
      line.startsWith("unreachable", index)
    );
  }
}
