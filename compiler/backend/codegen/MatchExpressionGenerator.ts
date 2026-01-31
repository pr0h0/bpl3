/**
 * Handles match expression and pattern matching code generation.
 *
 * Generates code for:
 * - Pattern matching compilation
 * - Enum variant destructuring
 * - Tuple pattern matching
 * - Literal patterns (int, string, bool)
 * - Guard clause evaluation
 * - Wildcard and catch-all patterns
 *
 * @extends CallExpressionGenerator
 * @see ARCHITECTURE.md for the full inheritance hierarchy
 */
import * as AST from "../../common/AST";
import { RTTI } from "../../middleend/RTTI";
import { CallExpressionGenerator } from "./CallExpressionGenerator";

export abstract class MatchExpressionGenerator extends CallExpressionGenerator {
  protected abstract generateBlock(block: AST.BlockStmt): void;
  protected abstract generateExpression(expr: AST.Expression): string;
  protected abstract generateCast(expr: AST.CastExpr): string;

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

  protected generateMatchExpr(expr: AST.MatchExpr): string {
    // Generate the value to match on
    const matchValue = this.generateExpression(expr.value);
    const matchType = expr.value.resolvedType;

    if (!matchType) {
      throw this.createError(
        "Match expression value must have a resolved type",
        expr.value,
      );
    }

    // Handle tuple matching
    if (matchType.kind === "TupleType") {
      return this.generateTupleMatch(expr, matchValue, matchType);
    }

    // For non-tuple types, must be BasicType
    if (matchType.kind !== "BasicType") {
      throw this.createError(
        "Match expression value must have a basic or tuple type",
        expr.value,
      );
    }

    // From here on, matchType is guaranteed to be BasicTypeNode
    const basicMatchType = matchType;

    // Get enum information - handle generic instantiation
    let enumName = basicMatchType.name;

    // Substitute types in matchType if we are in a generic context
    const substitutedMatchType = this.substituteType(
      basicMatchType,
      this.currentTypeMap,
    ) as AST.BasicTypeNode;

    // If this is a generic enum, instantiate it
    if (
      substitutedMatchType.genericArgs &&
      substitutedMatchType.genericArgs.length > 0
    ) {
      enumName = this.instantiateGenericEnum(
        basicMatchType.name,
        substitutedMatchType.genericArgs,
      );
    }

    const variantInfo = this.enumVariants.get(enumName);

    // Handle Type Matching on Any (or other structs if we support them later)
    if (!variantInfo) {
      // Check if it's Any
      if (basicMatchType.name === "Any") {
        return this.generateAnyMatch(expr, matchValue, basicMatchType);
      }

      // Check if it's a primitive type (int, float, bool, string, char)
      if (
        [
          "i1",
          "i8",
          "i16",
          "i32",
          "i64",
          "u8",
          "u16",
          "u32",
          "u64",
          "f32",
          "f64",
          "bool",
          "char",
          "int",
          "uint",
          "float",
          "double",
          "string",
        ].includes(basicMatchType.name)
      ) {
        return this.generatePrimitiveMatch(expr, matchValue, basicMatchType);
      }

      throw this.createError(
        `Cannot match on non-enum type '${basicMatchType.name}'`,
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
    }
    // Expression - generate and return
    return this.generateExpression(body as AST.Expression);
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
    _matchType: AST.BasicTypeNode,
  ): string {
    // Any struct: { type_info: *TypeInfo, data: i64 }
    const anyType = `%struct.Any`;

    // Allocate space for Any value to extract fields (if it's passed by value)
    const anyPtr = this.newRegister();
    this.emit(`  ${anyPtr} = alloca ${anyType}`);
    this.emit(`  store ${anyType} ${matchValue}, ${anyType}* ${anyPtr}`);

    // Extract type_info (index 0)
    const typeInfoPtr = this.newRegister();
    this.emit(
      `  ${typeInfoPtr} = getelementptr inbounds ${anyType}, ${anyType}* ${anyPtr}, i32 0, i32 0`,
    );
    const typeInfo = this.newRegister();
    this.emit(
      `  ${typeInfo} = load %struct.TypeInfo*, %struct.TypeInfo** ${typeInfoPtr}`,
    );

    // Extract data (index 1) - i64
    const dataPtr = this.newRegister();
    this.emit(
      `  ${dataPtr} = getelementptr inbounds ${anyType}, ${anyType}* ${anyPtr}, i32 0, i32 1`,
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
    const currentLabel = this.newLabel("match_any_start");
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
        // Check type_info pointer equality
        const typeName = pattern.variantName;

        // Resolve type to match RTTI generation
        const dummyType: AST.BasicTypeNode = {
          kind: "BasicType",
          name: typeName,
          genericArgs: [],
          pointerDepth: 0,
          arrayDimensions: [],
          location: expr.location,
        };

        // Get the global TypeInfo* for this type
        const targetTypeInfo = this.getOrCreateTypeInfo(dummyType);

        const typeCheck = this.newRegister();
        this.emit(
          `  ${typeCheck} = icmp eq %struct.TypeInfo* ${typeInfo}, ${targetTypeInfo}`,
        );
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
        const binding = pattern.bindings[0]!;
        // Only create binding if not wildcard
        if (binding.kind === "PatternIdentifier") {
          const bindingName = binding.name;
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
          // We need to ensure registers are created in emission order
          let castVal: string;

          if (bindingType === "double") {
            castVal = this.newRegister();
            this.emit(`  ${castVal} = bitcast i64 ${data} to double`);
          } else if (bindingType === "float") {
            const trunc = this.newRegister();
            this.emit(`  ${trunc} = trunc i64 ${data} to i32`);
            castVal = this.newRegister();
            this.emit(`  ${castVal} = bitcast i32 ${trunc} to float`);
          } else if (
            bindingType.startsWith("%struct.") &&
            !bindingType.endsWith("*")
          ) {
            // Struct value - data is pointer to it
            const ptrVal = this.newRegister();
            this.emit(`  ${ptrVal} = inttoptr i64 ${data} to ${bindingType}*`);
            castVal = this.newRegister();
            this.emit(
              `  ${castVal} = load ${bindingType}, ${bindingType}* ${ptrVal}`,
            );
          } else if (bindingType.endsWith("*") || bindingType === "i8*") {
            castVal = this.newRegister();
            this.emit(`  ${castVal} = inttoptr i64 ${data} to ${bindingType}`);
          } else if (bindingType === "i64" || bindingType === "u64") {
            castVal = this.newRegister();
            this.emit(`  ${castVal} = bitcast i64 ${data} to ${bindingType}`);
          } else {
            castVal = this.newRegister();
            this.emit(`  ${castVal} = trunc i64 ${data} to ${bindingType}`);
          }

          // Store in variable
          const varAddr = this.allocateStack(bindingName, bindingType);
          this.emit(
            `  store ${bindingType} ${castVal}, ${bindingType}* ${varAddr}`,
          );
        }
      }

      const result = this.generateMatchArmBody(arm.body);

      // Restore state
      this.localPointers = savedLocalPointers;
      this.locals = savedLocals;

      // Handle result
      if (result !== null) {
        const resultLabel = this.getCurrentLabel();
        this.matchStack[this.matchStack.length - 1]!.results.push({
          value: result,
          label: resultLabel,
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

  protected generatePrimitiveMatch(
    expr: AST.MatchExpr,
    matchValue: string,
    matchType: AST.BasicTypeNode,
  ): string {
    // Primitive match: compare value to literals or bind to identifier
    const llvmType = this.resolveType(matchType);

    // Create labels
    const mergeLabel = this.newLabel("match_prim_merge");
    const armLabels: string[] = [];
    const nextLabels: string[] = [];

    for (let i = 0; i < expr.arms.length; i++) {
      armLabels.push(this.newLabel(`match_prim_arm${i}`));
      nextLabels.push(this.newLabel(`match_prim_next${i}`));
    }

    const resultType = this.resolveType(expr.resolvedType!);
    this.matchStack.push({
      mergeLabel,
      results: [],
      resultType,
      resultTypeNode: expr.resolvedType!,
    });

    // Start matching
    const currentLabel = this.newLabel("match_prim_start");
    this.emit(`  br label %${currentLabel}`);
    this.emit(`${currentLabel}:`);

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i]!;
      const pattern = arm.pattern;
      const armLabel = armLabels[i]!;
      const nextLabel = nextLabels[i]!;

      if (pattern.kind === "PatternWildcard") {
        // Wildcard always matches
        this.emit(`  br label %${armLabel}`);
      } else if (pattern.kind === "PatternLiteral") {
        // Compare literal value
        let literalValue = this.generateLiteral(pattern.value);
        const cmpReg = this.newRegister();

        if (matchType.name === "string") {
          // String comparison requires strcmp
          const strcmpResult = this.newRegister();
          this.emit(
            `  ${strcmpResult} = call i32 @strcmp(i8* ${matchValue}, i8* ${literalValue})`,
          );
          this.emit(`  ${cmpReg} = icmp eq i32 ${strcmpResult}, 0`);
        } else if (llvmType === "double" || llvmType === "float") {
          // Ensure literal is float format for fcmp
          if (
            pattern.value.kind === "Literal" &&
            pattern.value.type === "number" &&
            !literalValue.includes(".") &&
            !literalValue.includes("e")
          ) {
            literalValue = literalValue + ".0";
          }
          this.emit(
            `  ${cmpReg} = fcmp oeq ${llvmType} ${matchValue}, ${literalValue}`,
          );
        } else {
          this.emit(
            `  ${cmpReg} = icmp eq ${llvmType} ${matchValue}, ${literalValue}`,
          );
        }

        this.emit(`  br i1 ${cmpReg}, label %${armLabel}, label %${nextLabel}`);
      } else if (pattern.kind === "PatternIdentifier") {
        // Identifier always matches (binds the value)
        // Check guard if present
        if (arm.guard) {
          // We need to bind the variable first, then evaluate the guard
          const savedLocalPointers = new Map(this.localPointers);
          const savedLocals = new Set(this.locals);

          // Bind the variable
          const varAddr = this.allocateStack(pattern.name, llvmType);
          this.emit(
            `  store ${llvmType} ${matchValue}, ${llvmType}* ${varAddr}`,
          );

          // Evaluate guard
          const guardValue = this.generateExpression(arm.guard);

          // Restore state (guard shouldn't define new vars that leak out)
          this.localPointers = savedLocalPointers;
          this.locals = savedLocals;

          this.emit(
            `  br i1 ${guardValue}, label %${armLabel}, label %${nextLabel}`,
          );
        } else {
          this.emit(`  br label %${armLabel}`);
        }
      } else {
        // Unsupported pattern (shouldn't happen after type checking)
        this.emit(`  br label %${nextLabel}`);
      }

      // Generate arm body
      this.emit(`${armLabel}:`);

      const savedLocalPointers = new Map(this.localPointers);
      const savedLocals = new Set(this.locals);

      // Bind variable if PatternIdentifier
      if (pattern.kind === "PatternIdentifier") {
        const varAddr = this.allocateStack(pattern.name, llvmType);
        this.emit(`  store ${llvmType} ${matchValue}, ${llvmType}* ${varAddr}`);
      }

      const result = this.generateMatchArmBody(arm.body);

      this.localPointers = savedLocalPointers;
      this.locals = savedLocals;

      if (result !== null) {
        const resultLabel = this.getCurrentLabel();
        this.matchStack[this.matchStack.length - 1]!.results.push({
          value: result,
          label: resultLabel,
          type: resultType,
        });
        this.emit(`  br label %${mergeLabel}`);
      } else if (
        !this.isTerminator(this.output[this.output.length - 1] || "")
      ) {
        this.emit(`  br label %${mergeLabel}`);
      }

      // Next check
      this.emit(`${nextLabel}:`);
    }

    // If no match, unreachable (should be exhaustive after type checking)
    this.emit(`  unreachable`);

    const matchContext = this.matchStack.pop()!;
    this.emit(`${mergeLabel}:`);

    if (resultType === "void") {
      return "";
    }

    const resultReg = this.newRegister();
    const armResults = matchContext.results;

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

  protected generateTupleMatch(
    expr: AST.MatchExpr,
    matchValue: string,
    matchType: AST.TupleTypeNode,
  ): string {
    // Tuple match: destructure and match sub-patterns
    const tupleType = this.resolveType(matchType);

    // Extract tuple elements
    const tupleElements: { value: string; type: string }[] = [];
    for (let i = 0; i < matchType.types.length; i++) {
      const elementType = this.resolveType(matchType.types[i]!);
      const elementReg = this.newRegister();
      this.emit(
        `  ${elementReg} = extractvalue ${tupleType} ${matchValue}, ${i}`,
      );
      tupleElements.push({ value: elementReg, type: elementType });
    }

    // Create labels
    const mergeLabel = this.newLabel("match_tuple_merge");
    const armLabels: string[] = [];
    const nextLabels: string[] = [];

    for (let i = 0; i < expr.arms.length; i++) {
      armLabels.push(this.newLabel(`match_tuple_arm${i}`));
      nextLabels.push(this.newLabel(`match_tuple_next${i}`));
    }

    const resultType = this.resolveType(expr.resolvedType!);
    this.matchStack.push({
      mergeLabel,
      results: [],
      resultType,
      resultTypeNode: expr.resolvedType!,
    });

    // Start matching
    const currentLabel = this.newLabel("match_tuple_start");
    this.emit(`  br label %${currentLabel}`);
    this.emit(`${currentLabel}:`);

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i]!;
      const pattern = arm.pattern;
      const armLabel = armLabels[i]!;
      const nextLabel = nextLabels[i]!;

      // Check if pattern matches
      const matchResult = this.generateTuplePatternCheck(
        pattern,
        tupleElements,
        matchType,
        armLabel,
        nextLabel,
      );

      if (matchResult === "always") {
        // Pattern always matches - check guard if present
        if (arm.guard) {
          const savedLocalPointers = new Map(this.localPointers);
          const savedLocals = new Set(this.locals);

          // Bind variables for guard evaluation
          this.bindTuplePatternVariables(pattern, tupleElements, matchType);

          // Evaluate guard
          const guardValue = this.generateExpression(arm.guard);

          // Restore state
          this.localPointers = savedLocalPointers;
          this.locals = savedLocals;

          this.emit(
            `  br i1 ${guardValue}, label %${armLabel}, label %${nextLabel}`,
          );
        } else {
          this.emit(`  br label %${armLabel}`);
        }
      } else if (matchResult === "never") {
        this.emit(`  br label %${nextLabel}`);
      }
      // Otherwise, the check has already emitted the branch

      // Generate arm body
      this.emit(`${armLabel}:`);

      const savedLocalPointers = new Map(this.localPointers);
      const savedLocals = new Set(this.locals);

      // Bind variables from pattern
      this.bindTuplePatternVariables(pattern, tupleElements, matchType);

      const result = this.generateMatchArmBody(arm.body);

      this.localPointers = savedLocalPointers;
      this.locals = savedLocals;

      if (result !== null) {
        const resultLabel = this.getCurrentLabel();
        this.matchStack[this.matchStack.length - 1]!.results.push({
          value: result,
          label: resultLabel,
          type: resultType,
        });
        this.emit(`  br label %${mergeLabel}`);
      } else if (
        !this.isTerminator(this.output[this.output.length - 1] || "")
      ) {
        this.emit(`  br label %${mergeLabel}`);
      }

      // Next check
      this.emit(`${nextLabel}:`);
    }

    // If no match, unreachable
    this.emit(`  unreachable`);

    const matchContext = this.matchStack.pop()!;
    this.emit(`${mergeLabel}:`);

    if (resultType === "void") {
      return "";
    }

    const resultReg = this.newRegister();
    const armResults = matchContext.results;

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

  protected generateTuplePatternCheck(
    pattern: AST.Pattern,
    tupleElements: { value: string; type: string }[],
    tupleType: AST.TupleTypeNode,
    successLabel: string,
    failLabel: string,
  ): "always" | "never" | "checked" {
    if (pattern.kind === "PatternWildcard") {
      return "always";
    }

    if (pattern.kind === "PatternIdentifier") {
      return "always";
    }

    if (pattern.kind === "PatternTuple") {
      if (pattern.patterns.length !== tupleElements.length) {
        return "never";
      }

      // Collect comparison results for literal sub-patterns
      const checkRegs: string[] = [];

      for (let i = 0; i < pattern.patterns.length; i++) {
        const subPattern = pattern.patterns[i]!;
        const element = tupleElements[i]!;
        const elementTypeNode = tupleType.types[i];

        if (subPattern.kind === "PatternLiteral") {
          let literalValue = this.generateLiteral(subPattern.value);

          if (element.type === "double" || element.type === "float") {
            // Ensure literal is float format for fcmp
            if (
              subPattern.value.kind === "Literal" &&
              subPattern.value.type === "number" &&
              !literalValue.includes(".") &&
              !literalValue.includes("e")
            ) {
              literalValue = literalValue + ".0";
            }
            const cmpReg = this.newRegister();
            this.emit(
              `  ${cmpReg} = fcmp oeq ${element.type} ${element.value}, ${literalValue}`,
            );
            checkRegs.push(cmpReg);
          } else if (element.type === "i8*") {
            const strcmpResult = this.newRegister();
            this.emit(
              `  ${strcmpResult} = call i32 @strcmp(i8* ${element.value}, i8* ${literalValue})`,
            );
            const cmpReg = this.newRegister();
            this.emit(`  ${cmpReg} = icmp eq i32 ${strcmpResult}, 0`);
            checkRegs.push(cmpReg);
          } else {
            const cmpReg = this.newRegister();
            this.emit(
              `  ${cmpReg} = icmp eq ${element.type} ${element.value}, ${literalValue}`,
            );
            checkRegs.push(cmpReg);
          }
        } else if (subPattern.kind === "PatternTuple") {
          // Nested tuple pattern - recursively check
          if (elementTypeNode?.kind === "TupleType") {
            const nestedTupleType = elementTypeNode as AST.TupleTypeNode;
            const nestedElements: { value: string; type: string }[] = [];

            // Extract each element from the nested tuple
            for (let j = 0; j < nestedTupleType.types.length; j++) {
              const nestedElementType = this.resolveType(
                nestedTupleType.types[j]!,
              );
              const nestedElementReg = this.newRegister();
              this.emit(
                `  ${nestedElementReg} = extractvalue ${element.type} ${element.value}, ${j}`,
              );
              nestedElements.push({
                value: nestedElementReg,
                type: nestedElementType,
              });
            }

            // Create temporary labels for nested check
            const nestedSuccessLabel = this.newLabel("nested_tuple_ok");
            const result = this.generateTuplePatternCheck(
              subPattern,
              nestedElements,
              nestedTupleType,
              nestedSuccessLabel,
              failLabel,
            );

            if (result === "checked") {
              // Continue from the success label
              this.emit(`${nestedSuccessLabel}:`);
            } else if (result === "never") {
              return "never";
            }
            // If "always", no check was emitted, continue
          } else {
            return "never";
          }
        } else if (
          subPattern.kind !== "PatternWildcard" &&
          subPattern.kind !== "PatternIdentifier"
        ) {
          return "never";
        }
      }

      // AND all checks together
      if (checkRegs.length > 0) {
        let combinedCheck = checkRegs[0]!;
        for (let i = 1; i < checkRegs.length; i++) {
          const andReg = this.newRegister();
          this.emit(`  ${andReg} = and i1 ${combinedCheck}, ${checkRegs[i]}`);
          combinedCheck = andReg;
        }

        this.emit(
          `  br i1 ${combinedCheck}, label %${successLabel}, label %${failLabel}`,
        );
        return "checked";
      }

      return "always";
    }

    return "never";
  }

  protected bindTuplePatternVariables(
    pattern: AST.Pattern,
    tupleElements: { value: string; type: string }[],
    tupleType: AST.TupleTypeNode,
  ): void {
    if (pattern.kind === "PatternIdentifier") {
      return;
    }

    if (pattern.kind === "PatternTuple") {
      for (let i = 0; i < pattern.patterns.length; i++) {
        const subPattern = pattern.patterns[i]!;
        const element = tupleElements[i]!;
        const elementTypeNode = tupleType.types[i];

        if (subPattern.kind === "PatternIdentifier") {
          const varAddr = this.allocateStack(subPattern.name, element.type);
          this.emit(
            `  store ${element.type} ${element.value}, ${element.type}* ${varAddr}`,
          );
        } else if (subPattern.kind === "PatternTuple") {
          // Nested tuple - recursively extract and bind elements
          if (elementTypeNode?.kind === "TupleType") {
            const nestedTupleType = elementTypeNode as AST.TupleTypeNode;
            const nestedElements: { value: string; type: string }[] = [];

            // Extract each element from the nested tuple
            for (let j = 0; j < nestedTupleType.types.length; j++) {
              const nestedElementType = this.resolveType(
                nestedTupleType.types[j]!,
              );
              const nestedElementReg = this.newRegister();
              this.emit(
                `  ${nestedElementReg} = extractvalue ${element.type} ${element.value}, ${j}`,
              );
              nestedElements.push({
                value: nestedElementReg,
                type: nestedElementType,
              });
            }

            // Recursively bind the nested pattern
            this.bindTuplePatternVariables(
              subPattern,
              nestedElements,
              nestedTupleType,
            );
          }
        } else if (subPattern.kind === "PatternWildcard") {
          // Wildcard - nothing to bind
        }
      }
    }
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
    }
    // Regular type checking for non-enum types
    return this.generateRegularTypeMatch(
      matchValue,
      valueType,
      targetType,
      expr,
    );
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
    _expr: AST.TypeMatchExpr,
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
      // 1. Get TypeInfo pointer from Any
      let typeInfoVal = "";
      if (isAny) {
        // Extract from struct
        // Any layout: { type_info, data } -> index 0
        const typeInfoReg = this.newRegister();
        this.emit(
          `  ${typeInfoReg} = extractvalue %struct.Any ${matchValue}, 0`,
        );
        typeInfoVal = typeInfoReg;
      } else {
        // Load from pointer
        // getelementptr %struct.Any, %struct.Any* %ptr, i32 0, i32 0
        const typeInfoPtr = this.newRegister();
        this.emit(
          `  ${typeInfoPtr} = getelementptr inbounds %struct.Any, %struct.Any* ${matchValue}, i32 0, i32 0`,
        );
        const typeInfoReg = this.newRegister();
        this.emit(
          `  ${typeInfoReg} = load %struct.TypeInfo*, %struct.TypeInfo** ${typeInfoPtr}`,
        );
        typeInfoVal = typeInfoReg;
      }

      // 2. Get target type Info Global
      const targetTypeInfo = this.getOrCreateTypeInfo(targetType);

      // 3. Compare pointers
      const result = this.newRegister();
      this.emit(
        `  ${result} = icmp eq %struct.TypeInfo* ${typeInfoVal}, ${targetTypeInfo}`,
      );
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

    // BUG-119/120: Runtime vtable-based type checking for struct pointers
    // When we have a pointer to a base type, we need to check the runtime vtable
    // to determine the actual type of the object
    if (
      canonicalValue.kind === "BasicType" &&
      canonicalTarget.kind === "BasicType"
    ) {
      const valueBasic = canonicalValue as AST.BasicTypeNode;
      const targetBasic = canonicalTarget as AST.BasicTypeNode;

      // Check if value is a pointer to a struct with a vtable
      if (valueBasic.pointerDepth === 1) {
        const valueStructName = valueBasic.name;
        const targetStructName = targetBasic.name;

        // Check if target inherits from value's declared type OR if target IS the value's type
        // This means the runtime type COULD be target
        const targetCouldBeValid =
          this.checkInheritance(targetStructName, valueStructName) ||
          valueStructName === targetStructName;

        // Check if both types have vtables (meaning they participate in inheritance)
        const valueHasVtable = this.vtableGlobalNames.has(valueStructName);
        const targetHasVtable = this.vtableGlobalNames.has(targetStructName);

        if (targetCouldBeValid && valueHasVtable && targetHasVtable) {
          // Generate runtime vtable comparison
          // 1. Load the vtable pointer from the object (first field)
          const vtablePtrPtr = this.newRegister();
          this.emit(
            `  ${vtablePtrPtr} = bitcast %struct.${valueStructName}* ${matchValue} to i8**`,
          );
          const actualVtable = this.newRegister();
          this.emit(`  ${actualVtable} = load i8*, i8** ${vtablePtrPtr}`);

          // 2. Get the target type's vtable
          const targetVtable = this.vtableGlobalNames.get(targetStructName);
          const targetVtableMethods =
            this.vtableLayouts.get(targetStructName) || [];
          const targetVtableType = `[${targetVtableMethods.length} x i8*]`;

          // 3. Compare vtables
          const targetVtablePtr = this.newRegister();
          this.emit(
            `  ${targetVtablePtr} = bitcast ${targetVtableType}* ${targetVtable} to i8*`,
          );
          const result = this.newRegister();
          this.emit(
            `  ${result} = icmp eq i8* ${actualVtable}, ${targetVtablePtr}`,
          );
          return result;
        }
      }

      // BUG-119: Also handle struct values (not just pointers) with vtables
      // When we have a struct value like `*animal` which has a vtable as first field,
      // we can do runtime type checking on the value
      if (valueBasic.pointerDepth === 0 && targetBasic.pointerDepth === 0) {
        const valueStructName = valueBasic.name;
        const targetStructName = targetBasic.name;

        // Check if target inherits from value's declared type OR if target IS the value's type
        const targetCouldBeValid =
          this.checkInheritance(targetStructName, valueStructName) ||
          valueStructName === targetStructName;

        // Check if both types have vtables (meaning they participate in inheritance)
        const valueHasVtable = this.vtableGlobalNames.has(valueStructName);
        const targetHasVtable = this.vtableGlobalNames.has(targetStructName);

        if (targetCouldBeValid && valueHasVtable && targetHasVtable) {
          // For struct values, we need to extract the vtable from the value
          // First, store the struct value to stack so we can get a pointer to it
          const structType = `%struct.${valueStructName}`;
          const tempPtr = this.allocateStack(
            `is_temp_${this.labelCount++}`,
            structType,
          );
          this.emit(
            `  store ${structType} ${matchValue}, ${structType}* ${tempPtr}`,
          );

          // Now get the vtable pointer (first field)
          const vtablePtrPtr = this.newRegister();
          this.emit(
            `  ${vtablePtrPtr} = bitcast ${structType}* ${tempPtr} to i8**`,
          );
          const actualVtable = this.newRegister();
          this.emit(`  ${actualVtable} = load i8*, i8** ${vtablePtrPtr}`);

          // Get the target type's vtable
          const targetVtable = this.vtableGlobalNames.get(targetStructName);
          const targetVtableMethods =
            this.vtableLayouts.get(targetStructName) || [];
          const targetVtableType = `[${targetVtableMethods.length} x i8*]`;

          // Compare vtables
          const targetVtablePtr = this.newRegister();
          this.emit(
            `  ${targetVtablePtr} = bitcast ${targetVtableType}* ${targetVtable} to i8*`,
          );
          const result = this.newRegister();
          this.emit(
            `  ${result} = icmp eq i8* ${actualVtable}, ${targetVtablePtr}`,
          );
          return result;
        }
      }

      // Static inheritance checking (fallback for non-pointer types)
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
    // Check if this is a downcast of struct pointers - need runtime type check
    const srcType = expr.expression.resolvedType;
    const destType = expr.type;

    // If both are pointers to structs with potential inheritance, do runtime check
    if (
      srcType &&
      srcType.kind === "BasicType" &&
      srcType.pointerDepth === 1 &&
      destType.kind === "BasicType" &&
      destType.pointerDepth === 1
    ) {
      const srcStructName = srcType.name;
      const destStructName = destType.name;

      // Get vtable for destination type to compare at runtime
      const destVtableName = this.vtableGlobalNames.get(destStructName);

      // Only do runtime check if destination has a vtable (part of inheritance hierarchy)
      if (destVtableName) {
        const val = this.generateExpression(expr.expression);
        const destLlvmType = `%struct.${destStructName}*`;

        // Check if value is null first
        const isNullLabel = `as_isnull_${this.labelCount++}`;
        const notNullLabel = `as_notnull_${this.labelCount++}`;
        const _checkVtableLabel = `as_check_${this.labelCount++}`;
        const matchLabel = `as_match_${this.labelCount++}`;
        const noMatchLabel = `as_nomatch_${this.labelCount++}`;
        const doneLabel = `as_done_${this.labelCount++}`;

        // Check for null
        const isNull = this.newRegister();
        const srcLlvmType = `%struct.${srcStructName}*`;
        this.emit(`  ${isNull} = icmp eq ${srcLlvmType} ${val}, null`);
        this.emit(
          `  br i1 ${isNull}, label %${isNullLabel}, label %${notNullLabel}`,
        );

        // If null, result is null
        this.emit(`${isNullLabel}:`);
        this.emit(`  br label %${doneLabel}`);

        // Not null - check vtable
        this.emit(`${notNullLabel}:`);

        // Load vtable pointer from object (first field)
        const vtablePtrPtr = this.newRegister();
        this.emit(
          `  ${vtablePtrPtr} = getelementptr inbounds ${srcLlvmType.slice(0, -1)}, ${srcLlvmType} ${val}, i32 0, i32 0`,
        );
        const actualVtable = this.newRegister();
        this.emit(`  ${actualVtable} = load i8*, i8** ${vtablePtrPtr}`);

        // Compare with expected vtable
        // Get the vtable type for proper bitcast
        const destVtableMethods = this.vtableLayouts.get(destStructName) || [];
        const destVtableType = `[${destVtableMethods.length} x i8*]`;
        const expectedVtable = this.newRegister();
        this.emit(
          `  ${expectedVtable} = bitcast ${destVtableType}* ${destVtableName} to i8*`,
        );

        const vtableMatch = this.newRegister();
        this.emit(
          `  ${vtableMatch} = icmp eq i8* ${actualVtable}, ${expectedVtable}`,
        );
        this.emit(
          `  br i1 ${vtableMatch}, label %${matchLabel}, label %${noMatchLabel}`,
        );

        // Vtable matches - do the cast
        this.emit(`${matchLabel}:`);
        const castResult = this.newRegister();
        this.emit(
          `  ${castResult} = bitcast ${srcLlvmType} ${val} to ${destLlvmType}`,
        );
        this.emit(`  br label %${doneLabel}`);

        // Vtable doesn't match - return null
        this.emit(`${noMatchLabel}:`);
        this.emit(`  br label %${doneLabel}`);

        // Phi node to select result
        this.emit(`${doneLabel}:`);
        const result = this.newRegister();
        this.emit(
          `  ${result} = phi ${destLlvmType} [ null, %${isNullLabel} ], [ ${castResult}, %${matchLabel} ], [ null, %${noMatchLabel} ]`,
        );

        return result;
      }
    }

    // Default: just do a regular cast
    const castExpr: AST.CastExpr = {
      kind: "Cast",
      expression: expr.expression,
      targetType: expr.type,
      resolvedType: expr.type,
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
      const binding = pattern.bindings[i]!;
      const bindingType = variant.dataType.types[i]!;
      const llvmType = this.resolveType(bindingType);
      const typeSize = this.getTypeSize(llvmType);

      const alignment = this.getAlignmentForSize(typeSize);
      if (byteOffset % alignment !== 0) {
        byteOffset = Math.ceil(byteOffset / alignment) * alignment;
      }

      // Skip wildcard bindings (but still account for offset)
      if (binding.kind === "PatternWildcard") {
        byteOffset += typeSize;
        continue;
      }

      const bindingName = (binding as AST.PatternIdentifier).name;

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
}
