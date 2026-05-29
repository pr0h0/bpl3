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

export function generateBplBindings(options: BindgenOptions): string {
  const source = fs.readFileSync(options.headerPath, "utf8");
  const prototypes = extractFunctionPrototypes(source);
  const lines = [
    `# Generated from ${options.headerPath}`,
    "# Review pointer and platform-specific integer mappings before publishing.",
    "",
    ...prototypes.map(formatPrototype),
    "",
  ];

  return lines.join("\n");
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
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/^\s*#.*$/gm, "");
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
  });
}

function formatPrototype(prototype: CPrototype): string {
  const params = prototype.parameters
    .map((param, index) =>
      param.variadic
        ? "..."
        : `${param.name ?? `arg${index}`}: ${mapCType(param.type)}`,
    )
    .join(", ");
  return `extern ${prototype.name}(${params}) ret ${mapCType(prototype.returnType)};`;
}

function mapCType(rawType: string): string {
  const pointerDepth = (rawType.match(/\*/g) ?? []).length;
  const base = rawType
    .replace(/\*/g, " ")
    .replace(/\b(const|volatile|restrict|static|extern)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const mappedBase = TYPE_MAP[base] ?? sanitizeUnknownType(base);

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

function sanitizeUnknownType(typeName: string): string {
  return typeName.replace(/\s+/g, "_") || "void";
}
