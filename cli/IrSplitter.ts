/**
 * Splits one LLVM IR module into several that clang can compile in parallel
 * and the linker joins again. The compiler emits one module for the whole
 * program, so without this a large program's optimizer and code generator
 * run on one core.
 *
 * Function definitions are partitioned by size. Every part gets all type
 * definitions, attribute groups and external declarations, a `declare` for
 * each function it calls in another part, and the globals it uses:
 * - private, internal and linkonce_odr constants (strings, vtables, type
 *   tables) are copied into each part that uses them;
 * - other globals are defined in the first part and declared `external`
 *   elsewhere.
 * Symbols with internal or private linkage that another part refers to get
 * hidden visibility instead, and linkonce_odr functions become weak_odr, so
 * a part does not discard a definition another part calls.
 *
 * Anything outside that model (metadata, aliases, comdats, module asm, debug
 * info) makes the splitter decline, and the module is compiled whole.
 */

interface Entity {
  kind: "header" | "type" | "attributes" | "declare" | "global" | "define";
  name?: string;
  text: string;
}

const SYMBOL = /@([-a-zA-Z$._0-9]+|"[^"]*")/g;
const LOCAL_LINKAGE = /^(private|internal)$/;

function symbolOf(line: string): string | undefined {
  const match = /^@([-a-zA-Z$._0-9]+|"[^"]*")\s*=/.exec(line);
  return match?.[1];
}

function definedFunctionName(line: string): string | undefined {
  const match = /@([-a-zA-Z$._0-9]+|"[^"]*")\(/.exec(line);
  return match?.[1];
}

function parseEntities(ir: string): Entity[] | undefined {
  const lines = ir.split("\n");
  const entities: Entity[] = [];
  let current:
    { kind: Entity["kind"]; name?: string; lines: string[] } | undefined;
  let inFunction = false;
  const flush = () => {
    if (current) {
      entities.push({
        kind: current.kind,
        name: current.name,
        text: current.lines.join("\n"),
      });
    }
    current = undefined;
  };
  for (const line of lines) {
    if (inFunction) {
      current!.lines.push(line);
      if (line === "}") {
        inFunction = false;
        flush();
      }
      continue;
    }
    if (line === "") {
      if (current?.kind !== "global") flush();
      continue;
    }
    if (line.startsWith("define ")) {
      flush();
      const name = definedFunctionName(line);
      if (!name || !line.trimEnd().endsWith("{")) return undefined;
      current = { kind: "define", name, lines: [line] };
      inFunction = true;
      continue;
    }
    if (line.startsWith("declare ")) {
      flush();
      entities.push({
        kind: "declare",
        name: definedFunctionName(line),
        text: line,
      });
      continue;
    }
    if (line.startsWith("@")) {
      flush();
      const name = symbolOf(line);
      if (!name) return undefined;
      if (/=\s*(\w+\s+)*(alias|ifunc)\b/.test(line)) return undefined;
      current = { kind: "global", name, lines: [line] };
      continue;
    }
    if (line.startsWith("%") && /^%[^ ]+ = type\b/.test(line)) {
      flush();
      entities.push({ kind: "type", text: line });
      continue;
    }
    if (line.startsWith("attributes #")) {
      flush();
      entities.push({ kind: "attributes", text: line });
      continue;
    }
    if (line.startsWith("target ") || line.startsWith("source_filename")) {
      flush();
      entities.push({ kind: "header", text: line });
      continue;
    }
    if (
      line.startsWith("!") ||
      line.startsWith("$") ||
      line.startsWith("module asm") ||
      line.startsWith("uselistorder")
    ) {
      return undefined;
    }
    if (current?.kind === "global" || line.startsWith(";")) {
      // A multi-line initializer, or a comment.
      if (current) current.lines.push(line);
      continue;
    }
    return undefined;
  }
  if (inFunction) return undefined;
  flush();
  return entities;
}

function referencedSymbols(text: string): Set<string> {
  const names = new Set<string>();
  SYMBOL.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SYMBOL.exec(text)) !== null) names.add(match[1]!);
  return names;
}

/** `[linkage, rest]` of the text after `@name = ` in a global definition. */
function splitGlobalLinkage(text: string): { linkage: string; rest: string } {
  const body = text.slice(text.indexOf("=") + 1).trimStart();
  const match =
    /^(private|internal|linkonce_odr|linkonce|weak_odr|weak|external|common|appending|available_externally|extern_weak)\s+/.exec(
      body,
    );
  return match
    ? { linkage: match[1]!, rest: body.slice(match[0].length) }
    : { linkage: "", rest: body };
}

/**
 * The value type of a global definition (after linkage, visibility and the
 * `global`/`constant` keyword). Returns `{ keyword, type, flags }`.
 */
function globalType(
  text: string,
): { keyword: string; type: string; prefix: string } | undefined {
  const { rest } = splitGlobalLinkage(text);
  const keywordMatch = /\b(global|constant)\s+/.exec(rest);
  if (!keywordMatch) return undefined;
  const prefix = rest.slice(0, keywordMatch.index).trim();
  let index = keywordMatch.index + keywordMatch[0].length;
  // Read one type: balanced over (), [], {}, <>, followed by `*`s.
  const start = index;
  let depth = 0;
  for (; index < rest.length; index++) {
    const c = rest[index]!;
    if (c === "(" || c === "[" || c === "{" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === "}" || c === ">") depth--;
    else if (depth === 0 && (c === " " || c === "\n" || c === ",")) {
      // A function type `ret (args)*` continues after a space before `(`.
      if (rest[index + 1] === "(") continue;
      break;
    }
  }
  const type = rest.slice(start, index).trim();
  if (!type) return undefined;
  return { keyword: keywordMatch[1]!, type, prefix };
}

/** `declare` text for a function definition header line. */
function declarationOf(defineLine: string): string | undefined {
  const name = definedFunctionName(defineLine);
  if (!name) return undefined;
  const at = defineLine.indexOf(`@${name}(`);
  const head = defineLine.slice("define ".length, at).trim();
  // Drop linkage, visibility and dso_local; keep return attributes and type.
  const returnPart = head
    .split(/\s+/)
    .filter(
      (word) =>
        !/^(private|internal|linkonce_odr|linkonce|weak_odr|weak|external|dso_local|hidden|protected|default|unnamed_addr|local_unnamed_addr)$/.test(
          word,
        ),
    )
    .join(" ");
  let index = at + name.length + 2;
  let depth = 1;
  const start = index;
  for (; index < defineLine.length && depth > 0; index++) {
    const c = defineLine[index]!;
    if (c === "(" || c === "[" || c === "{" || c === "<") depth++;
    else if (c === ")" || c === "]" || c === "}" || c === ">") depth--;
  }
  const params = defineLine.slice(start, index - 1);
  // Split parameters at top-level commas and drop their `%name`.
  const parts: string[] = [];
  let level = 0;
  let from = 0;
  for (let i = 0; i <= params.length; i++) {
    const c = params[i];
    if (c === "(" || c === "[" || c === "{" || c === "<") level++;
    else if (c === ")" || c === "]" || c === "}" || c === ">") level--;
    if ((c === "," && level === 0) || i === params.length) {
      const part = params.slice(from, i).trim();
      if (part) parts.push(part.replace(/\s+%[-a-zA-Z$._0-9]+$/, ""));
      from = i + 1;
    }
  }
  return `declare ${returnPart} @${name}(${parts.join(", ")})`;
}

/** Makes a definition visible to the other parts without changing its name. */
function exportDefinition(text: string, kind: "define" | "global"): string {
  if (kind === "define") {
    return text.replace(
      /^define\s+((?:private|internal)\s+)?(linkonce_odr\s+)?/,
      (_all, local: string | undefined, linkonce: string | undefined) => {
        if (local) return "define hidden ";
        if (linkonce) return "define weak_odr ";
        return "define ";
      },
    );
  }
  return text
    .replace(
      /^(@[^=]+=\s*)(private|internal)\s+/,
      (_all, head: string) => `${head}hidden `,
    )
    .replace(
      /^(@[^=]+=\s*)linkonce_odr\s+/,
      (_all, head: string) => `${head}weak_odr `,
    );
}

/** Functions up to this many characters of IR may be copied into a part. */
const SMALL_FUNCTION_COPY_LIMIT = 2000;

/** A part's private copy of a function defined in another part. */
function asInternalCopy(text: string): string {
  return text.replace(
    /^define\s+((?:private|internal|linkonce_odr|linkonce|weak_odr|weak|external|hidden|protected|default|dso_local)\s+)*/,
    "define internal ",
  );
}

/** Whether a definition's linkage is private or internal. */
function isLocalDefinition(text: string, kind: "define" | "global"): boolean {
  if (kind === "define") return /^define\s+(private|internal)\s/.test(text);
  return LOCAL_LINKAGE.test(splitGlobalLinkage(text).linkage);
}

/**
 * Splits `ir` into at most `parts` modules, or returns undefined when the
 * module is outside the supported shape or too small to be worth splitting.
 */
export function splitLlvmModule(
  ir: string,
  parts: number,
): string[] | undefined {
  if (parts < 2) return undefined;
  const entities = parseEntities(ir);
  if (!entities) return undefined;
  const functions = entities.filter((entity) => entity.kind === "define");
  if (functions.length < parts * 4) return undefined;

  const globals = new Map<string, Entity>();
  for (const entity of entities) {
    if (entity.kind === "global") globals.set(entity.name!, entity);
  }
  const functionByName = new Map(functions.map((f) => [f.name!, f]));

  // Balance by size: largest first, each into the lightest part.
  const assignment = new Map<string, number>();
  const sizes = new Array<number>(parts).fill(0);
  for (const fn of [...functions].sort(
    (a, b) => b.text.length - a.text.length,
  )) {
    let lightest = 0;
    for (let i = 1; i < parts; i++)
      if (sizes[i]! < sizes[lightest]!) lightest = i;
    assignment.set(fn.name!, lightest);
    sizes[lightest]! += fn.text.length;
  }

  // Copyable globals: private/internal/linkonce_odr constants.
  const copyable = new Set<string>();
  for (const [name, global] of globals) {
    const { linkage } = splitGlobalLinkage(global.text);
    const info = globalType(global.text);
    if (!info) return undefined;
    if (
      info.keyword === "constant" &&
      (LOCAL_LINKAGE.test(linkage) || linkage === "linkonce_odr")
    ) {
      copyable.add(name);
    }
  }

  // Which parts use each symbol, following copied constants transitively.
  const partUses: Set<string>[] = Array.from(
    { length: parts },
    () => new Set(),
  );
  for (const fn of functions) {
    const uses = partUses[assignment.get(fn.name!)!]!;
    for (const name of referencedSymbols(fn.text)) uses.add(name);
  }
  // The first part defines every non-copyable global and so uses what their
  // initializers reference.
  for (const [name, global] of globals) {
    if (copyable.has(name)) continue;
    for (const inner of referencedSymbols(global.text)) {
      if (inner !== name) partUses[0]!.add(inner);
    }
  }
  const closeOverConstants = (part: number) => {
    const uses = partUses[part]!;
    const pending = [...uses].filter((name) => copyable.has(name));
    const seen = new Set<string>();
    while (pending.length > 0) {
      const name = pending.pop()!;
      if (seen.has(name)) continue;
      seen.add(name);
      for (const inner of referencedSymbols(globals.get(name)!.text)) {
        if (inner === name) continue;
        uses.add(inner);
        if (copyable.has(inner)) pending.push(inner);
      }
    }
  };
  for (let part = 0; part < parts; part++) closeOverConstants(part);

  // Small functions that a part only calls get an internal copy there, so
  // the optimizer can still inline them across the split. A part that takes
  // a function's address keeps referring to the single definition, so
  // function-pointer comparisons stay correct.
  const copies: Set<string>[] = Array.from({ length: parts }, () => new Set());
  for (let part = 0; part < parts; part++) {
    const texts = functions
      .filter((fn) => assignment.get(fn.name!) === part)
      .map((fn) => fn.text);
    for (const name of partUses[part]!) {
      if (copyable.has(name)) texts.push(globals.get(name)!.text);
    }
    const addressTaken = new Set<string>();
    const collectAddressTaken = (text: string) => {
      for (const match of text.matchAll(
        /@([-a-zA-Z$._0-9]+)(?!\()(?=[^-a-zA-Z$._0-9]|$)/g,
      ))
        addressTaken.add(match[1]!);
    };
    texts.forEach(collectAddressTaken);
    const pending = [...partUses[part]!];
    while (pending.length > 0) {
      const name = pending.pop()!;
      const fn = functionByName.get(name);
      if (
        !fn ||
        assignment.get(name) === part ||
        copies[part]!.has(name) ||
        addressTaken.has(name) ||
        fn.text.length > SMALL_FUNCTION_COPY_LIMIT
      )
        continue;
      copies[part]!.add(name);
      collectAddressTaken(fn.text);
      for (const inner of referencedSymbols(fn.text)) {
        if (inner === name || partUses[part]!.has(inner)) continue;
        partUses[part]!.add(inner);
        pending.push(inner);
      }
    }
    // A copy found later can take the address of an earlier candidate.
    for (const name of [...copies[part]!]) {
      if (addressTaken.has(name)) copies[part]!.delete(name);
    }
    closeOverConstants(part);
  }

  // A local symbol used outside the part that defines it must be exported.
  const homePart = (name: string): number | undefined => {
    if (functionByName.has(name)) return assignment.get(name);
    if (globals.has(name) && !copyable.has(name)) return 0;
    return undefined;
  };
  const exported = new Set<string>();
  for (let part = 0; part < parts; part++) {
    for (const name of partUses[part]!) {
      const home = homePart(name);
      if (home !== undefined && home !== part && !copies[part]!.has(name))
        exported.add(name);
    }
  }

  const shared = entities
    .filter(
      (entity) =>
        entity.kind === "header" ||
        entity.kind === "type" ||
        entity.kind === "attributes",
    )
    .map((entity) => entity.text);
  const declares = entities.filter((entity) => entity.kind === "declare");

  const modules: string[] = [];
  for (let part = 0; part < parts; part++) {
    const uses = partUses[part]!;
    const out: string[] = [...shared];
    for (const declaration of declares) {
      if (!declaration.name || !functionByName.has(declaration.name)) {
        out.push(declaration.text);
      } else if (
        assignment.get(declaration.name) !== part &&
        !copies[part]!.has(declaration.name)
      ) {
        out.push(declaration.text);
      }
    }
    for (const [name, global] of globals) {
      if (copyable.has(name)) {
        if (uses.has(name)) out.push(global.text);
        continue;
      }
      if (part === 0) {
        out.push(
          exported.has(name)
            ? exportDefinition(global.text, "global")
            : global.text,
        );
      } else if (uses.has(name)) {
        const info = globalType(global.text)!;
        const tls = /\bthread_local\b/.test(info.prefix) ? "thread_local " : "";
        const hidden = isLocalDefinition(global.text, "global")
          ? "hidden "
          : "";
        out.push(
          `@${name} = external ${hidden}${tls}${info.keyword} ${info.type}`,
        );
      }
    }
    for (const fn of functions) {
      const home = assignment.get(fn.name!)!;
      if (home === part) {
        out.push(
          exported.has(fn.name!)
            ? exportDefinition(fn.text, "define")
            : fn.text,
        );
      } else if (copies[part]!.has(fn.name!)) {
        out.push(asInternalCopy(fn.text));
      } else if (uses.has(fn.name!)) {
        const declaration = declarationOf(
          fn.text.slice(0, fn.text.indexOf("\n")),
        );
        if (!declaration) return undefined;
        out.push(
          isLocalDefinition(fn.text, "define")
            ? declaration.replace(/^declare /, "declare hidden ")
            : declaration,
        );
      }
    }
    modules.push(`${out.join("\n\n")}\n`);
  }
  return modules;
}
