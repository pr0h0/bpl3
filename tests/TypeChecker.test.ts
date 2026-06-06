import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import type * as AST from "../compiler/common/AST";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parseProgram(source: string, filePath = "test.bpl") {
  const tokens = lexWithGrammar(source, filePath);
  const parser = new Parser(source, filePath, tokens);
  return parser.parse();
}

function check(source: string) {
  const program = parseProgram(source);
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }
  return program;
}

function collectErrorMessages(source: string, filePath = "test.bpl") {
  const typeChecker = new TypeChecker({ collectAllErrors: true });
  typeChecker.checkProgram(parseProgram(source, filePath), filePath);
  return typeChecker.getErrors().map((error) => error.message);
}

describe("TypeChecker", () => {
  it("defers implicit primitive wrapper imports for programs that only use builtin aliases", () => {
    const checker = new TypeChecker();
    checker.checkProgram(
      parseProgram(
        [
          "frame main() ret int {",
          "  local value: int = 42;",
          "  return value;",
          "}",
        ].join("\n"),
      ),
    );

    expect(
      Array.from(checker.modules.keys()).some((modulePath) =>
        modulePath.endsWith("primitives.bpl"),
      ),
    ).toBe(false);
  });

  it("loads implicit primitive wrappers on demand when wrapper types are used", () => {
    const checker = new TypeChecker();
    checker.checkProgram(
      parseProgram(
        [
          "frame main() ret int {",
          "  local boxed: Int;",
          "  boxed.value = 42;",
          "  return boxed.value;",
          "}",
        ].join("\n"),
      ),
    );

    expect(checker.getErrors()).toEqual([]);
    expect(
      Array.from(checker.modules.keys()).some((modulePath) =>
        modulePath.endsWith("primitives.bpl"),
      ),
    ).toBe(true);
  });

  it("checks standard library runtime type declarations by name before path suffix", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const start = source.indexOf(
      "protected isStandardLibraryRuntimeTypeDeclaration",
    );
    const end = source.indexOf(
      "protected initializeBuiltins",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const methodSource = source.slice(start, end);
    expect(source).toContain("function isBplStandardLibraryModuleFile");
    expect(methodSource).toContain("switch (name)");
    expect(methodSource).toContain('case "TypeInfo":');
    expect(methodSource).toContain('case "Type":');
    expect(methodSource).toContain('case "Any":');
    expect(methodSource).toContain(
      'isBplStandardLibraryModuleFile(location.file, "type")',
    );
    expect(methodSource).not.toContain("const isTypeModule");
    expect(methodSource).not.toContain("const isReflectionModule");
    expect(methodSource).not.toContain("const isErrorsModule");
    expect(methodSource).not.toContain("const isPrimitivesModule");
    expect(methodSource).not.toContain(".test(sourceFile)");
  });

  it("keeps canonical primitive type resolution on the no-op fast path", () => {
    const location = {
      file: "test.bpl",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 4,
    };
    const checker = new TypeChecker({ skipImportResolution: true });
    const canonical = {
      kind: "BasicType" as const,
      name: "i32",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location,
    };
    const alias = {
      ...canonical,
      name: "int",
    };

    const resolvedAlias = checker.resolveType(alias);

    expect(checker.resolveType(canonical)).toBe(canonical);
    expect(resolvedAlias.kind).toBe("BasicType");
    if (resolvedAlias.kind === "BasicType") {
      expect(resolvedAlias.name).toBe("i32");
    }
  });

  it("caches simple builtin alias resolution on the BasicType node", () => {
    const location = {
      file: "test.bpl",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 4,
    };
    const checker = new TypeChecker({ skipImportResolution: true });
    const alias: AST.BasicTypeNode = {
      kind: "BasicType",
      name: "int",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location,
    };

    const first = checker.resolveType(alias);
    const second = checker.resolveType(alias);

    expect(first.kind).toBe("BasicType");
    expect(second).toBe(first);
    expect(alias.resolvedType).toBe(first);
    if (first.kind === "BasicType") {
      expect(first.name).toBe("i32");
    }
  });

  it("does not reuse scalar builtin alias cache for fixed array literals", () => {
    const program = check(
      [
        "frame main() ret int {",
        "  local scalar: int = 1;",
        "  local values: int[2] = [10, 20];",
        "  return scalar + values[1];",
        "}",
      ].join("\n"),
    );
    expect(program.statements.length).toBe(1);
    const main = program.statements[0]!;
    expect(main.kind).toBe("FunctionDecl");
    if (main.kind !== "FunctionDecl") {
      return;
    }
    const declaration = main.body.statements[1];
    expect(declaration?.kind).toBe("VariableDecl");
    if (declaration?.kind === "VariableDecl") {
      expect(declaration.initializer?.resolvedType?.kind).toBe("BasicType");
      if (declaration.initializer?.resolvedType?.kind === "BasicType") {
        expect(declaration.initializer.resolvedType.arrayDimensions).toEqual([
          2,
        ]);
      }
    }
  });

  it("returns cached simple builtin aliases before name dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolveType = source.indexOf("public resolveType");
    const simpleBuiltin = source.indexOf(
      "const simpleBuiltin = resolveSimpleBuiltinBasicType(type)",
      resolveType,
    );

    expect(resolveType).toBeGreaterThanOrEqual(0);
    expect(simpleBuiltin).toBeGreaterThan(resolveType);

    const prefix = source.slice(resolveType, simpleBuiltin);
    expect(prefix).toContain("const cachedResolvedType = type.resolvedType;");
    expect(prefix).toContain('cachedResolvedType.kind === "BasicType"');
  });

  it("reuses cached expression basic type resolutions before resolveType", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeChecker.ts"),
      "utf8",
    );
    const checkExpression = source.indexOf("public checkExpression");
    const resolvedAssignment = source.indexOf(
      "expr.resolvedType = resolved;",
      checkExpression,
    );

    expect(checkExpression).toBeGreaterThanOrEqual(0);
    expect(resolvedAssignment).toBeGreaterThan(checkExpression);

    const checkExpressionSource = source.slice(
      checkExpression,
      resolvedAssignment,
    );
    const cached = checkExpressionSource.indexOf(
      "const cachedResolvedType = type.resolvedType;",
    );
    const resolveCall = checkExpressionSource.indexOf("this.resolveType(type)");

    expect(cached).toBeGreaterThanOrEqual(0);
    expect(resolveCall).toBeGreaterThan(cached);
  });

  it("reuses expression checker resolved types before resolving again", () => {
    const typeCheckerSource = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeChecker.ts"),
      "utf8",
    );
    const expressionCheckerSource = readFileSync(
      join(process.cwd(), "compiler/middleend/ExpressionChecker.ts"),
      "utf8",
    );
    const checkExpression = typeCheckerSource.indexOf("public checkExpression");
    const resolvedAssignment = typeCheckerSource.indexOf(
      "expr.resolvedType = resolved;",
      checkExpression,
    );
    const checkIdentifier = expressionCheckerSource.indexOf(
      "export function checkIdentifier",
    );
    const checkIdentifierEnd = expressionCheckerSource.indexOf(
      "\n}",
      checkIdentifier,
    );

    expect(checkExpression).toBeGreaterThanOrEqual(0);
    expect(resolvedAssignment).toBeGreaterThan(checkExpression);
    expect(checkIdentifier).toBeGreaterThanOrEqual(0);
    expect(checkIdentifierEnd).toBeGreaterThan(checkIdentifier);

    const checkExpressionSource = typeCheckerSource.slice(
      checkExpression,
      resolvedAssignment,
    );
    const checkIdentifierSource = expressionCheckerSource.slice(
      checkIdentifier,
      checkIdentifierEnd,
    );
    const previousResolvedType = checkExpressionSource.indexOf(
      "const previousResolvedType = expr.resolvedType;",
    );
    const directResolvedType = checkExpressionSource.indexOf(
      "const directResolvedType = expr.resolvedType;",
    );
    const resolveCall = checkExpressionSource.indexOf("this.resolveType(type)");

    expect(checkIdentifierSource).toContain("expr.resolvedType = type;");
    expect(previousResolvedType).toBeGreaterThanOrEqual(0);
    expect(directResolvedType).toBeGreaterThan(previousResolvedType);
    expect(resolveCall).toBeGreaterThan(directResolvedType);
  });

  it("reuses resolved initializer types during variable declaration checks", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/StatementChecker.ts"),
      "utf8",
    );
    const checkVariableDecl = source.indexOf("export function checkVariableDecl");
    const constValueCheck = source.indexOf(
      "const constVal = this.getIntegerConstantValue",
      checkVariableDecl,
    );

    expect(checkVariableDecl).toBeGreaterThanOrEqual(0);
    expect(constValueCheck).toBeGreaterThan(checkVariableDecl);

    const compatibilityPrefix = source.slice(checkVariableDecl, constValueCheck);
    expect(compatibilityPrefix).toContain(
      "const resolvedInit =\n          decl.initializer.resolvedType ?? this.resolveType(initType);",
    );
    expect(compatibilityPrefix).toContain("const resolvedDecl = declaredType;");
    expect(compatibilityPrefix).not.toContain(
      "this.resolveType(declaredType)",
    );
  });

  it("keeps integer literal underscore replacement behind a guard", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/ExpressionChecker.ts"),
      "utf8",
    );
    const checkLiteral = source.indexOf("export function checkLiteral");
    const checkLiteralEnd = source.indexOf("\n}\n\n/**", checkLiteral);

    expect(checkLiteral).toBeGreaterThanOrEqual(0);
    expect(checkLiteralEnd).toBeGreaterThan(checkLiteral);

    const literalSource = source.slice(checkLiteral, checkLiteralEnd);
    const underscoreCheck = literalSource.indexOf('expr.raw.indexOf("_")');
    const replace = literalSource.indexOf('expr.raw.replace(/_/g, "")');
    const bigint = literalSource.indexOf("BigInt(cleanRaw)");

    expect(underscoreCheck).toBeGreaterThanOrEqual(0);
    expect(replace).toBeGreaterThan(underscoreCheck);
    expect(bigint).toBeGreaterThan(replace);
  });

  it("keeps binary operator classification off temporary arrays", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/ExpressionChecker.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("export function checkBinary");
    const methodEnd = source.indexOf("export function checkUnary", methodStart);
    const methodSource = source.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(methodSource).toContain("op === TokenType.Ampersand");
    expect(methodSource).toContain("op === TokenType.Plus");
    expect(methodSource).not.toContain("].includes(op)");
  });

  it("keeps small struct literal missing-field checks off Set allocation", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/ExpressionChecker.ts"),
      "utf8",
    );
    const start = source.indexOf("export function checkStructLiteral");
    const end = source.indexOf("export function checkTupleLiteral", start);
    const methodSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(source).toContain("STRUCT_LITERAL_FIELD_SET_THRESHOLD");
    expect(methodSource).toContain("let providedFields: Set<string> | undefined;");
    expect(methodSource).toContain(
      "expr.fields.length > STRUCT_LITERAL_FIELD_SET_THRESHOLD",
    );
    expect(methodSource).toContain("providedFields = new Set<string>();");
    expect(methodSource).toContain("providedFields.add(field.name);");
    expect(methodSource).toContain("for (const field of expr.fields)");
    expect(methodSource).not.toContain(
      "new Set(expr.fields.map((f) => f.name))",
    );
  });

  it("allocates struct literal generic maps only when arguments are provided", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/ExpressionChecker.ts"),
      "utf8",
    );
    const start = source.indexOf("export function checkStructLiteral");
    const end = source.indexOf("export function checkTupleLiteral", start);
    const methodSource = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(methodSource).toContain(
      "let genericMap: Map<string, AST.TypeNode> | undefined;",
    );
    expect(methodSource).toContain(
      "genericMap = new Map<string, AST.TypeNode>();",
    );
    expect(methodSource).toContain("if (genericMap) {");
    expect(methodSource).not.toContain(
      "const genericMap = new Map<string, AST.TypeNode>();",
    );
    expect(methodSource).not.toContain("if (genericMap.size > 0)");
  });

  it("keeps simple builtin aliases before the scope lookup path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const aliasHelper = source.indexOf("resolveSimpleBuiltinBasicType");
    const resolveType = source.indexOf("public resolveType");
    const firstScopeLookup = source.indexOf(
      "this.currentScope.resolve(name)",
      resolveType,
    );

    expect(aliasHelper).toBeGreaterThanOrEqual(0);
    expect(resolveType).toBeGreaterThan(aliasHelper);
    expect(source.indexOf("resolveSimpleBuiltinBasicType(type)", resolveType))
      .toBeLessThan(firstScopeLookup);
    expect(source.indexOf("isCanonicalBuiltinBasicType(type)", resolveType))
      .toBe(-1);
    expect(source.indexOf("createCanonicalBuiltinAliasType(type)", resolveType))
      .toBe(-1);
  });

  it("keeps simple builtin resolver on a single direct dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf("\n}", resolver);
    const resolverSource = source.slice(resolver, resolverEnd);
    const dispatchCall = resolverSource.indexOf(
      "resolveSimpleBuiltinTypeName(name)",
    );
    const cloneCall = resolverSource.indexOf(
      "cloneSimpleBuiltinAliasType(type, resolvedName)",
    );

    expect(source).not.toContain("function isPotentialSimpleBuiltinTypeName");
    expect(dispatchCall).toBeGreaterThanOrEqual(0);
    expect(cloneCall).toBeGreaterThan(dispatchCall);
    expect(resolverSource).not.toContain("switch (name.charCodeAt(0))");
    expect(resolverSource).not.toContain("TYPE_ALIASES[type.name]");
    expect(resolverSource).not.toContain(
      "SIMPLE_BUILTIN_BASIC_TYPE_NAMES[type.name]",
    );
  });

  it("keeps scalar basic types off empty array-dimension iteration", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolveType = source.indexOf("public resolveType");
    const simpleBuiltin = source.indexOf(
      "const simpleBuiltin = resolveSimpleBuiltinBasicType(type)",
      resolveType,
    );

    expect(resolveType).toBeGreaterThanOrEqual(0);
    expect(simpleBuiltin).toBeGreaterThan(resolveType);

    const basicTypePrefix = source.slice(resolveType, simpleBuiltin);
    expect(basicTypePrefix).toContain("type.arrayDimensions.length !== 0");
    expect(basicTypePrefix).not.toContain("if (type.arrayDimensions) {");
  });

  it("keeps resolved basic type cache shape checks scalar-first", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const shapeHelper = source.indexOf("function hasSameBasicShape");
    const shapeHelperEnd = source.indexOf(
      "\nfunction resolveSimpleBuiltinTypeName",
      shapeHelper,
    );

    expect(shapeHelper).toBeGreaterThanOrEqual(0);
    expect(shapeHelperEnd).toBeGreaterThan(shapeHelper);

    const shapeSource = source.slice(shapeHelper, shapeHelperEnd);
    const pointerCheck = shapeSource.indexOf(
      "type.pointerDepth !== resolved.pointerDepth",
    );
    const dimensionCount = shapeSource.indexOf(
      "const dimensionCount = type.arrayDimensions.length;",
    );
    const scalarFastPath = shapeSource.indexOf("dimensionCount === 0");
    const lengthMismatch = shapeSource.indexOf(
      "dimensionCount !== resolved.arrayDimensions.length",
    );
    const loopLimit = shapeSource.indexOf("i < dimensionCount");

    expect(pointerCheck).toBeGreaterThanOrEqual(0);
    expect(dimensionCount).toBeGreaterThan(pointerCheck);
    expect(scalarFastPath).toBeGreaterThan(dimensionCount);
    expect(lengthMismatch).toBeGreaterThan(scalarFastPath);
    expect(loopLimit).toBeGreaterThan(lengthMismatch);
  });

  it("keeps cached basic type shape checks on the shared array-dimension fast path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const shapeHelper = source.indexOf("function hasSameBasicShape");
    const shapeHelperEnd = source.indexOf(
      "\nfunction resolveSimpleBuiltinTypeName",
      shapeHelper,
    );

    expect(shapeHelper).toBeGreaterThanOrEqual(0);
    expect(shapeHelperEnd).toBeGreaterThan(shapeHelper);

    const shapeSource = source.slice(shapeHelper, shapeHelperEnd);
    const pointerCheck = shapeSource.indexOf(
      "type.pointerDepth !== resolved.pointerDepth",
    );
    const sharedDimensions = shapeSource.indexOf(
      "type.arrayDimensions === resolved.arrayDimensions",
      pointerCheck,
    );
    const dimensionCount = shapeSource.indexOf(
      "const dimensionCount = type.arrayDimensions.length;",
      sharedDimensions,
    );

    expect(pointerCheck).toBeGreaterThanOrEqual(0);
    expect(sharedDimensions).toBeGreaterThan(pointerCheck);
    expect(dimensionCount).toBeGreaterThan(sharedDimensions);
  });

  it("reuses the builtin basic type name across the hot simple resolver", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf(
      "\nfunction canReuseResolvedBasicType",
      resolver,
    );

    expect(resolver).toBeGreaterThanOrEqual(0);
    expect(resolverEnd).toBeGreaterThan(resolver);

    const resolverSource = source.slice(resolver, resolverEnd);
    expect(resolverSource).toContain("const name = type.name;");
    expect(resolverSource).toContain("resolveSimpleBuiltinTypeName(name)");
    expect(resolverSource).not.toContain("switch (name.charCodeAt(0))");
    expect(resolverSource).not.toContain(
      "isPotentialSimpleBuiltinTypeName(type.name)",
    );
    expect(resolverSource).not.toContain(
      "isPotentialSimpleBuiltinTypeName(name)",
    );
    expect(resolverSource).not.toContain(
      "resolveSimpleBuiltinTypeName(type.name)",
    );
  });

  it("keeps hot int alias resolution before generic builtin dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf(
      "\nfunction canReuseResolvedBasicType",
      resolver,
    );

    expect(resolver).toBeGreaterThanOrEqual(0);
    expect(resolverEnd).toBeGreaterThan(resolver);

    const resolverSource = source.slice(resolver, resolverEnd);
    const hotIntFastPath = resolverSource.indexOf("name.length === 3");
    const dispatchCall = resolverSource.indexOf(
      "resolveSimpleBuiltinTypeName(name)",
    );
    expect(hotIntFastPath).toBeGreaterThanOrEqual(0);
    expect(dispatchCall).toBeGreaterThan(hotIntFastPath);
    expect(resolverSource).toContain('cloneSimpleBuiltinAliasType(type, "i32")');
  });

  it("skips uppercase nominal basic names before generic builtin dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf(
      "\nfunction canReuseResolvedBasicType",
      resolver,
    );

    expect(resolver).toBeGreaterThanOrEqual(0);
    expect(resolverEnd).toBeGreaterThan(resolver);

    const resolverSource = source.slice(resolver, resolverEnd);
    const uppercaseFastMiss = resolverSource.indexOf(
      "firstCode < 97 || firstCode > 122",
    );
    const dispatchCall = resolverSource.indexOf(
      "resolveSimpleBuiltinTypeName(name)",
    );

    expect(uppercaseFastMiss).toBeGreaterThanOrEqual(0);
    expect(dispatchCall).toBeGreaterThan(uppercaseFastMiss);
  });

  it("keeps simple builtin type resolution on direct dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const dispatch = source.indexOf("function resolveSimpleBuiltinTypeName");
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const dispatchEnd = source.indexOf(
      "\nfunction resolveSimpleBuiltinBasicType",
      dispatch,
    );
    const dispatchSource = source.slice(dispatch, dispatchEnd);
    const resolverEnd = source.indexOf("\n}", resolver);
    const resolverSource = source.slice(resolver, resolverEnd);

    expect(dispatch).toBeGreaterThanOrEqual(0);
    expect(dispatch).toBeLessThan(resolver);
    expect(dispatchSource).toContain("switch (name.length)");
    expect(dispatchSource).not.toContain('case "int"');
    expect(resolverSource).toContain("resolveSimpleBuiltinTypeName(name)");
    expect(resolverSource).not.toContain("TYPE_ALIASES[type.name]");
    expect(resolverSource).not.toContain(
      "SIMPLE_BUILTIN_BASIC_TYPE_NAMES[type.name]",
    );
  });

  it("keeps simple builtin alias cloning off the spread fast path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const cloneHelper = source.indexOf("function cloneSimpleBuiltinAliasType");
    const cloneHelperEnd = source.indexOf(
      "\nfunction resolveSimpleBuiltinTypeName",
      cloneHelper,
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf("\n/**", resolver);
    const cloneSource = source.slice(cloneHelper, cloneHelperEnd);
    const resolverSource = source.slice(resolver, resolverEnd);

    expect(cloneHelper).toBeGreaterThanOrEqual(0);
    expect(cloneHelperEnd).toBeGreaterThan(cloneHelper);
    expect(cloneHelper).toBeLessThan(resolver);
    expect(resolverSource).toContain(
      "cloneSimpleBuiltinAliasType(type, resolvedName)",
    );
    expect(resolverSource).not.toContain("...type");
    expect(source).not.toContain("function hasExtendedBasicTypeMetadata");
    expect(cloneSource).toContain("cached !== undefined");
    expect(cloneSource).not.toContain("cached?.kind");
    expect(cloneSource).not.toContain("hasExtendedBasicTypeMetadata(type)");
  });

  it("resolves already-resolved nominal basic types without scope lookup", () => {
    const location = {
      file: "test.bpl",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 12,
    };
    const declaration: AST.StructDecl = {
      kind: "StructDecl",
      name: "ResolvedBox",
      genericParams: [],
      inheritanceList: [],
      members: [],
      location,
    };
    const resolvedType: AST.BasicTypeNode = {
      kind: "BasicType",
      name: "ResolvedBox",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location,
      resolvedDeclaration: declaration,
    };
    const checker = new TypeChecker({ skipImportResolution: true });
    const originalResolve = checker.currentScope.resolve;
    checker.currentScope.resolve = () => {
      throw new Error("resolved type should not consult current scope");
    };

    try {
      expect(checker.resolveType(resolvedType)).toBe(resolvedType);
    } finally {
      checker.currentScope.resolve = originalResolve;
    }
  });

  it("caches non-generic nominal type resolution on the BasicType node", () => {
    const location = {
      file: "test.bpl",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 12,
    };
    const declaration: AST.StructDecl = {
      kind: "StructDecl",
      name: "ResolvedBox",
      genericParams: [],
      inheritanceList: [],
      members: [],
      location,
    };
    const unresolvedType: AST.BasicTypeNode = {
      kind: "BasicType",
      name: "ResolvedBox",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location,
    };
    const checker = new TypeChecker({ skipImportResolution: true });
    checker.currentScope.define({
      name: "ResolvedBox",
      kind: "Struct",
      declaration,
    });

    const first = checker.resolveType(unresolvedType);

    expect(first).toBe(unresolvedType);
    expect(unresolvedType.resolvedDeclaration).toBe(declaration);

    const originalResolve = checker.currentScope.resolve;
    checker.currentScope.resolve = () => {
      throw new Error("cached non-generic nominal type should not resolve");
    };

    try {
      expect(checker.resolveType(unresolvedType)).toBe(unresolvedType);
    } finally {
      checker.currentScope.resolve = originalResolve;
    }
  });

  it("keeps non-generic nominal type caching inline in resolveType", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolveType = source.indexOf("public resolveType");
    const nextMethod = source.indexOf("\n  public substituteType", resolveType);

    expect(resolveType).toBeGreaterThanOrEqual(0);
    expect(nextMethod).toBeGreaterThan(resolveType);

    const resolveTypeSource = source.slice(resolveType, nextMethod);
    expect(source).not.toContain("function cacheNonGenericNominalBasicType");
    expect(resolveTypeSource).not.toContain(
      "cacheNonGenericNominalBasicType(",
    );
    expect(resolveTypeSource).toContain(
      "declaration.genericParams.length === 0",
    );
  });

  it("keeps already-resolved nominal type reuse before implicit imports and scope lookup", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const helperStart = source.indexOf("function canReuseResolvedBasicType");
    const resolveType = source.indexOf("public resolveType");
    const reuseCheck = source.indexOf(
      "canReuseResolvedBasicType(type)",
      resolveType,
    );
    const primitiveImport = source.indexOf(
      "this.ensureImplicitPrimitiveWrappersLoaded(name)",
      resolveType,
    );
    const firstScopeLookup = source.indexOf(
      "this.currentScope.resolve(name)",
      resolveType,
    );

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(reuseCheck).toBeGreaterThan(resolveType);
    expect(reuseCheck).toBeLessThan(primitiveImport);
    expect(reuseCheck).toBeLessThan(firstScopeLookup);

    const helperSource = source.slice(helperStart, resolveType);
    expect(helperSource).toContain("type.genericArgs.length !== 0");
    expect(helperSource).toContain("type.aliasDeclaration");
    expect(helperSource).toContain("type.variableDeclaration");
    expect(helperSource).toContain('decl.kind !== "StructDecl"');
    expect(helperSource).toContain('decl.kind !== "EnumDecl"');
    expect(helperSource).toContain('decl.kind !== "SpecDecl"');
    expect(helperSource).toContain("decl.genericParams.length === 0");
  });

  it("reuses the basic type name across resolveType lookup branches", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolveType = source.indexOf("public resolveType");
    const nextMethod = source.indexOf("\n  protected", resolveType);

    expect(resolveType).toBeGreaterThanOrEqual(0);
    expect(nextMethod).toBeGreaterThan(resolveType);

    const resolveTypeSource = source.slice(resolveType, nextMethod);
    expect(resolveTypeSource).toContain("const name = type.name;");
    expect(resolveTypeSource).toContain("this.currentScope.resolve(name)");
    expect(resolveTypeSource).toContain(
      'const isQualifiedTypeName = name.includes(".");',
    );
    expect(resolveTypeSource).toContain(
      "this.ensureImplicitPrimitiveWrappersLoaded(name)",
    );
    expect(resolveTypeSource).toMatch(
      /resolveQualifiedTypeSymbol\(\s*this\.currentScope,\s*name,\s*\)/,
    );
  });

  it("keeps qualified type lookup lazy on the unqualified type fast path", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolveType = source.indexOf("public resolveType");
    const nextMethod = source.indexOf("\n  protected", resolveType);
    const resolveTypeSource = source.slice(resolveType, nextMethod);

    expect(resolveType).toBeGreaterThanOrEqual(0);
    expect(nextMethod).toBeGreaterThan(resolveType);
    expect(resolveTypeSource).not.toContain("const resolveQualifiedSymbol =");
    expect(resolveTypeSource).toContain(
      'const isQualifiedTypeName = name.includes(".");',
    );
    expect(resolveTypeSource).toMatch(
      /resolveQualifiedTypeSymbol\(\s*this\.currentScope,\s*name,\s*\)/,
    );
  });

  it("keeps function declaration hoisting on a single parameter scan", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeChecker.ts"),
      "utf8",
    );
    const functionCase = source.indexOf('case "FunctionDecl":');
    const typeAliasCase = source.indexOf('case "TypeAlias":', functionCase);

    expect(functionCase).toBeGreaterThanOrEqual(0);
    expect(typeAliasCase).toBeGreaterThan(functionCase);

    const branchSource = source.slice(functionCase, typeAliasCase);
    expect(branchSource).toContain(
      "const paramTypes: AST.TypeNode[] = new Array(stmt.params.length)",
    );
    expect(branchSource).toContain(
      "for (let i = 0; i < stmt.params.length; i++)",
    );
    expect(branchSource).not.toContain("stmt.params.some");
    expect(branchSource).not.toContain("stmt.params.map");
  });

  it("skips function attribute validation allocations for attribute-free functions", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "compiler/middleend/validators/FunctionAttributeValidator.ts",
      ),
      "utf8",
    );
    const validator = source.indexOf("export function validateFunctionAttributes");
    const validatorEnd = source.indexOf("\nfunction isVoidType", validator);

    expect(validator).toBeGreaterThanOrEqual(0);
    expect(validatorEnd).toBeGreaterThan(validator);

    const validatorSource = source.slice(validator, validatorEnd);
    const attributes = validatorSource.indexOf("const attributes =");
    const emptyReturn = validatorSource.indexOf(
      "if (attributes.length === 0) return;",
    );
    const seen = validatorSource.indexOf("const seen = new Set");
    const conflictGroups = validatorSource.indexOf(
      "FUNCTION_ATTRIBUTE_CONFLICT_GROUPS",
    );

    expect(attributes).toBeGreaterThanOrEqual(0);
    expect(emptyReturn).toBeGreaterThan(attributes);
    expect(seen).toBeGreaterThan(emptyReturn);
    expect(conflictGroups).toBeGreaterThan(seen);
  });

  it("skips attribute-free function validation before allocating options", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeChecker.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("private checkFunctionAttributes");
    const methodEnd = source.indexOf("private checkFunctionBody", methodStart);
    const methodSource = source.slice(methodStart, methodEnd);
    const emptyReturn = methodSource.indexOf(
      "if (decl.attributes.length === 0) return;",
    );
    const validation = methodSource.indexOf("validateFunctionAttributes(");

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(emptyReturn).toBeGreaterThanOrEqual(0);
    expect(validation).toBeGreaterThan(emptyReturn);
  });

  it("allocates function duplicate-name sets only when duplicates are possible", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeChecker.ts"),
      "utf8",
    );
    const bodyStart = source.indexOf("private checkFunctionBody");
    const bodyEnd = source.indexOf("private checkStructBody", bodyStart);

    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(bodyEnd).toBeGreaterThan(bodyStart);

    const bodySource = source.slice(bodyStart, bodyEnd);
    const genericLengthGuard = bodySource.indexOf(
      "if (decl.genericParams.length > 1)",
    );
    const genericSet = bodySource.indexOf(
      "const genericParamNames = new Set<string>()",
      genericLengthGuard,
    );
    const paramNamesInit = bodySource.indexOf("const paramNames =");
    const paramsLengthGuard = bodySource.indexOf(
      "decl.params.length > 1",
      paramNamesInit,
    );
    const paramSet = bodySource.indexOf("new Set<string>()", paramsLengthGuard);

    expect(genericLengthGuard).toBeGreaterThanOrEqual(0);
    expect(genericSet).toBeGreaterThan(genericLengthGuard);
    expect(paramNamesInit).toBeGreaterThan(genericSet);
    expect(paramsLengthGuard).toBeGreaterThan(paramNamesInit);
    expect(paramSet).toBeGreaterThan(paramsLengthGuard);
    expect(bodySource).toContain("if (paramNames !== undefined)");
  });

  it("keeps direct struct member lookups on cached maps", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const fieldCache = source.indexOf("private structFieldLookupCache");
    const memberCache = source.indexOf("private structMemberLookupCache");
    const directFieldHelper = source.indexOf("private getDirectStructField");
    const directMemberHelper = source.indexOf("private getDirectStructMembers");
    const resolveFieldStart = source.indexOf("public resolveStructField");
    const resolveMemberStart = source.indexOf("public resolveMemberWithContext");
    const resolveFieldSource = source.slice(
      resolveFieldStart,
      resolveMemberStart,
    );
    const resolveMemberEnd = source.indexOf(
      "  public typeToString",
      resolveMemberStart,
    );
    const resolveMemberSource = source.slice(
      resolveMemberStart,
      resolveMemberEnd,
    );
    const directStructBranchSource = resolveMemberSource.slice(
      resolveMemberSource.indexOf('if (decl.kind === "StructDecl")'),
      resolveMemberSource.indexOf('} else if (decl.kind === "EnumDecl")'),
    );

    expect(fieldCache).toBeGreaterThanOrEqual(0);
    expect(memberCache).toBeGreaterThanOrEqual(0);
    expect(directFieldHelper).toBeGreaterThan(fieldCache);
    expect(directMemberHelper).toBeGreaterThan(memberCache);
    expect(resolveFieldSource).toContain(
      "this.getDirectStructField(decl, fieldName)",
    );
    expect(resolveMemberSource).toContain("this.getDirectStructMembers(");
    expect(resolveMemberSource).toContain("decl as AST.StructDecl");
    expect(resolveMemberSource).toContain("memberName");
    expect(resolveFieldSource).not.toContain(
      "for (const member of decl.members)",
    );
    expect(directStructBranchSource).not.toContain(".members.filter(");
  });

  it("skips primitive wrapper classification for known struct members", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/CallChecker.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("export function checkMember");
    const moduleBranch = source.indexOf(
      "// Handle module member access",
      methodStart,
    );
    const methodPrefix = source.slice(methodStart, moduleBranch);
    const knownStructGuard = methodPrefix.indexOf(
      'objectType.resolvedDeclaration?.kind !== "StructDecl"',
    );
    const primitiveSwitch = methodPrefix.indexOf("switch (objectType.name)");

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(moduleBranch).toBeGreaterThan(methodStart);
    expect(knownStructGuard).toBeGreaterThanOrEqual(0);
    expect(primitiveSwitch).toBeGreaterThan(knownStructGuard);
  });

  it("keeps direct struct field resolution off empty generic maps", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("public resolveStructField");
    const methodEnd = source.indexOf("public resolveMemberWithContext", methodStart);
    const methodSource = source.slice(methodStart, methodEnd);

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(methodEnd).toBeGreaterThan(methodStart);
    expect(methodSource).toContain(
      "substitutionMap?: Map<string, AST.TypeNode>",
    );
    expect(methodSource).not.toContain("= new Map()");
    expect(methodSource).toContain("substitutionMap && substitutionMap.size > 0");
    expect(methodSource).toContain(": member.type");
  });

  it("skips operator overload member resolution for methodless structs", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/OverloadResolver.ts"),
      "utf8",
    );
    const methodStart = source.indexOf("findOperatorOverload(");
    const memberLookup = source.indexOf(
      "resolveMemberWithContext(basicType, methodName)",
      methodStart,
    );

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(memberLookup).toBeGreaterThan(methodStart);

    const methodPrefix = source.slice(methodStart, memberLookup);
    expect(methodPrefix).toContain('decl.kind === "StructDecl"');
    expect(methodPrefix).toContain("decl.inheritanceList.length === 0");
    expect(methodPrefix).toContain(
      '!decl.members.some((member) => member.kind === "FunctionDecl")',
    );
    expect(methodPrefix).toContain('decl.kind === "EnumDecl"');
    expect(methodPrefix).toContain("decl.methods.length === 0");
  });

  it("skips operator overload resolution for builtin operand types", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler", "middleend", "ExpressionChecker.ts"),
      "utf8",
    );
    const helperStart = source.indexOf("function canHaveOperatorOverload");
    const directNameHelper = source.indexOf(
      "function isOperatorOverloadFreeBasicTypeName",
    );
    const binaryStart = source.indexOf("export function checkBinary");
    const firstResolverCall = source.indexOf(
      "this.findOperatorOverload(leftType, methodName, [rightType])",
      binaryStart,
    );
    const binaryGuard = source.indexOf(
      "canHaveOperatorOverload(leftType)",
      binaryStart,
    );
    const swappedGuard = source.indexOf(
      "canHaveOperatorOverload(rightType)",
      binaryStart,
    );
    const unaryStart = source.indexOf("export function checkUnary");
    const unaryGuard = source.indexOf(
      "canHaveOperatorOverload(operandType)",
      unaryStart,
    );

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(directNameHelper).toBeGreaterThanOrEqual(0);
    expect(directNameHelper).toBeLessThan(helperStart);
    expect(source).not.toContain("OPERATOR_OVERLOAD_FREE_BASIC_TYPES.has");
    expect(source).not.toContain("new Set([");
    expect(binaryGuard).toBeGreaterThan(binaryStart);
    expect(binaryGuard).toBeLessThan(firstResolverCall);
    expect(swappedGuard).toBeGreaterThan(firstResolverCall);
    expect(unaryGuard).toBeGreaterThan(unaryStart);
  });

  it("skips failed-import cleanup scans when no recovery state exists", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const methodStart = source.indexOf(
      "public clearFailedImportSymbolsForProgram",
    );
    const methodEnd = source.indexOf(
      "  public shouldSuppressUndefinedIdentifier",
      methodStart,
    );
    const methodSource = source.slice(methodStart, methodEnd);
    const emptyStateGuard = methodSource.indexOf(
      "this.failedImportSymbolsByFile.size === 0",
    );
    const statementScan = methodSource.indexOf(
      "for (const stmt of program.statements)",
    );

    expect(methodStart).toBeGreaterThanOrEqual(0);
    expect(emptyStateGuard).toBeGreaterThanOrEqual(0);
    expect(emptyStateGuard).toBeLessThan(statementScan);
  });

  it("should clear failed import recovery state when reusing a checker", () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    const failedImportSource = [
      'import shadow from "std/missing.bpl";',
      "frame main() ret int {",
      "  return shadow();",
      "}",
    ].join("\n");
    const unresolvedSource = [
      "frame main() ret int {",
      "  return shadow();",
      "}",
    ].join("\n");

    checker.checkProgram(
      parseProgram(failedImportSource, "reuse.bpl"),
      "reuse.bpl",
    );
    const failedImportMessages = checker
      .getErrors()
      .map((error) => error.message);
    expect(
      failedImportMessages.some((message) =>
        message.includes("Standard library module not found: std/missing.bpl"),
      ),
    ).toBe(true);
    expect(failedImportMessages).not.toContain("Undefined symbol 'shadow'");

    checker.errors = [];
    checker.checkProgram(
      parseProgram(unresolvedSource, "other.bpl"),
      "other.bpl",
    );
    const otherFileMessages = checker.getErrors().map((error) => error.message);
    expect(otherFileMessages).toContain("Undefined symbol 'shadow'");

    checker.errors = [];
    checker.checkProgram(
      parseProgram(unresolvedSource, "reuse.bpl"),
      "reuse.bpl",
    );
    const sameFileMessages = checker.getErrors().map((error) => error.message);
    expect(sameFileMessages).toContain("Undefined symbol 'shadow'");
  });

  it("should not cascade unknown failed import expression types", () => {
    const cases = [
      {
        name: "return",
        source: [
          'import shadow from "std/missing.bpl";',
          "frame main() ret int {",
          "  return shadow();",
          "}",
        ].join("\n"),
      },
      {
        name: "initializer",
        source: [
          'import shadow from "std/missing.bpl";',
          "frame main() ret int {",
          "  local _value: int = shadow();",
          "  return 0;",
          "}",
        ].join("\n"),
      },
      {
        name: "assignment",
        source: [
          'import shadow from "std/missing.bpl";',
          "frame main() ret int {",
          "  local value: int = 1;",
          "  value = shadow();",
          "  return value;",
          "}",
        ].join("\n"),
      },
    ];

    for (const testCase of cases) {
      const messages = collectErrorMessages(
        testCase.source,
        `${testCase.name}.bpl`,
      );
      expect(
        messages.some((message) =>
          message.includes("Standard library module not found: std/missing.bpl"),
        ),
      ).toBe(true);
      expect(messages).not.toContain("Undefined symbol 'shadow'");
      expect(
        messages.some((message) => message.includes("Return type mismatch")),
      ).toBe(false);
      expect(
        messages.some((message) =>
          message.includes("Type mismatch: cannot assign"),
        ),
      ).toBe(false);
    }

    const mismatchMessages = collectErrorMessages(
      [
        'import shadow from "std/missing.bpl";',
        "frame main() ret int {",
        '  local _value: int = "wrong";',
        "  return shadow();",
        "}",
      ].join("\n"),
      "independent-mismatch.bpl",
    );
    expect(
      mismatchMessages.some((message) =>
        message.includes("Standard library module not found: std/missing.bpl"),
      ),
    ).toBe(true);
    expect(
      mismatchMessages.some((message) =>
        message.includes("Type mismatch: cannot assign"),
      ),
    ).toBe(true);
    expect(mismatchMessages).not.toContain("Undefined symbol 'shadow'");
    expect(
      mismatchMessages.some((message) =>
        message.includes("Return type mismatch"),
      ),
    ).toBe(false);
  });

  it("should pass for valid struct method access", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
        frame sum(this: Point) ret int {
          return this.x + this.y;
        }
      }
      frame main() {
        local p: Point;
        p.sum();
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should fail when accessing static method on instance", () => {
    const source = `
      struct S {
        frame staticFunc() {}
      }
      frame main() {
        local s: S;
        s.staticFunc();
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail when accessing instance method on type", () => {
    const source = `
      struct S {
        frame instanceFunc(this: S) {}
      }
      frame main() {
        S.instanceFunc();
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail if 'this' type mismatch", () => {
    const source = `
      struct A {}
      struct B {
        frame method(this: A) {} 
      }
    `;
    // If `method(this: A)` is defined inside `struct B`, calling `b.method()` passes `B` as `this`.
    // If `B` is not compatible with `A`, it should fail.

    const source2 = `
        struct A {}
        struct B {
            frame method(this: A) {}
        }
        frame main() {
            local b: B;
            b.method();
        }
    `;

    expect(() => check(source2)).toThrow(CompilerError);
  });
});
