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
  /^([+-]?(?:0[xX][0-9A-Fa-f]+|\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)([uUlLfF]*)$/;
const STRING_CONSTANT_PATTERN = /^"(?:[^"\\]|\\.)*"$/;
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
  if (!fs.existsSync(options.headerPath)) {
    throw new Error(`Header file not found: ${options.headerPath}`);
  }

  if (!fs.statSync(options.headerPath).isFile()) {
    throw new Error(`Header path is not a file: ${options.headerPath}`);
  }

  const source = fs.readFileSync(options.headerPath, "utf8");
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
    /(?:^|;)\s*([A-Za-z_][\w\s*]*?)\s+([A-Za-z_]\w*)\s*\(([^;{}]*)\)\s*;/gm;

  for (const match of cleaned.matchAll(pattern)) {
    const returnType = match[1]?.trim();
    const name = match[2]?.trim();
    const rawParams = match[3]?.trim() ?? "";

    if (!returnType || !name || returnType.startsWith("typedef")) {
      continue;
    }

    prototypes.push({
      name,
      returnType,
      parameters: parseParameters(rawParams),
    });
  }

  return prototypes;
}

function stripCommentsAndDirectives(source: string): string {
  return stripComments(source).replace(/^\s*#.*$/gm, "");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
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
  if (value.includes(".")) return "double";
  if (/[uU]/.test(suffix) && /[lL]/.test(suffix)) return "ulong";
  if (/[uU]/.test(suffix)) return "uint";
  if (/[lL]/.test(suffix)) return "long";
  return "int";
}

function normalizeConstantValue(value: string): string {
  if (value.startsWith('"')) return value;
  const match = NUMERIC_CONSTANT_PATTERN.exec(value);
  return match?.[1] ?? value;
}

function getNumericConstantSuffix(value: string): string {
  return NUMERIC_CONSTANT_PATTERN.exec(value)?.[2] ?? "";
}

function extractStructs(source: string): CStruct[] {
  const cleaned = stripCommentsAndDirectives(source);
  const structs: CStruct[] = [];
  const typedefPattern =
    /typedef\s+struct(?:\s+[A-Za-z_]\w*)?\s*\{([\s\S]*?)\}\s*([A-Za-z_]\w*)\s*;/g;
  const plainPattern =
    /(?:^|;)\s*struct\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}\s*;/g;

  for (const match of cleaned.matchAll(typedefPattern)) {
    structs.push({
      name: match[2]!,
      fields: parseStructFields(match[1] ?? ""),
    });
  }

  for (const match of cleaned.matchAll(plainPattern)) {
    const name = match[1]!;
    if (structs.some((struct) => struct.name === name)) continue;
    structs.push({
      name,
      fields: parseStructFields(match[2] ?? ""),
    });
  }

  return structs;
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
  const cleaned = stripCommentsAndDirectives(source)
    .replace(
      /typedef\s+struct(?:\s+[A-Za-z_]\w*)?\s*\{[\s\S]*?\}\s*[A-Za-z_]\w*\s*;/g,
      "",
    )
    .replace(
      /typedef\s+enum(?:\s+[A-Za-z_]\w*)?\s*\{[\s\S]*?\}\s*[A-Za-z_]\w*\s*;/g,
      "",
    );
  const aggregateNames = new Set([
    ...structs.map((struct) => struct.name),
    ...enums.map((enumDecl) => enumDecl.name),
  ]);
  const typedefs: CTypedef[] = [];
  const pattern = /typedef\s+([^;{}]+?)\s+([A-Za-z_]\w*)\s*;/g;

  for (const match of cleaned.matchAll(pattern)) {
    const name = match[2]!;
    if (aggregateNames.has(name)) continue;
    typedefs.push({
      name,
      mappedType: mapCType(match[1]!.trim(), {}),
    });
  }

  return typedefs;
}

function parseStructFields(body: string): CParameter[] {
  return body
    .split(";")
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field, index) => parseNamedDeclaration(field, index));
}

function parseEnumVariants(body: string): string[] {
  return body
    .split(",")
    .map((variant) => variant.trim())
    .filter(Boolean)
    .map((variant) => variant.replace(/\s*=.*$/, "").trim())
    .filter(Boolean);
}

function parseParameters(rawParams: string): CParameter[] {
  if (rawParams === "" || rawParams === "void") {
    return [];
  }

  return rawParams.split(",").map((rawParam, index) => {
    const param = rawParam.trim();
    if (param === "...") {
      return { type: "", variadic: true };
    }

    return parseNamedDeclaration(param, index, { arrayAsPointer: true });
  });
}

function parseNamedDeclaration(
  param: string,
  index: number,
  options: ParseDeclarationOptions = {},
): CParameter {
  const arrayDeclarator = parseArrayDeclarator(param);
  if (arrayDeclarator) {
    if (
      options.arrayAsPointer &&
      arrayDeclarator.dimensions.length === 1
    ) {
      return {
        name: arrayDeclarator.name,
        type: `${arrayDeclarator.baseType} *`,
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
