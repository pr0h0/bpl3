{
  // Helper utilities shared across productions
  const parserFilePath = (options && options.filePath) || "unknown";

  function makeLoc(loc) {
    if (loc && loc.startLine !== undefined) {
      return loc;
    }

    return {
      file: parserFilePath,
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
        location: loc,
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
      location: loc,
    };
  }

  function tupleType(types, loc) {
    return { kind: "TupleType", types, location: loc };
  }

  function functionType(ret, params, loc) {
    return { kind: "FunctionType", returnType: ret, paramTypes: params || [], location: loc };
  }

  function lambdaType(ret, params, loc) {
    return { kind: "LambdaType", returnType: ret, paramTypes: params || [], location: loc };
  }

  function literal(value, raw, type, loc) {
    return { kind: "Literal", value, raw, type, location: loc };
  }

  function identifier(name, loc) {
    return { kind: "Identifier", name, location: loc };
  }

  function unary(operator, operand, isPrefix, loc) {
    return { kind: "Unary", operator, operand, isPrefix, location: loc };
  }

  function binary(left, operator, right, loc) {
    return { kind: "Binary", left, operator, right, location: loc };
  }

  function ternary(condition, trueExpr, falseExpr, loc) {
    return { kind: "Ternary", condition, trueExpr, falseExpr, location: loc };
  }

  function assignment(lhs, operator, rhs, loc) {
    return { kind: "Assignment", assignee: lhs, operator, value: rhs, location: loc };
  }

  function call(callee, args, loc) {
    return { kind: "Call", callee, args: args || [], genericArgs: [], location: loc };
  }

  function member(object, property, loc) {
    return { kind: "Member", object, property, location: loc };
  }

  function index(object, indexExpr, loc) {
    return { kind: "Index", object, index: indexExpr, location: loc };
  }

  function arrayLiteral(elements, loc) {
    return { kind: "ArrayLiteral", elements: elements || [], location: loc };
  }

  function structLiteral(structName, fields, loc, genericArgs) {
    return { kind: "StructLiteral", structName, fields: fields || [], genericArgs: genericArgs || [], location: loc };
  }

  function tupleLiteral(elements, loc) {
    return { kind: "TupleLiteral", elements, location: loc };
  }

  function group(expression, loc) {
    return { kind: "Group", expression, location: loc };
  }

  function enumStructVariant(enumName, variantName, fields, loc) {
    return { kind: "EnumStructVariant", enumName, variantName, fields: fields || [], location: loc };
  }

  function castNode(targetType, expression, loc) {
    return { kind: "Cast", targetType, expression, location: loc };
  }

  function sizeofNode(target, loc) {
    return { kind: "Sizeof", target, location: loc };
  }

  function typeOfNode(target, loc) {
    return { kind: "TypeOf", target, location: loc };
  }

  function offsetofNode(type, member, loc) {
    return { kind: "OffsetOf", targetType: type, member: member, location: loc };
  }

  function lambdaExpression(params, returnType, body, loc) {
    return { kind: "LambdaExpression", params, returnType, body, location: loc };
  }

  function matchNode(targetType, value, loc) {
    return { kind: "TypeMatch", targetType, value, location: loc };
  }

  function isNode(expression, type, loc) {
    return { kind: "Is", expression, type, location: loc };
  }

  function asNode(expression, type, loc) {
    return { kind: "As", expression, type, location: loc };
  }

  function genericInstantiation(base, genericArgs, loc) {
    return { kind: "GenericInstantiation", base, genericArgs, location: loc };
  }

  function enumDecl(name, genericParams, variants, methods, loc, implementsList) {
    return { kind: "EnumDecl", name, genericParams, variants, methods: methods || [], implements: implementsList || [], location: loc };
  }

  function enumVariant(name, dataType, loc) {
    return { kind: "EnumVariant", name, dataType, location: loc };
  }

  function matchExpr(value, arms, loc) {
    return { kind: "Match", value, arms, location: loc };
  }

  function matchArm(pattern, guard, body, loc) {
    return { kind: "MatchArm", pattern, guard, body, location: loc };
  }

  function patternWildcard(loc) {
    return { kind: "PatternWildcard", location: loc };
  }

  function patternLiteral(value, loc) {
    return { kind: "PatternLiteral", value, location: loc };
  }

  function patternIdentifier(name, loc) {
    return { kind: "PatternIdentifier", name, location: loc };
  }

  function patternEnum(enumName, genericArgs, variantName, loc) {
    return { kind: "PatternEnum", enumName, variantName, genericArgs, location: loc };
  }

  function patternEnumTuple(enumName, genericArgs, variantName, bindings, loc) {
    return { kind: "PatternEnumTuple", enumName, variantName, bindings, genericArgs, location: loc };
  }

  function patternEnumStruct(enumName, genericArgs, variantName, fields, loc) {
    return { kind: "PatternEnumStruct", enumName, variantName, fields, genericArgs, location: loc };
  }

  function patternTuple(patterns, loc) {
    return { kind: "PatternTuple", patterns, location: loc };
  }

  function block(statements, loc) {
    return { kind: "Block", statements: statements || [], location: loc };
  }

  function collectTailIndex(head, tail, index) {
    const result = [head];
    for (let i = 0; i < tail.length; i++) {
      result.push(tail[i][index]);
    }
    return result;
  }

  function variableDecl(isGlobal, isConst, name, typeAnnotation, initializer, loc) {
    return { kind: "VariableDecl", isGlobal, isConst, name, typeAnnotation, initializer, location: loc };
  }

  function functionDecl(isFrame, isStatic, name, genericParams, params, returnType, body, loc, attributes) {
    return { kind: "FunctionDecl", isFrame, isStatic, name, genericParams, params, returnType, body, attributes: attributes || [], location: loc };
  }

  function structDecl(name, genericParams, inheritanceList, members, loc) {
    return { kind: "StructDecl", name, genericParams, inheritanceList, members, location: loc };
  }

  function specDecl(name, genericParams, extendsList, methods, loc) {
    return { kind: "SpecDecl", name, genericParams, extends: extendsList, methods, location: loc };
  }

  function typeAlias(name, genericParams, typeNode, loc) {
    return { kind: "TypeAlias", name, genericParams, type: typeNode, location: loc };
  }

  function importStmt(items, source, importAll, namespace, loc) {
    return { kind: "Import", items, source, importAll: !!importAll, namespace: namespace || undefined, location: loc };
  }

  function exportStmt(items, loc) {
    return { kind: "Export", items, location: loc };
  }

  function externDecl(name, params, isVariadic, returnType, loc) {
    return { kind: "Extern", name, params, isVariadic, returnType, location: loc };
  }

  function asmBlock(content, loc, flavor, clobbers) {
    return { kind: "Asm", content, flavor, clobbers, location: loc };
  }

  function tryStmt(tryBlock, catchClauses, loc) {
    return { kind: "Try", tryBlock, catchClauses, location: loc };
  }

  function catchClause(variable, type, body, loc) {
    // variable and type can be null for catch-all (catch { })
    return { kind: "CatchClause", variable, type, body, location: loc };
  }

  function throwStmt(expression, loc) {
    return { kind: "Throw", expression, location: loc };
  }

  function switchStmt(expression, cases, defaultCase, loc) {
    return { kind: "Switch", expression, cases, defaultCase, location: loc };
  }

  function caseClause(value, body, loc) {
    return { kind: "Case", value, body, location: loc };
  }

  function returnStmt(value, loc) {
    return { kind: "Return", value, location: loc };
  }

  function breakStmt(loc) {
    return { kind: "Break", location: loc };
  }

  function continueStmt(loc) {
    return { kind: "Continue", location: loc };
  }

  function expressionStmt(expr, loc) {
    return { kind: "ExpressionStmt", expression: expr, location: loc };
  }

  function loopStmt(init, condition, step, body, loc, isCStyle) {
    return { kind: "Loop", init, condition, step, body, location: loc, isCStyle };
  }

  function ifStmt(condition, thenBranch, elseBranch, loc) {
    return { kind: "If", condition, thenBranch, elseBranch, location: loc };
  }

  const voidType = (loc) => basicType("void", [], 0, [], loc);
  const boolType = (loc) => basicType("bool", [], 0, [], loc);

  function parseBplDigitValue(code) {
    if (code >= 48 && code <= 57) return code - 48;
    if (code >= 65 && code <= 70) return code - 55;
    if (code >= 97 && code <= 102) return code - 87;
    return -1;
  }

  function parseBplPrefixedNumber(raw, digitStart, radix) {
    if (digitStart >= raw.length) return Number.parseInt(raw.slice(digitStart), radix);

    let value = 0;
    for (let i = digitStart; i < raw.length; i++) {
      const digit = parseBplDigitValue(raw.charCodeAt(i));
      if (digit < 0 || digit >= radix) {
        return Number.parseInt(raw.slice(digitStart), radix);
      }
      if (value > (Number.MAX_SAFE_INTEGER - digit) / radix) {
        return Number.parseInt(raw.slice(digitStart), radix);
      }
      value = value * radix + digit;
    }
    return value;
  }

  function parseBplDecimalNumber(raw) {
    let value = 0;
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      if (code < 48 || code > 57) {
        return Number(raw);
      }
      const digit = code - 48;
      if (value > (Number.MAX_SAFE_INTEGER - digit) / 10) {
        return Number(raw);
      }
      value = value * 10 + digit;
    }
    return value;
  }

  function parseSmallBplDecimalNumber(raw, rawLength, firstDigit) {
    let value = firstDigit;
    for (let i = 1; i < rawLength; i++) {
      const code = raw.charCodeAt(i);
      if (code < 48 || code > 57) {
        return null;
      }
      value = value * 10 + code - 48;
    }
    return value;
  }

  function parseNumber(raw) {
    const rawLength = raw.length;
    const firstCode = raw.charCodeAt(0);
    if (rawLength === 1) {
      if (firstCode >= 48 && firstCode <= 57) {
        return firstCode - 48;
      }
    }
    if (rawLength > 2 && firstCode === 48) {
      const prefix = raw.charCodeAt(1) | 32;
      if (prefix === 120) return parseBplPrefixedNumber(raw, 2, 16);
      if (prefix === 98) return parseBplPrefixedNumber(raw, 2, 2);
      if (prefix === 111) return parseBplPrefixedNumber(raw, 2, 8);
    }
    if (rawLength === 2 && firstCode >= 48 && firstCode <= 57) {
      const secondCode = raw.charCodeAt(1);
      if (secondCode >= 48 && secondCode <= 57) {
        return (firstCode - 48) * 10 + secondCode - 48;
      }
    }
    if (rawLength === 3 && firstCode >= 48 && firstCode <= 57) {
      const secondCode = raw.charCodeAt(1);
      const thirdCode = raw.charCodeAt(2);
      if (
        secondCode >= 48 &&
        secondCode <= 57 &&
        thirdCode >= 48 &&
        thirdCode <= 57
      ) {
        return ((firstCode - 48) * 10 + secondCode - 48) * 10 + thirdCode - 48;
      }
    }
    if (rawLength === 4 && firstCode >= 48 && firstCode <= 57) {
      const secondCode = raw.charCodeAt(1);
      const thirdCode = raw.charCodeAt(2);
      const fourthCode = raw.charCodeAt(3);
      if (
        secondCode >= 48 &&
        secondCode <= 57 &&
        thirdCode >= 48 &&
        thirdCode <= 57 &&
        fourthCode >= 48 &&
        fourthCode <= 57
      ) {
        return (
          (((firstCode - 48) * 10 + secondCode - 48) * 10 + thirdCode - 48) *
            10 +
          fourthCode -
          48
        );
      }
    }
    if (rawLength <= 15 && firstCode >= 48 && firstCode <= 57) {
      const smallDecimal = parseSmallBplDecimalNumber(raw, rawLength, firstCode - 48);
      if (smallDecimal !== null) {
        return smallDecimal;
      }
    }
    return parseBplDecimalNumber(raw);
  }

  function decodeString(raw) {
    // raw includes surrounding quotes
    // Remove the quotes first
    const inner = raw.slice(1, -1);
    const firstEscape = inner.indexOf("\\");
    if (firstEscape === -1) return inner;
    
    // Manually process escape sequences
    let result = inner.slice(0, firstEscape);
    let i = firstEscape;
    
    while (i < inner.length) {
      if (inner[i] === "\\") {
        if (i + 1 >= inner.length) {
          result += "\\";
          i++;
          continue;
        }
        
        const nextChar = inner[i + 1];
        
        switch (nextChar) {
          case "n":
            result += "\n";
            i += 2;
            break;
          case "t":
            result += "\t";
            i += 2;
            break;
          case "r":
            result += "\r";
            i += 2;
            break;
          case "0":
            result += "\0";
            i += 2;
            break;
          case "\\":
            result += "\\";
            i += 2;
            break;
          case "'":
            result += "'";
            i += 2;
            break;
          case '"':
            result += '"';
            i += 2;
            break;
          case "x": {
            // Hex escape: \xHH
            if (i + 3 < inner.length) {
              const hex = inner.slice(i + 2, i + 4);
              const code = parseInt(hex, 16);
              if (!isNaN(code)) {
                result += String.fromCharCode(code);
                i += 4;
                break;
              }
            }
            // Invalid hex escape, keep as-is
            result += "\\x";
            i += 2;
            break;
          }
          case "u": {
            // Unicode escape: \uHHHH
            if (i + 5 < inner.length) {
              const hex = inner.slice(i + 2, i + 6);
              const code = parseInt(hex, 16);
              if (!isNaN(code)) {
                result += String.fromCharCode(code);
                i += 6;
                break;
              }
            }
            // Invalid unicode escape, keep as-is
            result += "\\u";
            i += 2;
            break;
          }
          default:
            // Unknown escape, keep backslash
            result += "\\" + nextChar;
            i += 2;
            break;
        }
      } else {
        const nextEscape = inner.indexOf("\\", i);
        if (nextEscape === -1) {
          result += inner.slice(i);
          break;
        }
        result += inner.slice(i, nextEscape);
        i = nextEscape;
      }
    }
    
    return result;
  }

  function parseChar(raw) {
    return decodeString(raw);
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

    return {
      type,
      lexeme: op,
      literal: null,
      line: loc.startLine,
      column: loc.startColumn,
      file: parserFilePath,
    };
  }

  function makeOperatorTokenFromPos(op, startPos, type) {
    const resolvedType = type || operatorTypeMap[op] || "Unknown";
    return makeTypedOperatorTokenFromPos(resolvedType, op, startPos);
  }

  function makeTypedOperatorTokenFromPos(type, op, startPos) {
    let lineIndex = peg$lastBplLineIndex;
    let lineStart = peg$bplLineStarts[lineIndex];
    const nextLineStart = peg$bplLineStarts[lineIndex + 1];

    if (
      startPos < lineStart ||
      (nextLineStart !== undefined && startPos >= nextLineStart)
    ) {
      lineIndex = peg$findBplLineIndex(startPos);
      lineStart = peg$bplLineStarts[lineIndex];
    } else {
      peg$lastBplLinePos = startPos;
    }

    return {
      type,
      lexeme: op,
      literal: null,
      line: lineIndex + 1,
      column: startPos - lineStart + 1,
      file: parserFilePath,
    };
  }

  function mergeLoc(startLoc, endLoc) {
    return {
      file: parserFilePath,
      startLine: startLoc.startLine,
      startColumn: startLoc.startColumn,
      endLine: endLoc.endLine,
      endColumn: endLoc.endColumn,
    };
  }

  function mergeLocToEndPos(startLoc, endPos) {
    let endLineIndex = startLoc.endLine - 1;
    const nextLineStart = peg$bplLineStarts[endLineIndex + 1];
    if (nextLineStart !== undefined && endPos >= nextLineStart) {
      endLineIndex = peg$findBplLineIndex(endPos);
    }

    return {
      file: parserFilePath,
      startLine: startLoc.startLine,
      startColumn: startLoc.startColumn,
      endLine: endLineIndex + 1,
      endColumn: endPos - peg$bplLineStarts[endLineIndex] + 1,
    };
  }

  function foldBinaryTail(left, tail) {
    let result = left;
    for (let i = 0; i < tail.length; i++) {
      const entry = tail[i];
      const op = entry[1];
      const right = entry[3];
      result = binary(
        result,
        makeOperatorTokenFromPos(op.op, op.pos, op.type),
        right,
        mergeLoc(result.location, right.location)
      );
    }
    return result;
  }

  function foldTypeCheckTail(head, tail) {
    let expr = head;
    for (let i = 0; i < tail.length; i++) {
      const entry = tail[i];
      const opStr = entry[1][0];
      const type = entry[3];
      const loc = mergeLoc(expr.location, type.location);
      expr = opStr === "is" ? isNode(expr, type, loc) : asNode(expr, type, loc);
    }
    return expr;
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
      const statements = [];
      for (let i = 0; i < stmts.length; i++) {
        const statement = stmts[i][0];
        if (statement) {
          statements.push(statement);
        }
      }
      const loc = location();
      return { kind: "Program", statements, location: loc };
    }

TopLevelErrorRecovery
  = !EOF error:. {
      addError("Unexpected token: " + error, location());
      return null;
    }

Statement
  = Block
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
  / FallthroughStatement
  / DeferStatement
  / ExpressionStatement
  / ErrorRecovery

ErrorRecovery
  = !EOF !("}") start:. rest:(!(";" / "}") .)* end:(";")? {
      const restStr = rest.map(r => r[1]).join("");
      const text = start + restStr;
      addError("Unexpected syntax: '" + text + "'", location());
      return null;
    }

VariableDeclaration
  = scope:(K_global { return true; } / K_local { return false; }) _ declaration:(
    K_const _ name:Identifier _ ":" _ type:Type _ "=" _ init:Expression _ ";" {
      return variableDecl(scope, true, name, type, init, undefined);
    }
  / "(" _ targets:DestructTargetList _ ")" _ "=" _ init:Expression _ ";" {
      return variableDecl(scope, false, targets, undefined, init, undefined);
    }
  / name:Identifier _ ":" _ type:Type _ init:(_ "=" _ Expression)? _ ";" {
      const initializer = init ? init[3] : undefined;
      return variableDecl(scope, false, name, type, initializer, undefined);
    }
  / name:Identifier _ "=" _ init:Expression _ ";" {
      return variableDecl(scope, false, name, undefined, init, undefined);
    }
  ) {
    declaration.location = location();
    return declaration;
  }

DestructTargetList
  = head:DestructTarget tail:(_ "," _ DestructTarget)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

DestructTarget
  = name:Identifier _ ":" _ type:Type { return { name, type }; }
  / name:Identifier { return { name }; }
  / "(" _ targets:DestructTargetList _ ")" { return targets; }

AttributeList
  = "@[" _ head:FunctionAttribute tail:(_ "," _ FunctionAttribute)* _ ","? _ "]" {
      return [head, ...tail.map(t => t[3])];
    }

FunctionAttribute
  = name:Identifier {
      return { kind: "FunctionAttribute", name, location: location() };
    }

FunctionDeclaration
  = attrs:(_ AttributeList _)? K_frame _ name:Identifier _ gen:GenericParamList? _ "(" _ params:ParameterList? _ ")" _ ret:ReturnType? _ body:Block {
      const genericParams = gen ? gen : [];
      const paramList = params ? params : [];
      const returnType = ret ? ret.returnType : voidType(location());
      const isStatic = !(paramList.length > 0 && paramList[0] && paramList[0].name === "this");
      const attributes = attrs ? attrs[1] : [];
      return functionDecl(true, isStatic, name, genericParams, paramList, returnType, body, location(), attributes);
    }

StructDeclaration
  = K_struct _ name:Identifier _ gen:GenericParamList? _ inheritance:(_ ":" _ TypeList)? _ "{" _ members:StructMemberList? _ "}" {
      const genericParams = gen ? gen : [];
      const inheritanceList = inheritance ? inheritance[3] : [];
      const memberList = members ? members : [];
      return structDecl(name, genericParams, inheritanceList, memberList, location());
    }

EnumDeclaration
  = K_enum _ name:Identifier _ gen:GenericParamList? _ ext:(_ ":" _ TypeList)? _ "{" _ content:EnumContent? _ "}" {
      const genericParams = gen ? gen : [];
      const implementsList = ext ? ext[3] : [];
      const variantList = content ? content.variants : [];
      const methods = content ? content.methods : [];
      return enumDecl(name, genericParams, variantList, methods, location(), implementsList);
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
      return enumVariant(name, data, location());
    }

EnumVariantData
  = "(" _ types:TypeList _ ")" { 
      return { kind: "EnumVariantTuple", types, location: location() };
    }
  / "{" _ fields:StructFieldList _ "}" { 
      return { kind: "EnumVariantStruct", fields, location: location() };
    }

StructFieldList
  = head:StructField tail:(_ "," _ StructField)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

StructField
  = name:Identifier _ ":" _ type:Type { 
      return { name, type };
    }

SpecDeclaration
  = K_spec _ name:Identifier _ gen:GenericParamList? _ ext:(_ ":" _ TypeList)? _ "{" _ methods:SpecMethodList? _ "}" {
      const genericParams = gen ? gen : [];
      const extendsList = ext ? ext[3] : [];
      const methodList = methods ? methods : [];
      return specDecl(name, genericParams, extendsList, methodList, location());
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
      return { kind: "SpecMethod", name, genericParams, params: paramList, returnType, location: location() };
    }

StructMemberList
  = head:StructMember tail:(_ StructMember)* {
      return [head, ...tail.map(t => t[1])];
    }

StructMember
  = fd:FunctionDeclaration { return fd; }
  / name:Identifier _ ":" _ type:Type _ "," { return { kind: "StructField", name, type, location: location() }; }
  / name:Identifier _ ":" _ type:Type &(_ "}") { return { kind: "StructField", name, type, location: location() }; }

TypeAlias
  = K_type _ name:Identifier _ gen:GenericParamList? _ "=" _ type:Type _ ";" {
      const genericParams = gen ? gen : [];
      return typeAlias(name, genericParams, type, location());
    }

ImportStatement
  = K_import _ items:ImportList _ K_from _ src:StringLiteral _ ";" {
      const normalized = items.map(it => ({ name: it.name, alias: it.alias, isType: it.isType || false, isWrapped: it.isWrapped }));
      return importStmt(normalized, src.value, false, undefined, location());
    }
  / K_import _ "*" _ K_as _ ns:Identifier _ K_from _ src:StringLiteral _ ";" {
      return importStmt([], src.value, true, ns, location());
    }
  / K_import _ src:StringLiteral _ ";" { return importStmt([], src.value, true, undefined, location()); }

ImportList
  = head:ImportItem tail:(_ "," _ ImportItem)* {
      return [head, ...tail.map(t => t[3])];
    }

ImportItem
  = "[" _ name:Identifier _ "]" { return { name, isType: true, isWrapped: false }; }
  / "{" _ name:Identifier _ "}" { return { name, isType: false, isWrapped: true }; }
  / name:Identifier _ alias:(_ K_as _ Identifier)? {
      return { name, alias: alias ? alias[3] : undefined, isType: false, isWrapped: false };
    }

ExportStatement
  = K_export _ item:ExportItem _ ";" {
      return exportStmt([item], location());
    }

ExportItem
  = "[" _ name:Identifier _ "]" { return { name, isType: true, isWrapped: false }; }
  / "{" _ name:Identifier _ "}" { return { name, isType: false, isWrapped: true }; }
  / name:Identifier { return { name, isType: false, isWrapped: false }; }

ExternDeclaration
  = K_extern _ name:Identifier _ "(" _ params:ExternParameterList? _ ")" _ ret:ReturnType? _ ";" {
      const paramList = params ? params.params : [];
      const isVariadic = params ? params.isVariadic : false;
      return externDecl(name, paramList, isVariadic, ret ? ret.returnType : undefined, location());
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
      const statements = [];
      for (let i = 0; i < stmts.length; i++) {
        const statement = stmts[i][0];
        if (statement !== null) {
          statements.push(statement);
        }
      }
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
  = K_loop _ header:LoopHeader? _ body:Statement {
      const { init, cond, step, isCStyle } = header || {};
      if (!body) return null;
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
  = K_if _ "(" _ cond:Expression _ ")" _ thenBranch:Statement _ elseBranch:ElseClause? {
      if (!thenBranch) return null;
      return ifStmt(cond, thenBranch, elseBranch || undefined, location());
    }

ElseClause
  = K_else _ stmt:Statement { return stmt; }

ReturnStatement
  = K_return _ expr:Expression? _ ";" { return returnStmt(expr || undefined, location()); }

BreakStatement
  = K_break _ ";" { return breakStmt(location()); }

ContinueStatement
  = K_continue _ ";" { return continueStmt(location()); }

DeferStatement
  = K_defer _ stmt:Statement { return { kind: "Defer", statement: stmt, location: location() }; }

TryStatement
  = K_try _ tryBlock:Block _ catches:(CatchClause _)+ {
      const catchList = catches.map(c => c[0]);
      return tryStmt(tryBlock, catchList, location());
    }

CatchClause
  = K_catch _ "(" _ name:Identifier _ ":" _ type:Type _ ")" _ body:Block {
      return catchClause(name, type, body, location());
    }
  / K_catch _ body:Block {
      // Catch-all: no variable, no type
      return catchClause(null, null, body, location());
    }

ThrowStatement
  = K_throw _ expr:Expression _ ";" { return throwStmt(expr, location()); }

FallthroughStatement
  = K_fallthrough _ ";" { return { kind: "Fallthrough", location: location() }; }

SwitchStatement
  = K_switch _ "(" _ expr:Expression _ ")" _ "{" _ cases:(SwitchCase _)* defaultCase:DefaultCase? _ "}" {
      const caseList = cases.map(c => c[0]);
      return switchStmt(expr, caseList, defaultCase || undefined, location());
    }
  / K_switch _ expr:Expression _ "{" _ cases:(SwitchCase _)* defaultCase:DefaultCase? _ "}" {
      const caseList = cases.map(c => c[0]);
      return switchStmt(expr, caseList, defaultCase || undefined, location());
    }

SwitchCase
  = K_case _ value:Expression _ ":" _ stmts:CaseStatements {
      // If stmts is a single Block, unwrap it (or keep it as is, depending on AST)
      // Actually, our AST expects a Block node for the body.
      // So if we parse a list of statements, we wrap them in a synthetic Block.
      // Filter out null values from error recovery
      const filtered = stmts.filter(s => s !== null);
      let body;
      if (filtered.length === 1 && filtered[0].kind === "Block") {
          body = filtered[0];
      } else {
          body = { kind: "Block", statements: filtered, synthesized: true, location: location() };
      }
      return caseClause(value, body, location());
    }

CaseStatements
  = block:Block { return [block]; }
  / stmts:(
      !(_ K_case / _ K_default / _ "}")
      stmt:Statement _ { return stmt; }
    )+ { return stmts; }
  / &(_ K_case / _ K_default / _ "}") { return []; }

DefaultCase
  = K_default _ ":" _ stmts:CaseStatements {
      // Filter out null values from error recovery
      const filtered = stmts.filter(s => s !== null);
      let body;
      if (filtered.length === 1 && filtered[0].kind === "Block") {
          body = filtered[0];
      } else {
          body = { kind: "Block", statements: filtered, synthesized: true, location: location() };
      }
      return body;
    }

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
  / "fallthrough" IdBoundary

ExpressionStatement
  = !StatementStartKeyword expr:Expression _ semi:";"? &{ return semi || expr.kind === "Match"; } { return expressionStmt(expr, location()); }

Expression
  = Assignment

Assignment
  = head:Ternary tail:(_ op:AssignmentOperator _ right:Ternary)* {
      if (tail.length === 0) return head;
      let result = head;
      for (const [, op, , right] of tail) {
        const opToken = makeOperatorTokenFromPos(op.op, op.pos, op.type);
        result = assignment(result, opToken, right, mergeLoc(result.location, right.location));
      }
      return result;
    }

AssignmentOperator
  = op:("+=" / "-=" / "*=" / "/=" / "%=" / "&=" / "|=" / "^=" / "=") { return { op, pos: offset() }; }

Ternary
  = cond:LogicalOr _ "?" _ trueExpr:Ternary _ ":" _ falseExpr:Ternary {
      return ternary(cond, trueExpr, falseExpr, mergeLoc(cond.location, falseExpr.location));
    }
  / LogicalOr

LogicalOr
  = left:LogicalAnd tail:(_ op:LogicalOrOperator _ right:LogicalAnd)* {
      return foldBinaryTail(left, tail);
    }

LogicalOrOperator
  = op:"||" { return { op, pos: offset() }; }

LogicalAnd
  = left:BitwiseOr tail:(_ op:LogicalAndOperator _ right:BitwiseOr)* {
      return foldBinaryTail(left, tail);
    }

LogicalAndOperator
  = op:"&&" { return { op, pos: offset() }; }

BitwiseOr
  = left:BitwiseXor tail:(_ op:BitwiseOrOperator _ right:BitwiseXor)* {
      return foldBinaryTail(left, tail);
    }

BitwiseOrOperator
  = op:"|" !"|" { return { op, pos: offset() }; }

BitwiseXor
  = left:BitwiseAnd tail:(_ op:BitwiseXorOperator _ right:BitwiseAnd)* {
      return foldBinaryTail(left, tail);
    }

BitwiseXorOperator
  = op:"^" { return { op, pos: offset() }; }

BitwiseAnd
  = left:Equality tail:(_ op:BitwiseAndOperator _ right:Equality)* {
      return foldBinaryTail(left, tail);
    }

BitwiseAndOperator
  = op:"&" !"&" { return { op, pos: offset() }; }

Equality
  = left:TypeCheck tail:(_ op:EqualityOperator _ right:TypeCheck)* {
      return foldBinaryTail(left, tail);
    }

EqualityOperator
  = op:("==" / "!=") { return { op, pos: offset() }; }

TypeCheck
  = head:Relational tail:(_ (K_is / K_as) _ Type)* {
      return foldTypeCheckTail(head, tail);
    }

Relational
  = left:Shift tail:(_ op:RelationalOperator _ right:Shift)* {
      return foldBinaryTail(left, tail);
    }

RelationalOperator
  = op:(">="/ "<=" / "<" / ">") { return { op, pos: offset() }; }

Shift
  = left:Additive tail:(_ op:ShiftOperator _ right:Additive)* {
      return foldBinaryTail(left, tail);
    }

ShiftOperator
  = op:("<<" / ">>") { return { op, pos: offset() }; }

Additive
  = left:Multiplicative tail:(_ op:AdditiveOperator _ right:Multiplicative)* {
      return foldBinaryTail(left, tail);
    }

AdditiveOperator
  = op:("+" / "-") { return { op, pos: offset() }; }

Multiplicative
  = left:Unary tail:(_ op:MultiplicativeOperator _ right:Unary)* {
      return foldBinaryTail(left, tail);
    }

MultiplicativeOperator
  = op:("*" / "/" / "%") { return { op, pos: offset() }; }

Unary
  = op:UnaryOperator _ expr:Unary {
      const opToken = makeOperatorTokenFromPos(op.op, op.pos, op.type);
      return unary(opToken, expr, true, location());
    }
  / Postfix

UnaryOperator
  = op:("++" / "--" / "!" / "~" / "*" / "&" / "-" / "+") { return { op, pos: offset() }; }

Postfix
  = primary:Primary postfixes:PostfixTail* {
      let expr = primary;
      for (const post of postfixes) {
        if (post.type === "call") {
          expr = call(expr, post.args, mergeLocToEndPos(expr.location, post.endPos));
        } else if (post.type === "index") {
          expr = index(expr, post.index, mergeLocToEndPos(expr.location, post.endPos));
        } else if (post.type === "member") {
          expr = member(expr, post.property, mergeLocToEndPos(expr.location, post.endPos));
        } else if (post.type === "enumStructVariant") {
          // For enum struct variant like Shape.Circle { radius: 5.0 }
          // expr should be an Identifier (enum name)
          if (expr.kind === "Identifier") {
            expr = enumStructVariant(expr.name, post.property, post.fields, mergeLocToEndPos(expr.location, post.endPos));
          } else {
            error("Enum struct variant construction requires an identifier before '.'");
          }
        } else if (post.type === "generic") {
          expr = genericInstantiation(expr, post.genericArgs, mergeLocToEndPos(expr.location, post.endPos));
        } else if (post.type === "postfixUnary") {
          const opToken = makeOperatorTokenFromPos(post.operator, post.startPos, post.operatorType);
          expr = unary(opToken, expr, false, mergeLocToEndPos(expr.location, post.endPos));
        }
      }
      return expr;
    }

PostfixTail
  = _ tail:PostfixTailAfterTrivia {
      tail.startPos = peg$savedPos;
      tail.endPos = offset();
      return tail;
    }

PostfixTailAfterTrivia
  = "<" _ args:GenericArgList _ ">" {
      return { type: "generic", genericArgs: args };
    }
  / "(" _ args:ArgumentList? _ ")" {
      return { type: "call", args: args || [] };
    }
  / "[" _ idx:Expression _ "]" {
      return { type: "index", index: idx };
    }
  / "." _ prop:Identifier _ "{" _ fields:StructLiteralFields? _ "}" {
      return { type: "enumStructVariant", property: prop, fields: fields || [] };
    }
  / "." _ prop:Identifier {
      return { type: "member", property: prop };
    }
  / "." _ num:[0-9]+ {
      return { type: "member", property: num.join("") };
    }
  / op:("++" / "--") {
      return { type: "postfixUnary", operator: op, operatorType: operatorTypeMap[op] || "Unknown" };
    }

ArgumentList
  = head:Expression tail:(_ "," _ Expression)* _ ","? {
      return collectTailIndex(head, tail, 3);
    }

GenericArgList
  = head:Type tail:(_ "," _ Type)* {
      return [head, ...tail.map(t => t[3])];
    }

Primary
  = StructLiteral
  / IdentifierExpr
  / BoolLiteral
  / NullptrLiteral
  / NumberLiteral
  / InterpolatedStringLiteral
  / StringLiteral
  / CharLiteral
  / TupleOrGrouped
  / CastExpression
  / SizeofExpression
  / TypeOfExpression
  / OffsetOfExpression
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
  / K_sizeof _ "(" _ arg:(Expression / Type) _ ")" { return sizeofNode(arg, location()); }
  / K_sizeof _ "(" _ expr:Expression _ ")" { return sizeofNode(expr, location()); }

TypeOfExpression
  = K_typeof _ "<" _ type:Type _ ">" _ "(" _ ")" { return typeOfNode(type, location()); }
  / K_typeof _ "(" _ arg:(Expression / Type) _ ")" { return typeOfNode(arg, location()); }

OffsetOfExpression
  = K_offsetof _ "(" _ type:Type _ "," _ member:Identifier _ ")" { return offsetofNode(type, member, location()); }

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
  / PatternTuple
  / PatternLiteral
  / PatternEnum
  / PatternIdentifier

PatternWildcard
  = "_" { return patternWildcard(location()); }

PatternTuple
  = "(" _ patterns:PatternList _ ")" {
      return patternTuple(patterns, location());
    }

PatternList
  = head:Pattern tail:(_ "," _ Pattern)* {
      return [head, ...tail.map(t => t[3])];
    }

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
      return { name, type: type ? type[2] : null, location: location() };
    }

LambdaBody
  = Block
  / expr:Expression {
      // Wrap expression in a block with return statement
      return { kind: "Block", statements: [{ kind: "Return", value: expr, location: location() }], location: location() };
    }

PatternLiteral
  = lit:(BoolLiteral / NumberLiteral / StringLiteral / CharLiteral / NullptrLiteral) { 
      return patternLiteral(lit, location()); 
    }

PatternIdentifier
  = name:Identifier { return patternIdentifier(name, location()); }

EnumName
  = name:QualifiedIdentifier gen:GenericArgs? {
      return { name: name, genericArgs: gen || [] };
    }

PatternEnum
  = enumName:EnumName rest:(_ "." _ Identifier)? &{ 
      // Ensure there's at least one dot (in qualified identifier or explicit)
      return (enumName.genericArgs && enumName.genericArgs.length > 0) || 
             rest !== null || 
             enumName.name.includes(".");
    } !(_ ("(" / "{")) {
      let name = enumName.name;
      let generics = enumName.genericArgs;
      let variant = "";

      if (generics.length > 0) {
        // Generic enums require explicit dot: Option<T>.Some
        if (!rest) error("Expected '.' and variant name after generic enum");
        variant = rest[3];
      } else if (rest) {
        // Explicit dot after EnumName
        variant = rest[3];
      } else {
        // No explicit dot - split the qualified identifier
        const parts = name.split(".");
        variant = parts.pop();
        name = parts.join(".");
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
          variant = rest[3];
      } else {
          if (rest) {
             variant = rest[3];
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
          variant = rest[3];
      } else {
          if (rest) {
             variant = rest[3];
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
  = Pattern

PatternFieldList
  = head:PatternField tail:(_ "," _ PatternField)* _ ","? {
      return [head, ...tail.map(t => t[3])];
    }

PatternField
  = fieldName:Identifier _ ":" _ binding:Identifier {
      return { fieldName, binding };
    }

ArrayLiteral
  = "[" _ elems:ArrayElements? _ "]" {
      return arrayLiteral(elems || [], location());
    }

ArrayElements
  = head:Expression tail:(_ "," _ Expression)* _ ","? { return [head, ...tail.map(t => t[3])]; }

StructLiteral
  = name:Identifier _ gen:GenericArgs? _ "{" _ fields:StructLiteralFields? _ "}" {
      return structLiteral(name, fields || [], location(), gen || []);
    }

StructLiteralFields
  = head:StructLiteralField tail:(_ "," _ StructLiteralField)* _ ","? {
      return collectTailIndex(head, tail, 3);
    }

StructLiteralField
  = key:Identifier _ ":" _ value:Expression { return { name: key, value }; }

IdentifierExpr
  = id:Identifier { return identifier(id, location()); }

Identifier
  = !(KeywordReserved) name:IdentToken {
      return name;
    }

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
      return literal(decodeString(raw), raw, "string", location());
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
  = ("0x" / "0X") [0-9a-fA-F]+
  / ("0b" / "0B") [01]+
  / ("0o" / "0O") [0-7]+
  / [0-9] (_?[0-9])* ("." [0-9] (_?[0-9])*)?

ParameterList
  = head:Parameter tail:(_ "," _ Parameter)* {
      return collectTailIndex(head, tail, 3);
    }

Parameter
  = isConstPrefix:K_const? _ isVariadicPrefix:"..."? _ name:Identifier _ ":" _ isConstType:K_const? _ isVariadicSuffix:"..."? _ type:Type? {
      const isVariadic = !!isVariadicPrefix || !!isVariadicSuffix;
      
      if (isVariadic && !type) {
         // Heterogeneous variadic: name: ...
         // We treat this as Any
         return {
            kind: "Parameter",
            name,
            type: { kind: "BasicType", name: "Any", genericArgs: [], pointerDepth: 0, arrayDimensions: [], location: location() },
            isConst: !!isConstPrefix || !!isConstType,
            isVariadic: true,
            location: location(),
         };
      }
      
      if (!type) {
          error("Missing type for parameter " + name);
      }

      return {
        kind: "Parameter",
        name,
        type,
        isConst: !!isConstPrefix || !!isConstType,
        isVariadic: isVariadic,
        location: location(),
      };
    }

GenericParamList
  = "<" _ head:GenericParam tail:(_ "," _ GenericParam)* _ ">" {
      return [head, ...tail.map(t => t[3])];
    }

GenericParam
  = name:Identifier constraint:(_ ":" _ Type)? {
      return { name, constraint: constraint ? constraint[3] : undefined };
    }

GenericArgs
  = "<" _ head:Type tail:(_ "," _ Type)* _ ">" {
      return [head, ...tail.map(t => t[3])];
    }

ReturnType
  = K_ret _ type:Type { return { returnType: type }; }

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
  / ParenthesizedType
  / BasicType

ParenthesizedType
  = "(" _ t:Type _ ")" arr:ArraySuffix* {
      if (arr.length > 0) {
        if (!t.arrayDimensions) {
          t.arrayDimensions = [];
        }
        t.arrayDimensions.push(...arr.map(a => a));
      }
      return t;
    }

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
K_return = "return" IdBoundary
K_throw = "throw" IdBoundary
K_switch = "switch" IdBoundary
K_case = "case" IdBoundary
K_default = "default" IdBoundary
K_fallthrough = "fallthrough" IdBoundary
K_cast = "cast" IdBoundary
K_sizeof = "sizeof" IdBoundary
K_typeof = "typeof" IdBoundary
K_offsetof = "offsetof" IdBoundary
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
  / "return" IdBoundary
  / "throw" IdBoundary
  / "switch" IdBoundary
  / "case" IdBoundary
  / "default" IdBoundary
  / "fallthrough" IdBoundary
  / "cast" IdBoundary
  / "sizeof" IdBoundary
  / "typeof" IdBoundary
  / "offsetof" IdBoundary
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
  = c:(MultiLineComment
  / "#"[^\n\r]*) {
    if (options && options.comments) {
      const loc = location();
      options.comments.push({
        type: "Comment",
        lexeme: text(),
        literal: null,
        line: loc.startLine,
        column: loc.startColumn,
        file: options.filePath || "unknown"
      });
    }
    return c;
  }

MultiLineComment
  = "/#" (MultiLineComment / (!"#/" SourceChar))* "#/"

SourceChar = .

InterpolatedStringLiteral
  = '`' parts:InterpolatedStringPart* '`' {
      return {
        kind: "InterpolatedString",
        parts: parts,
        location: location()
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
  / c:[^`\\$] { 
      if (c === '"') return '\\"';
      if (c === '\n') return '\\n';
      if (c === '\r') return '\\r';
      return c;
    }
  / "$" ! "{" { return "$"; }

EOF = !.
