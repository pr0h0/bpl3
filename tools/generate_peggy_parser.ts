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
const declarationOutputPath = join(
  repoRoot,
  "compiler",
  "frontend",
  "generated",
  "BplParser.d.ts",
);

const generatedParserDeclaration = [
  "export const StartRules: string[];",
  "export class SyntaxError extends globalThis.SyntaxError {",
  "  expected: unknown[];",
  "  found: unknown;",
  "  location: unknown;",
  "  format(sources: unknown[]): string;",
  "}",
  "export function parse(input: string, options?: Record<string, unknown>): unknown;",
  "",
].join("\n");

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

  let optimized = optimizeGeneratedMakeLoc(withBplLocation);
  optimized = optimizeGeneratedLiteralMatches(optimized);
  optimized = optimizeGeneratedFailureTracking(optimized);
  optimized = optimizeGeneratedLiteralExpectationInitialization(optimized);
  optimized = optimizeGeneratedIdentifierScanning(optimized);
  optimized = optimizeGeneratedIdentifierExpressionAction(optimized);
  optimized = optimizeGeneratedBoolLiteralFailureGuard(optimized);
  optimized = optimizeGeneratedIdBoundary(optimized);
  optimized = optimizeGeneratedQualifiedIdentifierScanning(optimized);
  optimized = optimizeGeneratedBasicTypeParsing(optimized);
  optimized = optimizeGeneratedPostfixTailScanning(optimized);
  optimized = optimizeGeneratedPostfixParsing(optimized);
  optimized = optimizeGeneratedStructLiteralSuccessCaching(optimized);
  optimized = optimizeGeneratedExpressionOperatorScanning(optimized);
  optimized = optimizeGeneratedBinaryExpressionTailParsing(optimized);
  optimized = optimizeGeneratedRelationalActualTailGuard(optimized);
  optimized = optimizeGeneratedBitwiseOrPostTriviaGuard(optimized);
  optimized = optimizeGeneratedLogicalAndPostTriviaGuard(optimized);
  optimized = optimizeGeneratedMultiplicativePostTriviaGuard(optimized);
  optimized = optimizeGeneratedAdditiveOperatorTokens(optimized);
  optimized = optimizeGeneratedRelationalOperatorTokens(optimized);
  optimized = optimizeGeneratedTypeCheckTailParsing(optimized);
  optimized = optimizeGeneratedAssignmentParsing(optimized);
  optimized = optimizeGeneratedAssignmentOperatorScanning(optimized);
  optimized = optimizeGeneratedTernaryParsing(optimized);
  optimized = optimizeGeneratedStatementStartKeywordScanning(optimized);
  optimized = optimizeGeneratedStatementDispatch(optimized);
  optimized = optimizeGeneratedProgramRecoveryGuard(optimized);
  optimized = optimizeGeneratedFunctionDeclarationFailureGuard(optimized);
  optimized = optimizeGeneratedImportStatementFailureGuard(optimized);
  optimized = optimizeGeneratedSwitchStatementFailureGuard(optimized);
  optimized = optimizeGeneratedTryStatementFailureGuard(optimized);
  optimized = optimizeGeneratedSpecDeclarationFailureGuard(optimized);
  optimized = optimizeGeneratedEnumDeclarationFailureGuard(optimized);
  optimized = optimizeGeneratedVariableScopeKeywordScanning(optimized);
  optimized = optimizeGeneratedNumberScanning(optimized);
  optimized = optimizeGeneratedStringLiteralScanning(optimized);
  optimized = optimizeGeneratedInterpolatedStringRunScanning(optimized);
  optimized = optimizeGeneratedTriviaSkipping(optimized);
  return optimizeGeneratedInlineFailureDispatch(optimized);
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
    "  const peg$bplInputLength = input.length;",
    "",
    "  const peg$bplLineStarts = [0];",
    '  let peg$bplLinePos = input.indexOf("\\n");',
    "  while (peg$bplLinePos !== -1) {",
    "    peg$bplLineStarts.push(peg$bplLinePos + 1);",
    '    peg$bplLinePos = input.indexOf("\\n", peg$bplLinePos + 1);',
    "  }",
    "",
    "  let peg$lastBplLineIndex = 0;",
    "  let peg$lastBplLinePos = 0;",
    "",
    "  function peg$findBplLineIndex(pos) {",
    "    if (pos >= peg$bplLineStarts[peg$lastBplLineIndex] &&",
    "      (peg$lastBplLineIndex + 1 === peg$bplLineStarts.length || pos < peg$bplLineStarts[peg$lastBplLineIndex + 1])) {",
    "      peg$lastBplLinePos = pos;",
    "      return peg$lastBplLineIndex;",
    "    }",
    "",
    "    if (pos >= peg$bplLineStarts[peg$lastBplLineIndex]) {",
    "      while (",
    "        peg$lastBplLineIndex + 1 < peg$bplLineStarts.length &&",
    "        pos >= peg$bplLineStarts[peg$lastBplLineIndex + 1]",
    "      ) {",
    "        peg$lastBplLineIndex++;",
    "      }",
    "      peg$lastBplLinePos = pos;",
    "      return peg$lastBplLineIndex;",
    "    }",
    "",
    "    const backwardLineLimit = peg$lastBplLineIndex > 8",
    "      ? peg$lastBplLineIndex - 8",
    "      : 0;",
    "    while (",
    "      peg$lastBplLineIndex > backwardLineLimit &&",
    "      pos < peg$bplLineStarts[peg$lastBplLineIndex]",
    "    ) {",
    "      peg$lastBplLineIndex--;",
    "    }",
    "    if (pos >= peg$bplLineStarts[peg$lastBplLineIndex]) {",
    "      peg$lastBplLinePos = pos;",
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
    "    peg$lastBplLinePos = pos;",
    "    return high;",
    "  }",
    "",
    "  function peg$computeBplLocation(startPos, endPos) {",
    "    const startLineIndex = peg$findBplLineIndex(startPos);",
    "    const startLineStart = peg$bplLineStarts[startLineIndex];",
    "    const nextLineStart = peg$bplLineStarts[startLineIndex + 1];",
    "    // Successful source ranges satisfy endPos >= startPos >= startLineStart.",
    "    const endLineIndex = nextLineStart === undefined || endPos < nextLineStart",
    "      ? startLineIndex",
    "      : peg$findBplLineIndex(endPos);",
    "    const endLineStart = endLineIndex === startLineIndex",
    "      ? startLineStart",
    "      : peg$bplLineStarts[endLineIndex];",
    "",
    "    return {",
    "      file: parserFilePath,",
    "      startLine: startLineIndex + 1,",
    "      startColumn: startPos - startLineStart + 1,",
    "      endLine: endLineIndex + 1,",
    "      endColumn: endPos - endLineStart + 1,",
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
    "    if (!peg$collectExpected) { return; }",
    "",
    "    if (peg$currPos < peg$maxFailPos) { return; }",
    "",
    "    if (peg$currPos > peg$maxFailPos) {",
    "      peg$maxFailPos = peg$currPos;",
    "      if (peg$collectExpected) {",
    "        peg$maxFailExpected = [];",
    "      }",
    "    }",
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

function optimizeGeneratedLiteralExpectationInitialization(
  parserSource: string,
): string {
  const original = [
    "  function peg$literalExpectation(text, ignoreCase) {",
    '    return { type: "literal", text, ignoreCase };',
    "  }",
  ].join("\n");
  const replacement = [
    "  function peg$literalExpectation(text, ignoreCase) {",
    "    if (options.bplCollectExpected === false) return undefined;",
    '    return { type: "literal", text, ignoreCase };',
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser literal expectation helper shape changed; update the BPL parser literal expectation optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedInlineFailureDispatch(parserSource: string): string {
  const unguardedFailurePattern =
    /if \(peg\$silentFails === 0\) \{ peg\$fail\((peg\$e\d+)\); }/g;
  const optimized = parserSource.replace(
    unguardedFailurePattern,
    "if (peg$collectExpected && peg$silentFails === 0) { peg$fail($1); }",
  );

  if (
    optimized === parserSource ||
    optimized.match(unguardedFailurePattern) !== null
  ) {
    throw new Error(
      "Generated Peggy parser inline failure shape changed; update the BPL parser inline failure optimizer.",
    );
  }

  return optimized;
}

function optimizeGeneratedIdentifierScanning(parserSource: string): string {
  const identifierPattern =
    /  function peg\$parseIdentifier\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseIdentToken\(\)/;
  const identTokenPattern =
    /  function peg\$parseIdentToken\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseBoolLiteral\(\)/;
  const keywordReservedPattern =
    /  function peg\$parseKeywordReserved\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parse_\(\)/;
  const identifierReplacement = [
    "  let peg$bplLastIdentifierStart = -1;",
    "  let peg$bplLastIdentifierEnd = -1;",
    '  let peg$bplLastIdentifierValue = "";',
    "  let peg$bplLastIdentifierFailure = -1;",
    "",
    "  function peg$parseIdentifier() {",
    "    const startPos = peg$currPos;",
    "    if (startPos === peg$bplLastIdentifierStart) {",
    "      peg$currPos = peg$bplLastIdentifierEnd;",
    "      if (peg$collectExpected && peg$silentFails === 0) { peg$fail(peg$e79); }",
    "      return peg$bplLastIdentifierValue;",
    "    }",
    "",
    "    if (startPos === peg$bplLastIdentifierFailure && !peg$collectExpected) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    const firstCode = input.charCodeAt(startPos);",
    "",
    "    if (!((firstCode >= 65 && firstCode <= 90) || (firstCode >= 97 && firstCode <= 122) || firstCode === 95)) {",
    "      peg$bplLastIdentifierFailure = startPos;",
    "      if (peg$silentFails === 0) { peg$fail(peg$e78); }",
    "      return peg$FAILED;",
    "    }",
    "",
    "    let endPos = startPos + 1;",
    "    while (endPos < peg$bplInputLength) {",
    "      const code = input.charCodeAt(endPos);",
    "      if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || (code >= 48 && code <= 57))) {",
    "        break;",
    "      }",
    "      endPos++;",
    "    }",
    "    peg$currPos = endPos;",
    "    if (peg$collectExpected && peg$silentFails === 0) { peg$fail(peg$e79); }",
    "",
    "    if (",
    "      peg$isBplReservedKeywordStartCode(firstCode) &&",
    "      peg$isBplReservedKeywordRange(startPos, endPos)",
    "    ) {",
    "      peg$currPos = startPos;",
    "      peg$bplLastIdentifierFailure = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    const value = input.slice(startPos, endPos);",
    "    peg$bplLastIdentifierStart = startPos;",
    "    peg$bplLastIdentifierEnd = endPos;",
    "    peg$bplLastIdentifierValue = value;",
    "    return value;",
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
    "    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || (code >= 48 && code <= 57);",
    "  }",
    "",
    "  function peg$scanBplIdentTokenEnd(firstCode) {",
    "    let pos = peg$currPos;",
    "",
    "    if (!((firstCode >= 65 && firstCode <= 90) || (firstCode >= 97 && firstCode <= 122) || firstCode === 95)) {",
    "      if (peg$silentFails === 0) { peg$fail(peg$e78); }",
    "      return peg$FAILED;",
    "    }",
    "",
    "    pos++;",
    "    while (pos < peg$bplInputLength) {",
    "      const code = input.charCodeAt(pos);",
    "      if (!((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95 || (code >= 48 && code <= 57))) {",
    "        break;",
    "      }",
    "      pos++;",
    "    }",
    "    peg$currPos = pos;",
    "    if (peg$collectExpected && peg$silentFails === 0) { peg$fail(peg$e79); }",
    "",
    "    return pos;",
    "  }",
    "",
    "  function peg$scanBplIdentToken() {",
    "    const startPos = peg$currPos;",
    "    const firstCode = input.charCodeAt(startPos);",
    "    const endPos = peg$scanBplIdentTokenEnd(firstCode);",
    "    if (endPos === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "    return input.slice(startPos, endPos);",
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
    ...buildReservedKeywordRangeHelper(reservedKeywords),
    "",
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

function optimizeGeneratedIdentifierExpressionAction(
  parserSource: string,
): string {
  const identifierExprPattern =
    /  function peg\$parseIdentifierExpr\(\) \{([\s\S]*?)\n  \}\n\n(?=  let peg\$bplLastIdentifierStart)/;
  const match = parserSource.match(identifierExprPattern);
  const actionName = match?.[1]?.match(/s1 = (peg\$f\d+)\(s1\);/)?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser IdentifierExpr helper shape changed; update the BPL parser identifier-expression optimizer.",
    );
  }

  const expectedFragments = [
    "s0 = peg$currPos;",
    "s1 = peg$parseIdentifier();",
    "peg$savedPos = s0;",
    `s1 = ${actionName}(s1);`,
    "return s0;",
  ];
  if (!expectedFragments.every((fragment) => match[1]!.includes(fragment))) {
    throw new Error(
      "Generated Peggy parser IdentifierExpr action shape changed; update the BPL parser identifier-expression optimizer.",
    );
  }

  const escapedActionName = actionName.replace(/\$/g, "\\$");
  const actionPattern = new RegExp(
    `  function ${escapedActionName}\\(id\\) \\{\\s+return identifier\\(id, location\\(\\)\\);\\s+\\}\\n`,
  );
  if (!actionPattern.test(parserSource)) {
    throw new Error(
      "Generated Peggy parser IdentifierExpr action definition changed; update the BPL parser identifier-expression optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseIdentifierExpr() {",
    "    const startPos = peg$currPos;",
    "    const name = peg$parseIdentifier();",
    "    if (name === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    return identifier(name, peg$computeBplLocation(startPos, peg$currPos));",
    "  }",
    "",
    "",
  ].join("\n");

  return parserSource
    .replace(actionPattern, "")
    .replace(identifierExprPattern, replacement);
}

function optimizeGeneratedIdBoundary(parserSource: string): string {
  const original = [
    "  function peg$parseIdBoundary() {",
    "    let s0, s1;",
    "",
    "    s0 = peg$currPos;",
    "    peg$silentFails++;",
    "    s1 = input.charAt(peg$currPos);",
    "    if (peg$r12.test(s1)) {",
    "      peg$currPos++;",
    "    } else {",
    "      s1 = peg$FAILED;",
    "      if (peg$silentFails === 0) { peg$fail(peg$e79); }",
    "    }",
    "    peg$silentFails--;",
    "    if (s1 === peg$FAILED) {",
    "      s0 = undefined;",
    "    } else {",
    "      peg$currPos = s0;",
    "      s0 = peg$FAILED;",
    "    }",
    "",
    "    return s0;",
    "  }",
  ].join("\n");
  const replacement = [
    "  function peg$parseIdBoundary() {",
    "    const code = input.charCodeAt(peg$currPos);",
    "    if (",
    "      code === 95 ||",
    "      (code >= 48 && code <= 57) ||",
    "      (code >= 65 && code <= 90) ||",
    "      (code >= 97 && code <= 122)",
    "    ) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    return undefined;",
    "  }",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser IdBoundary shape changed; update the BPL parser boundary optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedQualifiedIdentifierScanning(
  parserSource: string,
): string {
  const qualifiedIdentifierPattern =
    /  function peg\$parseQualifiedIdentifier\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseArraySuffix\(\)/;
  const match = parserSource.match(qualifiedIdentifierPattern);
  const dotExpectationName = match?.[1]?.match(/peg\$fail\((peg\$e\d+)\)/)?.[1];

  if (!match || dotExpectationName === undefined) {
    throw new Error(
      "Generated Peggy parser qualified identifier helper shape changed; update the BPL parser qualified identifier optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseQualifiedIdentifier() {",
    "    const startPos = peg$currPos;",
    "    const head = peg$scanBplIdentToken();",
    "",
    "    if (head === peg$FAILED) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    let qualifiedName = head;",
    "    while (true) {",
    "      const tailStartPos = peg$currPos;",
    "      peg$parse_();",
    "      if (input.charCodeAt(peg$currPos) !== 46) {",
    `        if (peg$silentFails === 0) { peg$fail(${dotExpectationName}); }`,
    "        peg$currPos = tailStartPos;",
    "        break;",
    "      }",
    "",
    "      peg$currPos++;",
    "      peg$parse_();",
    "      const tailPart = peg$scanBplIdentToken();",
    "      if (tailPart === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        break;",
    "      }",
    "",
    '      qualifiedName += "." + tailPart;',
    "    }",
    "",
    "    return qualifiedName;",
    "  }",
    "",
    "  function peg$parseArraySuffix()",
  ].join("\n");

  return parserSource.replace(qualifiedIdentifierPattern, replacement);
}

function optimizeGeneratedBasicTypeParsing(parserSource: string): string {
  const basicTypePattern =
    /  function peg\$parseBasicType\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseSelfKeyword\(\)/;
  const match = parserSource.match(basicTypePattern);
  const actionName = match?.[1]?.match(
    /s0 = (peg\$f\d+)\(s1, s2, s3, s4\);/,
  )?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser BasicType helper shape changed; update the BPL parser basic-type optimizer.",
    );
  }

  const expectedFragments = [
    "s1 = peg$parsePointerPrefix();",
    "s2 = peg$parseSelfKeyword();",
    "s2 = peg$parseQualifiedIdentifier();",
    "s3 = peg$parseGenericArgs();",
    "s4 = [];",
    "s5 = peg$parseArraySuffix();",
    "s4.push(s5);",
  ];
  if (!expectedFragments.every(fragment => match[1]!.includes(fragment))) {
    throw new Error(
      "Generated Peggy parser BasicType suffix shape changed; update the BPL parser basic-type optimizer.",
    );
  }

  const actionDefinition = [
    `  function ${actionName}(ptrs, name, gen, arr) {`,
    "    const pointerDepth = ptrs ? ptrs.length : 0;",
    "    const genericArgs = gen ? gen : [];",
    "    const arrayDimensions = arr.length ? arr.map(a => a) : [];",
    "    return basicType(name, genericArgs, pointerDepth, arrayDimensions, location());",
    "  }",
  ].join("\n");
  if (!parserSource.includes(actionDefinition)) {
    throw new Error(
      "Generated Peggy parser BasicType action shape changed; update the BPL parser basic-type optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseBasicType() {",
    "    const startPos = peg$currPos;",
    "    const pointerPrefix =",
    "      !peg$collectExpected && input.charCodeAt(startPos) !== 42",
    "        ? peg$FAILED",
    "        : peg$parsePointerPrefix();",
    "    const pointerDepth = pointerPrefix === peg$FAILED ? 0 : pointerPrefix.length;",
    "",
    "    let name = peg$parseSelfKeyword();",
    "    if (name === peg$FAILED) {",
    "      name = peg$parseQualifiedIdentifier();",
    "    }",
    "    if (name === peg$FAILED) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    let genericArgs =",
    "      !peg$collectExpected && input.charCodeAt(peg$currPos) !== 60",
    "        ? peg$FAILED",
    "        : peg$parseGenericArgs();",
    "    const firstArraySuffix =",
    "      !peg$collectExpected && input.charCodeAt(peg$currPos) !== 91",
    "        ? peg$FAILED",
    "        : peg$parseArraySuffix();",
    "    if (genericArgs === peg$FAILED && firstArraySuffix === peg$FAILED) {",
    "      peg$savedPos = startPos;",
    "      return basicType(name, [], pointerDepth, [], location());",
    "    }",
    "",
    "    if (genericArgs === peg$FAILED) {",
    "      genericArgs = [];",
    "    }",
    "    const arrayDimensions = [];",
    "    if (firstArraySuffix !== peg$FAILED) {",
    "      arrayDimensions.push(firstArraySuffix);",
    "      let arraySuffix = peg$parseArraySuffix();",
    "      while (arraySuffix !== peg$FAILED) {",
    "        arrayDimensions.push(arraySuffix);",
    "        arraySuffix = peg$parseArraySuffix();",
    "      }",
    "    }",
    "",
    "    peg$savedPos = startPos;",
    "    return basicType(name, genericArgs, pointerDepth, arrayDimensions, location());",
    "  }",
    "",
    "  function peg$parseSelfKeyword()",
  ].join("\n");

  return parserSource.replace(basicTypePattern, replacement);
}

function buildReservedKeywordRangeHelper(reservedKeywords: string[]): string[] {
  const firstCodes = [
    ...new Set(reservedKeywords.map((keyword) => keyword.charCodeAt(0))),
  ].sort((a, b) => a - b);
  const byLength = new Map<number, Map<number, string[]>>();
  for (const keyword of reservedKeywords) {
    const firstCode = keyword.charCodeAt(0);
    let byFirstCode = byLength.get(keyword.length);
    if (!byFirstCode) {
      byFirstCode = new Map();
      byLength.set(keyword.length, byFirstCode);
    }
    const bucket = byFirstCode.get(firstCode) ?? [];
    bucket.push(keyword);
    byFirstCode.set(firstCode, bucket);
  }

  const lines = [
    "  function peg$isBplReservedKeywordStartCode(code) {",
    "    switch (code) {",
    ...firstCodes.flatMap((code) => [
      `      case ${code}:`,
      "        return true;",
    ]),
    "      default:",
    "        return false;",
    "    }",
    "  }",
    "",
    "  function peg$isBplReservedKeywordRange(startPos, endPos) {",
    "    switch (endPos - startPos) {",
  ];
  for (const [length, byFirstCode] of [...byLength.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    lines.push(`      case ${length}:`);
    lines.push("        switch (input.charCodeAt(startPos)) {");
    for (const [firstCode, keywords] of [...byFirstCode.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      const checks = keywords
        .sort()
        .map((keyword) =>
          keyword
            .split("")
            .slice(1)
            .map(
              (char, index) =>
                `input.charCodeAt(startPos + ${index + 1}) === ${char.charCodeAt(0)}`,
            )
            .join(" && "),
        );
      lines.push(`          case ${firstCode}:`);
      lines.push(`            return ${checks.join(" || ")};`);
    }
    lines.push("        }");
    lines.push("        return false;");
  }
  lines.push("      default:");
  lines.push("        return false;");
  lines.push("    }");
  lines.push("  }");
  return lines;
}

function optimizeGeneratedPostfixTailScanning(parserSource: string): string {
  const postfixTailPattern =
    /  function peg\$parsePostfixTail\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parsePostfixTailAfterTrivia\(\)/;
  const match = parserSource.match(postfixTailPattern);
  const actionName = match?.[1]?.match(/s0 = (peg\$f\d+)\(s2\);/)?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser postfix-tail helper shape changed; update the BPL parser postfix-tail optimizer.",
    );
  }

  const actionDefinition = [
    `  function ${actionName}(tail) {`,
    "    tail.startPos = peg$savedPos;",
    "    tail.endPos = offset();",
    "    return tail;",
    "  }",
    "",
  ].join("\n");
  if (!parserSource.includes(actionDefinition)) {
    throw new Error(
      "Generated Peggy parser postfix-tail action shape changed; update the BPL parser postfix-tail optimizer.",
    );
  }

  const replacement = [
    "  function peg$parsePostfixTail() {",
    "    let s0, s2;",
    "",
    "    s0 = peg$currPos;",
    "    peg$parse_();",
    "    const nextCode = input.charCodeAt(peg$currPos);",
    "    switch (nextCode) {",
    "      case 60:",
    "      case 40:",
    "      case 91:",
    "      case 46:",
    "        break;",
    "      case 43:",
    "        if (input.charCodeAt(peg$currPos + 1) === 43) break;",
    "        peg$currPos = s0;",
    "        return peg$FAILED;",
    "      case 45:",
    "        if (input.charCodeAt(peg$currPos + 1) === 45) break;",
    "        peg$currPos = s0;",
    "        return peg$FAILED;",
    "      default:",
    "        peg$currPos = s0;",
    "        return peg$FAILED;",
    "    }",
    "    s2 = peg$parsePostfixTailAfterTrivia();",
    "    if (s2 !== peg$FAILED) {",
    "      s2.startPos = s0;",
    "      s2.endPos = peg$currPos;",
    "      return s2;",
    "    }",
    "",
    "    peg$currPos = s0;",
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$parsePostfixTailAfterTrivia()",
  ].join("\n");

  return parserSource
    .replace(actionDefinition, "")
    .replace(postfixTailPattern, replacement);
}

function optimizeGeneratedPostfixParsing(parserSource: string): string {
  const postfixPattern =
    /  function peg\$parsePostfix\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parsePostfixTail\(\)/;
  const match = parserSource.match(postfixPattern);
  const actionName = match?.[1]?.match(/s0 = (peg\$f\d+)\(s1, s2\);/)?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser postfix helper shape changed; update the BPL parser postfix optimizer.",
    );
  }

  const expectedFragments = [
    "s1 = peg$parsePrimary();",
    "s2 = [];",
    "s3 = peg$parsePostfixTail();",
    "s2.push(s3);",
  ];
  if (!expectedFragments.every((fragment) => match[1]!.includes(fragment))) {
    throw new Error(
      "Generated Peggy parser postfix tail loop changed; update the BPL parser postfix optimizer.",
    );
  }

  const replacement = [
    "  function peg$parsePostfix() {",
    "    const startPos = peg$currPos;",
    "    const primary = peg$parsePrimary();",
    "    if (primary === peg$FAILED) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    const directMemberStartPos = peg$currPos;",
    "    if (",
    "      !peg$collectExpected &&",
    "      !peg$hasBplCommentMarker &&",
    "      input.charCodeAt(directMemberStartPos) === 46",
    "    ) {",
    "      peg$currPos++;",
    "      peg$parse_();",
    "      const directMemberProperty = peg$parseIdentifier();",
    "      if (directMemberProperty !== peg$FAILED) {",
    "        const directMemberEndPos = peg$currPos;",
    "        let directMemberLookaheadPos = directMemberEndPos;",
    "        while (directMemberLookaheadPos < peg$bplInputLength) {",
    "          const code = input.charCodeAt(directMemberLookaheadPos);",
    "          if (code !== 32 && code !== 9 && code !== 10 && code !== 13) break;",
    "          directMemberLookaheadPos++;",
    "        }",
    "        if (input.charCodeAt(directMemberLookaheadPos) !== 123) {",
    "          const directMember = member(",
    "            primary,",
    "            directMemberProperty,",
    "            mergeLocToEndPos(primary.location, directMemberEndPos),",
    "          );",
    "          const nextPostfix = peg$parsePostfixTail();",
    "          if (nextPostfix === peg$FAILED) {",
    "            return directMember;",
    "          }",
    "          const postfixes = [nextPostfix];",
    "          let postfix = peg$parsePostfixTail();",
    "          while (postfix !== peg$FAILED) {",
    "            postfixes.push(postfix);",
    "            postfix = peg$parsePostfixTail();",
    "          }",
    "          peg$savedPos = startPos;",
    `          return ${actionName}(directMember, postfixes);`,
    "        }",
    "      }",
    "      peg$currPos = directMemberStartPos;",
    "    }",
    "",
    "    const firstPostfix = peg$parsePostfixTail();",
    "    if (firstPostfix === peg$FAILED) { return primary; }",
    "",
    "    const secondPostfix = peg$parsePostfixTail();",
    "    if (secondPostfix === peg$FAILED) {",
    "      peg$savedPos = startPos;",
    '      if (firstPostfix.type === "member") {',
    "        return member(",
    "          primary,",
    "          firstPostfix.property,",
    "          mergeLocToEndPos(primary.location, firstPostfix.endPos),",
    "        );",
    "      }",
    `      return ${actionName}(primary, [firstPostfix]);`,
    "    }",
    "",
    "    const postfixes = [firstPostfix, secondPostfix];",
    "    let postfix = peg$parsePostfixTail();",
    "    while (postfix !== peg$FAILED) {",
    "      postfixes.push(postfix);",
    "      postfix = peg$parsePostfixTail();",
    "    }",
    "",
    "    peg$savedPos = startPos;",
    `    return ${actionName}(primary, postfixes);`,
    "  }",
    "",
    "  function peg$parsePostfixTail()",
  ].join("\n");

  return parserSource.replace(postfixPattern, replacement);
}

function optimizeGeneratedStructLiteralSuccessCaching(
  parserSource: string,
): string {
  const structLiteralPattern =
    /  function peg\$parseStructLiteral\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseStructLiteralFields\(\)/;
  const match = parserSource.match(structLiteralPattern);
  const actionName = match?.[1]?.match(
    /peg\$savedPos = s0;\n          s0 = (peg\$f\d+)\(s1, s3, s7\);/,
  )?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser StructLiteral helper shape changed; update the BPL parser StructLiteral cache optimizer.",
    );
  }

  const success = [
    "        if (s9 !== peg$FAILED) {",
    "          peg$savedPos = s0;",
    `          s0 = ${actionName}(s1, s3, s7);`,
    "        } else {",
  ].join("\n");
  if (!match[0].includes(success)) {
    throw new Error(
      "Generated Peggy parser StructLiteral success shape changed; update the BPL parser StructLiteral cache optimizer.",
    );
  }

  const cachedSuccess = [
    "        if (s9 !== peg$FAILED) {",
    "          peg$savedPos = s0;",
    `          s0 = ${actionName}(s1, s3, s7);`,
    "          if (!peg$collectExpected && !peg$hasBplCommentMarker) {",
    "            peg$bplLastStructLiteralStart = startPos;",
    "            peg$bplLastStructLiteralEnd = peg$currPos;",
    "            peg$bplLastStructLiteralValue = s0;",
    "          }",
    "        } else {",
  ].join("\n");
  const replacement = [
    "  let peg$bplLastStructLiteralStart = -1;",
    "  let peg$bplLastStructLiteralEnd = -1;",
    "  let peg$bplLastStructLiteralValue;",
    "",
    "  function peg$parseStructLiteral() {",
    "    const startPos = peg$currPos;",
    "    if (",
    "      !peg$collectExpected &&",
    "      !peg$hasBplCommentMarker &&",
    "      peg$currPos === peg$bplLastStructLiteralStart",
    "    ) {",
    "      peg$currPos = peg$bplLastStructLiteralEnd;",
    "      return peg$bplLastStructLiteralValue;",
    "    }",
    match[1]!.replace(success, cachedSuccess),
    "  }",
    "",
    "  function peg$parseStructLiteralFields()",
  ].join("\n");

  return parserSource.replace(structLiteralPattern, replacement);
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

function optimizeGeneratedStringLiteralScanning(parserSource: string): string {
  const stringLiteralPattern =
    /  function peg\$parseStringLiteral\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseCharLiteral\(\)/;
  const match = parserSource.match(stringLiteralPattern);
  const actionName = match?.[1]?.match(/s1 = (peg\$f\d+)\(s1\);/)?.[1];

  if (!match || !actionName) {
    throw new Error(
      "Generated Peggy parser string literal helper shape changed; update the BPL string scanner optimizer.",
    );
  }

  const replacement = [
    "  function peg$scanBplStringLiteral() {",
    "    const startPos = peg$currPos;",
    "    if (input.charCodeAt(startPos) !== 34) return peg$FAILED;",
    "",
    "    let pos = startPos + 1;",
    "    while (pos < input.length) {",
    "      const code = input.charCodeAt(pos);",
    "      if (code === 34) {",
    "        peg$currPos = pos + 1;",
    "        return input.substring(startPos, peg$currPos);",
    "      }",
    "      if (code === 92) {",
    "        if (pos + 1 >= input.length) return peg$FAILED;",
    "        pos += 2;",
    "        continue;",
    "      }",
    "      if (code === 10 || code === 13) return peg$FAILED;",
    "      pos++;",
    "    }",
    "",
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$parseStringLiteral() {",
    "    if (peg$collectExpected) return peg$parseStringLiteralDetailed();",
    "",
    "    const startPos = peg$currPos;",
    "    const raw = peg$scanBplStringLiteral();",
    "    if (raw === peg$FAILED) return peg$FAILED;",
    "    peg$savedPos = startPos;",
    `    return ${actionName}(raw);`,
    "  }",
    "",
    `  function peg$parseStringLiteralDetailed() {${match[1]}`,
    "  }",
    "",
    "  function peg$parseCharLiteral()",
  ].join("\n");

  return parserSource.replace(stringLiteralPattern, replacement);
}

function optimizeGeneratedInterpolatedStringRunScanning(
  parserSource: string,
): string {
  const charsPattern =
    /  function peg\$parseInterpolatedStringChars\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseInterpolatedStringChar\(\)/;
  const match = parserSource.match(charsPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser interpolated-string chars helper shape changed; update the BPL interpolated-string scanner optimizer.",
    );
  }

  const replacement = [
    "  function peg$scanBplPlainInterpolatedStringChars() {",
    "    const startPos = peg$currPos;",
    "    let pos = startPos;",
    "",
    "    while (pos < peg$bplInputLength) {",
    "      const code = input.charCodeAt(pos);",
    "      if (code === 96 || (code === 36 && input.charCodeAt(pos + 1) === 123)) {",
    "        break;",
    "      }",
    "      if (code === 92 || code === 34 || code === 10 || code === 13) {",
    "        return peg$FAILED;",
    "      }",
    "      pos++;",
    "    }",
    "",
    "    if (pos === startPos) return peg$FAILED;",
    "    peg$currPos = pos;",
    "    return input.substring(startPos, pos);",
    "  }",
    "",
    "  function peg$parseInterpolatedStringChars() {",
    "    if (peg$collectExpected) return peg$parseInterpolatedStringCharsDetailed();",
    "",
    "    const plain = peg$scanBplPlainInterpolatedStringChars();",
    "    if (plain !== peg$FAILED) return plain;",
    "    return peg$parseInterpolatedStringCharsDetailed();",
    "  }",
    "",
    `  function peg$parseInterpolatedStringCharsDetailed() {${match[1]}`,
    "  }",
    "",
    "  function peg$parseInterpolatedStringChar()",
  ].join("\n");

  return parserSource.replace(charsPattern, replacement);
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
    "  function peg$scanBplStatementStartKeyword() {",
    "    const startPos = peg$currPos;",
    "    switch (input.charCodeAt(startPos)) {",
    "      case 97:",
    ...buildStatementStartKeywordAttempt("asm", "        ", 1),
    "        return peg$FAILED;",
    "      case 98:",
    ...buildStatementStartKeywordAttempt("break", "        ", 2),
    "        return peg$FAILED;",
    "      case 99:",
    ...buildStatementStartKeywordAttempt("continue", "        ", 3),
    "        return peg$FAILED;",
    "      case 100:",
    ...buildStatementStartKeywordAttempt("defer", "        ", 4),
    "        return peg$FAILED;",
    "      case 101:",
    ...buildStatementStartKeywordAttempt("enum", "        ", 5),
    ...buildStatementStartKeywordAttempt("export", "        ", 6),
    ...buildStatementStartKeywordAttempt("extern", "        ", 7),
    "        return peg$FAILED;",
    "      case 102:",
    ...buildStatementStartKeywordAttempt("frame", "        ", 8),
    ...buildStatementStartKeywordAttempt("fallthrough", "        ", 9),
    "        return peg$FAILED;",
    "      case 103:",
    ...buildStatementStartKeywordAttempt("global", "        ", 10),
    "        return peg$FAILED;",
    "      case 105:",
    ...buildStatementStartKeywordAttempt("if", "        ", 11),
    ...buildStatementStartKeywordAttempt("import", "        ", 12),
    "        return peg$FAILED;",
    "      case 108:",
    ...buildStatementStartKeywordAttempt("local", "        ", 13),
    ...buildStatementStartKeywordAttempt("loop", "        ", 14),
    "        return peg$FAILED;",
    "      case 114:",
    ...buildStatementStartKeywordAttempt("return", "        ", 15),
    "        return peg$FAILED;",
    "      case 115:",
    ...buildStatementStartKeywordAttempt("struct", "        ", 16),
    ...buildStatementStartKeywordAttempt("spec", "        ", 17),
    ...buildStatementStartKeywordAttempt("switch", "        ", 18),
    "        return peg$FAILED;",
    "      case 116:",
    ...buildStatementStartKeywordAttempt("type", "        ", 19),
    ...buildStatementStartKeywordAttempt("try", "        ", 20),
    ...buildStatementStartKeywordAttempt("throw", "        ", 21),
    "        return peg$FAILED;",
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

function buildStatementStartKeywordAttempt(
  keyword: string,
  indent: string,
  statementKind: number,
): string[] {
  const continuationIndex = keyword.length;
  const tailChecks = keyword
    .split("")
    .slice(1)
    .map(
      (char, index) =>
        `input.charCodeAt(startPos + ${index + 1}) === ${char.charCodeAt(0)}`,
    );
  const checks = [
    ...tailChecks,
    `!peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + ${continuationIndex}))`,
  ];

  return [
    `${indent}if (${checks.join(" && ")}) {`,
    `${indent}  peg$currPos = startPos + ${keyword.length};`,
    `${indent}  return ${statementKind};`,
    `${indent}}`,
  ];
}

function optimizeGeneratedStatementDispatch(parserSource: string): string {
  const statementPattern =
    /  function peg\$parseStatement\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseErrorRecovery\(\)/;
  const match = parserSource.match(statementPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser Statement helper shape changed; update the BPL parser statement dispatch optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseStatement() {",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (startPos >= peg$bplInputLength || input.charCodeAt(startPos) === 125) {",
    "        return peg$FAILED;",
    "      }",
    "",
    "      const statementKind = peg$scanBplStatementStartKeyword();",
    "      peg$currPos = startPos;",
    "      let parser;",
    "",
    "      switch (statementKind) {",
    "        case 1: parser = peg$parseAsmBlock; break;",
    "        case 2: parser = peg$parseBreakStatement; break;",
    "        case 3: parser = peg$parseContinueStatement; break;",
    "        case 4: parser = peg$parseDeferStatement; break;",
    "        case 5: parser = peg$parseEnumDeclaration; break;",
    "        case 6: parser = peg$parseExportStatement; break;",
    "        case 7: parser = peg$parseExternDeclaration; break;",
    "        case 8: parser = peg$parseFunctionDeclaration; break;",
    "        case 9: parser = peg$parseFallthroughStatement; break;",
    "        case 10:",
    "        case 13: parser = peg$parseVariableDeclaration; break;",
    "        case 11: parser = peg$parseIfStatement; break;",
    "        case 12: parser = peg$parseImportStatement; break;",
    "        case 14: parser = peg$parseLoopStatement; break;",
    "        case 15: parser = peg$parseReturnStatement; break;",
    "        case 16: parser = peg$parseStructDeclaration; break;",
    "        case 17: parser = peg$parseSpecDeclaration; break;",
    "        case 18: parser = peg$parseSwitchStatement; break;",
    "        case 19: parser = peg$parseTypeAlias; break;",
    "        case 20: parser = peg$parseTryStatement; break;",
    "        case 21: parser = peg$parseThrowStatement; break;",
    "      }",
    "",
    "      if (statementKind === peg$FAILED && input.charCodeAt(startPos) !== 123) parser = peg$parseExpressionStatement;",
    "",
    "      if (parser !== undefined) {",
    "        const result = parser();",
    "        if (result !== peg$FAILED) return result;",
    "        peg$currPos = startPos;",
    "      }",
    "    }",
    "",
    "    return peg$parseStatementFallback();",
    "  }",
    "",
    "  function peg$parseStatementFallback() {",
    match[1]!,
    "  }",
    "",
    "  function peg$parseErrorRecovery()",
  ].join("\n");

  return parserSource.replace(statementPattern, replacement);
}

function optimizeGeneratedProgramRecoveryGuard(parserSource: string): string {
  const recoveryCallPattern =
    /^(\s*)s4 = peg\$parseTopLevelErrorRecovery\(\);$/gm;
  const matches = [...parserSource.matchAll(recoveryCallPattern)];

  if (matches.length !== 2) {
    throw new Error(
      "Generated Peggy Program recovery shape changed; update the BPL Program recovery optimizer.",
    );
  }

  return parserSource.replace(recoveryCallPattern, (_match, indent: string) =>
    [
      `${indent}s4 = !peg$collectExpected && peg$currPos >= peg$bplInputLength`,
      `${indent}  ? peg$FAILED`,
      `${indent}  : peg$parseTopLevelErrorRecovery();`,
    ].join("\n"),
  );
}

function optimizeGeneratedImportStatementFailureGuard(
  parserSource: string,
): string {
  const importStatementPattern =
    /  function peg\$parseImportStatement\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(importStatementPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser ImportStatement helper shape changed; update the BPL import-statement failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseImportStatement() {",
    match[1]!.trimEnd(),
    "",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (",
    "        input.charCodeAt(startPos) !== 105 ||",
    "        input.charCodeAt(startPos + 1) !== 109 ||",
    "        input.charCodeAt(startPos + 2) !== 112 ||",
    "        input.charCodeAt(startPos + 3) !== 111 ||",
    "        input.charCodeAt(startPos + 4) !== 114 ||",
    "        input.charCodeAt(startPos + 5) !== 116 ||",
    "        peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 6))",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
  ].join("\n");

  return parserSource.replace(importStatementPattern, replacement);
}

function optimizeGeneratedBoolLiteralFailureGuard(
  parserSource: string,
): string {
  const boolLiteralPattern =
    /  function peg\$parseBoolLiteral\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(boolLiteralPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser BoolLiteral helper shape changed; update the BPL boolean-literal failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseBoolLiteral() {",
    match[1]!.trimEnd(),
    "",
    "    if (!peg$collectExpected) {",
    "      const startCode = input.charCodeAt(peg$currPos);",
    "      if (startCode !== 116 && startCode !== 102) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
  ].join("\n");

  return parserSource.replace(boolLiteralPattern, replacement);
}

function optimizeGeneratedFunctionDeclarationFailureGuard(
  parserSource: string,
): string {
  const functionDeclarationPattern =
    /  function peg\$parseFunctionDeclaration\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(functionDeclarationPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser FunctionDeclaration helper shape changed; update the BPL function-declaration failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseFunctionDeclaration() {",
    match[1]!.trimEnd(),
    "",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      const startCode = input.charCodeAt(startPos);",
    "      if (",
    "        (startCode !== 64 || input.charCodeAt(startPos + 1) !== 91) &&",
    "        (",
    "          startCode !== 102 ||",
    "          input.charCodeAt(startPos + 1) !== 114 ||",
    "          input.charCodeAt(startPos + 2) !== 97 ||",
    "          input.charCodeAt(startPos + 3) !== 109 ||",
    "          input.charCodeAt(startPos + 4) !== 101 ||",
    "          peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 5))",
    "        )",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
  ].join("\n");

  return parserSource.replace(functionDeclarationPattern, replacement);
}

function optimizeGeneratedSwitchStatementFailureGuard(
  parserSource: string,
): string {
  const switchStatementPattern =
    /  function peg\$parseSwitchStatement\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(switchStatementPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser SwitchStatement helper shape changed; update the BPL switch-statement failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseSwitchStatement() {",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (",
    "        input.charCodeAt(startPos) !== 115 ||",
    "        input.charCodeAt(startPos + 1) !== 119 ||",
    "        input.charCodeAt(startPos + 2) !== 105 ||",
    "        input.charCodeAt(startPos + 3) !== 116 ||",
    "        input.charCodeAt(startPos + 4) !== 99 ||",
    "        input.charCodeAt(startPos + 5) !== 104 ||",
    "        peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 6))",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
    match[1]!,
  ].join("\n");

  return parserSource.replace(switchStatementPattern, replacement);
}

function optimizeGeneratedTryStatementFailureGuard(
  parserSource: string,
): string {
  const tryStatementPattern =
    /  function peg\$parseTryStatement\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(tryStatementPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser TryStatement helper shape changed; update the BPL try-statement failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseTryStatement() {",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (",
    "        input.charCodeAt(startPos) !== 116 ||",
    "        input.charCodeAt(startPos + 1) !== 114 ||",
    "        input.charCodeAt(startPos + 2) !== 121 ||",
    "        peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 3))",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
    match[1]!,
  ].join("\n");

  return parserSource.replace(tryStatementPattern, replacement);
}

function optimizeGeneratedSpecDeclarationFailureGuard(
  parserSource: string,
): string {
  const specDeclarationPattern =
    /  function peg\$parseSpecDeclaration\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(specDeclarationPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser SpecDeclaration helper shape changed; update the BPL spec-declaration failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseSpecDeclaration() {",
    match[1]!.trimEnd(),
    "",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (",
    "        input.charCodeAt(startPos) !== 115 ||",
    "        input.charCodeAt(startPos + 1) !== 112 ||",
    "        input.charCodeAt(startPos + 2) !== 101 ||",
    "        input.charCodeAt(startPos + 3) !== 99 ||",
    "        peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 4))",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
  ].join("\n");

  return parserSource.replace(specDeclarationPattern, replacement);
}

function optimizeGeneratedEnumDeclarationFailureGuard(
  parserSource: string,
): string {
  const enumDeclarationPattern =
    /  function peg\$parseEnumDeclaration\(\) \{\n(    let [^\n]+;\n)/;
  const match = parserSource.match(enumDeclarationPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser EnumDeclaration helper shape changed; update the BPL enum-declaration failure optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseEnumDeclaration() {",
    match[1]!.trimEnd(),
    "",
    "    if (!peg$collectExpected) {",
    "      const startPos = peg$currPos;",
    "      if (",
    "        input.charCodeAt(startPos) !== 101 ||",
    "        input.charCodeAt(startPos + 1) !== 110 ||",
    "        input.charCodeAt(startPos + 2) !== 117 ||",
    "        input.charCodeAt(startPos + 3) !== 109 ||",
    "        peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 4))",
    "      ) {",
    "        return peg$FAILED;",
    "      }",
    "    }",
    "",
  ].join("\n");

  return parserSource.replace(enumDeclarationPattern, replacement);
}

function optimizeGeneratedVariableScopeKeywordScanning(
  parserSource: string,
): string {
  const keywordPattern =
    /  function peg\$parseK_global\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseK_local\(\) \{([\s\S]*?)\n  \}\n\n(?=  function peg\$parseK_const\(\))/;
  const match = parserSource.match(keywordPattern);
  const globalExpectation = match?.[1]?.match(
    /peg\$fail\((peg\$e\d+)\)/,
  )?.[1];
  const localExpectation = match?.[2]?.match(
    /peg\$fail\((peg\$e\d+)\)/,
  )?.[1];
  const globalCallCount =
    parserSource.match(/peg\$parseK_global\(\);/g)?.length ?? 0;
  const localCallCount =
    parserSource.match(/peg\$parseK_local\(\);/g)?.length ?? 0;

  if (
    !match ||
    !globalExpectation ||
    !localExpectation ||
    globalCallCount !== 1 ||
    localCallCount !== 1
  ) {
    throw new Error(
      "Generated Peggy parser variable-scope keyword shape changed; update the BPL parser variable-scope optimizer.",
    );
  }

  const replacement = [
    "  let peg$bplLastVariableScopeStart = -1;",
    "  let peg$bplLastVariableScope = 0;",
    "",
    "  function peg$scanBplVariableScopeKeyword() {",
    "    const startPos = peg$currPos;",
    "    if (startPos === peg$bplLastVariableScopeStart) {",
    "      return peg$bplLastVariableScope;",
    "    }",
    "",
    "    let scope = 0;",
    "    switch (input.charCodeAt(startPos)) {",
    "      case 103:",
    "        if (",
    "          input.charCodeAt(startPos + 1) === 108 &&",
    "          input.charCodeAt(startPos + 2) === 111 &&",
    "          input.charCodeAt(startPos + 3) === 98 &&",
    "          input.charCodeAt(startPos + 4) === 97 &&",
    "          input.charCodeAt(startPos + 5) === 108",
    "        ) {",
    "          scope = peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 6)) ? -1 : 1;",
    "        }",
    "        break;",
    "      case 108:",
    "        if (",
    "          input.charCodeAt(startPos + 1) === 111 &&",
    "          input.charCodeAt(startPos + 2) === 99 &&",
    "          input.charCodeAt(startPos + 3) === 97 &&",
    "          input.charCodeAt(startPos + 4) === 108",
    "        ) {",
    "          scope = peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 5)) ? -2 : 2;",
    "        }",
    "        break;",
    "    }",
    "",
    "    peg$bplLastVariableScopeStart = startPos;",
    "    peg$bplLastVariableScope = scope;",
    "    return scope;",
    "  }",
    "",
    "  function peg$parseK_global() {",
    "    const startPos = peg$currPos;",
    "    const scope = peg$scanBplVariableScopeKeyword();",
    "    if (scope === 1) {",
    "      peg$currPos = startPos + 6;",
    "      return undefined;",
    "    }",
    `    if (scope !== -1 && peg$silentFails === 0) { peg$fail(${globalExpectation}); }`,
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$parseK_local() {",
    "    const startPos = peg$currPos;",
    "    const scope = peg$scanBplVariableScopeKeyword();",
    "    if (scope === 2) {",
    "      peg$currPos = startPos + 5;",
    "      return undefined;",
    "    }",
    `    if (scope !== -2 && peg$silentFails === 0) { peg$fail(${localExpectation}); }`,
    "    return peg$FAILED;",
    "  }",
    "",
  ].join("\n");

  return parserSource.replace(keywordPattern, replacement);
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
  const expectedNames = [...helperBody.matchAll(/peg\$fail\((peg\$e\d+)\)/g)].map(
    ([, expectedName]) => expectedName,
  );

  if (expectedNames.length !== 9) {
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
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("+=")}; }`,
    "        break;",
    "      case 45:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("-=")}; }`,
    "        break;",
    "      case 42:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("*=")}; }`,
    "        break;",
    "      case 47:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("/=")}; }`,
    "        break;",
    "      case 37:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("%=")}; }`,
    "        break;",
    "      case 38:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("&=")}; }`,
    "        break;",
    "      case 124:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("|=")}; }`,
    "        break;",
    "      case 94:",
    `        if (input.charCodeAt(startPos + 1) === 61) { peg$currPos = startPos + 2; return ${buildGeneratedOperatorScannerResult("^=")}; }`,
    "        break;",
    "      case 61:",
    "        peg$currPos = startPos + 1;",
    `        return ${buildGeneratedOperatorScannerResult("=")};`,
    "    }",
    "",
    "    if (peg$collectExpected) { peg$failBplAssignmentOperatorExpectation(); }",
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

function optimizeGeneratedAssignmentParsing(parserSource: string): string {
  const assignmentPattern =
    /  function peg\$parseAssignment\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseAssignmentOperator\(\)/;
  const match = parserSource.match(assignmentPattern);

  if (!match) {
    throw new Error(
      "Generated Peggy parser Assignment helper shape changed; update the BPL parser assignment optimizer.",
    );
  }

  const expectedFragments = [
    "s1 = peg$parseTernary();",
    "s2 = [];",
    "s5 = peg$parseAssignmentOperator();",
    "s7 = peg$parseTernary();",
    "s2.push(s3);",
    "s4 = [s4, s5, s6, s7];",
  ];
  if (!expectedFragments.every(fragment => match[1]!.includes(fragment))) {
    throw new Error(
      "Generated Peggy parser Assignment tail shape changed; update the BPL parser assignment optimizer.",
    );
  }

  const replacement = [
    "  function peg$parseAssignment() {",
    "    let result = peg$parseTernary();",
    "    if (result === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    while (true) {",
    "      const tailStartPos = peg$currPos;",
    "      peg$parse_();",
    "      const operator = peg$scanBplAssignmentOperator();",
    "      if (operator === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      peg$parse_();",
    "      const right = peg$parseTernary();",
    "      if (right === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      result = assignment(",
    "        result,",
    "        makeOperatorTokenFromPos(operator.op, operator.pos, operator.type),",
    "        right,",
    "        mergeLoc(result.location, right.location),",
    "      );",
    "    }",
    "  }",
    "",
    "  function peg$parseAssignmentOperator()",
  ].join("\n");

  return parserSource.replace(assignmentPattern, replacement);
}

function optimizeGeneratedTernaryParsing(parserSource: string): string {
  const ternaryPattern =
    /  function peg\$parseTernary\(\) \{([\s\S]*?)\n  \}\n\n  function peg\$parseLogicalOr\(\)/;
  const match = parserSource.match(ternaryPattern);
  const actionName = match?.[1]?.match(
    /s0 = (peg\$f\d+)\(s1, s5, s9\);/,
  )?.[1];
  const expectedNames = match
    ? [...match[1]!.matchAll(/peg\$fail\((peg\$e\d+)\)/g)].map(
        ([, expectedName]) => expectedName,
      )
    : [];

  if (!match || !actionName || expectedNames.length !== 2) {
    throw new Error(
      "Generated Peggy parser Ternary helper shape changed; update the BPL parser ternary optimizer.",
    );
  }

  const [questionExpectation, colonExpectation] = expectedNames;
  const replacement = [
    "  function peg$parseTernary() {",
    "    const startPos = peg$currPos;",
    "    const condition = peg$parseLogicalOr();",
    "    if (condition === peg$FAILED) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    const conditionEndPos = peg$currPos;",
    "    const comments = options.comments;",
    "    const conditionCommentCount = comments?.length ?? 0;",
    "    peg$parse_();",
    "    if (input.charCodeAt(peg$currPos) !== 63) {",
    `      if (peg$collectExpected && peg$silentFails === 0) { peg$fail(${questionExpectation}); }`,
    "      if (comments && comments.length !== conditionCommentCount) {",
    "        comments.length = conditionCommentCount;",
    "      }",
    "      peg$currPos = conditionEndPos;",
    "      return condition;",
    "    }",
    "",
    "    peg$currPos++;",
    "    peg$parse_();",
    "    const trueExpr = peg$parseTernary();",
    "    if (trueExpr === peg$FAILED) {",
    "      if (comments && comments.length !== conditionCommentCount) {",
    "        comments.length = conditionCommentCount;",
    "      }",
    "      peg$currPos = conditionEndPos;",
    "      return condition;",
    "    }",
    "",
    "    peg$parse_();",
    "    if (input.charCodeAt(peg$currPos) !== 58) {",
    `      if (peg$collectExpected && peg$silentFails === 0) { peg$fail(${colonExpectation}); }`,
    "      if (comments && comments.length !== conditionCommentCount) {",
    "        comments.length = conditionCommentCount;",
    "      }",
    "      peg$currPos = conditionEndPos;",
    "      return condition;",
    "    }",
    "",
    "    peg$currPos++;",
    "    peg$parse_();",
    "    const falseExpr = peg$parseTernary();",
    "    if (falseExpr === peg$FAILED) {",
    "      if (comments && comments.length !== conditionCommentCount) {",
    "        comments.length = conditionCommentCount;",
    "      }",
    "      peg$currPos = conditionEndPos;",
    "      return condition;",
    "    }",
    "",
    "    peg$savedPos = startPos;",
    `    return ${actionName}(condition, trueExpr, falseExpr);`,
    "  }",
    "",
    "  function peg$parseLogicalOr()",
  ].join("\n");

  return parserSource.replace(ternaryPattern, replacement);
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

type GeneratedBinaryExpressionTailConfig = {
  name: string;
  operatorName: string;
  nextParserName: string;
};

const GENERATED_OPERATOR_TOKEN_TYPES: Record<string, string> = {
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

const BINARY_EXPRESSION_TAIL_CONFIGS: GeneratedBinaryExpressionTailConfig[] = [
  {
    name: "LogicalOr",
    operatorName: "LogicalOrOperator",
    nextParserName: "LogicalAnd",
  },
  {
    name: "LogicalAnd",
    operatorName: "LogicalAndOperator",
    nextParserName: "BitwiseOr",
  },
  {
    name: "BitwiseOr",
    operatorName: "BitwiseOrOperator",
    nextParserName: "BitwiseXor",
  },
  {
    name: "BitwiseXor",
    operatorName: "BitwiseXorOperator",
    nextParserName: "BitwiseAnd",
  },
  {
    name: "BitwiseAnd",
    operatorName: "BitwiseAndOperator",
    nextParserName: "Equality",
  },
  {
    name: "Equality",
    operatorName: "EqualityOperator",
    nextParserName: "TypeCheck",
  },
  {
    name: "Relational",
    operatorName: "RelationalOperator",
    nextParserName: "Shift",
  },
  {
    name: "Shift",
    operatorName: "ShiftOperator",
    nextParserName: "Additive",
  },
  {
    name: "Additive",
    operatorName: "AdditiveOperator",
    nextParserName: "Multiplicative",
  },
  {
    name: "Multiplicative",
    operatorName: "MultiplicativeOperator",
    nextParserName: "Unary",
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
  const expectedNames = Array.from(
    new Set(
      [...helperBody.matchAll(/peg\$fail\((peg\$e\d+)\)/g)].map(
        ([, expectedName]) => expectedName,
      ),
    ),
  );

  if (expectedNames.length === 0) {
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
      buildGeneratedOperatorScannerBranchLine(branch),
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
    `    if (peg$collectExpected) { peg$failBpl${config.name}Expectation(); }`,
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
): string {
  const endPos = `startPos + ${branch.op.length}`;
  const success = `peg$currPos = ${endPos}; return ${buildGeneratedOperatorScannerResult(branch.op)};`;

  if (branch.nextCode !== undefined) {
    return `        if (input.charCodeAt(startPos + 1) === ${branch.nextCode}) { ${success} }`;
  }

  if (branch.rejectNextCode !== undefined) {
    return `        if (input.charCodeAt(startPos + 1) !== ${branch.rejectNextCode}) { ${success} }`;
  }

  return `        { ${success} }`;
}

function buildGeneratedOperatorScannerResult(op: string): string {
  const type = GENERATED_OPERATOR_TOKEN_TYPES[op];
  if (type === undefined) {
    throw new Error(`Missing generated operator token type for ${op}`);
  }
  return `{ op: ${JSON.stringify(op)}, type: ${JSON.stringify(type)}, pos: startPos }`;
}

function optimizeGeneratedBinaryExpressionTailParsing(
  parserSource: string,
): string {
  let optimized = parserSource;
  for (const config of BINARY_EXPRESSION_TAIL_CONFIGS) {
    optimized = optimizeGeneratedBinaryExpressionTailParsingForConfig(
      optimized,
      config,
    );
  }
  return optimized;
}

function optimizeGeneratedBinaryExpressionTailParsingForConfig(
  parserSource: string,
  config: GeneratedBinaryExpressionTailConfig,
): string {
  const parserPattern = new RegExp(
    `  function peg\\$parse${config.name}\\(\\) \\{([\\s\\S]*?)\\n  \\}\\n\\n(?=  function peg\\$failBpl${config.operatorName}Expectation\\()`,
  );
  const match = parserSource.match(parserPattern);

  if (!match) {
    throw new Error(
      `Generated Peggy parser ${config.name} helper shape changed; update the BPL parser binary-tail optimizer.`,
    );
  }

  const helperBody = match[1]!;
  const expectedFragments = [
    `s1 = peg$parse${config.nextParserName}();`,
    `s5 = peg$parse${config.operatorName}();`,
    `s7 = peg$parse${config.nextParserName}();`,
    "s2.push(s3);",
    "s4 = [s4, s5, s6, s7];",
  ];
  if (!expectedFragments.every((fragment) => helperBody.includes(fragment))) {
    throw new Error(
      `Generated Peggy parser ${config.name} tail shape changed; update the BPL parser binary-tail optimizer.`,
    );
  }

  const operatorConfig = EXPRESSION_OPERATOR_SCAN_CONFIGS.find(
    operator => operator.name === config.operatorName,
  );
  if (operatorConfig === undefined) {
    throw new Error(
      `Missing generated operator scanner config for ${config.operatorName}.`,
    );
  }
  const possibleTailCodes = [
    32,
    9,
    10,
    13,
    ...operatorConfig.cases.map(operatorCase => operatorCase.code),
  ];
  const impossibleTailChecks = possibleTailCodes.map(
    (code, index) =>
      `        tailCode !== ${code}${index + 1 < possibleTailCodes.length ? " &&" : ""}`,
  );

  const replacement = [
    `  function peg$parse${config.name}() {`,
    `    let result = peg$parse${config.nextParserName}();`,
    "    if (result === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    while (true) {",
    "      const tailStartPos = peg$currPos;",
    "      const tailCode = input.charCodeAt(tailStartPos);",
    "      if (",
    "        !peg$collectExpected &&",
    "        !peg$hasBplCommentMarker &&",
    ...impossibleTailChecks,
    "      ) {",
    "        return result;",
    "      }",
    "",
    "      peg$parse_();",
    `      const operator = peg$scanBpl${config.operatorName}();`,
    "      if (operator === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      peg$parse_();",
    `      const right = peg$parse${config.nextParserName}();`,
    "      if (right === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      result = binary(",
    "        result,",
    "        makeTypedOperatorTokenFromPos(operator.type, operator.op, operator.pos),",
    "        right,",
    "        mergeLoc(result.location, right.location),",
    "      );",
    "    }",
    "  }",
    "",
  ].join("\n");

  return parserSource.replace(parserPattern, replacement);
}

function optimizeGeneratedRelationalActualTailGuard(
  parserSource: string,
): string {
  const parserPattern =
    /  function peg\$parseRelational\(\) \{[\s\S]*?\n  \}\n(?=  function peg\$failBplRelationalOperatorExpectation\(\))/;
  const parser = parserSource.match(parserPattern)?.[0];
  const original = [
    "      if (",
    "        !peg$collectExpected &&",
    "        !peg$hasBplCommentMarker &&",
    "        tailCode !== 32 &&",
    "        tailCode !== 9 &&",
    "        tailCode !== 10 &&",
    "        tailCode !== 13 &&",
    "        tailCode !== 62 &&",
    "        tailCode !== 60",
    "      ) {",
  ].join("\n");
  const replacement = [
    "      if (",
    "        !peg$collectExpected &&",
    "        tailCode !== 32 &&",
    "        tailCode !== 9 &&",
    "        tailCode !== 10 &&",
    "        tailCode !== 13 &&",
    "        tailCode !== 62 &&",
    "        tailCode !== 60 &&",
    "        tailCode !== 35 &&",
    "        (tailCode !== 47 ||",
    "          input.charCodeAt(tailStartPos + 1) !== 35)",
    "      ) {",
  ].join("\n");

  if (!parser?.includes(original)) {
    throw new Error(
      "Generated Peggy parser Relational actual-tail shape changed; update the BPL parser Relational optimizer.",
    );
  }

  return parserSource.replace(
    parserPattern,
    parser.replace(original, replacement),
  );
}

function optimizeGeneratedBitwiseOrPostTriviaGuard(
  parserSource: string,
): string {
  const original = [
    "      peg$parse_();",
    "      const operator = peg$scanBplBitwiseOrOperator();",
  ].join("\n");
  const replacement = [
    "      peg$parse_();",
    "      if (!peg$collectExpected && input.charCodeAt(peg$currPos) !== 124) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "      const operator = peg$scanBplBitwiseOrOperator();",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser BitwiseOr post-trivia shape changed; update the BPL parser BitwiseOr optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedLogicalAndPostTriviaGuard(
  parserSource: string,
): string {
  const original = [
    "      peg$parse_();",
    "      const operator = peg$scanBplLogicalAndOperator();",
  ].join("\n");
  const replacement = [
    "      peg$parse_();",
    "      const operatorCode = input.charCodeAt(peg$currPos);",
    "      if (",
    "        !peg$collectExpected &&",
    "        (operatorCode !== 38 ||",
    "          input.charCodeAt(peg$currPos + 1) !== 38)",
    "      ) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "      const operator = peg$scanBplLogicalAndOperator();",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser LogicalAnd post-trivia shape changed; update the BPL parser LogicalAnd optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedMultiplicativePostTriviaGuard(
  parserSource: string,
): string {
  const original = [
    "      peg$parse_();",
    "      const operator = peg$scanBplMultiplicativeOperator();",
  ].join("\n");
  const replacement = [
    "      peg$parse_();",
    "      const operatorCode = input.charCodeAt(peg$currPos);",
    "      if (",
    "        !peg$collectExpected &&",
    "        operatorCode !== 42 &&",
    "        operatorCode !== 47 &&",
    "        operatorCode !== 37",
    "      ) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "      const operator = peg$scanBplMultiplicativeOperator();",
  ].join("\n");

  if (!parserSource.includes(original)) {
    throw new Error(
      "Generated Peggy parser Multiplicative post-trivia shape changed; update the BPL parser Multiplicative optimizer.",
    );
  }

  return parserSource.replace(original, replacement);
}

function optimizeGeneratedAdditiveOperatorTokens(
  parserSource: string,
): string {
  const scannerPattern =
    /  function peg\$scanBplAdditiveOperator\(\) \{[\s\S]*?\n  \}\n\n(?=  function peg\$parseAdditiveOperator\(\))/;
  const scanner = parserSource.match(scannerPattern)?.[0];
  const parserPattern =
    /  function peg\$parseAdditive\(\) \{[\s\S]*?\n  \}\n(?=  function peg\$failBplAdditiveOperatorExpectation\(\))/;
  const parser = parserSource.match(parserPattern)?.[0];

  if (!scanner || !parser) {
    throw new Error(
      "Generated Peggy parser additive helper shape changed; update the BPL parser additive-token optimizer.",
    );
  }

  const directScanner = scanner
    .replace(
      'return { op: "+", type: "Plus", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("Plus", "+", startPos);',
    )
    .replace(
      'return { op: "-", type: "Minus", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("Minus", "-", startPos);',
    );
  const directParser = parser.replace(
    "        makeTypedOperatorTokenFromPos(operator.type, operator.op, operator.pos),",
    "        operator,",
  );

  if (directScanner === scanner || directParser === parser) {
    throw new Error(
      "Generated Peggy parser additive token shape changed; update the BPL parser additive-token optimizer.",
    );
  }

  return parserSource
    .replace(scannerPattern, directScanner)
    .replace(parserPattern, directParser);
}

function optimizeGeneratedRelationalOperatorTokens(
  parserSource: string,
): string {
  const scannerPattern =
    /  function peg\$scanBplRelationalOperator\(\) \{[\s\S]*?\n  \}\n\n(?=  function peg\$parseRelationalOperator\(\))/;
  const scanner = parserSource.match(scannerPattern)?.[0];
  const parserPattern =
    /  function peg\$parseRelational\(\) \{[\s\S]*?\n  \}\n(?=  function peg\$failBplRelationalOperatorExpectation\(\))/;
  const parser = parserSource.match(parserPattern)?.[0];

  if (!scanner || !parser) {
    throw new Error(
      "Generated Peggy parser relational helper shape changed; update the BPL parser relational-token optimizer.",
    );
  }

  const directScanner = scanner
    .replace(
      'return { op: ">=", type: "GreaterEqual", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("GreaterEqual", ">=", startPos);',
    )
    .replace(
      'return { op: ">", type: "Greater", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("Greater", ">", startPos);',
    )
    .replace(
      'return { op: "<=", type: "LessEqual", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("LessEqual", "<=", startPos);',
    )
    .replace(
      'return { op: "<", type: "Less", pos: startPos };',
      'return makeTypedOperatorTokenFromPos("Less", "<", startPos);',
    );
  const directParser = parser.replace(
    "        makeTypedOperatorTokenFromPos(operator.type, operator.op, operator.pos),",
    "        operator,",
  );

  if (directScanner === scanner || directParser === parser) {
    throw new Error(
      "Generated Peggy parser relational token shape changed; update the BPL parser relational-token optimizer.",
    );
  }

  return parserSource
    .replace(scannerPattern, directScanner)
    .replace(parserPattern, directParser);
}

function optimizeGeneratedTypeCheckTailParsing(parserSource: string): string {
  const parserPattern =
    /  function peg\$parseTypeCheck\(\) \{([\s\S]*?)\n  \}\n\n(?=  function peg\$parseRelational\(\))/;
  const parserMatch = parserSource.match(parserPattern);
  const isKeywordMatch = parserSource.match(
    /  function peg\$parseK_is\(\) \{([\s\S]*?)\n  \}/,
  );
  const asKeywordMatch = parserSource.match(
    /  function peg\$parseK_as\(\) \{([\s\S]*?)\n  \}/,
  );
  const isExpectation = isKeywordMatch?.[1]?.match(
    /peg\$fail\((peg\$e\d+)\)/,
  )?.[1];
  const asExpectation = asKeywordMatch?.[1]?.match(
    /peg\$fail\((peg\$e\d+)\)/,
  )?.[1];

  if (!parserMatch || !isExpectation || !asExpectation) {
    throw new Error(
      "Generated Peggy parser TypeCheck helper shape changed; update the BPL parser type-check optimizer.",
    );
  }

  const helperBody = parserMatch[1]!;
  const expectedFragments = [
    "s1 = peg$parseRelational();",
    "s5 = peg$parseK_is();",
    "s5 = peg$parseK_as();",
    "s7 = peg$parseType();",
    "s2.push(s3);",
    "s4 = [s4, s5, s6, s7];",
  ];
  if (!expectedFragments.every((fragment) => helperBody.includes(fragment))) {
    throw new Error(
      "Generated Peggy parser TypeCheck tail shape changed; update the BPL parser type-check optimizer.",
    );
  }

  const replacement = [
    "  function peg$failBplTypeCheckOperatorExpectation() {",
    "    if (peg$silentFails !== 0) {",
    "      return;",
    "    }",
    `    peg$fail(${isExpectation});`,
    `    peg$fail(${asExpectation});`,
    "  }",
    "",
    "  function peg$scanBplTypeCheckOperator() {",
    "    const startPos = peg$currPos;",
    "",
    "    switch (input.charCodeAt(startPos)) {",
    "      case 105:",
    "        if (",
    "          input.charCodeAt(startPos + 1) === 115 &&",
    "          !peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 2))",
    "        ) {",
    "          peg$currPos = startPos + 2;",
    "          return 1;",
    "        }",
    "        break;",
    "      case 97:",
    "        if (",
    "          input.charCodeAt(startPos + 1) === 115 &&",
    "          !peg$isBplIdentifierContinuationCode(input.charCodeAt(startPos + 2))",
    "        ) {",
    "          peg$currPos = startPos + 2;",
    "          return 2;",
    "        }",
    "        break;",
    "    }",
    "",
    "    if (peg$collectExpected) { peg$failBplTypeCheckOperatorExpectation(); }",
    "    return peg$FAILED;",
    "  }",
    "",
    "  function peg$parseTypeCheck() {",
    "    let result = peg$parseRelational();",
    "    if (result === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    while (true) {",
    "      const tailStartPos = peg$currPos;",
    "      peg$parse_();",
    "      const operator = peg$scanBplTypeCheckOperator();",
    "      if (operator === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      peg$parse_();",
    "      const type = peg$parseType();",
    "      if (type === peg$FAILED) {",
    "        peg$currPos = tailStartPos;",
    "        return result;",
    "      }",
    "",
    "      const location = mergeLoc(result.location, type.location);",
    "      result = operator === 1 ? isNode(result, type, location) : asNode(result, type, location);",
    "    }",
    "  }",
    "",
  ].join("\n");

  return parserSource.replace(parserPattern, replacement);
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
    '  const peg$hasBplCommentMarker = options.bplHasCommentMarker ?? input.indexOf("#") !== -1;',
    "",
    "  function peg$parseWhitespaceOnly() {",
    "    while (peg$currPos < input.length) {",
    "      const currentCode = input.charCodeAt(peg$currPos);",
    "      if (currentCode !== 32 && currentCode !== 9 && currentCode !== 10 && currentCode !== 13) {",
    "        break;",
    "      }",
    "      peg$currPos++;",
    "    }",
    "",
    "    return peg$emptyTrivia;",
    "  }",
    "",
    "  function peg$parse_() {",
    "    if (!peg$hasBplCommentMarker) return peg$parseWhitespaceOnly();",
    "",
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
  writeFileSync(declarationOutputPath, generatedParserDeclaration);
  console.log(`Generated ${outputPath}`);
  console.log(`Generated ${declarationOutputPath}`);
}

if (import.meta.main) {
  main();
}
