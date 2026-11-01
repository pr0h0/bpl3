import * as AST from "../common/AST";
import { OPERATOR_METHOD_MAP } from "../middleend/OverloadResolver";
const languageHooks = new Set([
  ...Object.values(OPERATOR_METHOD_MAP),
  "__init__",
  "__destroy__",
  "__get__",
  "__set__",
  "__call__",
]);
import { CompilerError, DiagnosticSeverity } from "../common/CompilerError";
import { lexWithGrammar } from "../frontend/GrammarLexer";
import { TokenType } from "../frontend/TokenType";
import { getPrimitiveType } from "../common/PrimitiveTypes";

export interface LintRule {
  code: string;
  name: string;
  check(node: AST.ASTNode, context: LintContext): void;
}

export interface LintContext {
  /** The linted file's text, when the caller provided it. */
  source?: string;
  report(
    message: string,
    node: AST.ASTNode,
    severity?: DiagnosticSeverity,
    code?: string,
    hint?: string,
  ): void;
}

/** Codes of the built-in lint diagnostics, which `disabledCodes` may name. */
export const LINT_RULE_CODES: readonly string[] = [
  "L001",
  "L002",
  "L003",
  "L004",
  "L005",
  "L006",
  "L007",
  "L008",
];

export class Linter {
  private rules: LintRule[] = [];
  private errors: CompilerError[] = [];

  /**
   * `disabledCodes` lists diagnostic codes (such as `"L003"`) to leave out of
   * the results.
   */
  constructor(
    extraRules: LintRule[] = [],
    private readonly disabledCodes: ReadonlySet<string> = new Set(),
  ) {
    this.registerRules();
    this.rules.push(...extraRules);
  }

  private registerRules() {
    this.rules.push(new NamingConventionRule());
    this.rules.push(new ConstantConditionRule());
    this.rules.push(new SelfAssignmentRule());
    this.rules.push(new SelfComparisonRule());
    this.rules.push(new DuplicateConditionRule());
    this.rules.push(new EmptyBranchRule());
  }

  /**
   * Lints a parsed program. With its `source` text, imports the module
   * never uses (L002) and unused private functions (L003) are also reported.
   */
  public lint(program: AST.Program, source?: string): CompilerError[] {
    this.errors = [];
    const context: LintContext = {
      source,
      report: (
        message,
        node,
        _severity = DiagnosticSeverity.Warning,
        code = "LINT",
        hint = "Fix the reported issue or disable the rule.",
      ) => {
        const error = new CompilerError(message, hint, node.location, code);
        error.setSeverity(_severity);
        this.errors.push(error);
      },
    };

    this.visit(program, context);
    if (source !== undefined) {
      reportUnusedImports(program, source, context);
      reportUnusedPrivateFunctions(program, source, context);
    }
    if (this.disabledCodes.size === 0) return this.errors;
    return this.errors.filter(
      (error) => !this.disabledCodes.has(error.code ?? ""),
    );
  }

  private visit(node: AST.ASTNode, context: LintContext) {
    if (!node) return;

    // Run rules
    for (const rule of this.rules) {
      rule.check(node, context);
    }

    // Traverse children
    switch (node.kind) {
      case "Program":
        for (const stmt of (node as AST.Program).statements) {
          this.visit(stmt, context);
        }
        break;
      case "FunctionDecl":
        const func = node as AST.FunctionDecl;
        for (const attribute of func.attributes) {
          this.visit(attribute, context);
        }
        for (const param of func.params) {
          this.visit(param, context);
        }
        this.visit(func.returnType, context);
        if (func.body) this.visit(func.body, context);
        break;
      case "StructDecl":
        const struct = node as AST.StructDecl;
        for (const inheritedType of struct.inheritanceList) {
          this.visit(inheritedType, context);
        }
        for (const member of struct.members) {
          this.visit(member, context);
        }
        break;
      case "StructField":
        this.visit((node as AST.StructField).type, context);
        break;
      case "SpecDecl":
        const spec = node as AST.SpecDecl;
        for (const extendedType of spec.extends) {
          this.visit(extendedType, context);
        }
        for (const method of spec.methods) {
          this.visit(method, context);
        }
        break;
      case "SpecMethod":
        const specMethod = node as AST.SpecMethod;
        for (const param of specMethod.params) {
          this.visit(param, context);
        }
        if (specMethod.returnType) this.visit(specMethod.returnType, context);
        break;
      case "EnumDecl":
        const enumDecl = node as AST.EnumDecl;
        for (const variant of enumDecl.variants) {
          this.visit(variant, context);
        }
        for (const method of enumDecl.methods) {
          this.visit(method, context);
        }
        break;
      case "EnumVariant":
        const variant = node as AST.EnumVariant;
        if (variant.dataType) this.visit(variant.dataType, context);
        break;
      case "EnumVariantTuple":
        for (const variantType of (node as AST.EnumVariantTuple).types) {
          this.visit(variantType, context);
        }
        break;
      case "EnumVariantStruct":
        for (const field of (node as AST.EnumVariantStruct).fields) {
          this.visit(field.type, context);
        }
        break;
      case "FunctionAttribute":
        break;
      case "TypeAlias":
        this.visit((node as AST.TypeAliasDecl).type, context);
        break;
      case "BasicType":
        for (const genericArg of (node as AST.BasicTypeNode).genericArgs) {
          this.visit(genericArg, context);
        }
        break;
      case "TupleType":
        for (const tupleType of (node as AST.TupleTypeNode).types) {
          this.visit(tupleType, context);
        }
        break;
      case "FunctionType":
        const functionType = node as AST.FunctionTypeNode;
        this.visit(functionType.returnType, context);
        for (const paramType of functionType.paramTypes) {
          this.visit(paramType, context);
        }
        break;
      case "LambdaType":
        const lambdaType = node as AST.LambdaTypeNode;
        this.visit(lambdaType.returnType, context);
        for (const paramType of lambdaType.paramTypes) {
          this.visit(paramType, context);
        }
        break;
      case "MetaType":
        this.visit((node as AST.MetaType).type, context);
        break;
      case "Block":
        for (const stmt of (node as AST.BlockStmt).statements) {
          this.visit(stmt, context);
        }
        break;
      case "If":
        const ifStmt = node as AST.IfStmt;
        this.visit(ifStmt.condition, context);
        this.visit(ifStmt.thenBranch, context);
        if (ifStmt.elseBranch) this.visit(ifStmt.elseBranch, context);
        break;
      case "Loop":
        const loopStmt = node as AST.LoopStmt;
        if (loopStmt.init) this.visit(loopStmt.init, context);
        if (loopStmt.condition) this.visit(loopStmt.condition, context);
        this.visit(loopStmt.body, context);
        if (loopStmt.step) this.visit(loopStmt.step, context);
        break;
      case "Return":
        const retStmt = node as AST.ReturnStmt;
        if (retStmt.value) this.visit(retStmt.value, context);
        break;
      case "Throw":
        this.visit((node as AST.ThrowStmt).expression, context);
        break;
      case "Try":
        const tryStmt = node as AST.TryStmt;
        this.visit(tryStmt.tryBlock, context);
        for (const catchClause of tryStmt.catchClauses) {
          this.visit(catchClause, context);
        }
        break;
      case "CatchClause":
        const catchClause = node as AST.CatchClause;
        if (catchClause.type) this.visit(catchClause.type, context);
        this.visit(catchClause.body, context);
        break;
      case "Switch":
        const switchStmt = node as AST.SwitchStmt;
        this.visit(switchStmt.expression, context);
        for (const switchCase of switchStmt.cases) {
          this.visit(switchCase, context);
        }
        if (switchStmt.defaultCase) this.visit(switchStmt.defaultCase, context);
        break;
      case "Case":
        const switchCase = node as AST.SwitchCase;
        this.visit(switchCase.value, context);
        this.visit(switchCase.body, context);
        break;
      case "Defer":
        this.visit((node as AST.DeferStmt).statement, context);
        break;
      case "ExpressionStmt":
        this.visit((node as AST.ExpressionStmt).expression, context);
        break;
      case "Parameter":
        this.visit((node as AST.Parameter).type, context);
        break;
      case "VariableDecl":
        const varDecl = node as AST.VariableDecl;
        if (varDecl.typeAnnotation) this.visit(varDecl.typeAnnotation, context);
        if (varDecl.initializer) this.visit(varDecl.initializer, context);
        break;
      case "Extern":
        const externDecl = node as AST.ExternDecl;
        for (const param of externDecl.params) {
          this.visit(param.type, context);
        }
        if (externDecl.returnType) this.visit(externDecl.returnType, context);
        break;
      case "InterpolatedString":
        const interpolated = node as AST.InterpolatedStringExpr;
        for (const part of interpolated.parts) {
          this.visit(part, context);
        }
        if (interpolated.desugared) this.visit(interpolated.desugared, context);
        break;
      case "Binary":
        const binExpr = node as AST.BinaryExpr;
        this.visit(binExpr.left, context);
        this.visit(binExpr.right, context);
        break;
      case "Unary":
        this.visit((node as AST.UnaryExpr).operand, context);
        break;
      case "Call":
        const callExpr = node as AST.CallExpr;
        this.visit(callExpr.callee, context);
        for (const arg of callExpr.args) {
          this.visit(arg, context);
        }
        break;
      case "Member":
        this.visit((node as AST.MemberExpr).object, context);
        break;
      case "Index":
        const indexExpr = node as AST.IndexExpr;
        this.visit(indexExpr.object, context);
        this.visit(indexExpr.index, context);
        break;
      case "ArrayLiteral":
        for (const element of (node as AST.ArrayLiteralExpr).elements) {
          this.visit(element, context);
        }
        break;
      case "StructLiteral":
        for (const field of (node as AST.StructLiteralExpr).fields) {
          this.visit(field.value, context);
        }
        break;
      case "TupleLiteral":
        for (const element of (node as AST.TupleLiteralExpr).elements) {
          this.visit(element, context);
        }
        break;
      case "EnumStructVariant":
        for (const field of (node as AST.EnumStructVariantExpr).fields) {
          this.visit(field.value, context);
        }
        break;
      case "Cast":
        this.visit((node as AST.CastExpr).targetType, context);
        this.visit((node as AST.CastExpr).expression, context);
        break;
      case "Sizeof":
        this.visit((node as AST.SizeofExpr).target, context);
        break;
      case "TypeOf":
        this.visit((node as AST.TypeOfExpr).target, context);
        break;
      case "OffsetOf":
        this.visit((node as AST.OffsetOfExpr).targetType, context);
        break;
      case "TypeMatch":
        const typeMatch = node as AST.TypeMatchExpr;
        this.visit(typeMatch.targetType, context);
        this.visit(typeMatch.value, context);
        break;
      case "Match":
        const matchExpr = node as AST.MatchExpr;
        this.visit(matchExpr.value, context);
        for (const arm of matchExpr.arms) {
          this.visit(arm, context);
        }
        break;
      case "MatchArm":
        const matchArm = node as AST.MatchArm;
        this.visit(matchArm.pattern, context);
        if (matchArm.guard) this.visit(matchArm.guard, context);
        this.visit(matchArm.body, context);
        break;
      case "PatternLiteral":
        this.visit((node as AST.PatternLiteral).value, context);
        break;
      case "PatternIdentifier":
        const patternIdentifier = node as AST.PatternIdentifier;
        if (patternIdentifier.type) {
          this.visit(patternIdentifier.type, context);
        }
        if (patternIdentifier.bindingDeclaration) {
          this.visit(patternIdentifier.bindingDeclaration, context);
        }
        break;
      case "PatternTuple":
        for (const pattern of (node as AST.PatternTuple).patterns) {
          this.visit(pattern, context);
        }
        break;
      case "PatternEnum":
        for (const genericArg of (node as AST.PatternEnum).genericArgs ?? []) {
          this.visit(genericArg, context);
        }
        break;
      case "PatternEnumTuple":
        for (const genericArg of (node as AST.PatternEnumTuple).genericArgs ??
          []) {
          this.visit(genericArg, context);
        }
        for (const binding of (node as AST.PatternEnumTuple).bindings) {
          this.visit(binding, context);
        }
        break;
      case "PatternEnumStruct":
        for (const genericArg of (node as AST.PatternEnumStruct).genericArgs ??
          []) {
          this.visit(genericArg, context);
        }
        for (const field of (node as AST.PatternEnumStruct).fields) {
          if (field.bindingDeclaration) {
            this.visit(field.bindingDeclaration, context);
          }
          if (field.pattern) this.visit(field.pattern, context);
        }
        break;
      case "Assignment":
        const assignment = node as AST.AssignmentExpr;
        this.visit(assignment.assignee, context);
        this.visit(assignment.value, context);
        break;
      case "Ternary":
        const ternary = node as AST.TernaryExpr;
        this.visit(ternary.condition, context);
        this.visit(ternary.trueExpr, context);
        this.visit(ternary.falseExpr, context);
        break;
      case "GenericInstantiation":
        const genericInstantiation = node as AST.GenericInstantiationExpr;
        this.visit(genericInstantiation.base, context);
        for (const genericArg of genericInstantiation.genericArgs) {
          this.visit(genericArg, context);
        }
        break;
      case "LambdaExpression":
        const lambda = node as AST.LambdaExpr;
        for (const param of lambda.params) {
          this.visit(param, context);
        }
        if (lambda.returnType) this.visit(lambda.returnType, context);
        this.visit(lambda.body, context);
        break;
      case "LambdaParameter":
        const lambdaParam = node as AST.LambdaParameter;
        if (lambdaParam.type) this.visit(lambdaParam.type, context);
        break;
      case "Is":
        const isExpr = node as AST.IsExpr;
        this.visit(isExpr.expression, context);
        this.visit(isExpr.type, context);
        break;
      case "As":
        const asExpr = node as AST.AsExpr;
        this.visit(asExpr.expression, context);
        this.visit(asExpr.type, context);
        break;
      case "Group":
        this.visit((node as AST.GroupExpr).expression, context);
        break;
      // Add more cases as needed
    }
  }
}

/** A rename hint, or a general one when the converted name is not usable. */
function renameHint(name: string, pascal: boolean): string {
  const suggestion = toCase(name, pascal);
  let tokens: { type: TokenType }[] = [];
  try {
    tokens = lexWithGrammar(suggestion, "lint-suggestion.bpl");
  } catch {
    tokens = [];
  }
  // Keywords (`_frame` → `frame`) and digits (`_123`) are not identifiers.
  const valid =
    tokens.length > 0 &&
    tokens[0]!.type === TokenType.Identifier &&
    tokens.filter((token) => token.type !== TokenType.EOF).length === 1;
  return valid
    ? `Rename it to '${suggestion}'.`
    : `Rename it to ${pascal ? "PascalCase, e.g. 'MyStruct'" : "camelCase, e.g. 'doWork'"}.`;
}

/** `my_struct`/`MY_STRUCT`/`myStruct` → `MyStruct` (pascal) or `myStruct`. */
function toCase(name: string, pascal: boolean): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+|\s+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  const joined = words
    .map((word, index) =>
      index === 0 && !pascal ? word : word[0]!.toUpperCase() + word.slice(1),
    )
    .join("");
  return joined || name;
}

/**
 * L002: an imported name that no identifier outside the import statements
 * refers to. Matching tokens rather than resolved declarations counts every
 * use — calls, type annotations, generic arguments, `Enum.Variant`, namespace
 * members and `export` lists — at the cost of treating a same-named local as
 * a use.
 */
function reportUnusedImports(
  program: AST.Program,
  source: string,
  context: LintContext,
): void {
  const imports = program.statements.filter(
    (statement): statement is AST.ImportStmt =>
      statement.kind === "Import" && !(statement as AST.ImportStmt).isImplicit,
  );
  if (imports.length === 0) return;

  let tokens;
  try {
    tokens = lexWithGrammar(source, program.location?.file ?? "lint.bpl");
  } catch {
    return;
  }
  const insideImport = (line: number, column: number) =>
    imports.some(({ location: l }) => {
      const afterStart =
        line > l.startLine || (line === l.startLine && column >= l.startColumn);
      const beforeEnd =
        line < l.endLine || (line === l.endLine && column < l.endColumn);
      return afterStart && beforeEnd;
    });
  const used = new Set<string>();
  for (const token of tokens) {
    if (insideImport(token.line, token.column)) continue;
    if (token.type === TokenType.Identifier) {
      used.add(token.lexeme);
    } else if (token.type === TokenType.InterpolatedStringLiteral) {
      // An interpolated string is one token: its `${...}` names count, and
      // it builds a `String`, which therefore has to be imported.
      used.add("String");
      for (const [, expression] of token.lexeme.matchAll(/\$\{([^}]*)\}/g)) {
        for (const [name] of expression!.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
          used.add(name);
        }
      }
    }
  }

  for (const statement of imports) {
    let names = statement.items.map((item) => item.alias ?? item.name);
    if (statement.namespace) names = [statement.namespace];
    // `import * from` brings in names the module may not spell out.
    else if (statement.importAll) names = [];
    for (const name of names) {
      if (used.has(name)) continue;
      context.report(
        `Import '${name}' from "${statement.source}" is never used`,
        statement,
        DiagnosticSeverity.Warning,
        "L002",
        `Remove '${name}' from the import.`,
      );
    }
  }
}

/**
 * L003: a top-level frame named `_something` (a private helper, by the naming
 * convention) that is not exported and whose name appears nowhere in the
 * module but its own declaration. Like L002 this matches tokens, so a call
 * inside the function's own body counts as a use.
 */
function reportUnusedPrivateFunctions(
  program: AST.Program,
  source: string,
  context: LintContext,
): void {
  const exported = new Set(
    program.statements
      .filter((statement) => statement.kind === "Export")
      .flatMap((statement) =>
        (statement as AST.ExportStmt).items.map((item) => item.name),
      ),
  );
  const candidates = program.statements.filter(
    (statement): statement is AST.FunctionDecl =>
      statement.kind === "FunctionDecl" &&
      /^_[a-zA-Z]/.test((statement as AST.FunctionDecl).name) &&
      !exported.has((statement as AST.FunctionDecl).name),
  );
  if (candidates.length === 0) return;

  let tokens;
  try {
    tokens = lexWithGrammar(source, program.location?.file ?? "lint.bpl");
  } catch {
    return;
  }
  const occurrences = new Map<string, number>();
  const count = (name: string) =>
    occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
  for (const token of tokens) {
    if (token.type === TokenType.Identifier) {
      count(token.lexeme);
    } else if (token.type === TokenType.InterpolatedStringLiteral) {
      for (const [, expression] of token.lexeme.matchAll(/\$\{([^}]*)\}/g)) {
        for (const [name] of expression!.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
          count(name);
        }
      }
    }
  }

  for (const frame of candidates) {
    // The declaration itself spells the name once.
    if ((occurrences.get(frame.name) ?? 0) > 1) continue;
    context.report(
      `Private function '${frame.name}' is never used`,
      frame,
      DiagnosticSeverity.Warning,
      "L003",
      `Remove '${frame.name}', or export it if other modules need it.`,
    );
  }
}

/** The value of `true`/`false`, also inside parentheses, or undefined. */
function booleanLiteral(
  expression: AST.Expression | undefined,
): boolean | undefined {
  let current = expression;
  while (current?.kind === "Group") {
    current = (current as AST.GroupExpr).expression;
  }
  if (current?.kind !== "Literal") return undefined;
  const literal = current as AST.LiteralExpr;
  return literal.type === "bool" ? literal.value === true : undefined;
}

/**
 * L004: an `if` or ternary whose condition is `true` or `false`, so one branch
 * never runs, and a `loop (false)`, whose body never runs. Usually leftover
 * debugging. `loop (true)` is an ordinary infinite loop and is not reported.
 */
class ConstantConditionRule implements LintRule {
  code = "L004";
  name = "constant-condition";

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind === "If" || node.kind === "Ternary") {
      const value = booleanLiteral(
        (node as AST.IfStmt | AST.TernaryExpr).condition,
      );
      if (value === undefined) return;
      const construct = node.kind === "If" ? "if" : "ternary";
      context.report(
        `This ${construct} condition is always ${value}`,
        node,
        DiagnosticSeverity.Warning,
        this.code,
        value
          ? "Keep the code of the true branch and remove the condition."
          : "Remove the branch that never runs.",
      );
    } else if (node.kind === "Loop") {
      if (booleanLiteral((node as AST.LoopStmt).condition) !== false) return;
      context.report(
        "This loop condition is always false, so the body never runs",
        node,
        DiagnosticSeverity.Warning,
        this.code,
        "Remove the loop, or fix its condition.",
      );
    }
  }
}

/**
 * A name, or a chain of member and constant-index accesses on one (`a.b[0]`),
 * as text; undefined for anything else, so calls and computed indexes, which
 * may differ between evaluations, never compare equal.
 */
function storagePath(expression: AST.Expression): string | undefined {
  if (expression.kind === "Identifier") {
    return (expression as AST.IdentifierExpr).name;
  }
  if (expression.kind === "Group") {
    return storagePath((expression as AST.GroupExpr).expression);
  }
  if (expression.kind === "Member") {
    const member = expression as AST.MemberExpr;
    const object = storagePath(member.object);
    return object === undefined ? undefined : `${object}.${member.property}`;
  }
  if (expression.kind === "Index") {
    const index = expression as AST.IndexExpr;
    const object = storagePath(index.object);
    if (object === undefined || index.index.kind !== "Literal")
      return undefined;
    return `${object}[${(index.index as AST.LiteralExpr).raw}]`;
  }
  return undefined;
}

/** L005: `x = x` and `this.n = this.n`, which store a value where it already is. */
class SelfAssignmentRule implements LintRule {
  code = "L005";
  name = "self-assignment";

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind !== "Assignment") return;
    const assignment = node as AST.AssignmentExpr;
    if (assignment.operator.lexeme !== "=") return;
    const target = storagePath(assignment.assignee);
    if (target === undefined || target !== storagePath(assignment.value)) {
      return;
    }
    context.report(
      `'${target}' is assigned to itself`,
      node,
      DiagnosticSeverity.Warning,
      this.code,
      "Remove the assignment, or assign the value that was meant.",
    );
  }
}

type ComparedKind = "float" | "exact" | "unknown";

const ALWAYS_FALSE_COMPARISONS = new Set(["<", ">"]);
const SELF_COMPARISONS = new Set(["==", "!=", "<", "<=", ">", ">="]);

/**
 * How a declared type compares with itself: `float` for floating point (NaN
 * is unequal to itself), `exact` for integers, `bool`, `string` and pointers,
 * and `unknown` for anything else, such as a struct that may overload the
 * operator.
 */
function comparedKind(type: AST.TypeNode | null | undefined): ComparedKind {
  if (!type || type.kind !== "BasicType") return "unknown";
  const basic = type as AST.BasicTypeNode;
  if (basic.arrayDimensions.length > 0) return "unknown";
  if (basic.pointerDepth > 0 || basic.name === "string") return "exact";
  const primitive = getPrimitiveType(basic.name);
  if (!primitive) return "unknown";
  return primitive.kind === "float" ? "float" : "exact";
}

/**
 * L006: a variable compared with itself, such as `n == n` or `i < i`, whose
 * result is fixed. Only names whose declared type is a primitive, `string` or
 * a pointer are checked. For floating-point values `==`, `!=`, `<=` and `>=`
 * are skipped, since `x != x` is how NaN is detected; `<` and `>` are always
 * false.
 */
class SelfComparisonRule implements LintRule {
  code = "L006";
  name = "self-comparison";
  private kinds = new Map<string, ComparedKind>();

  check(node: AST.ASTNode, context: LintContext) {
    switch (node.kind) {
      case "FunctionDecl":
        // Declarations are visited before the expressions that use them.
        this.kinds = new Map();
        return;
      case "Parameter": {
        const param = node as AST.Parameter;
        this.declare(param.name, param.type);
        return;
      }
      case "LambdaExpression":
        // Lambda parameters are not visited as nodes of their own.
        for (const param of (node as AST.LambdaExpr).params) {
          this.declare(param.name, param.type);
        }
        return;
      case "VariableDecl": {
        const decl = node as AST.VariableDecl;
        if (typeof decl.name === "string") {
          this.declare(decl.name, decl.typeAnnotation);
        } else {
          for (const target of decl.name) this.declare(target.name, undefined);
        }
        return;
      }
      case "Binary":
        break;
      default:
        return;
    }

    const binary = node as AST.BinaryExpr;
    const operator = binary.operator.lexeme;
    if (!SELF_COMPARISONS.has(operator)) return;
    const left = unwrapGroups(binary.left);
    const right = unwrapGroups(binary.right);
    if (left.kind !== "Identifier" || right.kind !== "Identifier") return;
    const name = (left as AST.IdentifierExpr).name;
    if (name !== (right as AST.IdentifierExpr).name) return;

    const kind = this.kinds.get(name) ?? "unknown";
    if (kind === "unknown") return;
    if (kind === "float" && !ALWAYS_FALSE_COMPARISONS.has(operator)) return;

    const result = ["==", "<=", ">="].includes(operator) ? "true" : "false";
    context.report(
      `'${name} ${operator} ${name}' compares '${name}' with itself and is always ${result}`,
      node,
      DiagnosticSeverity.Warning,
      this.code,
      "Compare with the value that was meant.",
    );
  }

  /** A name declared twice with different kinds is treated as unknown. */
  private declare(name: string, type: AST.TypeNode | null | undefined) {
    const kind = comparedKind(type);
    const previous = this.kinds.get(name);
    this.kinds.set(
      name,
      previous === undefined || previous === kind ? kind : "unknown",
    );
  }
}

function unwrapGroups(expression: AST.Expression): AST.Expression {
  let current = expression;
  while (current.kind === "Group") {
    current = (current as AST.GroupExpr).expression;
  }
  return current;
}

/**
 * L007: an `else if` whose condition repeats an earlier condition of the same
 * chain, so its branch can never run. Only conditions without calls, casts or
 * increments are compared, so evaluating one cannot change another.
 */
class DuplicateConditionRule implements LintRule {
  code = "L007";
  name = "duplicate-condition";
  // An `else if` is also visited on its own; it was checked with its chain.
  private checked = new WeakSet<AST.IfStmt>();

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind !== "If") return;
    let current: AST.IfStmt | undefined = node as AST.IfStmt;
    if (this.checked.has(current)) return;
    const seen = new Set<string>();
    while (current) {
      this.checked.add(current);
      const key = conditionKey(current.condition);
      if (key !== undefined) {
        if (seen.has(key)) {
          context.report(
            "This condition repeats an earlier condition of the same if/else chain, so its branch never runs",
            current.condition,
            DiagnosticSeverity.Warning,
            this.code,
            "Change the condition, or merge the branches.",
          );
        }
        seen.add(key);
      }
      const next: AST.Statement | undefined = current.elseBranch;
      current = next?.kind === "If" ? (next as AST.IfStmt) : undefined;
    }
  }
}

/**
 * A text key for a condition built only from names, literals, member and
 * constant-index accesses, and unary or binary operators; undefined for
 * anything else, such as a call, whose value may change between evaluations.
 */
function conditionKey(expression: AST.Expression): string | undefined {
  switch (expression.kind) {
    case "Group":
      return conditionKey((expression as AST.GroupExpr).expression);
    case "Literal": {
      const literal = expression as AST.LiteralExpr;
      return `${literal.type}:${literal.raw}`;
    }
    case "Identifier":
    case "Member":
    case "Index":
      return storagePath(expression);
    case "Unary": {
      const unary = expression as AST.UnaryExpr;
      if (!unary.isPrefix || !["!", "-", "~"].includes(unary.operator.lexeme)) {
        return undefined;
      }
      const operand = conditionKey(unary.operand);
      return operand === undefined
        ? undefined
        : `(${unary.operator.lexeme}${operand})`;
    }
    case "Binary": {
      const binary = expression as AST.BinaryExpr;
      const left = conditionKey(binary.left);
      const right = conditionKey(binary.right);
      return left === undefined || right === undefined
        ? undefined
        : `(${left} ${binary.operator.lexeme} ${right})`;
    }
    default:
      return undefined;
  }
}

/**
 * L008: an `if` or `else` whose block is empty, so the branch does nothing.
 * A block holding only a comment is deliberate and is not reported; without
 * the source text comments cannot be seen, so nothing is reported.
 */
class EmptyBranchRule implements LintRule {
  code = "L008";
  name = "empty-branch";

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind !== "If" || context.source === undefined) return;
    const statement = node as AST.IfStmt;
    if (isEmptyBlock(statement.thenBranch, context.source)) {
      context.report(
        "This if has an empty body",
        statement.thenBranch,
        DiagnosticSeverity.Warning,
        this.code,
        statement.elseBranch
          ? "Invert the condition and keep only the else branch, or add a comment saying why nothing is done."
          : "Remove the if, or add a comment saying why nothing is done.",
      );
    }
    if (
      statement.elseBranch &&
      isEmptyBlock(statement.elseBranch, context.source)
    ) {
      context.report(
        "This else has an empty body",
        statement.elseBranch,
        DiagnosticSeverity.Warning,
        this.code,
        "Remove the else, or add a comment saying why nothing is done.",
      );
    }
  }
}

/** A written `{ }` block with no statements and no comment inside. */
function isEmptyBlock(statement: AST.Statement, source: string): boolean {
  if (statement.kind !== "Block") return false;
  const block = statement as AST.BlockStmt;
  if (block.synthesized || block.statements.length > 0) return false;
  const text = sourceText(source, block.location);
  return text !== undefined && !text.includes("#");
}

/** The text a location covers, or undefined if it lies outside `source`. */
function sourceText(
  source: string,
  location: AST.ASTNode["location"],
): string | undefined {
  if (!location) return undefined;
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\r" && source[i + 1] === "\n") continue;
    if (c === "\n" || c === "\r") lineStarts.push(i + 1);
  }
  const start = lineStarts[location.startLine - 1];
  const end = lineStarts[location.endLine - 1];
  if (start === undefined || end === undefined) return undefined;
  return source.slice(
    start + location.startColumn - 1,
    end + location.endColumn - 1,
  );
}

class NamingConventionRule implements LintRule {
  code = "L001";
  name = "naming-convention";

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind === "StructDecl") {
      const decl = node as AST.StructDecl;
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(decl.name)) {
        context.report(
          `Struct '${decl.name}' should be PascalCase`,
          node,
          DiagnosticSeverity.Warning,
          this.code,
          renameHint(decl.name, true),
        );
      }
    } else if (node.kind === "FunctionDecl") {
      const decl = node as AST.FunctionDecl;
      // Skip main
      if (decl.name === "main" || languageHooks.has(decl.name)) return;

      // A leading underscore marks a private helper: `_siftDown`.
      if (!/^_?[a-z][a-zA-Z0-9]*$/.test(decl.name)) {
        context.report(
          `Function '${decl.name}' should be camelCase.`,
          node,
          DiagnosticSeverity.Warning,
          this.code,
          renameHint(decl.name, false),
        );
      }
    }
  }
}
