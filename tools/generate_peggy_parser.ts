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

  return optimizeGeneratedTriviaSkipping(
    optimizeGeneratedNumberScanning(
      optimizeGeneratedStatementStartKeywordScanning(
        optimizeGeneratedAssignmentOperatorScanning(
          optimizeGeneratedBinaryExpressionTailParsing(
            optimizeGeneratedExpressionOperatorScanning(
              optimizeGeneratedPostfixTailScanning(
                optimizeGeneratedQualifiedIdentifierScanning(
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
    "  function peg$findBplLineIndex(pos) {",
    "    if (pos >= peg$bplLineStarts[peg$lastBplLineIndex] &&",
    "      (peg$lastBplLineIndex + 1 === peg$bplLineStarts.length || pos < peg$bplLineStarts[peg$lastBplLineIndex + 1])) {",
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
    "    const endLineIndex = endPos >= peg$bplLineStarts[startLineIndex] &&",
    "      (startLineIndex + 1 === peg$bplLineStarts.length || endPos < peg$bplLineStarts[startLineIndex + 1])",
    "      ? startLineIndex",
    "      : peg$findBplLineIndex(endPos);",
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
    "    const endPos = peg$scanBplIdentTokenEnd();",
    "",
    "    if (endPos === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "    if (peg$isBplReservedKeywordRange(startPos, endPos)) {",
    "      peg$currPos = startPos;",
    "      return peg$FAILED;",
    "    }",
    "",
    "    const name = input.substring(startPos, endPos);",
    "    return { name };",
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
    "  function peg$scanBplIdentTokenEnd() {",
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
    "    return peg$currPos;",
    "  }",
    "",
    "  function peg$scanBplIdentToken() {",
    "    const startPos = peg$currPos;",
    "    const endPos = peg$scanBplIdentTokenEnd();",
    "    if (endPos === peg$FAILED) {",
    "      return peg$FAILED;",
    "    }",
    "    return input.substring(startPos, endPos);",
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
    "      peg$savedPos = s0;",
    `      s0 = ${actionName}(s2);`,
    "    } else {",
    "      peg$currPos = s0;",
    "      s0 = peg$FAILED;",
    "    }",
    "",
    "    return s0;",
    "  }",
    "",
    "  function peg$parsePostfixTailAfterTrivia()",
  ].join("\n");

  return parserSource.replace(postfixTailPattern, replacement);
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

type GeneratedBinaryExpressionTailConfig = {
  name: string;
  operatorName: string;
  nextParserName: string;
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
    "        makeOperatorTokenFromPos(operator.op, operator.pos),",
    "        right,",
    "        mergeLoc(result.location, right.location),",
    "      );",
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
    "      if (!peg$hasBplCommentMarker) break;",
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
