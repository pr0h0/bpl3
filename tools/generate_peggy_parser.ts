import { dirname, join } from "path";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import * as peggy from "peggy";

const repoRoot = join(__dirname, "..");
const grammarPath = join(repoRoot, "grammar", "bpl.peggy");
const outputPath = join(
  repoRoot,
  "compiler",
  "frontend",
  "generated",
  "BplParser.js",
);

export function generateBplParserSource(grammarSource: string): string {
  return optimizeGeneratedParserSource(
    peggy.generate(grammarSource, {
      output: "source",
      format: "es",
      cache: false,
    }),
  ).replace(/[ \t]+$/gm, "");
}

export function optimizeGeneratedParserSource(parserSource: string): string {
  const original = [
    "  function location() {",
    "    return peg$computeLocation(peg$savedPos, peg$currPos);",
    "  }",
  ].join("\n");
  const replacement = [
    "  function location() {",
    "    return peg$computeBplLocation(peg$savedPos, peg$currPos);",
    "  }",
    "",
    "  function peg$computeBplLocation(startPos, endPos) {",
    "    const startPosDetails = peg$computePosDetails(startPos);",
    "    const endPosDetails = peg$computePosDetails(endPos);",
    "",
    "    return {",
    "      file: parserFilePath,",
    "      startLine: startPosDetails.line,",
    "      startColumn: startPosDetails.column,",
    "      endLine: endPosDetails.line,",
    "      endColumn: endPosDetails.column,",
    "    };",
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser location helper shape changed; update the BPL parser location optimizer.",
    );
  }

  const withBplLocation = optimizeGeneratedBplLocationLines(
    parserSource.replace(original, replacement),
  );

  return optimizeGeneratedTriviaSkipping(
    optimizeGeneratedNumberScanning(
      optimizeGeneratedStatementStartKeywordScanning(
        optimizeGeneratedAssignmentOperatorScanning(
          optimizeGeneratedExpressionOperatorScanning(
            optimizeGeneratedIdentifierScanning(
              optimizeGeneratedFailureTracking(
                optimizeGeneratedLiteralMatches(
                  optimizeGeneratedMakeLoc(withBplLocation),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function optimizeGeneratedBplLocationLines(parserSource: string): string {
  const original = [
    "  function peg$computeBplLocation(startPos, endPos) {",
    "    const startPosDetails = peg$computePosDetails(startPos);",
    "    const endPosDetails = peg$computePosDetails(endPos);",
    "",
    "    return {",
    "      file: parserFilePath,",
    "      startLine: startPosDetails.line,",
    "      startColumn: startPosDetails.column,",
    "      endLine: endPosDetails.line,",
    "      endColumn: endPosDetails.column,",
    "    };",
    "  }",
  ].join("\n");
  const replacement = [
    "  const peg$bplLineStarts = [0];",
    "  for (let peg$bplLinePos = 0; peg$bplLinePos < input.length; peg$bplLinePos++) {",
    "    if (input.charCodeAt(peg$bplLinePos) === 10) {",
    "      peg$bplLineStarts.push(peg$bplLinePos + 1);",
    "    }",
    "  }",
    "",
    "  let peg$lastBplLineIndex = 0;",
    "",
    "  function peg$isBplPosInLine(pos, lineIndex) {",
    "    return pos >= peg$bplLineStarts[lineIndex] &&",
    "      (lineIndex + 1 === peg$bplLineStarts.length || pos < peg$bplLineStarts[lineIndex + 1]);",
    "  }",
    "",
    "  function peg$findBplLineIndex(pos) {",
    "    if (peg$isBplPosInLine(pos, peg$lastBplLineIndex)) {",
    "      return peg$lastBplLineIndex;",
    "    }",
    "",
    "    let low = 0;",
    "    let high = peg$bplLineStarts.length - 1;",
    "",
    "    while (low <= high) {",
    "      const mid = (low + high) >>> 1;",
    "      if (peg$bplLineStarts[mid] <= pos) {",
    "        low = mid + 1;",
    "      } else {",
    "        high = mid - 1;",
    "      }",
    "    }",
    "",
    "    peg$lastBplLineIndex = high;",
    "    return high;",
    "  }",
    "",
    "  function peg$computeBplLocation(startPos, endPos) {",
    "    const startLineIndex = peg$findBplLineIndex(startPos);",
    "    const endLineIndex = peg$isBplPosInLine(endPos, startLineIndex) ? startLineIndex : peg$findBplLineIndex(endPos);",
    "",
    "    return {",
    "      file: parserFilePath,",
    "      startLine: startLineIndex + 1,",
    "      startColumn: startPos - peg$bplLineStarts[startLineIndex] + 1,",
    "      endLine: endLineIndex + 1,",
    "      endColumn: endPos - peg$bplLineStarts[endLineIndex] + 1,",
    "    };",
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser BPL location helper shape changed; update the BPL parser line-start optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedMakeLoc(parserSource: string): string {
  const original = [
    "  function makeLoc(loc) {",
    "    if (loc && loc.startLine !== undefined) {",
    "      return loc;",
    "    }",
    "",
    "    return {",
    "      file: parserFilePath,",
    "      startLine: 0,",
    "      startColumn: 0,",
    "      endLine: 0,",
    "      endColumn: 0,",
    "    };",
    "  }",
  ].join("\n");
  const replacement = [
    "  function makeLoc(loc) {",
    "    return loc;",
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser makeLoc helper shape changed; update the BPL parser location optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedLiteralMatches(parserSource: string): string {
  const optimized = parserSource.replace(
    /input\.substr\(peg\$currPos, \d+\) === (peg\$c\d+)/g,
    "input.startsWith($1, peg$currPos)",
  );

  if (optimized === parserSource) {
    throw new Error(
      "Generated Peggy parser literal-match shape changed; update the BPL parser literal optimizer.",
    );
  }

  return optimized;
}

function optimizeGeneratedFailureTracking(parserSource: string): string {
  const originalDeclarations = [
    "  let peg$maxFailPos = peg$currPos;",
    "  let peg$maxFailExpected = options.peg$maxFailExpected || [];",
  ].join("\n");
  const replacementDeclarations = [
    "  let peg$maxFailPos = peg$currPos;",
    "  let peg$maxFailExpected = options.peg$maxFailExpected || [];",
    "  const peg$collectExpected = options.bplCollectExpected !== false;",
  ].join("\n");
  const originalFailHelper = [
    "  function peg$fail(expected) {",
    "    if (peg$currPos < peg$maxFailPos) { return; }",
    "",
    "    if (peg$currPos > peg$maxFailPos) {",
    "      peg$maxFailPos = peg$currPos;",
    "      peg$maxFailExpected = [];",
    "    }",
    "",
    "    peg$maxFailExpected.push(expected);",
    "  }",
  ].join("\n");
  const replacementFailHelper = [
    "  function peg$fail(expected) {",
    "    if (peg$currPos < peg$maxFailPos) { return; }",
    "",
    "    if (peg$currPos > peg$maxFailPos) {",
    "      peg$maxFailPos = peg$currPos;",
    "      if (peg$collectExpected) {",
    "        peg$maxFailExpected = [];",
    "      }",
    "    }",
    "",
    "    if (!peg$collectExpected) { return; }",
    "",
    "    peg$maxFailExpected.push(expected);",
    "  }",
  ].join("\n");

  if (
    !parserSource.includes(originalDeclarations) ||
    !parserSource.includes(originalFailHelper)
  ) {
    throw new Error(
      "Generated Peggy parser failure helper shape changed; update the BPL parser failure optimizer.",
    );
  }

  return parserSource
    .replace(originalDeclarations, replacementDeclarations)
    .replace(originalFailHelper, replacementFailHelper);
}

function optimizeGeneratedIdentifierScanning(parserSource: string): string {
  const identifierPattern =
    /  function peg\$parseIdentifier\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseIdentToken\(\)/;
  const identTokenPattern =
    /  function peg\$parseIdentToken\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseBoolLiteral\(\)/;
  const keywordReservedPattern =
    /  function peg\$parseKeywordReserved\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parse_\(\)/;
  const identifierReplacement = [
    "  function peg$parseIdentifier() {",
    "    const startPos = peg$currPos;",
    "    const name = peg$scanBplIdentToken();",
    "",
    "    if (name === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "    if (peg$bplReservedKeywords.has(name)) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    peg$savedPos = startPos;",
    "    return peg$f162(name);",
    "  }",
    "",
    "  function peg$parseIdentToken()",
  ].join("\n");
  const identTokenReplacement = [
    "  function peg$isBplIdentStartCode(code) {",
    "    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95;",
    "  }",
    "",
    "  function peg$isBplIdentPartCode(code) {",
    "    return peg$isBplIdentStartCode(code) || (code >= 48 && code <= 57);",
    "  }",
    "",
    "  function peg$scanBplIdentToken() {",
    "    const startPos = peg$currPos;",
    "    const firstCode = input.charCodeAt(peg$currPos);",
    "",
    "    if (!peg$isBplIdentStartCode(firstCode)) {",
    "      if (peg$silentFails === 0) { peg$fail(peg$e78); }",
    "      return peg$FAILED;",
    "    }",
    "",
    "    peg$currPos++;",
    "    while (peg$currPos < input.length && peg$isBplIdentPartCode(input.charCodeAt(peg$currPos))) {",
    "      peg$currPos++;",
    "    }",
    "    if (peg$silentFails === 0) { peg$fail(peg$e79); }",
    "",
    "    return input.substring(startPos, peg$currPos);",
    "  }",
    "",
    "  function peg$parseIdentToken() {",
    "    return peg$scanBplIdentToken();",
    "  }",
    "",
    "  function peg$parseBoolLiteral()",
  ].join("\n");
  const reservedKeywords = [
    "global",
    "local",
    "const",
    "type",
    "frame",
    "static",
    "ret",
    "struct",
    "enum",
    "spec",
    "Self",
    "import",
    "from",
    "as",
    "export",
    "extern",
    "asm",
    "loop",
    "if",
    "else",
    "break",
    "continue",
    "try",
    "catch",
    "return",
    "throw",
    "switch",
    "case",
    "default",
    "fallthrough",
    "cast",
    "sizeof",
    "typeof",
    "offsetof",
    "match",
    "is",
    "Func",
    "Lambda",
    "null",
    "nullptr",
    "true",
    "false",
  ];
  const keywordReservedReplacement = [
    `  const peg$bplReservedKeywords = new Set(${JSON.stringify(reservedKeywords)});`,
    "",
    "  function peg$parseKeywordReserved() {",
    "    const startPos = peg$currPos;",
    "    const firstCode = input.charCodeAt(startPos);",
    "",
    "    if (!peg$isBplIdentStartCode(firstCode)) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    let endPos = startPos + 1;",
    "    while (endPos < input.length && peg$isBplIdentPartCode(input.charCodeAt(endPos))) {",
    "      endPos++;",
    "    }",
    "",
    "    const word = input.substring(startPos, endPos);",
    "    if (!peg$bplReservedKeywords.has(word)) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    peg$currPos = endPos;",
    "    return [word, undefined];",
    "  }",
    "",
    "  function peg$parse_()",
  ].join("\n");

  if (
    !identifierPattern.test(parserSource) ||
    !identTokenPattern.test(parserSource) ||
    !keywordReservedPattern.test(parserSource)
  ) {
    throw new Error(
      "Generated Peggy parser identifier helper shape changed; update the BPL parser identifier optimizer.",
    );
  }

  return parserSource
    .replace(identifierPattern, identifierReplacement)
    .replace(identTokenPattern, identTokenReplacement)
    .replace(keywordReservedPattern, keywordReservedReplacement);
}

function optimizeGeneratedNumberScanning(parserSource: string): string {
  const numberTokenPattern =
    /  function peg\$parseNumberToken\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseParameterList\(\)/;
  const numberTokenReplacement = [
    "  function peg$isBplDigitCode(code) {",
    "    return code >= 48 && code <= 57;",
    "  }",
    "",
    "  function peg$isBplHexDigitCode(code) {",
    "    return peg$isBplDigitCode(code) || (code >= 65 && code <= 70) || (code >= 97 && code <= 102);",
    "  }",
    "",
    "  function peg$isBplNumberTriviaStartCode(code) {",
    "    return code === 32 || code === 9 || code === 10 || code === 13 || code === 35 || code === 47;",
    "  }",
    "",
    "  function peg$scanBplDecimalDigitTail(pos) {",
    "    while (pos < input.length) {",
    "      const code = input.charCodeAt(pos);",
    "      if (peg$isBplDigitCode(code)) {",
    "        pos++;",
    "        continue;",
    "      }",
    "      if (!peg$isBplNumberTriviaStartCode(code)) {",
    "        break;",
    "      }",
    "      const digitStartPos = pos;",
    "      peg$currPos = pos;",
    "      peg$parse_();",
    "      if (peg$isBplDigitCode(input.charCodeAt(peg$currPos))) {",
    "        peg$currPos++;",
    "        pos = peg$currPos;",
    "        continue;",
    "      }",
    "      peg$currPos = digitStartPos;",
    "      break;",
    "    }",
    "    peg$currPos = pos;",
    "    return pos;",
    "  }",
    "",
    "  function peg$scanBplDecimalNumber(startPos) {",
    "    let pos = peg$scanBplDecimalDigitTail(startPos + 1);",
    "    if (input.charCodeAt(pos) === 46 && peg$isBplDigitCode(input.charCodeAt(pos + 1))) {",
    "      pos = peg$scanBplDecimalDigitTail(pos + 2);",
    "    }",
    "    peg$currPos = pos;",
    "    return input.substring(startPos, peg$currPos);",
    "  }",
    "",
    "  function peg$scanBplPrefixedNumber(startPos, digitStartPos, isDigit, expected) {",
    "    let pos = digitStartPos;",
    "    if (!isDigit(input.charCodeAt(pos))) {",
    "      peg$currPos = digitStartPos;",
    "      if (peg$silentFails === 0) { peg$fail(expected); }",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "    pos++;",
    "    while (pos < input.length && isDigit(input.charCodeAt(pos))) {",
    "      pos++;",
    "    }",
    "    peg$currPos = pos;",
    "    return input.substring(startPos, peg$currPos);",
    "  }",
    "",
    "  function peg$scanBplNumberToken() {",
    "    const startPos = peg$currPos;",
    "    const firstCode = input.charCodeAt(peg$currPos);",
    "    if (!peg$isBplDigitCode(firstCode)) {",
    "      if (peg$silentFails === 0) { peg$fail(peg$e73); }",
    "      return peg$FAILED;",
    "    }",
    "",
    "    if (firstCode === 48) {",
    "      const secondCode = input.charCodeAt(peg$currPos + 1);",
    "      if (secondCode === 120 || secondCode === 88) {",
    "        const hex = peg$scanBplPrefixedNumber(startPos, startPos + 2, peg$isBplHexDigitCode, peg$e81);",
    "        if (hex !== peg$FAILED) return hex;",
    "      } else if (secondCode === 98 || secondCode === 66) {",
    "        const binary = peg$scanBplPrefixedNumber(startPos, startPos + 2, code => code === 48 || code === 49, peg$e83);",
    "        if (binary !== peg$FAILED) return binary;",
    "      } else if (secondCode === 111 || secondCode === 79) {",
    "        const octal = peg$scanBplPrefixedNumber(startPos, startPos + 2, code => code >= 48 && code <= 55, peg$e85);",
    "        if (octal !== peg$FAILED) return octal;",
    "      }",
    "    }",
    "",
    "    return peg$scanBplDecimalNumber(startPos);",
    "  }",
    "",
    "  function peg$parseNumberToken() {",
    "    return peg$scanBplNumberToken();",
    "  }",
    "",
    "  function peg$parseParameterList()",
  ].join("\n");

  if (!numberTokenPattern.test(parserSource)) {
    throw new Error(
      "Generated Peggy parser number token helper shape changed; update the BPL parser number scanner optimizer.",
    );
  }

  return parserSource.replace(numberTokenPattern, numberTokenReplacement);
}

function optimizeGeneratedStatementStartKeywordScanning(
  parserSource: string,
): string {
  const statementStartPattern =
    /  function peg\$parseStatementStartKeyword\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseExpressionStatement\(\)/;
  const statementStartReplacement = [
    "  function peg$isBplIdentifierContinuationCode(code) {",
    "    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95;",
    "  }",
    "",
    "  function peg$matchBplStatementStartKeyword(keyword) {",
    "    const startPos = peg$currPos;",
    "    if (!input.startsWith(keyword, startPos)) {",
    "      return peg$FAILED;",
    "    }",
    "    const endPos = startPos + keyword.length;",
    "    if (peg$isBplIdentifierContinuationCode(input.charCodeAt(endPos))) {",
    "      return peg$FAILED;",
    "    }",
    "    peg$currPos = endPos;",
    "    return undefined;",
    "  }",
    "",
    "  function peg$scanBplStatementStartKeyword() {",
    "    switch (input.charCodeAt(peg$currPos)) {",
    "      case 97:",
    '        return peg$matchBplStatementStartKeyword("asm");',
    "      case 98:",
    '        return peg$matchBplStatementStartKeyword("break");',
    "      case 99:",
    '        return peg$matchBplStatementStartKeyword("continue");',
    "      case 100:",
    '        return peg$matchBplStatementStartKeyword("defer");',
    "      case 101: {",
    '        const enumKeyword = peg$matchBplStatementStartKeyword("enum");',
    "        if (enumKeyword !== peg$FAILED) return enumKeyword;",
    '        const exportKeyword = peg$matchBplStatementStartKeyword("export");',
    "        if (exportKeyword !== peg$FAILED) return exportKeyword;",
    '        return peg$matchBplStatementStartKeyword("extern");',
    "      }",
    "      case 102: {",
    '        const frameKeyword = peg$matchBplStatementStartKeyword("frame");',
    "        if (frameKeyword !== peg$FAILED) return frameKeyword;",
    '        return peg$matchBplStatementStartKeyword("fallthrough");',
    "      }",
    "      case 103:",
    '        return peg$matchBplStatementStartKeyword("global");',
    "      case 105: {",
    '        const ifKeyword = peg$matchBplStatementStartKeyword("if");',
    "        if (ifKeyword !== peg$FAILED) return ifKeyword;",
    '        return peg$matchBplStatementStartKeyword("import");',
    "      }",
    "      case 108: {",
    '        const localKeyword = peg$matchBplStatementStartKeyword("local");',
    "        if (localKeyword !== peg$FAILED) return localKeyword;",
    '        return peg$matchBplStatementStartKeyword("loop");',
    "      }",
    "      case 114:",
    '        return peg$matchBplStatementStartKeyword("return");',
    "      case 115: {",
    '        const structKeyword = peg$matchBplStatementStartKeyword("struct");',
    "        if (structKeyword !== peg$FAILED) return structKeyword;",
    '        const specKeyword = peg$matchBplStatementStartKeyword("spec");',
    "        if (specKeyword !== peg$FAILED) return specKeyword;",
    '        return peg$matchBplStatementStartKeyword("switch");',
    "      }",
    "      case 116: {",
    '        const typeKeyword = peg$matchBplStatementStartKeyword("type");',
    "        if (typeKeyword !== peg$FAILED) return typeKeyword;",
    '        const tryKeyword = peg$matchBplStatementStartKeyword("try");',
    "        if (tryKeyword !== peg$FAILED) return tryKeyword;",
    '        return peg$matchBplStatementStartKeyword("throw");',
    "      }",
    "      default:",
    "        return peg$FAILED;",
    "    }",
    "  }",
    "",
    "  function peg$parseStatementStartKeyword() {",
    "    return peg$scanBplStatementStartKeyword();",
    "  }",
    "",
    "  function peg$parseExpressionStatement()",
  ].join("\n");

  if (!statementStartPattern.test(parserSource)) {
    throw new Error(
      "Generated Peggy parser statement-start keyword helper shape changed; update the BPL parser statement-start optimizer.",
    );
  }

  return parserSource.replace(statementStartPattern, statementStartReplacement);
}

function optimizeGeneratedAssignmentOperatorScanning(
  parserSource: string,
): string {
  const assignmentOperatorPattern =
    /  function peg\$parseAssignmentOperator\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseTernary\(\)/;
  const match = parserSource.match(assignmentOperatorPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser assignment-operator helper shape changed; update the BPL parser assignment-operator optimizer.",
    );
  }

  const helperBody = match[1]!;
  const actionName = helperBody.match(
    /peg\$savedPos = s0;\n\s+s1 = (peg\$f\d+)\(s1\);/,
  )?.[1];
  const expectedNames = [...helperBody.matchAll(/peg\$fail\((peg\$e\d+)\)/g)].map(
    ([, expectedName]) => expectedName,
  );

  if (!actionName || expectedNames.length !== 9) {
    throw new Error(
      "Generated Peggy parser assignment-operator action or expectations changed; update the BPL parser assignment-operator optimizer.",
    );
  }

  const failExpectationLines = expectedNames.map(
    expectedName => `    peg$fail(${expectedName});`,
  );
  const assignmentOperatorReplacement = [
    "  function peg$failBplAssignmentOperatorExpectation() {",
    "    if (peg$silentFails !== 0) {",
    "      return;",
    "    }",
    ...failExpectationLines,
    "  }",
    "",
    "  function peg$scanBplAssignmentOperator() {",
    "    const startPos = peg$currPos;",
    "",
    "    switch (input.charCodeAt(startPos)) {",
    "      case 43:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("+="); }`,
    "        break;",
    "      case 45:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("-="); }`,
    "        break;",
    "      case 42:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("*="); }`,
    "        break;",
    "      case 47:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("/="); }`,
    "        break;",
    "      case 37:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("%="); }`,
    "        break;",
    "      case 38:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("&="); }`,
    "        break;",
    "      case 124:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("|="); }`,
    "        break;",
    "      case 94:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; peg$savedPos = startPos; return ${actionName}("^="); }`,
    "        break;",
    "      case 61:",
    "        peg$currPos = startPos + 1;",
    "        peg$savedPos = startPos;",
    `        return ${actionName}("=");`,
    "    }",
    "",
    "    peg$failBplAssignmentOperatorExpectation();",
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$parseAssignmentOperator() {",
    "    return peg$scanBplAssignmentOperator();",
    "  }",
    "",
    "  function peg$parseTernary()",
  ].join("\n");

  return parserSource.replace(
    assignmentOperatorPattern,
    assignmentOperatorReplacement,
  );
}

type GeneratedOperatorScanBranch = {
  op: string;
  nextCode?: number;
  rejectNextCode?: number;
};

type GeneratedOperatorScanConfig = {
  name: string;
  nextParserName: string;
  cases: {
    code: number;
    branches: GeneratedOperatorScanBranch[];
  }[];
};

const EXPRESSION_OPERATOR_SCAN_CONFIGS: GeneratedOperatorScanConfig[] = [
  {
    name: "LogicalOrOperator",
    nextParserName: "LogicalAnd",
    cases: [{ code: 124, branches: [{ op: "||", nextCode: 124 }] }],
  },
  {
    name: "LogicalAndOperator",
    nextParserName: "BitwiseOr",
    cases: [{ code: 38, branches: [{ op: "&&", nextCode: 38 }] }],
  },
  {
    name: "BitwiseOrOperator",
    nextParserName: "BitwiseXor",
    cases: [{ code: 124, branches: [{ op: "|", rejectNextCode: 124 }] }],
  },
  {
    name: "BitwiseXorOperator",
    nextParserName: "BitwiseAnd",
    cases: [{ code: 94, branches: [{ op: "^" }] }],
  },
  {
    name: "BitwiseAndOperator",
    nextParserName: "Equality",
    cases: [{ code: 38, branches: [{ op: "&", rejectNextCode: 38 }] }],
  },
  {
    name: "EqualityOperator",
    nextParserName: "TypeCheck",
    cases: [
      { code: 61, branches: [{ op: "==", nextCode: 61 }] },
      { code: 33, branches: [{ op: "!=", nextCode: 61 }] },
    ],
  },
  {
    name: "RelationalOperator",
    nextParserName: "Shift",
    cases: [
      { code: 62, branches: [{ op: ">=", nextCode: 61 }, { op: ">" }] },
      { code: 60, branches: [{ op: "<=", nextCode: 61 }, { op: "<" }] },
    ],
  },
  {
    name: "ShiftOperator",
    nextParserName: "Additive",
    cases: [
      { code: 60, branches: [{ op: "<<", nextCode: 60 }] },
      { code: 62, branches: [{ op: ">>", nextCode: 62 }] },
    ],
  },
  {
    name: "AdditiveOperator",
    nextParserName: "Multiplicative",
    cases: [
      { code: 43, branches: [{ op: "+" }] },
      { code: 45, branches: [{ op: "-" }] },
    ],
  },
  {
    name: "MultiplicativeOperator",
    nextParserName: "Unary",
    cases: [
      { code: 42, branches: [{ op: "*" }] },
      { code: 47, branches: [{ op: "/" }] },
      { code: 37, branches: [{ op: "%" }] },
    ],
  },
  {
    name: "UnaryOperator",
    nextParserName: "Postfix",
    cases: [
      { code: 43, branches: [{ op: "++", nextCode: 43 }, { op: "+" }] },
      { code: 45, branches: [{ op: "--", nextCode: 45 }, { op: "-" }] },
      { code: 33, branches: [{ op: "!" }] },
      { code: 126, branches: [{ op: "~" }] },
      { code: 42, branches: [{ op: "*" }] },
      { code: 38, branches: [{ op: "&" }] },
    ],
  },
];

function optimizeGeneratedExpressionOperatorScanning(
  parserSource: string,
): string {
  let optimized = parserSource;
  for (const config of EXPRESSION_OPERATOR_SCAN_CONFIGS) {
    optimized = optimizeGeneratedExpressionOperatorScanningForConfig(
      optimized,
      config,
    );
  }
  return optimized;
}

function optimizeGeneratedExpressionOperatorScanningForConfig(
  parserSource: string,
  config: GeneratedOperatorScanConfig,
): string {
  const operatorPattern = new RegExp(
    `  function peg\\$parse${config.name}\\(\\) \\{([\\s\\S]*?)\\n  \\}\\n\\n(?=  function peg\\$parse${config.nextParserName}\\()`,
  );
  const match = parserSource.match(operatorPattern);
  if (!match) {
    throw new Error(
      `Generated Peggy parser ${config.name} helper shape changed; update the BPL parser expression-operator optimizer.`,
    );
  }

  const helperBody = match[1]!;
  const actionName = helperBody.match(
    /peg\$savedPos = s0;\n\s+s\d+ = (peg\$f\d+)\(s\d+\);/,
  )?.[1];
  const expectedNames = Array.from(
    new Set(
      [...helperBody.matchAll(/peg\$fail\((peg\$e\d+)\)/g)].map(
        ([, expectedName]) => expectedName,
      ),
    ),
  );

  if (!actionName || expectedNames.length === 0) {
    throw new Error(
      `Generated Peggy parser ${config.name} action or expectations changed; update the BPL parser expression-operator optimizer.`,
    );
  }

  const failExpectationLines = expectedNames.map(
    expectedName => `    peg$fail(${expectedName});`,
  );
  const scannerLines = config.cases.flatMap(({ code, branches }) => [
    `      case ${code}:`,
    ...branches.map(branch =>
      buildGeneratedOperatorScannerBranchLine(branch, actionName),
    ),
    "        break;",
  ]);

  const replacement = [
    `  function peg$failBpl${config.name}Expectation() {`,
    "    if (peg$silentFails !== 0) {",
    "      return;",
    "    }",
    ...failExpectationLines,
    "  }",
    "",
    `  function peg$scanBpl${config.name}() {`,
    "    const startPos = peg$currPos;",
    "",
    "    switch (input.charCodeAt(startPos)) {",
    ...scannerLines,
    "    }",
    "",
    `    peg$failBpl${config.name}Expectation();`,
    "    return peg$FAILED;",
    "  }",
    "",
    `  function peg$parse${config.name}() {`,
    `    return peg$scanBpl${config.name}();`,
    "  }",
    "",
  ].join("\n");

  return parserSource.replace(operatorPattern, replacement);
}

function buildGeneratedOperatorScannerBranchLine(
  branch: GeneratedOperatorScanBranch,
  actionName: string,
): string {
  const endPos = `startPos + ${branch.op.length}`;
  const success = `peg$currPos = ${endPos}; peg$savedPos = startPos; return ${actionName}(${JSON.stringify(branch.op)});`;

  if (branch.nextCode !== undefined) {
    return `        if (input.charCodeAt(startPos + 1) === ${branch.nextCode}) { ${success} }`;
  }

  if (branch.rejectNextCode !== undefined) {
    return `        if (input.charCodeAt(startPos + 1) !== ${branch.rejectNextCode}) { ${success} }`;
  }

  return `        { ${success} }`;
}

function optimizeGeneratedTriviaSkipping(parserSource: string): string {
  const original = [
    "  function peg$parse_() {",
    "    let s0, s1;",
    "",
    "    s0 = [];",
    "    s1 = peg$parseWhitespace();",
    "    if (s1 === peg$FAILED) {",
    "      s1 = peg$parseComment();",
    "    }",
    "    while (s1 !== peg$FAILED) {",
    "      s0.push(s1);",
    "      s1 = peg$parseWhitespace();",
    "      if (s1 === peg$FAILED) {",
    "        s1 = peg$parseComment();",
    "      }",
    "    }",
    "",
    "    return s0;",
    "  }",
  ].join("\n");
  const replacement = [
    "  const peg$emptyTrivia = [];",
    "",
    "  function peg$parse_() {",
    "    while (peg$currPos < input.length) {",
    "      const currentCode = input.charCodeAt(peg$currPos);",
    "",
    "      if (currentCode === 32 || currentCode === 9 || currentCode === 10 || currentCode === 13) {",
    "        peg$currPos++;",
    "        while (peg$currPos < input.length) {",
    "          const code = input.charCodeAt(peg$currPos);",
    "          if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;",
    "          peg$currPos++;",
    "        }",
    "        continue;",
    "      }",
    "",
    "      if (currentCode === 35) {",
    "        const commentStart = peg$currPos++;",
    "        while (peg$currPos < input.length) {",
    "          const code = input.charCodeAt(peg$currPos);",
    "          if (code === 10 || code === 13) break;",
    "          peg$currPos++;",
    "        }",
    "        peg$pushCommentToken(commentStart, peg$currPos);",
    "        continue;",
    "      }",
    "",
    "      if (currentCode === 47 && input.charCodeAt(peg$currPos + 1) === 35) {",
    "        const commentStart = peg$currPos;",
    "        const commentEnd = peg$scanBplBlockCommentEnd(peg$currPos);",
    "        if (commentEnd === peg$FAILED) break;",
    "        peg$currPos = commentEnd;",
    "        peg$pushCommentToken(commentStart, peg$currPos);",
    "        continue;",
    "      }",
    "",
    "      break;",
    "    }",
    "",
    "    return peg$emptyTrivia;",
    "  }",
    "",
    "  function peg$scanBplBlockCommentEnd(startPos) {",
    "    let pos = startPos + 2;",
    "    let depth = 1;",
    "",
    "    while (pos < input.length) {",
    "      const code = input.charCodeAt(pos);",
    "      if (code === 47 && input.charCodeAt(pos + 1) === 35) {",
    "        depth++;",
    "        pos += 2;",
    "        continue;",
    "      }",
    "      if (code === 35 && input.charCodeAt(pos + 1) === 47) {",
    "        depth--;",
    "        pos += 2;",
    "        if (depth === 0) return pos;",
    "        continue;",
    "      }",
    "      pos++;",
    "    }",
    "",
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$pushCommentToken(startPos, endPos) {",
    "    if (!(options && options.comments)) return;",
    "",
    "    const loc = peg$computeBplLocation(startPos, endPos);",
    "    options.comments.push({",
    '      type: "Comment",',
    "      lexeme: input.substring(startPos, endPos),",
    "      literal: null,",
    "      line: loc.startLine,",
    "      column: loc.startColumn,",
    "      file: parserFilePath,",
    "    });",
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser trivia helper shape changed; update the BPL parser trivia optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function main(): void {
  const grammarSource = readFileSync(grammarPath, "utf8");
  const parserSource = generateBplParserSource(grammarSource);

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, parserSource);
  console.log(`Generated ${outputPath}`);
}

if (import.meta.main) {
  main();
}
