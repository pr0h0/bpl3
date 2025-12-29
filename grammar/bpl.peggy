{
  // Helper utilities shared across productions
  function makeLoc(loc) {
    // Optimization: Avoid object creation if possible, or simplify
    const filePath = (options && options.filePath) || "unknown";
    if (loc && loc.startLine !== undefined) {
      return loc;
    }
    // Fast path for Peggy location object
    if (loc && loc.start && loc.end) {
       return {
        file: filePath,
        startLine: loc.start.line,
        startColumn: loc.start.column,
        endLine: loc.end.line,
        endColumn: loc.end.column,
      };
    }
    
    return {
      file: filePath,
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };
  }

  function addError(message, loc) {
    if (options && options.errors) {
      options.errors.push({
        message,
        location: makeLoc(loc),
        severity: "error"
      });
    }
  }

  // Optimization: Cache common location objects if they are identical?
  // Probably not worth it for now, but inlining makeLoc calls or reducing them helps.

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

  function lambdaType(ret, params, loc) {
    return { kind: "LambdaType", returnType: ret, paramTypes: params || [], location: makeLoc(loc) };
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

  function structLiteral(structName, fields, loc, genericArgs) {
    return { kind: "StructLiteral", structName, fields: fields || [], genericArgs: genericArgs || [], location: makeLoc(loc) };
  }

  function tupleLiteral(elements, loc) {
    return { kind: "TupleLiteral", elements, location: makeLoc(loc) };
  }

  function group(expression, loc) {
    return { kind: "Group", expression, location: makeLoc(loc) };
  }

  function enumStructVariant(enumName, variantName, fields, loc) {
    return { kind: "EnumStructVariant", enumName, variantName, fields: fields || [], location: makeLoc(loc) };
  }

  function castNode(targetType, expression, loc) {
    return { kind: "Cast", targetType, expression, location: makeLoc(loc) };
  }

  function sizeofNode(target, loc) {
    return { kind: "Sizeof", target, location: makeLoc(loc) };
  }

  function lambdaExpression(params, returnType, body, loc) {
    return { kind: "LambdaExpression", params, returnType, body, location: makeLoc(loc) };
  }

  function matchNode(targetType, value, loc) {
    return { kind: "TypeMatch", targetType, value, location: makeLoc(loc) };
  }

  function isNode(expression, type, loc) {
    return { kind: "Is", expression, type, location: makeLoc(loc) };
  }

  function asNode(expression, type, loc) {
    return { kind: "As", expression, type, location: makeLoc(loc) };
  }

  function genericInstantiation(base, genericArgs, loc) {
    return { kind: "GenericInstantiation", base, genericArgs, location: makeLoc(loc) };
  }

  function enumDecl(name, genericParams, variants, methods, loc) {
    return { kind: "EnumDecl", name, genericParams, variants, methods: methods || [], location: makeLoc(loc) };
  }

  function enumVariant(name, dataType, loc) {
    return { kind: "EnumVariant", name, dataType, location: makeLoc(loc) };
  }

  function matchExpr(value, arms, loc) {
    return { kind: "Match", value, arms, location: makeLoc(loc) };
  }

  function matchArm(pattern, guard, body, loc) {
    return { kind: "MatchArm", pattern, guard, body, location: makeLoc(loc) };
  }

  function patternWildcard(loc) {
    return { kind: "PatternWildcard", location: makeLoc(loc) };
  }

  function patternLiteral(value, loc) {
    return { kind: "PatternLiteral", value, location: makeLoc(loc) };
  }

  function patternIdentifier(name, loc) {
    return { kind: "PatternIdentifier", name, location: makeLoc(loc) };
  }

  function patternEnum(enumName, genericArgs, variantName, loc) {
    return { kind: "PatternEnum", enumName, variantName, genericArgs, location: makeLoc(loc) };
  }

  function patternEnumTuple(enumName, genericArgs, variantName, bindings, loc) {
    return { kind: "PatternEnumTuple", enumName, variantName, bindings, genericArgs, location: makeLoc(loc) };
  }

  function patternEnumStruct(enumName, genericArgs, variantName, fields, loc) {
    return { kind: "PatternEnumStruct", enumName, variantName, fields, genericArgs, location: makeLoc(loc) };
  }

  function block(statements, loc) {
    return { kind: "Block", statements: statements || [], location: makeLoc(loc) };
  }

  function variableDecl(isGlobal, isConst, name, typeAnnotation, initializer, loc) {
    return { kind: "VariableDecl", isGlobal, isConst, name, typeAnnotation, initializer, location: makeLoc(loc) };
  }

  function functionDecl(isFrame, isStatic, name, genericParams, params, returnType, body, loc) {
    return { kind: "FunctionDecl", isFrame, isStatic, name, genericParams, params, returnType, body, location: makeLoc(loc) };
  }

  function structDecl(name, genericParams, inheritanceList, members, loc) {
    return { kind: "StructDecl", name, genericParams, inheritanceList, members, location: makeLoc(loc) };
  }

  function specDecl(name, genericParams, extendsList, methods, loc) {
    return { kind: "SpecDecl", name, genericParams, extends: extendsList, methods, location: makeLoc(loc) };
  }

  function typeAlias(name, genericParams, typeNode, loc) {
    return { kind: "TypeAlias", name, genericParams, type: typeNode, location: makeLoc(loc) };
  }

  function importStmt(items, source, importAll, namespace, loc) {
    return { kind: "Import", items, source, importAll: !!importAll, namespace: namespace || undefined, location: makeLoc(loc) };
  }

  function exportStmt(items, loc) {
    return { kind: "Export", items, location: makeLoc(loc) };
  }

  function externDecl(name, params, isVariadic, returnType, loc) {
    return { kind: "Extern", name, params, isVariadic, returnType, location: makeLoc(loc) };
  }

  function asmBlock(content, loc, flavor, clobbers) {
    return { kind: "Asm", content, flavor, clobbers, location: makeLoc(loc) };
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

  function loopStmt(init, condition, step, body, loc, isCStyle) {
    return { kind: "Loop", init, condition, step, body, location: makeLoc(loc), isCStyle };
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
    
    let line = 1, column = 1;
    if (loc && loc.startLine !== undefined) {
        line = loc.startLine;
        column = loc.startColumn;
    } else if (loc && loc.start) {
        line = loc.start.line;
        column = loc.start.column;
    }

    return {
      type,
      lexeme: op,
      literal: null,
      line,
      column,
      file: filePath,
    };
  }

  function mergeLoc(startLoc, endLoc) {
    const filePath = (options && options.filePath) || "unknown";
    
    let startLine = 1, startColumn = 1;
    if (startLoc && startLoc.startLine !== undefined) {
        startLine = startLoc.startLine;
        startColumn = startLoc.startColumn;
    } else if (startLoc && startLoc.start) {
        startLine = startLoc.start.line;
        startColumn = startLoc.start.column;
    }

    let endLine = 1, endColumn = 1;
    if (endLoc && endLoc.endLine !== undefined) {
        endLine = endLoc.endLine;
        endColumn = endLoc.endColumn;
    } else if (endLoc && endLoc.end) {
        endLine = endLoc.end.line;
        endColumn = endLoc.end.column;
    }

    return {
        file: filePath,
        startLine,
        startColumn,
        endLine,
        endColumn
    };
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
  = _ stmts:(Statement _ / TopLevelErrorRecovery _)* EOF {
      const statements = stmts.map(([stmt]) => stmt).filter(Boolean);
      const loc = location();
      return { kind: "Program", statements, location: makeLoc(loc) };
    }

TopLevelErrorRecovery
  = !EOF error:. {
      addError("Unexpected token: " + error, location());
      return null;
    }

Statement
  = Block
  / ExpressionStatement
  / VariableDeclaration
  / ReturnStatement
  / FunctionDeclaration
  / StructDeclaration
  / EnumDeclaration
  / SpecDeclaration
  / TypeAlias
  / ImportStatement
  / ExportStatement
  / ExternDeclaration
  / AsmBlock
  / LoopStatement
  / IfStatement
  / TryStatement
  / ThrowStatement
  / SwitchStatement
  / BreakStatement
  / ContinueStatement
  / DeferStatement
  / ErrorRecovery

ErrorRecovery
  = !EOF !("}") start:. rest:(!(";" / "}") .)* end:(";")? {
      const restStr = rest.map(r => r[1]).join("");
      const text = start + restStr;
      addError("Unexpected syntax: '" + text + "'", location());
      return null;
    }

VariableDeclaration
  = K_global _ K_const _ name:Identifier _ ":" _ type:Type _ "=" _ init:Expression _ ";" {
      return variableDecl(true, true, name.name, type, init, location());
    }
  / K_local _ K_const _ name:Identifier _ ":" _ type:Type _ "=" _ init:Expression _ ";" {
      return variableDecl(false, true, name.name, type, init, location());
    }
  / K_global _ "(" _ targets:DestructTargetList _ ")" _ "=" _ init:Expression _ ";" {
      return variableDecl(true, false, targets, undefined, init, location());
    }
  / K_local _ "(" _ targets:DestructTargetList _ ")" _ "=" _ init:Expression _ ";" {
      return variableDecl(false, false, targets, undefined, init, location());
    }
  / K_global _ name:Identifier _ ":" _ type:Type _ init:(_ "=" _ Expression)? _ ";" {
      const initializer = init ? init[3] : undefined;
      return variableDecl(true, false, name.name, type, initializer, location());
    }
  / K_local _ name:Identifier _ ":" _ type:Type _ init:(_ "=" _ Expression)? _ ";" {
      const initializer = init ? init[3] : undefined;
      return variableDecl(false, false, name.name, type, initializer, location());
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
  = K_struct _ name:Identifier _ gen:GenericParamList? _ inheritance:(_ ":" _ TypeList)? _ "{" _ members:StructMemberList? _ "}" {
      const genericParams = gen ? gen : [];
      const inheritanceList = inheritance ? inheritance[3] : [];
      const memberList = members ? members : [];
      return structDecl(name.name, genericParams, inheritanceList, memberList, location());
    }

EnumDeclaration
  = K_enum _ name:Identifier _ gen:GenericParamList? _ "{" _ content:EnumContent? _ "}" {
      const genericParams = gen ? gen : [];
      const variantList = content ? content.variants : [];
      const methods = content ? content.methods : [];
      return enumDecl(name.name, genericParams, variantList, methods, location());
    }

EnumContent
  = variants:EnumVariantList _ methods:EnumMethodList? {
      return { variants, methods: methods || [] };
    }
  / methods:EnumMethodList {
      return { variants: [], methods };
    }

EnumVariantList
  = head:EnumVariant tail:(_ "," _ EnumVariant)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

EnumMethodList
  = head:FunctionDeclaration tail:(_ FunctionDeclaration)* {
      return [head, ...tail.map(t => t[1])];
    }

EnumVariant
  = name:Identifier _ data:EnumVariantData? {
      return enumVariant(name.name, data, location());
    }

EnumVariantData
  = "(" _ types:TypeList _ ")" { 
      return { kind: "EnumVariantTuple", types, location: makeLoc(location()) };
    }
  / "{" _ fields:StructFieldList _ "}" { 
      return { kind: "EnumVariantStruct", fields, location: makeLoc(location()) };
    }

StructFieldList
  = head:StructField tail:(_ "," _ StructField)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

StructField
  = name:Identifier _ ":" _ type:Type { 
      return { name: name.name, type }; 
    }

SpecDeclaration
  = K_spec _ name:Identifier _ gen:GenericParamList? _ ext:(_ ":" _ TypeList)? _ "{" _ methods:SpecMethodList? _ "}" {
      const genericParams = gen ? gen : [];
      const extendsList = ext ? ext[3] : [];
      const methodList = methods ? methods : [];
      return specDecl(name.name, genericParams, extendsList, methodList, location());
    }

SpecMethodList
  = head:SpecMethod tail:(_ SpecMethod)* {
      return [head, ...tail.map(t => t[1])];
    }

SpecMethod
  = K_frame _ name:Identifier _ gen:GenericParamList? _ "(" _ params:ParameterList? _ ")" _ ret:(_ K_ret _ Type)? _ ";" {
      const genericParams = gen ? gen : [];
      const paramList = params ? params : [];
      const returnType = ret ? ret[3] : undefined;
      return { kind: "SpecMethod", name: name.name, genericParams, params: paramList, returnType, location: location() };
    }

StructMemberList
  = head:StructMember tail:(_ StructMember)* {
      return [head, ...tail.map(t => t[1])];
    }

StructMember
  = fd:FunctionDeclaration { return fd; }
  / name:Identifier _ ":" _ type:Type _ "," { return { kind: "StructField", name: name.name, type, location: location() }; }
  / name:Identifier _ ":" _ type:Type &(_ "}") { return { kind: "StructField", name: name.name, type, location: location() }; }

TypeAlias
  = K_type _ name:Identifier _ gen:GenericParamList? _ "=" _ type:Type _ ";" {
      const genericParams = gen ? gen : [];
      return typeAlias(name.name, genericParams, type, location());
    }

ImportStatement
  = K_import _ items:ImportList _ K_from _ src:StringLiteral _ ";" {
      const normalized = items.map(it => ({ name: it.name, alias: it.alias, isType: it.isType || false, isWrapped: it.isWrapped }));
      return importStmt(normalized, src.value, false, undefined, location());
    }
  / K_import _ "*" _ K_as _ ns:Identifier _ K_from _ src:StringLiteral _ ";" {
      return importStmt([], src.value, true, ns.name, location());
    }
  / K_import _ src:StringLiteral _ ";" { return importStmt([], src.value, true, undefined, location()); }

ImportList
  = head:ImportItem tail:(_ "," _ ImportItem)* {
      return [head, ...tail.map(t => t[3])];
    }

ImportItem
  = "[" _ name:Identifier _ "]" { return { name: name.name, isType: true, isWrapped: false }; }
  / "{" _ name:Identifier _ "}" { return { name: name.name, isType: false, isWrapped: true }; }
  / name:Identifier _ alias:(_ K_as _ Identifier)? {
      return { name: name.name, alias: alias ? alias[3].name : undefined, isType: false, isWrapped: false };
    }

ExportStatement
  = K_export _ item:ExportItem _ ";" {
      return exportStmt([item], location());
    }

ExportItem
  = "[" _ name:Identifier _ "]" { return { name: name.name, isType: true, isWrapped: false }; }
  / "{" _ name:Identifier _ "}" { return { name: name.name, isType: false, isWrapped: true }; }
  / name:Identifier { return { name: name.name, isType: false, isWrapped: false }; }

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
  = K_asm _ flavor:("(" _ s:StringLiteral _ ")" { return s.value; })? _ "{" content:AsmContent clobbers:AsmClobbers? "}" {
      return asmBlock(content, location(), flavor || undefined, clobbers || undefined);
    }

AsmClobbers
  = _ "[" _ head:AsmString tail:(_ "," _ AsmString)* _ "]" _ {
      const extract = (s) => s.slice(1, -1);
      return [extract(head), ...tail.map(t => extract(t[3]))];
    }

Block
  = "{" _ stmts:(Statement _)* "}" {
      const statements = stmts.map(s => s[0]).filter(s => s !== null);
      return block(statements, location());
    }

AsmContent
  = parts:( !AsmClobbers p:AsmPart { return p; } )* { return parts.join(""); }

AsmPart
  = AsmString
  / AsmCharLiteral
  / AsmComment
  / AsmNestedBlock
  / "[" { return "["; }
  / "]" { return "]"; }
  / AsmText

AsmString
  = s:$("\"" ("\\" . / [^"\n\r])* "\"") { return s; }

AsmCharLiteral
  = s:$("'" ("\\" . / [^'\n\r]) "'") { return s; }

AsmComment
  = s:$("#" [^\n\r]*) { return s; }

AsmNestedBlock
  = "{" body:AsmContent "}" { return "{" + body + "}"; }

AsmText
  = s:$([^{}"'#\[\]]+) { return s; }

LoopStatement
  = K_loop _ header:LoopHeader? _ body:Block {
      const { init, cond, step, isCStyle } = header || {};
      return loopStmt(init, cond, step, body, location(), isCStyle);
    }

LoopHeader
  = "(" _ init:ForInit _ cond:Expression? _ ";" _ step:Expression? _ ")" {
      return { init, cond, step, isCStyle: true };
    }
  / "(" _ cond:Expression _ ")" {
      return { cond, isCStyle: false };
    }

ForInit
  = VariableDeclaration
  / ExpressionStatement
  / ";" { return undefined; }

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

DeferStatement
  = K_defer _ stmt:Statement { return { kind: "Defer", statement: stmt, location: makeLoc(location()) }; }

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

StatementStartKeyword
  = "global" IdBoundary
  / "local" IdBoundary
  / "type" IdBoundary
  / "frame" IdBoundary
  / "struct" IdBoundary
  / "enum" IdBoundary
  / "spec" IdBoundary
  / "import" IdBoundary
  / "export" IdBoundary
  / "extern" IdBoundary
  / "asm" IdBoundary
  / "loop" IdBoundary
  / "if" IdBoundary
  / "break" IdBoundary
  / "continue" IdBoundary
  / "defer" IdBoundary
  / "try" IdBoundary
  / "return" IdBoundary
  / "throw" IdBoundary
  / "switch" IdBoundary

ExpressionStatement
  = !StatementStartKeyword expr:Expression _ semi:";"? &{ return semi || expr.kind === "Match"; } { return expressionStmt(expr, location()); }

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
  = left:TypeCheck tail:(_ op:EqualityOperator _ right:TypeCheck)* {
      return tail.reduce((acc, [, op, , r]) => binary(acc, makeOperatorToken(op.op, op.loc), r, makeLoc(mergeLoc(acc.location, r.location))), left);
    }

EqualityOperator
  = op:("==" / "!=") { return { op, loc: location() }; }

TypeCheck
  = head:Relational tail:(_ (K_is / K_as) _ Type)* {
      return tail.reduce((expr, [, op, , type]) => {
        const opStr = op[0];
        const loc = makeLoc(mergeLoc(expr.location, type.location));
        if (opStr === "is") {
          return isNode(expr, type, loc);
        } else {
          return asNode(expr, type, loc);
        }
      }, head);
    }

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
        } else if (post.type === "enumStructVariant") {
          // For enum struct variant like Shape.Circle { radius: 5.0 }
          // expr should be an Identifier (enum name)
          if (expr.kind === "Identifier") {
            expr = enumStructVariant(expr.name, post.property, post.fields, makeLoc(mergeLoc(expr.location, post.loc)));
          } else {
            error("Enum struct variant construction requires an identifier before '.'");
          }
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
  / _ "." _ prop:Identifier _ "{" _ fields:StructLiteralFields? _ "}" {
      const loc = location();
      return { type: "enumStructVariant", property: prop.name, fields: fields || [], loc: loc };
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
  = head:Expression tail:(_ "," _ Expression)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

GenericArgList
  = head:Type tail:(_ "," _ Type)* {
      return [head, ...tail.map(t => t[3])];
    }

Primary
  = BoolLiteral
  / NullptrLiteral
  / NumberLiteral
  / InterpolatedStringLiteral
  / StringLiteral
  / CharLiteral
  / StructLiteral
  / IdentifierExpr
  / TupleOrGrouped
  / CastExpression
  / SizeofExpression
  / TypeMatchExpression
  / PatternMatchExpression
  / ArrayLiteral
  / LambdaExpression

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
      if (elems.length === 1) return group(elems[0], loc);
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

TypeMatchExpression
  = K_match _ "<" _ type:Type _ ">" _ "(" _ val:(Expression / Type) _ ")" { return matchNode(type, val, location()); }

PatternMatchExpression
  = K_match _ "(" _ value:Expression _ ")" _ "{" _ arms:MatchArmList? _ "}" {
      return matchExpr(value, arms || [], location());
    }

MatchArmList
  = head:MatchArm tail:(_ "," _ MatchArm)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

MatchArm
  = pattern:Pattern _ guard:(_ K_if _ Expression)? _ "=>" _ body:MatchArmBody {
      const guardExpr = guard ? guard[3] : undefined;
      return matchArm(pattern, guardExpr, body, location());
    }

MatchArmBody
  = Block
  / Expression

Pattern
  = PatternWildcard
  / PatternEnumStruct
  / PatternEnumTuple
  / PatternEnum
  / PatternLiteral
  / PatternIdentifier

PatternWildcard
  = "_" { return patternWildcard(location()); }

LambdaExpression
  = "|" _ K_void _ "|" _ retType:("ret" _ Type)? _ body:LambdaBody {
      return lambdaExpression([], retType ? retType[2] : null, body, location());
    }
  / "|" _ params:LambdaParams? _ "|" _ retType:("ret" _ Type)? _ body:LambdaBody {
      return lambdaExpression(params || [], retType ? retType[2] : null, body, location());
    }

LambdaParams
  = head:LambdaParam tail:(_ "," _ LambdaParam)* {
      return [head, ...tail.map(t => t[3])];
    }

LambdaParam
  = name:Identifier _ type:(":" _ Type)? {
      return { name: name.name, type: type ? type[2] : null, location: makeLoc(location()) };
    }

LambdaBody
  = Block
  / expr:Expression {
      // Wrap expression in a block with return statement
      return { kind: "Block", statements: [{ kind: "Return", value: expr, location: makeLoc(location()) }], location: makeLoc(location()) };
    }

PatternLiteral
  = lit:(BoolLiteral / NumberLiteral / StringLiteral / CharLiteral / NullptrLiteral) { 
      return patternLiteral(lit, location()); 
    }

PatternIdentifier
  = name:Identifier { return patternIdentifier(name.name, location()); }

EnumName
  = name:QualifiedIdentifier gen:GenericArgs? {
      return { name: name, genericArgs: gen || [] };
    }

PatternEnum
  = enumName:EnumName rest:(_ "." _ Identifier)? !(_ ("(" / "{")) {
      let name = enumName.name;
      let generics = enumName.genericArgs;
      let variant = "";

      if (generics.length > 0) {
          if (!rest) error("Expected '.' and variant name after generic enum");
          variant = rest[3].name;
      } else {
          if (rest) {
             variant = rest[3].name;
          } else {
             const parts = name.split(".");
             if (parts.length < 2) {
                 // Allow single identifier for Type Matching
                 variant = name;
                 name = "";
             } else {
                 variant = parts.pop();
                 name = parts.join(".");
             }
          }
      }
      return patternEnum(name, generics, variant, location());
    }

PatternEnumTuple
  = enumName:EnumName rest:(_ "." _ Identifier)? _ "(" _ bindings:PatternBindingList? _ ")" {
      let name = enumName.name;
      let generics = enumName.genericArgs;
      let variant = "";

      if (generics.length > 0) {
          if (!rest) error("Expected '.' and variant name after generic enum");
          variant = rest[3].name;
      } else {
          if (rest) {
             variant = rest[3].name;
          } else {
             const parts = name.split(".");
             if (parts.length < 2) {
                 // Allow single identifier for Type Matching
                 variant = name;
                 name = "";
             } else {
                 variant = parts.pop();
                 name = parts.join(".");
             }
          }
      }
      return patternEnumTuple(name, generics, variant, bindings || [], location());
    }

PatternEnumStruct
  = enumName:EnumName rest:(_ "." _ Identifier)? _ "{" _ fields:PatternFieldList? _ "}" {
      let name = enumName.name;
      let generics = enumName.genericArgs;
      let variant = "";

      if (generics.length > 0) {
          if (!rest) error("Expected '.' and variant name after generic enum");
          variant = rest[3].name;
      } else {
          if (rest) {
             variant = rest[3].name;
          } else {
             const parts = name.split(".");
             if (parts.length < 2) {
                 // Allow single identifier for Type Matching
                 variant = name;
                 name = "";
             } else {
                 variant = parts.pop();
                 name = parts.join(".");
             }
          }
      }
      return patternEnumStruct(name, generics, variant, fields || [], location());
    }

PatternBindingList
  = head:PatternBinding tail:(_ "," _ PatternBinding)* {
      return [head, ...tail.map(t => t[3])];
    }

PatternBinding
  = "_" { return "_"; }
  / name:Identifier { return name.name; }

PatternFieldList
  = head:PatternField tail:(_ "," _ PatternField)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

PatternField
  = fieldName:Identifier _ ":" _ binding:Identifier {
      return { fieldName: fieldName.name, binding: binding.name };
    }

ArrayLiteral
  = "[" _ elems:ArrayElements? _ "]" {
      return arrayLiteral(elems || [], location());
    }

ArrayElements
  = head:Expression tail:(_ "," _ Expression)* _ ","? { return [head, ...tail.map(t => t[3])]; }

StructLiteral
  = name:Identifier _ gen:GenericArgs? _ "{" _ fields:StructLiteralFields? _ "}" {
      return structLiteral(name.name, fields || [], location(), gen || []);
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

NullptrLiteral
  = (K_null / K_nullptr) { return literal(null, "nullptr", "nullptr", location()); }

NumberLiteral
  = raw:$(NumberToken) { return literal(parseNumber(raw), raw, "number", location()); }

StringLiteral
  = raw:$("\"" ("\\" . / [^"\n\r])* "\"") { 
      try {
        return literal(JSON.parse(raw), raw, "string", location());
      } catch (e) {
        error("Invalid string literal: " + e.message);
      }
    }

CharLiteral
  = raw:$("'" ("\\" . / [^'\n\r])+ "'") { 
      const parsed = parseChar(raw);
      if (parsed.length !== 1) {
        error("Character literal must contain exactly one character");
      }
      return literal(parsed, raw, "char", location()); 
    }

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
  = isConstPrefix:K_const? _ isVariadicPrefix:"..."? _ name:Identifier _ ":" _ isConstType:K_const? _ isVariadicSuffix:"..."? _ type:Type? {
      const isVariadic = !!isVariadicPrefix || !!isVariadicSuffix;
      
      if (isVariadic && !type) {
         // Heterogeneous variadic: name: ...
         // We treat this as Any
         return {
            name: name.name,
            type: { kind: "BasicType", name: "Any", genericArgs: [], pointerDepth: 0, arrayDimensions: [], location: makeLoc(location()) },
            isConst: !!isConstPrefix || !!isConstType,
            isVariadic: true,
            location: makeLoc(location()),
         };
      }
      
      if (!type) {
          error("Missing type for parameter " + name.name);
      }

      return {
        name: name.name,
        type,
        isConst: !!isConstPrefix || !!isConstType,
        isVariadic: isVariadic,
        location: makeLoc(location()),
      };
    }

GenericParamList
  = "<" _ head:GenericParam tail:(_ "," _ GenericParam)* _ ">" {
      return [head, ...tail.map(t => t[3])];
    }

GenericParam
  = name:Identifier constraint:(_ ":" _ Type)? {
      return { name: name.name, constraint: constraint ? constraint[3] : undefined };
    }

GenericArgs
  = "<" _ head:Type tail:(_ "," _ Type)* _ ">" {
      return [head, ...tail.map(t => t[3])];
    }

ReturnType
  = K_ret _ type:Type { return type; }

Type
  = isConst:K_const? _ t:BaseType {
      if (isConst) {
        t.isConst = true;
      }
      return t;
    }

BaseType
  = FunctionType
  / LambdaType
  / TupleType
  / BasicType

FunctionType
  = K_Func _ "<" _ ret:Type _ ">" _ "(" _ params:TypeList? _ ")" arr:ArraySuffix* { 
      const t = functionType(ret, params || [], location());
      t.arrayDimensions = arr.length ? arr.map(a => a) : [];
      return t;
    }

LambdaType
  = K_Lambda _ "<" _ ret:Type _ ">" _ "(" _ params:TypeList? _ ")" arr:ArraySuffix* { 
      const t = lambdaType(ret, params || [], location());
      t.arrayDimensions = arr.length ? arr.map(a => a) : [];
      return t;
    }

TypeList
  = head:Type tail:(_ "," _ Type)* { return [head, ...tail.map(t => t[3])]; }

TupleType
  = "(" _ head:Type tail:(_ "," _ Type)+ _ ")" arr:ArraySuffix* {
      const types = [head, ...tail.map(t => t[3])];
      const t = tupleType(types, location());
      t.arrayDimensions = arr.length ? arr.map(a => a) : [];
      return t;
    }

BasicType
  = ptrs:PointerPrefix? name:(SelfKeyword / QualifiedIdentifier) gen:GenericArgs? arr:ArraySuffix* {
      const pointerDepth = ptrs ? ptrs.length : 0;
      const genericArgs = gen ? gen : [];
      const arrayDimensions = arr.length ? arr.map(a => a) : [];
      return basicType(name, genericArgs, pointerDepth, arrayDimensions, location());
    }

SelfKeyword
  = $("Self") IdBoundary { return "Self"; }

PointerPrefix
  = "*"+

QualifiedIdentifier
  = head:IdentToken tail:(_ "." _ IdentToken)* { return [head, ...tail.map(t => t[3])].join("."); }

ArraySuffix
  = "[" _ sign:"-"? _ size:NumberLiteral _ "]" { return sign ? -size.value : size.value; }
  / "[" _ "]" { return null; }

ImportWhitespace
  = [ \t]*

IdBoundary
  = ![a-zA-Z0-9_]

K_global = "global" IdBoundary
K_local = "local" IdBoundary
K_const = "const" IdBoundary
K_type = "type" IdBoundary
K_frame = "frame" IdBoundary
K_static = "static" IdBoundary
K_ret = "ret" IdBoundary
K_struct = "struct" IdBoundary
K_enum = "enum" IdBoundary
K_spec = "spec" IdBoundary
K_import = "import" IdBoundary
K_from = "from" IdBoundary
K_as = "as" IdBoundary
K_export = "export" IdBoundary
K_extern = "extern" IdBoundary
K_asm = "asm" IdBoundary
K_loop = "loop" IdBoundary
K_if = "if" IdBoundary
K_else = "else" IdBoundary
K_break = "break" IdBoundary
K_continue = "continue" IdBoundary
K_defer = "defer" IdBoundary
K_try = "try" IdBoundary
K_catch = "catch" IdBoundary
K_catchOther = "catchOther" IdBoundary
K_return = "return" IdBoundary
K_throw = "throw" IdBoundary
K_switch = "switch" IdBoundary
K_case = "case" IdBoundary
K_default = "default" IdBoundary
K_cast = "cast" IdBoundary
K_sizeof = "sizeof" IdBoundary
K_match = "match" IdBoundary
K_is = "is" IdBoundary
K_Func = "Func" IdBoundary
K_Lambda = "Lambda" IdBoundary
K_void = "void" IdBoundary
K_true = "true" IdBoundary
K_false = "false" IdBoundary
K_null = "null" IdBoundary
K_nullptr = "nullptr" IdBoundary

KeywordReserved
  = "global" IdBoundary
  / "local" IdBoundary
  / "const" IdBoundary
  / "type" IdBoundary
  / "frame" IdBoundary
  / "static" IdBoundary
  / "ret" IdBoundary
  / "struct" IdBoundary
  / "enum" IdBoundary
  / "spec" IdBoundary
  / "Self" IdBoundary
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
  / "is" IdBoundary
  / "Func" IdBoundary
  / "Lambda" IdBoundary
  / "null" IdBoundary
  / "nullptr" IdBoundary
  / "true" IdBoundary
  / "false" IdBoundary

_
  = (Whitespace / Comment)*

Whitespace
  = [ \t\n\r]+

Comment
  = c:("/#" (!"#/" SourceChar)* "#/"
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

SourceChar = .

InterpolatedStringLiteral
  = '`' parts:InterpolatedStringPart* '`' {
      return {
        kind: "InterpolatedString",
        parts: parts,
        location: makeLoc(location())
      };
    }

InterpolatedStringPart
  = "${" _ expr:Expression _ "}" { return expr; }
  / chars:InterpolatedStringChars {
      return literal(chars, JSON.stringify(chars), "string", location());
    }

InterpolatedStringChars
  = chars:InterpolatedStringChar+ {
      const raw = '"' + chars.join("") + '"';
      try {
        return JSON.parse(raw);
      } catch (e) {
        error("Invalid interpolated string: " + e.message);
      }
    }

InterpolatedStringChar
  = "\\" c:. { 
      if (c === '$') return '$'; 
      if (c === '`') return '`';
      return text(); 
    }
  / [^`\\$\n\r] { return text(); }
  / "$" ! "{" { return "$"; }

EOF = !.
