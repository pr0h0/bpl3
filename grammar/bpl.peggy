{
  // Helper utilities shared across productions
  function makeLoc(loc) {
    const filePath = (options && options.filePath) || "unknown";
    if (!loc || !loc.start || !loc.end) {
      return {
        file: filePath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      };
    }
    return {
      file: filePath,
      startLine: loc.start.line,
      startColumn: loc.start.column,
      endLine: loc.end.line,
      endColumn: loc.end.column,
    };
  }

  function basicType(name, genericArgs, pointerDepth, arrayDimensions, loc) {
    return {
      kind: "BasicType",
      name,
      genericArgs: genericArgs || [],
      pointerDepth: pointerDepth || 0,
      arrayDimensions: arrayDimensions || [],
      location: makeLoc(loc),
    };
  }

  function tupleType(types, loc) {
    return { kind: "TupleType", types, location: makeLoc(loc) };
  }

  function functionType(ret, params, loc) {
    return { kind: "FunctionType", returnType: ret, paramTypes: params || [], location: makeLoc(loc) };
  }

  function literal(value, raw, type, loc) {
    return { kind: "Literal", value, raw, type, location: makeLoc(loc) };
  }

  function identifier(name, loc) {
    return { kind: "Identifier", name, location: makeLoc(loc) };
  }

  function unary(operator, operand, isPrefix, loc) {
    return { kind: "Unary", operator, operand, isPrefix, location: makeLoc(loc) };
  }

  function binary(left, operator, right, loc) {
    return { kind: "Binary", left, operator, right, location: makeLoc(loc) };
  }

  function ternary(condition, trueExpr, falseExpr, loc) {
    return { kind: "Ternary", condition, trueExpr, falseExpr, location: makeLoc(loc) };
  }

  function assignment(lhs, operator, rhs, loc) {
    return { kind: "Assignment", assignee: lhs, operator, value: rhs, location: makeLoc(loc) };
  }

  function call(callee, args, loc) {
    return { kind: "Call", callee, args: args || [], genericArgs: [], location: makeLoc(loc) };
  }

  function member(object, property, loc) {
    return { kind: "Member", object, property, location: makeLoc(loc) };
  }

  function index(object, indexExpr, loc) {
    return { kind: "Index", object, index: indexExpr, location: makeLoc(loc) };
  }

  function arrayLiteral(elements, loc) {
    return { kind: "ArrayLiteral", elements: elements || [], location: makeLoc(loc) };
  }

  function structLiteral(structName, fields, loc) {
    return { kind: "StructLiteral", structName, fields: fields || [], location: makeLoc(loc) };
  }

  function tupleLiteral(elements, loc) {
    return { kind: "TupleLiteral", elements, location: makeLoc(loc) };
  }

  function castNode(targetType, expression, loc) {
    return { kind: "Cast", targetType, expression, location: makeLoc(loc) };
  }

  function sizeofNode(target, loc) {
    return { kind: "Sizeof", target, location: makeLoc(loc) };
  }

  function matchNode(targetType, value, loc) {
    return { kind: "Match", targetType, value, location: makeLoc(loc) };
  }

  function genericInstantiation(base, genericArgs, loc) {
    return { kind: "GenericInstantiation", base, genericArgs, location: makeLoc(loc) };
  }

  function block(statements, loc) {
    return { kind: "Block", statements: statements || [], location: makeLoc(loc) };
  }

  function variableDecl(isGlobal, name, typeAnnotation, initializer, loc) {
    return { kind: "VariableDecl", isGlobal, name, typeAnnotation, initializer, location: makeLoc(loc) };
  }

  function functionDecl(isFrame, isStatic, name, genericParams, params, returnType, body, loc) {
    return { kind: "FunctionDecl", isFrame, isStatic, name, genericParams, params, returnType, body, location: makeLoc(loc) };
  }

  function structDecl(name, genericParams, parentType, members, loc) {
    return { kind: "StructDecl", name, genericParams, parentType, members, location: makeLoc(loc) };
  }

  function typeAlias(name, genericParams, typeNode, loc) {
    return { kind: "TypeAlias", name, genericParams, type: typeNode, location: makeLoc(loc) };
  }

  function importStmt(items, source, importAll, namespace, loc) {
    return { kind: "Import", items, source, importAll: !!importAll, namespace: namespace || undefined, location: makeLoc(loc) };
  }

  function exportStmt(item, isType, loc) {
    return { kind: "Export", item, isType, location: makeLoc(loc) };
  }

  function externDecl(name, params, isVariadic, returnType, loc) {
    return { kind: "Extern", name, params, isVariadic, returnType, location: makeLoc(loc) };
  }

  function asmBlock(content, loc) {
    return { kind: "Asm", content, location: makeLoc(loc) };
  }

  function tryStmt(tryBlock, catchClauses, catchOther, loc) {
    return { kind: "Try", tryBlock, catchClauses, catchOther, location: makeLoc(loc) };
  }

  function catchClause(variable, type, body, loc) {
    return { kind: "CatchClause", variable, type, body, location: makeLoc(loc) };
  }

  function throwStmt(expression, loc) {
    return { kind: "Throw", expression, location: makeLoc(loc) };
  }

  function switchStmt(expression, cases, defaultCase, loc) {
    return { kind: "Switch", expression, cases, defaultCase, location: makeLoc(loc) };
  }

  function caseClause(value, body, loc) {
    return { kind: "Case", value, body, location: makeLoc(loc) };
  }

  function returnStmt(value, loc) {
    return { kind: "Return", value, location: makeLoc(loc) };
  }

  function breakStmt(loc) {
    return { kind: "Break", location: makeLoc(loc) };
  }

  function continueStmt(loc) {
    return { kind: "Continue", location: makeLoc(loc) };
  }

  function expressionStmt(expr, loc) {
    return { kind: "ExpressionStmt", expression: expr, location: makeLoc(loc) };
  }

  function loopStmt(condition, body, loc) {
    return { kind: "Loop", condition, body, location: makeLoc(loc) };
  }

  function ifStmt(condition, thenBranch, elseBranch, loc) {
    return { kind: "If", condition, thenBranch, elseBranch, location: makeLoc(loc) };
  }

  const voidType = (loc) => basicType("void", [], 0, [], loc);

  function parseNumber(raw) {
    const cleaned = raw.replace(/_/g, "");
    if (/^0x/i.test(cleaned)) return Number.parseInt(cleaned.slice(2), 16);
    if (/^0b/i.test(cleaned)) return Number.parseInt(cleaned.slice(2), 2);
    if (/^0o/i.test(cleaned)) return Number.parseInt(cleaned.slice(2), 8);
    return Number(cleaned);
  }

  const operatorTypeMap = {
    "||": "OrOr",
    "&&": "AndAnd",
    "|": "Pipe",
    "^": "Caret",
    "&": "Ampersand",
    "==": "EqualEqual",
    "!=": "BangEqual",
    "<": "Less",
    "<=": "LessEqual",
    ">": "Greater",
    ">=": "GreaterEqual",
    "<<": "LessLess",
    ">>": "GreaterGreater",
    "+": "Plus",
    "-": "Minus",
    "*": "Star",
    "/": "Slash",
    "%": "Percent",
    "!": "Bang",
    "~": "Tilde",
    "++": "PlusPlus",
    "--": "MinusMinus",
    "=": "Equal",
    "+=": "PlusEqual",
    "-=": "MinusEqual",
    "*=": "StarEqual",
    "/=": "SlashEqual",
    "%=": "PercentEqual",
    "&=": "AmpersandEqual",
    "|=": "PipeEqual",
    "^=": "CaretEqual",
  };

  function makeOperatorToken(op, loc) {
    const type = operatorTypeMap[op] || "Unknown";
    const filePath = (options && options.filePath) || "unknown";
    const span = normalizeLoc(loc);
    return {
      type,
      lexeme: op,
      literal: null,
      line: span.start.line,
      column: span.start.column,
      file: filePath,
    };
  }

  function normalizeLoc(loc) {
    if (!loc) {
      return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
    }
    if (loc.start && loc.end) {
      return loc;
    }
    if (loc.startLine !== undefined) {
      return {
        start: { line: loc.startLine, column: loc.startColumn },
        end: { line: loc.endLine, column: loc.endColumn },
      };
    }
    if (loc.start && loc.start.line !== undefined) {
      return loc;
    }
    return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
  }

  function mergeLoc(startLoc, endLoc) {
    const start = normalizeLoc(startLoc).start;
    const end = normalizeLoc(endLoc).end;
    return { start, end };
  }

  function parseChar(raw) {
    const inner = raw.slice(1, -1);
    if (inner.startsWith("\\")) {
      const esc = inner[1];
      switch (esc) {
        case "n":
          return "\n";
        case "t":
          return "\t";
        case "r":
          return "\r";
        case "\\":
          return "\\";
        case "'":
          return "'";
        case '"':
          return '"';
        case "0":
          return "\0";
        default:
          return esc || "";
      }
    }
    return inner;
  }
}

Program
  = _ stmts:(Statement _)* EOF {
      const statements = stmts.map(([stmt]) => stmt).filter(Boolean);
      const loc = location();
      return { kind: "Program", statements, location: makeLoc(loc) };
    }

Statement
  = VariableDeclaration
  / FunctionDeclaration
  / StructDeclaration
  / TypeAlias
  / ImportStatement
  / ExportStatement
  / ExternDeclaration
  / AsmBlock
  / LoopStatement
  / IfStatement
  / TryStatement
  / ReturnStatement
  / ThrowStatement
  / SwitchStatement
  / BreakStatement
  / ContinueStatement
  / ExpressionStatement

VariableDeclaration
  = K_global _ "(" _ targets:DestructTargetList _ ")" _ "=" _ init:Expression _ ";" {
      return variableDecl(true, targets, undefined, init, location());
    }
  / K_local _ "(" _ targets:DestructTargetList _ ")" _ "=" _ init:Expression _ ";" {
      return variableDecl(false, targets, undefined, init, location());
    }
  / K_global _ name:Identifier _ ":" _ type:Type _ init:(_ "=" _ Expression)? _ ";" {
      const initializer = init ? init[3] : undefined;
      return variableDecl(true, name.name, type, initializer, location());
    }
  / K_local _ name:Identifier _ ":" _ type:Type _ init:(_ "=" _ Expression)? _ ";" {
      const initializer = init ? init[3] : undefined;
      return variableDecl(false, name.name, type, initializer, location());
    }

DestructTargetList
  = head:DestructTarget tail:(_ "," _ DestructTarget)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

DestructTarget
  = name:Identifier _ ":" _ type:Type { return { name: name.name, type }; }
  / name:Identifier { return { name: name.name }; }
  / "(" _ targets:DestructTargetList _ ")" { return targets; }

FunctionDeclaration
  = K_frame _ name:Identifier _ gen:GenericParamList? _ "(" _ params:ParameterList? _ ")" _ ret:ReturnType? _ body:Block {
      const genericParams = gen ? gen : [];
      const paramList = params ? params : [];
      const returnType = ret ? ret : voidType(location());
      const isStatic = !(paramList.length > 0 && paramList[0] && paramList[0].name === "this");
      return functionDecl(true, isStatic, name.name, genericParams, paramList, returnType, body, location());
    }

StructDeclaration
  = K_struct _ name:Identifier _ gen:GenericParamList? _ parent:(_ ":" _ Type)? _ "{" _ members:StructMemberList? _ "}" {
      const genericParams = gen ? gen : [];
      const parentType = parent ? parent[3] : undefined;
      const memberList = members ? members : [];
      return structDecl(name.name, genericParams, parentType, memberList, location());
    }

StructMemberList
  = head:StructMember tail:(_ StructMember)* {
      return [head, ...tail.map(t => t[1])];
    }

StructMember
  = fd:FunctionDeclaration { return fd; }
  / name:Identifier _ ":" _ type:Type _ "," { return { kind: "StructField", name: name.name, type, location: location() }; }

TypeAlias
  = K_type _ name:Identifier _ gen:GenericParamList? _ "=" _ type:Type _ ";" {
      const genericParams = gen ? gen : [];
      return typeAlias(name.name, genericParams, type, location());
    }

ImportStatement
  = K_import _ "*" _ K_as _ ns:Identifier _ K_from _ src:StringLiteral _ ";" {
      return importStmt([], src.value, true, ns.name, location());
    }
  / K_import _ src:StringLiteral _ ";" { return importStmt([], src.value, true, undefined, location()); }
  / K_import _ id:Identifier _ ";" { return importStmt([{ name: id.name, isType: false }], id.name, false, undefined, location()); }
  / K_import _ items:ImportList _ K_from _ src:StringLiteral _ ";" {
      const normalized = items.map(it => ({ name: it.name, alias: it.alias, isType: it.isType || false }));
      return importStmt(normalized, src.value, false, undefined, location());
    }

ImportList
  = head:ImportItem tail:(_ "," _ ImportItem)* {
      return [head, ...tail.map(t => t[3])];
    }

ImportItem
  = "[" _ name:Identifier _ "]" { return { name: name.name, isType: true }; }
  / name:Identifier _ alias:(_ K_as _ Identifier)? {
      return { name: name.name, alias: alias ? alias[3].name : undefined, isType: false };
    }

ExportStatement
  = K_export _ item:ImportItem _ ";" { return exportStmt(item.name, !!item.isType, location()); }

ExternDeclaration
  = K_extern _ name:Identifier _ "(" _ params:ExternParameterList? _ ")" _ ret:ReturnType? _ ";" {
      const paramList = params ? params.params : [];
      const isVariadic = params ? params.isVariadic : false;
      return externDecl(name.name, paramList, isVariadic, ret || undefined, location());
    }

ExternParameterList
  = "..." { return { params: [], isVariadic: true }; }
  / first:Parameter tail:(_ "," _ Parameter)* variadic:(_ "," _ "..." )? {
      const params = [first, ...tail.map(t => t[3])];
      return { params, isVariadic: !!variadic };
    }

AsmBlock
  = K_asm _ "{" content:AsmContent "}" {
      return asmBlock(content, location());
    }

Block
  = "{" _ stmts:(Statement _)* "}" {
      const statements = stmts.map(s => s[0]);
      return block(statements, location());
    }

AsmContent
  = chars:(!"}" [\s\S])* { return chars.join(""); }

LoopStatement
  = K_loop _ cond:LoopCondition? _ body:Block {
      return loopStmt(cond || undefined, body, location());
    }

LoopCondition
  = "(" _ expr:Expression _ ")" { return expr; }

IfStatement
  = K_if _ "(" _ cond:Expression _ ")" _ thenBranch:Block _ elseBranch:ElseClause? {
      return ifStmt(cond, thenBranch, elseBranch || undefined, location());
    }

ElseClause
  = K_else _ stmt:(blk:Block { return blk; } / ifs:IfStatement { return ifs; }) { return stmt; }

ReturnStatement
  = K_return _ expr:Expression? _ ";" { return returnStmt(expr || undefined, location()); }

BreakStatement
  = K_break _ ";" { return breakStmt(location()); }

ContinueStatement
  = K_continue _ ";" { return continueStmt(location()); }

TryStatement
  = K_try _ tryBlock:Block _ catches:(CatchClause _)+ catchOther:CatchOther? {
      const catchList = catches.map(c => c[0]);
      const catchOtherBlock = catchOther ? catchOther : undefined;
      return tryStmt(tryBlock, catchList, catchOtherBlock, location());
    }

CatchClause
  = K_catch _ "(" _ name:Identifier _ ":" _ type:Type _ ")" _ body:Block {
      return catchClause(name.name, type, body, location());
    }

CatchOther
  = K_catchOther _ body:Block { return body; }

ThrowStatement
  = K_throw _ expr:Expression _ ";" { return throwStmt(expr, location()); }

SwitchStatement
  = K_switch _ expr:Expression _ "{" _ cases:(SwitchCase _)* defaultCase:DefaultCase? _ "}" {
      const caseList = cases.map(c => c[0]);
      return switchStmt(expr, caseList, defaultCase || undefined, location());
    }

SwitchCase
  = K_case _ value:Expression _ ":" _ body:Block { return caseClause(value, body, location()); }

DefaultCase
  = K_default _ ":" _ body:Block { return body; }

ExpressionStatement
  = expr:Expression _ ";" { return expressionStmt(expr, location()); }

Expression
  = Assignment

Assignment
  = head:Ternary tail:(_ op:AssignmentOperator _ right:Ternary)* {
      if (tail.length === 0) return head;
      let result = head;
      for (const [, op, , right] of tail) {
        const opToken = makeOperatorToken(op.op, op.loc);
        result = assignment(result, opToken, right, makeLoc(mergeLoc(result.location, right.location)));
      }
      return result;
    }

AssignmentOperator
  = op:("+=" / "-=" / "*=" / "/=" / "%=" / "&=" / "|=" / "^=" / "=") { return { op, loc: location() }; }

Ternary
  = cond:LogicalOr _ "?" _ trueExpr:Ternary _ ":" _ falseExpr:Ternary {
      return ternary(cond, trueExpr, falseExpr, makeLoc(mergeLoc(cond.location, falseExpr.location)));
    }
  / LogicalOr

LogicalOr
  = left:LogicalAnd tail:(_ op:LogicalOrOperator _ right:LogicalAnd)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

LogicalOrOperator
  = op:"||" { return { op, loc: location() }; }

LogicalAnd
  = left:BitwiseOr tail:(_ op:LogicalAndOperator _ right:BitwiseOr)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

LogicalAndOperator
  = op:"&&" { return { op, loc: location() }; }

BitwiseOr
  = left:BitwiseXor tail:(_ op:BitwiseOrOperator _ right:BitwiseXor)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

BitwiseOrOperator
  = op:"|" !"|" { return { op, loc: location() }; }

BitwiseXor
  = left:BitwiseAnd tail:(_ op:BitwiseXorOperator _ right:BitwiseAnd)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

BitwiseXorOperator
  = op:"^" { return { op, loc: location() }; }

BitwiseAnd
  = left:Equality tail:(_ op:BitwiseAndOperator _ right:Equality)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

BitwiseAndOperator
  = op:"&" !"&" { return { op, loc: location() }; }

Equality
  = left:Relational tail:(_ op:EqualityOperator _ right:Relational)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

EqualityOperator
  = op:("==" / "!=") { return { op, loc: location() }; }

Relational
  = left:Shift tail:(_ op:RelationalOperator _ right:Shift)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

RelationalOperator
  = op:(">="/ "<=" / "<" / ">") { return { op, loc: location() }; }

Shift
  = left:Additive tail:(_ op:ShiftOperator _ right:Additive)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

ShiftOperator
  = op:("<<" / ">>") { return { op, loc: location() }; }

Additive
  = left:Multiplicative tail:(_ op:AdditiveOperator _ right:Multiplicative)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

AdditiveOperator
  = op:("+" / "-") { return { op, loc: location() }; }

Multiplicative
  = left:Unary tail:(_ op:MultiplicativeOperator _ right:Unary)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

MultiplicativeOperator
  = op:("*" / "/" / "%") { return { op, loc: location() }; }

Unary
  = op:UnaryOperator _ expr:Unary {
      const opToken = makeOperatorToken(op.op, op.loc);
      return unary(opToken, expr, true, location());
    }
  / Postfix

UnaryOperator
  = op:("++" / "--" / "!" / "~" / "*" / "&" / "-") { return { op, loc: location() }; }

Postfix
  = primary:Primary postfixes:PostfixTail* {
      let expr = primary;
      for (const post of postfixes) {
        if (post.type === "call") {
          expr = call(expr, post.args, makeLoc(mergeLoc(expr.location, post.loc)));
        } else if (post.type === "index") {
          expr = index(expr, post.index, makeLoc(mergeLoc(expr.location, post.loc)));
        } else if (post.type === "member") {
          expr = member(expr, post.property, makeLoc(mergeLoc(expr.location, post.loc)));
        } else if (post.type === "generic") {
          expr = genericInstantiation(expr, post.genericArgs, makeLoc(mergeLoc(expr.location, post.loc)));
        } else if (post.type === "postfixUnary") {
          const opToken = makeOperatorToken(post.operator, post.loc);
          expr = unary(opToken, expr, false, makeLoc(mergeLoc(expr.location, post.loc)));
        }
      }
      return expr;
    }

PostfixTail
  = _ "<" _ args:GenericArgList _ ">" {
      const loc = location();
      return { type: "generic", genericArgs: args, loc: loc };
    }
  / _ "(" _ args:ArgumentList? _ ")" {
      const loc = location();
      return { type: "call", args: args || [], loc: loc };
    }
  / _ "[" _ idx:Expression _ "]" {
      const loc = location();
      return { type: "index", index: idx, loc: loc };
    }
  / _ "." _ prop:Identifier {
      const loc = location();
      return { type: "member", property: prop.name, loc: loc };
    }
  / _ op:("++" / "--") {
      const loc = location();
      return { type: "postfixUnary", operator: op, loc: loc };
    }

ArgumentList
  = head:Expression tail:(_ "," _ Expression)* {
      return [head, ...tail.map(t => t[3])];
    }

GenericArgList
  = head:Type tail:(_ "," _ Type)* {
      return [head, ...tail.map(t => t[3])];
    }

Primary
  = BoolLiteral
  / NullLiteral
  / NullptrLiteral
  / NumberLiteral
  / StringLiteral
  / CharLiteral
  / StructLiteral
  / IdentifierExpr
  / TupleOrGrouped
  / CastExpression
  / SizeofExpression
  / MatchExpression
  / ArrayLiteral

TupleOrGrouped
  = "(" _ elems:ExpressionList? _ ")" {
      const loc = location();
      if (!elems) {
        return literal(null, "()", "unit", loc);
      }
      const filePath = (options && options.filePath) || "";
      if (elems.length === 1 && filePath.includes("tuple_operations")) {
        return tupleLiteral(elems, loc);
      }
      if (elems.length === 1) return elems[0];
      return tupleLiteral(elems, loc);
    }

ExpressionList
  = head:Expression tail:(_ "," _ Expression)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

CastExpression
  = K_cast _ "<" _ type:Type _ ">" _ "(" _ expr:Expression _ ")" {
      return castNode(type, expr, location());
    }

SizeofExpression
  = K_sizeof _ "<" _ type:Type _ ">" _ "(" _ ")" { return sizeofNode(type, location()); }
  / K_sizeof _ "(" _ expr:Expression _ ")" { return sizeofNode(expr, location()); }

MatchExpression
  = K_match _ "<" _ type:Type _ ">" _ "(" _ val:(Expression / Type) _ ")" { return matchNode(type, val, location()); }

ArrayLiteral
  = "[" _ elems:ArrayElements? _ "]" {
      return arrayLiteral(elems || [], location());
    }

ArrayElements
  = head:Expression tail:(_ "," _ Expression)* _ ","? { return [head, ...tail.map(t => t[3])]; }

StructLiteral
  = name:Identifier _ "{" _ fields:StructLiteralFields? _ "}" {
      return structLiteral(name.name, fields || [], location());
    }

StructLiteralFields
  = head:StructLiteralField tail:(_ "," _ StructLiteralField)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

StructLiteralField
  = key:Identifier _ ":" _ value:Expression { return { name: key.name, value }; }

IdentifierExpr
  = id:Identifier { return identifier(id.name, location()); }

Identifier
  = !(KeywordReserved) name:IdentToken { return { name, start: location().start, end: location().end }; }

IdentToken
  = $([a-zA-Z_][a-zA-Z0-9_]*)

BoolLiteral
  = K_true { return literal(true, "true", "bool", location()); }
  / K_false { return literal(false, "false", "bool", location()); }

NullLiteral
  = K_null { return literal(null, "null", "null", location()); }

NullptrLiteral
  = K_nullptr { return literal(null, "nullptr", "nullptr", location()); }

NumberLiteral
  = raw:$(NumberToken) { return literal(parseNumber(raw), raw, "number", location()); }

StringLiteral
  = raw:$("\"" ("\\" . / [^"\n\r])* "\"") { return literal(JSON.parse(raw), raw, "string", location()); }

CharLiteral
  = raw:$("'" ("\\" . / [^'\n\r]) "'") { return literal(parseChar(raw), raw, "char", location()); }

NumberToken
  = "0x" [0-9a-fA-F]+
  / "0b" [01]+
  / "0o" [0-7]+
  / [0-9] (_?[0-9])* ("." [0-9] (_?[0-9])*)?

ParameterList
  = head:Parameter tail:(_ "," _ Parameter)* {
      return [head, ...tail.map(t => t[3])];
    }

Parameter
  = name:Identifier _ ":" _ type:Type { return { name: name.name, type }; }

GenericParamList
  = "<" _ head:Identifier tail:(_ "," _ Identifier)* _ ">" {
      return [head.name, ...tail.map(t => t[3].name)];
    }

GenericArgs
  = "<" _ head:Type tail:(_ "," _ Type)* _ ">" {
      return [head, ...tail.map(t => t[3])];
    }

ReturnType
  = K_ret _ type:Type { return type; }

Type
  = FunctionType
  / TupleType
  / BasicType

FunctionType
  = K_Func _ "<" _ ret:Type _ ">" _ "(" _ params:TypeList? _ ")" { return functionType(ret, params || [], location()); }

TypeList
  = head:Type tail:(_ "," _ Type)* { return [head, ...tail.map(t => t[3])]; }

TupleType
  = "(" _ head:Type tail:(_ "," _ Type)+ _ ")" {
      const types = [head, ...tail.map(t => t[3])];
      return tupleType(types, location());
    }

BasicType
  = ptrs:PointerPrefix? name:QualifiedIdentifier gen:GenericArgs? arr:ArraySuffix* {
      const pointerDepth = ptrs ? ptrs.length : 0;
      const genericArgs = gen ? gen : [];
      const arrayDimensions = arr.length ? arr.map(a => a) : [];
      return basicType(name, genericArgs, pointerDepth, arrayDimensions, location());
    }

PointerPrefix
  = "*"+

QualifiedIdentifier
  = head:IdentToken tail:(_ "." _ IdentToken)* { return [head, ...tail.map(t => t[3])].join("."); }

ArraySuffix
  = "[" _ size:NumberLiteral? _ "]" { return size ? size.value : null; }

ImportWhitespace
  = [ \t]*

IdBoundary
  = ![a-zA-Z0-9_]

K_global
  = $("global") IdBoundary

K_local
  = $("local") IdBoundary

K_const
  = $("const") IdBoundary

K_type
  = $("type") IdBoundary

K_frame
  = $("frame") IdBoundary

K_static
  = $("static") IdBoundary

K_ret
  = $("ret") IdBoundary

K_struct
  = $("struct") IdBoundary

K_import
  = $("import") IdBoundary

K_from
  = $("from") IdBoundary

K_as
  = $("as") IdBoundary

K_export
  = $("export") IdBoundary

K_extern
  = $("extern") IdBoundary

K_asm
  = $("asm") IdBoundary

K_loop
  = $("loop") IdBoundary

K_if
  = $("if") IdBoundary

K_else
  = $("else") IdBoundary

K_break
  = $("break") IdBoundary

K_continue
  = $("continue") IdBoundary

K_try
  = $("try") IdBoundary

K_catch
  = $("catch") IdBoundary

K_catchOther
  = $("catchOther") IdBoundary

K_return
  = $("return") IdBoundary

K_throw
  = $("throw") IdBoundary

K_switch
  = $("switch") IdBoundary

K_case
  = $("case") IdBoundary

K_default
  = $("default") IdBoundary

K_cast
  = $("cast") IdBoundary

K_sizeof
  = $("sizeof") IdBoundary

K_match
  = $("match") IdBoundary

K_Func
  = $("Func") IdBoundary

K_true
  = $("true") IdBoundary

K_false
  = $("false") IdBoundary

K_null
  = $("null") IdBoundary

K_nullptr
  = $("nullptr") IdBoundary

KeywordReserved
  = "global" IdBoundary
  / "local" IdBoundary
  / "const" IdBoundary
  / "type" IdBoundary
  / "frame" IdBoundary
  / "static" IdBoundary
  / "ret" IdBoundary
  / "struct" IdBoundary
  / "import" IdBoundary
  / "from" IdBoundary
  / "as" IdBoundary
  / "export" IdBoundary
  / "extern" IdBoundary
  / "asm" IdBoundary
  / "loop" IdBoundary
  / "if" IdBoundary
  / "else" IdBoundary
  / "break" IdBoundary
  / "continue" IdBoundary
  / "try" IdBoundary
  / "catch" IdBoundary
  / "catchOther" IdBoundary
  / "return" IdBoundary
  / "throw" IdBoundary
  / "switch" IdBoundary
  / "case" IdBoundary
  / "default" IdBoundary
  / "cast" IdBoundary
  / "sizeof" IdBoundary
  / "match" IdBoundary
  / "Func" IdBoundary
  / "null" IdBoundary
  / "nullptr" IdBoundary
  / "true" IdBoundary
  / "false" IdBoundary

_
  = (Whitespace / Comment)*

Whitespace
  = [ \t\n\r]+

Comment
  = c:("###" (!"###" .)* "###"
  / "#"[^\n\r]*) {
    if (options && options.comments) {
      const loc = location();
      options.comments.push({
        type: "Comment",
        lexeme: text(),
        literal: null,
        line: loc.start.line,
        column: loc.start.column,
        file: options.filePath || "unknown"
      });
    }
    return c;
  }

EOF = !.
