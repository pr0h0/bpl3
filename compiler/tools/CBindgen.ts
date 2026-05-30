import * as fs from "fs";

export interface BindgenOptions {
  headerPath: string;
}

const TYPE_MAP: Record<string, string> = {
  void: "void",
  bool: "bool",
  char: "char",
  "signed char": "i8",
  "unsigned char": "u8",
  short: "i16",
  "short int": "i16",
  "unsigned short": "u16",
  "unsigned short int": "u16",
  int: "int",
  "unsigned int": "uint",
  long: "long",
  "long int": "long",
  "unsigned long": "ulong",
  "unsigned long int": "ulong",
  "long long": "long",
  "long long int": "long",
  "unsigned long long": "ulong",
  "unsigned long long int": "ulong",
  size_t: "ulong",
  ssize_t: "long",
  float: "float",
  double: "double",
};
const NUMERIC_CONSTANT_PATTERN =
  /^([+-]?(?:(?:0[xX][0-9A-Fa-f]+|0[bB][01]+|0[0-7]+)|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)))([uUlLfF]*)$/;
const STRING_CONSTANT_PATTERN = /^"(?:[^"\\]|\\.)*"$/;
const CHAR_CONSTANT_PATTERN = /^'(?:[^'\\]|\\.)'$/;
const SCALAR_CONSTANT_TYPES = new Set([
  "char",
  "i8",
  "u8",
  "i16",
  "u16",
  "int",
  "uint",
  "long",
  "ulong",
  "float",
  "double",
]);

export function generateBplBindings(options: BindgenOptions): string {
  const headerStats = tryLstat(options.headerPath);
  if (!headerStats) {
    throw new Error(`Header file not found: ${options.headerPath}`);
  }

  if (headerStats.isSymbolicLink()) {
    throw new Error(`Header path is a symbolic link: ${options.headerPath}`);
  }

  if (!headerStats.isFile()) {
    throw new Error(`Header path is not a file: ${options.headerPath}`);
  }

  const source = joinLineContinuations(
    fs.readFileSync(options.headerPath, "utf8"),
  );
  const constants = extractConstants(source);
  const structs = extractStructs(source);
  const enums = extractEnums(source);
  const typedefs = extractTypedefs(source, structs, enums);
  const aliases = Object.fromEntries(
    typedefs.map((typedef) => [typedef.name, typedef.mappedType]),
  );
  const prototypes = extractFunctionPrototypes(source);
  const lines = [
    `# Generated from ${options.headerPath}`,
    "# Review pointer and platform-specific integer mappings before publishing.",
    "",
    ...constants.map(formatConstant),
    ...sectionBreak(constants.length > 0),
    ...typedefs.map(formatTypedef),
    ...sectionBreak(typedefs.length > 0),
    ...structs.map((struct) => formatStruct(struct, aliases)),
    ...sectionBreak(structs.length > 0),
    ...enums.map(formatEnum),
    ...sectionBreak(enums.length > 0),
    ...prototypes.map((prototype) => formatPrototype(prototype, aliases)),
    "",
  ];

  return lines.join("\n");
}

function joinLineContinuations(source: string): string {
  return source.replace(/\\\r?\n/g, " ");
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}

interface CConstant {
  name: string;
  value: string;
  type: string;
}

interface CTypedef {
  name: string;
  mappedType: string;
}

interface CStruct {
  name: string;
  fields: CParameter[];
}

interface CEnum {
  name: string;
  variants: string[];
}

interface CPrototype {
  name: string;
  returnType: string;
  parameters: CParameter[];
}

interface CParameter {
  name?: string;
  type: string;
  variadic?: boolean;
}

interface ParseDeclarationOptions {
  arrayAsPointer?: boolean;
}

function extractFunctionPrototypes(source: string): CPrototype[] {
  const cleaned = stripCommentsAndDirectives(source);
  const prototypes: CPrototype[] = [];
  const pattern =
    /(?:^|;)\s*([A-Za-z_][\w\s*]*?(?:\*+\s*)?[A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*;/gm;

  for (const match of cleaned.matchAll(pattern)) {
    const declaration = parseNamedDeclaration(match[1]!.trim(), 0);
    const returnType = declaration.type;
    const name = declaration.name;
    const rawParams = match[2]?.trim() ?? "";

    if (
      !returnType ||
      !name ||
      name === "arg0" ||
      returnType.startsWith("typedef")
    ) {
      continue;
    }

    const parameters = parseParameters(rawParams);
    if (!parameters) continue;

    prototypes.push({
      name,
      returnType,
      parameters,
    });
  }

  return prototypes;
}

function stripCommentsAndDirectives(source: string): string {
  return stripComments(source).replace(/^\s*#.*$/gm, "");
}

function stripComments(source: string): string {
  let result = "";
  let inString = false;
  let inChar = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "\n") {
        result += char;
      }
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index++;
      }
      continue;
    }

    if (inString || inChar) {
      result += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (inString && char === '"') {
        inString = false;
      } else if (inChar && char === "'") {
        inChar = false;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      index++;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "'") {
      inChar = true;
    }

    result += char;
  }

  return result;
}

function extractConstants(source: string): CConstant[] {
  const constants: CConstant[] = [];
  const pattern = /^\s*#define\s+([A-Za-z_]\w*)\s+(.+?)\s*$/gm;

  for (const match of stripComments(source).matchAll(pattern)) {
    const name = match[1]!;
    const rawValue = match[2]!;
    const value = parseConstantValue(rawValue);
    if (!value) continue;
    constants.push({
      name,
      value: value.value,
      type: value.type,
    });
  }

  return constants;
}

interface ParsedConstantValue {
  value: string;
  type: string;
}

function parseConstantValue(rawValue: string): ParsedConstantValue | null {
  const normalized = normalizeConstantExpression(rawValue);
  if (normalized.value.startsWith('"')) {
    if (!STRING_CONSTANT_PATTERN.test(normalized.value)) return null;
    return { value: normalized.value, type: "string" };
  }
  if (normalized.value.startsWith("'")) {
    if (!CHAR_CONSTANT_PATTERN.test(normalized.value)) return null;
    return { value: normalized.value, type: "char" };
  }

  if (!NUMERIC_CONSTANT_PATTERN.test(normalized.value)) {
    return null;
  }

  return {
    value: normalizeConstantValue(normalized.value),
    type: normalized.castType ?? inferConstantType(normalized.value),
  };
}

function normalizeConstantExpression(value: string): {
  value: string;
  castType?: string;
} {
  let expression = stripEnclosingParentheses(value.trim());
  const cast = stripLeadingScalarCast(expression);
  if (!cast) return { value: expression };

  expression = stripEnclosingParentheses(cast.expression);
  return { value: expression, castType: cast.type };
}

function stripLeadingScalarCast(value: string):
  | { expression: string; type: string }
  | null {
  const match = /^\(\s*([A-Za-z_][\w\s]*?)\s*\)\s*(.+)$/.exec(value);
  if (!match) return null;

  const type = mapConstantCastType(match[1]!.trim());
  if (!type) return null;

  return { expression: match[2]!.trim(), type };
}

function mapConstantCastType(rawType: string): string | null {
  const mappedType = TYPE_MAP[normalizeCBaseType(rawType)];
  if (!mappedType || !SCALAR_CONSTANT_TYPES.has(mappedType)) {
    return null;
  }

  return mappedType;
}

function stripEnclosingParentheses(value: string): string {
  let current = value.trim();
  while (isWrappedInSingleParenthesisPair(current)) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function isWrappedInSingleParenthesisPair(value: string): boolean {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;

  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth === 0 && index < value.length - 1) return false;
    if (depth < 0) return false;
  }

  return depth === 0;
}

function inferConstantType(value: string): string {
  if (value.startsWith('"')) return "string";
  const suffix = getNumericConstantSuffix(value);
  if (/[fF]/.test(suffix)) return "float";
  if (value.includes(".") || /[eE]/.test(value)) return "double";
  if (/[uU]/.test(suffix) && /[lL]/.test(suffix)) return "ulong";
  if (/[uU]/.test(suffix)) return "uint";
  if (/[lL]/.test(suffix)) return "long";
  return "int";
}

function normalizeConstantValue(value: string): string {
  if (value.startsWith('"')) return value;
  const match = NUMERIC_CONSTANT_PATTERN.exec(value);
  const literal = match?.[1] ?? value;
  const sign =
    literal.startsWith("-") || literal.startsWith("+") ? literal[0]! : "";
  const magnitude = sign ? literal.slice(1) : literal;
  if (/^0[0-7]+$/.test(magnitude) && magnitude !== "0") {
    return `${sign}0o${magnitude.slice(1)}`;
  }

  return literal;
}

function getNumericConstantSuffix(value: string): string {
  return NUMERIC_CONSTANT_PATTERN.exec(value)?.[2] ?? "";
}

function extractStructs(source: string): CStruct[] {
  const cleaned = stripCommentsAndDirectives(source);
  const structs: CStruct[] = [];
  const typedefPattern = /typedef\s+struct(?:\s+[A-Za-z_]\w*)?\s*\{/g;
  const plainPattern = /(?:^|;)\s*struct\s+([A-Za-z_]\w*)\s*\{/g;
  const plainStructSource = removeTypedefAggregateDeclarations(
    cleaned,
    "struct",
  );

  for (const match of cleaned.matchAll(typedefPattern)) {
    const openBrace = cleaned.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(cleaned, openBrace);
    if (openBrace < 0 || closeBrace < 0) continue;

    const tail = /^\s*([A-Za-z_]\w*)\s*;/.exec(
      cleaned.slice(closeBrace + 1),
    );
    if (!tail) continue;

    structs.push({
      name: tail[1]!,
      fields: parseStructFields(cleaned.slice(openBrace + 1, closeBrace)),
    });
  }

  for (const match of plainStructSource.matchAll(plainPattern)) {
    const name = match[1]!;
    if (structs.some((struct) => struct.name === name)) continue;
    const openBrace = plainStructSource.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(plainStructSource, openBrace);
    if (openBrace < 0 || closeBrace < 0) continue;
    if (!/^\s*;/.test(plainStructSource.slice(closeBrace + 1))) continue;

    structs.push({
      name,
      fields: parseStructFields(
        plainStructSource.slice(openBrace + 1, closeBrace),
      ),
    });
  }

  return structs;
}

function findMatchingBrace(source: string, openBrace: number): number {
  if (openBrace < 0 || source[openBrace] !== "{") return -1;

  let depth = 0;
  for (let index = openBrace; index < source.length; index++) {
    const char = source[index];
    if (char === "{") depth++;
    if (char === "}") depth--;
    if (depth === 0) return index;
  }

  return -1;
}

function extractEnums(source: string): CEnum[] {
  const cleaned = stripCommentsAndDirectives(source);
  const enums: CEnum[] = [];
  const typedefPattern =
    /typedef\s+enum(?:\s+[A-Za-z_]\w*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_]\w*)\s*;/g;
  const plainPattern =
    /(?:^|;)\s*enum\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}\s*;/g;

  for (const match of cleaned.matchAll(typedefPattern)) {
    enums.push({
      name: match[2]!,
      variants: parseEnumVariants(match[1] ?? ""),
    });
  }

  for (const match of cleaned.matchAll(plainPattern)) {
    const name = match[1]!;
    if (enums.some((enumDecl) => enumDecl.name === name)) continue;
    enums.push({
      name,
      variants: parseEnumVariants(match[2] ?? ""),
    });
  }

  return enums;
}

function extractTypedefs(
  source: string,
  structs: CStruct[],
  enums: CEnum[],
): CTypedef[] {
  const cleaned = removeTypedefAggregateDeclarations(
    removeTypedefAggregateDeclarations(
      stripCommentsAndDirectives(source),
      "struct",
    ),
    "enum",
  );
  const aggregateNames = new Set([
    ...structs.map((struct) => struct.name),
    ...enums.map((enumDecl) => enumDecl.name),
  ]);
  const typedefs: CTypedef[] = [];
  const pattern = /typedef\s+([^;{}]+?)\s*;/g;

  for (const match of cleaned.matchAll(pattern)) {
    for (const rawDeclaration of expandCDeclaration(match[1]!.trim())) {
      const declaration = parseNamedDeclaration(rawDeclaration, typedefs.length);
      const name = declaration.name;
      if (!name || name === `arg${typedefs.length}`) continue;
      if (aggregateNames.has(name)) continue;
      typedefs.push({
        name,
        mappedType: mapCType(declaration.type, {}),
      });
    }
  }

  return typedefs;
}

function removeTypedefAggregateDeclarations(
  source: string,
  keyword: "struct" | "enum",
): string {
  const pattern = new RegExp(
    `typedef\\s+${keyword}(?:\\s+[A-Za-z_]\\w*)?\\s*\\{`,
    "g",
  );
  let result = "";
  let cursor = 0;

  for (const match of source.matchAll(pattern)) {
    const openBrace = source.indexOf("{", match.index);
    const closeBrace = findMatchingBrace(source, openBrace);
    if (openBrace < 0 || closeBrace < 0) continue;

    const tail = /^\s*[A-Za-z_]\w*\s*;/.exec(source.slice(closeBrace + 1));
    if (!tail) continue;

    result += source.slice(cursor, match.index);
    cursor = closeBrace + 1 + tail[0].length;
  }

  result += source.slice(cursor);
  return result;
}

function parseStructFields(body: string): CParameter[] {
  const fields: CParameter[] = [];
  for (const declaration of splitTopLevelStructDeclarations(body)
    .map((field) => field.trim())
    .filter(Boolean)) {
    if (isUnsupportedStructField(declaration)) continue;

    for (const field of expandCDeclaration(declaration)) {
      fields.push(parseNamedDeclaration(field, fields.length));
    }
  }

  return fields;
}

function isUnsupportedStructField(field: string): boolean {
  return (
    field.includes(":") ||
    field.includes("{") ||
    field.includes("}") ||
    /\(\s*\*/.test(field)
  );
}

function splitTopLevelStructDeclarations(body: string): string[] {
  const declarations: string[] = [];
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let start = 0;

  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "{") braceDepth++;
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (char === "[") bracketDepth++;
    if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    if (char === "(") parenDepth++;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (
      char === ";" &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0
    ) {
      declarations.push(body.slice(start, index));
      start = index + 1;
    }
  }

  declarations.push(body.slice(start));
  return declarations;
}

function expandCDeclaration(declaration: string): string[] {
  const declarators = splitTopLevelParameters(declaration)
    .map((field) => field.trim())
    .filter(Boolean);
  if (declarators.length <= 1) {
    return declarators;
  }

  const baseType = extractDeclarationBaseType(declarators[0]!);
  if (!baseType) {
    return [declaration];
  }

  return declarators.map((declarator, index) =>
    index === 0 ? declarator : `${baseType} ${declarator}`,
  );
}

function extractDeclarationBaseType(declaration: string): string | null {
  const match =
    /^(.*?)([A-Za-z_]\w*)(?:\s*(?:\[[^\]]*\])*)\s*$/.exec(declaration);
  if (!match) return null;

  const beforeName = match[1]!.trim();
  if (!beforeName) return null;

  return beforeName.replace(/\*+\s*$/, "").trim() || null;
}

function parseEnumVariants(body: string): string[] {
  return body
    .split(",")
    .map((variant) => variant.trim())
    .filter(Boolean)
    .map((variant) => variant.replace(/\s*=.*$/, "").trim())
    .filter(Boolean);
}

function parseParameters(rawParams: string): CParameter[] | null {
  if (rawParams === "" || rawParams === "void") {
    return [];
  }

  const rawParameters = splitTopLevelParameters(rawParams);
  if (rawParameters.some((rawParam) => /\(\s*\*/.test(rawParam))) {
    return null;
  }

  return rawParameters.map((rawParam, index) => {
    const param = rawParam.trim();
    if (param === "...") {
      return { type: "", variadic: true };
    }

    return parseNamedDeclaration(param, index, { arrayAsPointer: true });
  });
}

function splitTopLevelParameters(rawParams: string): string[] {
  const params: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < rawParams.length; index++) {
    const char = rawParams[index];
    if (char === "(") depth++;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      params.push(rawParams.slice(start, index));
      start = index + 1;
    }
  }

  params.push(rawParams.slice(start));
  return params;
}

function parseNamedDeclaration(
  param: string,
  index: number,
  options: ParseDeclarationOptions = {},
): CParameter {
  const arrayDeclarator = parseArrayDeclarator(param);
  if (arrayDeclarator) {
    if (options.arrayAsPointer) {
      const remainingDimensions = arrayDeclarator.dimensions.slice(1);
      const decayedType =
        remainingDimensions.length === 0
          ? arrayDeclarator.baseType
          : formatArrayType(arrayDeclarator.baseType, remainingDimensions);
      return {
        name: arrayDeclarator.name,
        type: `${decayedType} *`,
      };
    }

    return {
      name: arrayDeclarator.name,
      type: formatArrayType(arrayDeclarator.baseType, arrayDeclarator.dimensions),
    };
  }

  const nameMatch = /^(.*?)([A-Za-z_]\w*)$/.exec(param);
  if (!nameMatch) {
    return { name: `arg${index}`, type: param };
  }

  const beforeName = nameMatch[1]!.trim();
  const name = nameMatch[2]!;
  if (beforeName === "" && TYPE_MAP[name]) {
    return { name: `arg${index}`, type: param };
  }
  if (beforeName === "" || beforeName.endsWith("*")) {
    return { name, type: beforeName || param };
  }

  return { name, type: beforeName };
}

function parseArrayDeclarator(
  declaration: string,
): { baseType: string; name: string; dimensions: Array<string | null> } | null {
  const match =
    /^(.*?)([A-Za-z_]\w*)((?:\s*\[[^\]]*\])+)\s*$/.exec(declaration);
  if (!match) return null;

  const dimensions = [...match[3]!.matchAll(/\[\s*([^\]]*)\s*\]/g)].map(
    (dimension) => {
      const value = dimension[1]!.trim();
      return /^\d+$/.test(value) ? value : null;
    },
  );
  if (dimensions.length === 0) return null;

  return {
    baseType: match[1]!.trim(),
    name: match[2]!,
    dimensions,
  };
}

function formatArrayType(
  baseType: string,
  dimensions: Array<string | null>,
): string {
  if (dimensions.some((dimension) => dimension === null)) {
    return `${baseType} *`;
  }

  return `${baseType}${dimensions.map((dimension) => `[${dimension}]`).join("")}`;
}

function sectionBreak(enabled: boolean): string[] {
  return enabled ? [""] : [];
}

function formatConstant(constant: CConstant): string {
  return `global const ${constant.name}: ${constant.type} = ${constant.value};`;
}

function formatTypedef(typedef: CTypedef): string {
  return `type ${typedef.name} = ${typedef.mappedType};`;
}

function formatStruct(struct: CStruct, aliases: Record<string, string>): string {
  const lines = [`struct ${struct.name} {`];
  for (const field of struct.fields) {
    lines.push(`    ${field.name}: ${mapCType(field.type, aliases)},`);
  }
  lines.push("}");
  return lines.join("\n");
}

function formatEnum(enumDecl: CEnum): string {
  const lines = [`enum ${enumDecl.name} {`];
  for (const variant of enumDecl.variants) {
    lines.push(`    ${variant},`);
  }
  lines.push("}");
  return lines.join("\n");
}

function formatPrototype(
  prototype: CPrototype,
  aliases: Record<string, string>,
): string {
  const params = prototype.parameters
    .map((param, index) =>
      param.variadic
        ? "..."
        : `${param.name ?? `arg${index}`}: ${mapCType(param.type, aliases)}`,
    )
    .join(", ");
  return `extern ${prototype.name}(${params}) ret ${mapCType(prototype.returnType, aliases)};`;
}

function mapCType(
  rawType: string,
  aliases: Record<string, string> = {},
): string {
  const arrayType = parseArrayType(rawType.trim());
  if (arrayType) {
    return `${mapCType(arrayType.baseType, aliases)}${arrayType.dimensions
      .map((dimension) => `[${dimension}]`)
      .join("")}`;
  }

  const pointerDepth = (rawType.match(/\*/g) ?? []).length;
  const base = rawType
    .replace(/\*/g, " ")
    .replace(/\b(const|volatile|restrict|static|extern)\b/g, " ")
    .replace(/\b(struct|enum)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedBase = normalizeCBaseType(base);
  const mappedBase = aliases[base]
    ? base
    : TYPE_MAP[normalizedBase] ?? sanitizeUnknownType(base);

  if (pointerDepth === 0) {
    return mappedBase;
  }
  if (base === "char" && pointerDepth === 1) {
    return "string";
  }
  if (base === "void") {
    return `${"*".repeat(pointerDepth)}void`;
  }

  return `${"*".repeat(pointerDepth)}${mappedBase}`;
}

function parseArrayType(
  rawType: string,
): { baseType: string; dimensions: string[] } | null {
  const match = /^(.*?)(\s*(?:\[\d+\]\s*)+)$/.exec(rawType);
  if (!match) return null;

  const dimensions = [...match[2]!.matchAll(/\[(\d+)\]/g)].map(
    (dimension) => dimension[1]!,
  );
  if (dimensions.length === 0) return null;

  return {
    baseType: match[1]!.trim(),
    dimensions,
  };
}

function sanitizeUnknownType(typeName: string): string {
  return typeName.replace(/\s+/g, "_") || "void";
}

function normalizeCBaseType(base: string): string {
  const tokens = base.split(" ").filter(Boolean);
  if (tokens.length === 0) return base;
  if (tokens.includes("double") || tokens.includes("float")) return base;

  const isUnsigned = tokens.includes("unsigned");
  const isSigned = tokens.includes("signed");
  const longCount = tokens.filter((token) => token === "long").length;

  if (tokens.includes("char")) {
    if (isUnsigned) return "unsigned char";
    if (isSigned) return "signed char";
    return "char";
  }

  if (tokens.includes("short")) {
    return isUnsigned ? "unsigned short int" : "short int";
  }

  if (longCount >= 2) {
    return isUnsigned ? "unsigned long long int" : "long long int";
  }

  if (longCount === 1) {
    return isUnsigned ? "unsigned long int" : "long int";
  }

  if (tokens.includes("int")) {
    return isUnsigned ? "unsigned int" : "int";
  }

  return base;
}
