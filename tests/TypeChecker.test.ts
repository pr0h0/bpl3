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

  it("inlines simple builtin type guard before direct dispatch", () => {
    const source = readFileSync(
      join(process.cwd(), "compiler/middleend/TypeCheckerBase.ts"),
      "utf8",
    );
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf("\n}", resolver);
    const resolverSource = source.slice(resolver, resolverEnd);
    const guardSwitch = resolverSource.indexOf("switch (name.charCodeAt(0))");
    const dispatchCall = resolverSource.indexOf(
      "resolveSimpleBuiltinTypeName(name)",
    );

    expect(source).not.toContain("function isPotentialSimpleBuiltinTypeName");
    expect(guardSwitch).toBeGreaterThanOrEqual(0);
    expect(dispatchCall).toBeGreaterThanOrEqual(0);
    expect(guardSwitch).toBeLessThan(dispatchCall);
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
    expect(resolverSource).toContain("switch (name.charCodeAt(0))");
    expect(resolverSource).toContain("resolveSimpleBuiltinTypeName(name)");
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
    const resolver = source.indexOf("function resolveSimpleBuiltinBasicType");
    const resolverEnd = source.indexOf("\n/**", resolver);
    const resolverSource = source.slice(resolver, resolverEnd);

    expect(cloneHelper).toBeGreaterThanOrEqual(0);
    expect(cloneHelper).toBeLessThan(resolver);
    expect(resolverSource).toContain(
      "cloneSimpleBuiltinAliasType(type, resolvedName)",
    );
    expect(resolverSource).not.toContain("...type");
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
    expect(source).toContain("OPERATOR_OVERLOAD_FREE_BASIC_TYPES.has");
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
