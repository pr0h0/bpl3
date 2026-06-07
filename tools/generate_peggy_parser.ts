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
  optimized = optimizeGeneratedIdentifierScanning(optimized);
  optimized = optimizeGeneratedIdBoundary(optimized);
  optimized = optimizeGeneratedQualifiedIdentifierScanning(optimized);
  optimized = optimizeGeneratedPostfixTailScanning(optimized);
  optimized = optimizeGeneratedPostfixParsing(optimized);
  optimized = optimizeGeneratedExpressionOperatorScanning(optimized);
  optimized = optimizeGeneratedBinaryExpressionTailParsing(optimized);
  optimized = optimizeGeneratedAdditiveOperatorTokens(optimized);
  optimized = optimizeGeneratedTypeCheckTailParsing(optimized);
  optimized = optimizeGeneratedAssignmentOperatorScanning(optimized);
  optimized = optimizeGeneratedStatementStartKeywordScanning(optimized);
  optimized = optimizeGeneratedVariableScopeKeywordScanning(optimized);
  optimized = optimizeGeneratedNumberScanning(optimized);
  return optimizeGeneratedTriviaSkipping(optimized);
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
    "    if (pos === peg$lastBplLinePos) {",
    "      return peg$lastBplLineIndex;",
    "    }",
    "",
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
    "    const endLineIndex = endPos >= startLineStart &&",
    "      (nextLineStart === undefined || endPos < nextLineStart)",
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

function optimizeGeneratedIdentifierScanning(parserSource: string): string {
  const identifierPattern =
    /  function peg\$parseIdentifier\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseIdentToken\(\)/;
  const identTokenPattern =
    /  function peg\$parseIdentToken\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parseBoolLiteral\(\)/;
  const keywordReservedPattern =
    /  function peg\$parseKeywordReserved\(\) \{[\s\S]*?\n  \}\n\n  function peg\$parse_\(\)/;
  const identifierReplacement = [
    "  let peg$bplLastIdentifierStart = -1;",
    '  let peg$bplLastIdentifierValue = "";',
    "",
    "  function peg$parseIdentifier() {",
    "    const startPos = peg$currPos;",
    "    if (startPos === peg$bplLastIdentifierStart) {",
    "      peg$currPos = startPos + peg$bplLastIdentifierValue.length;",
    "      if (peg$collectExpected && peg$silentFails === 0) { peg$fail(peg$e79); }",
    "      return peg$bplLastIdentifierValue;",
    "    }",
    "",
    "    const firstCode = input.charCodeAt(startPos);",
    "",
    "    if (!((firstCode >= 65 && firstCode <= 90) || (firstCode >= 97 && firstCode <= 122) || firstCode === 95)) {",
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
    "      return peg$FAILED;",
    "    }",
    "",
    "    const value = input.slice(startPos, endPos);",
    "    peg$bplLastIdentifierStart = startPos;",
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
    "    const firstPostfix = peg$parsePostfixTail();",
    "    if (firstPostfix === peg$FAILED) { return primary; }",
    "",
    "    const postfixes = [firstPostfix];",
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
    "  function peg$scanBplStatementStartKeyword() {",
    "    const startPos = peg$currPos;",
    "    switch (input.charCodeAt(startPos)) {",
    "      case 97:",
    ...buildStatementStartKeywordAttempt("asm", "        "),
    "        return peg$FAILED;",
    "      case 98:",
    ...buildStatementStartKeywordAttempt("break", "        "),
    "        return peg$FAILED;",
    "      case 99:",
    ...buildStatementStartKeywordAttempt("continue", "        "),
    "        return peg$FAILED;",
    "      case 100:",
    ...buildStatementStartKeywordAttempt("defer", "        "),
    "        return peg$FAILED;",
    "      case 101:",
    ...buildStatementStartKeywordAttempt("enum", "        "),
    ...buildStatementStartKeywordAttempt("export", "        "),
    ...buildStatementStartKeywordAttempt("extern", "        "),
    "        return peg$FAILED;",
    "      case 102:",
    ...buildStatementStartKeywordAttempt("frame", "        "),
    ...buildStatementStartKeywordAttempt("fallthrough", "        "),
    "        return peg$FAILED;",
    "      case 103:",
    ...buildStatementStartKeywordAttempt("global", "        "),
    "        return peg$FAILED;",
    "      case 105:",
    ...buildStatementStartKeywordAttempt("if", "        "),
    ...buildStatementStartKeywordAttempt("import", "        "),
    "        return peg$FAILED;",
    "      case 108:",
    ...buildStatementStartKeywordAttempt("local", "        "),
    ...buildStatementStartKeywordAttempt("loop", "        "),
    "        return peg$FAILED;",
    "      case 114:",
    ...buildStatementStartKeywordAttempt("return", "        "),
    "        return peg$FAILED;",
    "      case 115:",
    ...buildStatementStartKeywordAttempt("struct", "        "),
    ...buildStatementStartKeywordAttempt("spec", "        "),
    ...buildStatementStartKeywordAttempt("switch", "        "),
    "        return peg$FAILED;",
    "      case 116:",
    ...buildStatementStartKeywordAttempt("type", "        "),
    ...buildStatementStartKeywordAttempt("try", "        "),
    ...buildStatementStartKeywordAttempt("throw", "        "),
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
    `${indent}  return undefined;`,
    `${indent}}`,
  ];
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
    globalCallCount !== 4 ||
    localCallCount !== 4
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

  const replacement = [
    `  function peg$parse${config.name}() {`,
    `    let result = peg$parse${config.nextParserName}();`,
    "    if (result === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "",
    "    while (true) {",
    "      const tailStartPos = peg$currPos;",
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
    "    peg$failBplTypeCheckOperatorExpectation();",
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
