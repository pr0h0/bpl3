/**
 * Damages a valid generated program: swaps types, operators, values and
 * identifiers, or changes call shapes and statements. The result is usually
 * invalid, and the type checker must say so. Anything it accepts has to compile:
 * an error raised by code generation, or IR that LLVM rejects, is a compiler
 * bug, because the checker let through something the backend cannot lower.
 */
const TYPE_POOL = [
  "int",
  "u8",
  "i16",
  "long",
  "ulong",
  "double",
  "f32",
  "bool",
  "char",
  "string",
  "void",
  "*int",
  "**int",
  "*u8",
  "*void",
  "int[2]",
  "int[]",
  "*int[2]",
  "int[2][2]",
  "long[4]",
  "(int, bool)",
  "(int, (u8, long))",
  "Func<int>(int)",
  "Lambda<int>(int)",
  "Func<void>()",
  "Box<int>",
  "Box<Box<long>>",
  "Pr<int, u8>",
  "nullptr",
];
export function mutateProgramTypes(src: string, rng: () => number): string {
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)]!;
  const names = [
    ...new Set(
      [...src.matchAll(/^(?:struct|enum) ([A-Za-z_]\w*)/gm)].map((m) => m[1]!),
    ),
  ].filter((n) => !n.startsWith("Opt") && n !== "Box" && n !== "Pr");
  const pool = [
    ...TYPE_POOL,
    ...names,
    ...names.map((n) => `*${n}`),
    ...names.map((n) => `${n}[2]`),
    ...names.map((n) => `${n}[]`),
  ];
  const body = src
    .split("\n")
    .filter((l) => !l.startsWith("# fuzz-"))
    .join("\n");
  const re =
    /(: |cast<|ret |local \w+: |Box<)((?:\*+)?[A-Za-z_]\w*(?:<[^<>()]*>)?(?:\[\d*\])*)/g;
  const sites = [...body.matchAll(re)];
  let out = body;
  const count = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < count; i++) {
    const kind = Math.floor(rng() * 12);
    if (kind >= 5) {
      if (kind === 5) {
        // binary operator swap
        const ops = [
          ...out.matchAll(
            / (\+|-|\*|\/|%|&|\||\^|<<|>>|==|!=|<|>|<=|>=|&&|\|\|) /g,
          ),
        ];
        if (ops.length) {
          const m = pick(ops);
          out =
            out.slice(0, m.index! + 1) +
            pick([
              "+",
              "-",
              "*",
              "/",
              "%",
              "&",
              "|",
              "^",
              "<<",
              ">>",
              "==",
              "!=",
              "<",
              "<=",
              "&&",
              "||",
            ]) +
            out.slice(m.index! + 1 + m[1]!.length);
        }
      } else if (kind === 6) {
        // value replaced by a value of another kind
        const lits = [
          ...out.matchAll(/(?<=[(, ])(-?\d+(?:\.\d+)?|true|false)(?=[),; ])/g),
        ];
        if (lits.length) {
          const m = pick(lits);
          out =
            out.slice(0, m.index!) +
            pick([
              '"s"',
              "null",
              "nullptr",
              "true",
              "1.5",
              "'c'",
              "[1, 2]",
              "(1, true)",
              "[]",
              "-1",
              "0",
              "4294967296",
            ]) +
            out.slice(m.index! + m[1]!.length);
        }
      } else if (kind === 7) {
        // identifier replaced by another
        const ids = [...out.matchAll(/\b([a-z]+\d+)\b/g)];
        if (ids.length > 1) {
          const m = pick(ids);
          out =
            out.slice(0, m.index!) +
            pick(ids)[1]! +
            out.slice(m.index! + m[1]!.length);
        }
      } else if (kind === 8) {
        // member access on the wrong thing
        const ids = [...out.matchAll(/\.(f\d+|v|a|b|x|y|k)\b/g)];
        if (ids.length) {
          const m = pick(ids);
          out =
            out.slice(0, m.index!) +
            pick([
              ".f0",
              ".f9",
              ".v",
              ".len()",
              ".get()",
              "[0]",
              "()",
              ".a.b",
              "",
            ]) +
            out.slice(m.index! + m[0]!.length);
        }
      } else if (kind === 9) {
        // call arguments
        const calls = [
          ...out.matchAll(/(?<!frame )\b([a-z]+\d+)\(([^()]*)\)/g),
        ];
        if (calls.length) {
          const m = pick(calls);
          const args = m[2]!;
          const repl = pick([
            `${m[1]}()`,
            `${m[1]}(${args}, ${args || "1"})`,
            `${m[1]}<int>(${args})`,
            `${m[1]}`,
            `(*${m[1]})(${args})`,
            `${m[1]}(${args})(${args})`,
            `${m[1]}(${args})[0]`,
            `${m[1]}(${args}).f0`,
          ]);
          out =
            out.slice(0, m.index!) + repl + out.slice(m.index! + m[0]!.length);
        }
      } else if (kind === 10) {
        // statements
        const st = [
          ...out.matchAll(
            /^\s+(return [^;]*;|break;|continue;|throw [^;]*;)/gm,
          ),
        ];
        if (st.length) {
          const m = pick(st);
          const text = m[1]!;
          out =
            out.slice(0, m.index! + m[0]!.length - text.length) +
            pick([
              "return;",
              "return 1;",
              "return null;",
              "return (1, 2);",
              "break;",
              "continue;",
              "throw 1;",
              "throw;",
              "fallthrough;",
              "",
            ]) +
            out.slice(m.index! + m[0]!.length);
        }
      } else {
        // struct/array literal fields
        const lits = [...out.matchAll(/\{ (f\d+|a|v|x|id): /g)];
        if (lits.length) {
          const m = pick(lits);
          out =
            out.slice(0, m.index! + 2) +
            pick(["nosuch: 1, ", "f0: 1, ", "__vtable__: 1, ", "a: [1], "]) +
            out.slice(m.index! + 2);
        }
      }
      continue;
    }
    if (kind < 3 && sites.length) {
      const all = [...out.matchAll(re)];
      if (!all.length) continue;
      const m = pick(all);
      const start = m.index! + m[1]!.length;
      out = out.slice(0, start) + pick(pool) + out.slice(start + m[2]!.length);
    } else if (kind === 3) {
      const amps = [...out.matchAll(/&(?=[a-z])/g)];
      if (amps.length) {
        const m = pick(amps);
        out = out.slice(0, m.index!) + out.slice(m.index! + 1);
      }
    } else {
      const ids = [...out.matchAll(/= ([a-z]\w*)([;,)])/g)];
      if (ids.length) {
        const m = pick(ids);
        const start = m.index! + 2;
        out =
          out.slice(0, start) +
          pick(["&", "*", "-", "!", "~"]) +
          out.slice(start);
      }
    }
  }
  return out;
}
