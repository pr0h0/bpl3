/**
 * Random programs that exercise the standard library against exact models:
 * JavaScript strings, arrays, maps, sets, dates, JSON and regular expressions,
 * arbitrary-precision BigInt, and Node's codecs, hashes, checksums, one-time
 * passwords and POSIX paths. Each block of operations prints what it
 * observes, so the first differing line names the failing operation.
 */
import { createHash, createHmac } from "crypto";
import { posix } from "path";
import { crc32 } from "zlib";

import { EXPECT_MARKER, type GeneratedProgram } from "./programGenerator";

interface Block {
  /** Top-level declarations the block's code uses. */
  declarations?: string[];
  imports: string[];
  code: string[];
  output: string[];
}

const NONE = -999;
const optionValue = (expr: string) =>
  `match (${expr}) { Option<int>.Some(v) => v, Option<int>.None => ${NONE} }`;

function compareBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

export function generateStdlibProgram(rng: () => number): GeneratedProgram {
  const int = (min: number, max: number) =>
    min + Math.floor(rng() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
  const text = (alphabet: string, max: number) =>
    Array.from({ length: int(0, max) }, () =>
      alphabet.charAt(int(0, alphabet.length - 1)),
    ).join("");
  let counter = 0;
  const fresh = (prefix: string) => `${prefix}${counter++}`;

  const stringBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const value = text("ab ,A1", 14);
    const name = fresh("s");
    code.push(`local ${name}: String = String.new("${value}");`);
    const show = (label: string, expr: string, expected: string) => {
      const local = fresh("t");
      code.push(
        `local ${local}: String = ${expr};`,
        `printf("${label}=[%s]\\n", ${local}.cstr());`,
      );
      output.push(`${label}=[${expected}]`);
    };
    const number = (
      label: string,
      expr: string,
      expected: number | boolean,
    ) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${Number(expected)}`);
    };
    const needle = text("ab,", 2) || "a";
    const replacement = text("xy", 2);
    for (let index = int(4, 12); index > 0; index--) {
      switch (int(0, 16)) {
        case 0: {
          const [start, len] = [int(-1, 16), int(-1, 16)];
          show(
            "sub",
            `${name}.substring(${start}, ${len})`,
            start < 0 || start >= value.length || len <= 0
              ? ""
              : value.slice(start, start + len),
          );
          break;
        }
        case 1:
          show("trim", `${name}.trim()`, value.trim());
          break;
        case 2:
          show("trimL", `${name}.trimLeft()`, value.trimStart());
          break;
        case 3:
          show("trimR", `${name}.trimRight()`, value.trimEnd());
          break;
        case 4:
          show("up", `${name}.toUpper()`, value.toUpperCase());
          break;
        case 5:
          show("low", `${name}.toLower()`, value.toLowerCase());
          break;
        case 6:
          show("rev", `${name}.reverse()`, [...value].reverse().join(""));
          break;
        case 7: {
          const count = int(0, 3);
          show("rep", `${name}.repeat(${count})`, value.repeat(count));
          break;
        }
        case 8: {
          const width = int(0, 20);
          show(
            "padL",
            `${name}.padLeft(${width}, '*')`,
            value.padStart(width, "*"),
          );
          show(
            "padR",
            `${name}.padRight(${width}, '*')`,
            value.padEnd(width, "*"),
          );
          break;
        }
        case 9:
          show(
            "one",
            `${name}.replace("${needle}", "${replacement}")`,
            value.includes(needle)
              ? value.replace(needle, () => replacement)
              : value,
          );
          break;
        case 10:
          show(
            "all",
            `${name}.replaceAll("${needle}", "${replacement}")`,
            value.split(needle).join(replacement),
          );
          break;
        case 11:
          number("idx", `${name}.indexOf("${needle}")`, value.indexOf(needle));
          number(
            "last",
            `${name}.lastIndexOf("${needle}")`,
            value.lastIndexOf(needle),
          );
          number(
            "count",
            `${name}.count("${needle}")`,
            value.split(needle).length - 1,
          );
          break;
        case 12:
          number(
            "starts",
            `${name}.startsWith("${needle}")`,
            value.startsWith(needle),
          );
          number(
            "ends",
            `${name}.endsWith("${needle}")`,
            value.endsWith(needle),
          );
          number(
            "has",
            `${name}.includes("${needle}")`,
            value.includes(needle),
          );
          break;
        case 13:
          number("digits", `${name}.isDigits()`, /^[0-9]+$/.test(value));
          number("alpha", `${name}.isAlpha()`, /^[a-zA-Z]+$/.test(value));
          number(
            "alnum",
            `${name}.isAlphanumeric()`,
            /^[a-zA-Z0-9]+$/.test(value),
          );
          break;
        case 14: {
          const other = text("ab ,A1", 6);
          show("cat", `${name} + "${other}"`, value + other);
          const right = fresh("o");
          code.push(`local ${right}: String = String.new("${other}");`);
          number("eq", `${name} == ${right}`, value === other);
          number("lt", `${name} < ${right}`, compareBytes(value, other) < 0);
          number("ge", `${name} >= ${right}`, compareBytes(value, other) >= 0);
          break;
        }
        case 15: {
          const parts = fresh("p");
          const expected = value.length === 0 ? [] : value.split(",");
          code.push(
            `local ${parts}: Array<String> = ${name}.split(',');`,
            `printf("split=%d\\n", ${parts}.len());`,
          );
          output.push(`split=${expected.length}`);
          expected.forEach((part, slot) => {
            code.push(
              `printf("part=[%s]\\n", ${parts}.getRef(${slot}).cstr());`,
            );
            output.push(`part=[${part}]`);
          });
          break;
        }
        default:
          if (value.length > 0) {
            const slot = int(0, value.length - 1);
            number("at", `${name}.get(${slot})`, value.charCodeAt(slot));
          }
          break;
      }
    }
    return {
      imports: [
        'import [String] from "std/string.bpl";',
        'import [Array] from "std/array.bpl";',
      ],
      code,
      output,
    };
  };

  const arrayBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const name = fresh("xs");
    code.push(`local ${name}: Array<int> = Array<int>.new(${int(1, 4)});`);
    const model: number[] = [];
    const say = (label: string, expr: string, value: number | boolean) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${Number(value)}`);
    };
    for (let index = int(8, 40); index > 0; index--) {
      const value = int(-9, 9);
      switch (int(0, 13)) {
        case 0:
        case 1:
        case 2:
        case 3:
          code.push(`${name}.push(${value});`);
          model.push(value);
          break;
        case 4:
          if (model.length > 0) say("pop", `${name}.pop()`, model.pop()!);
          break;
        case 5:
          if (model.length > 0) {
            const slot = int(0, model.length - 1);
            say("get", `${name}.get(${slot})`, model[slot]!);
          }
          break;
        case 6:
          if (model.length > 0) {
            const slot = int(0, model.length - 1);
            code.push(`${name}.set(${slot}, ${value});`);
            model[slot] = value;
          }
          break;
        case 7: {
          const slot = int(0, model.length);
          code.push(`${name}.insert(${slot}, ${value});`);
          model.splice(slot, 0, value);
          break;
        }
        case 8:
          if (model.length > 0) {
            const slot = int(0, model.length - 1);
            code.push(`${name}.removeAt(${slot});`);
            model.splice(slot, 1);
          }
          break;
        case 9:
          say("idx", `${name}.indexOf(${value})`, model.indexOf(value));
          say("has", `${name}.contains(${value})`, model.includes(value));
          break;
        case 10: {
          code.push(
            `${name}.sortBy(|a: int, b: int| ret int { return a - b; });`,
          );
          model.sort((a, b) => a - b);
          break;
        }
        case 11: {
          const kept = fresh("kept");
          code.push(
            `local ${kept}: Array<int> = ${name}.filter(|v: int, i: int| ret bool { return ((v + i) & 1) == 0; });`,
            `printf("kept=%d\\n", ${kept}.len());`,
          );
          output.push(
            `kept=${model.filter((v, i) => ((v + i) & 1) === 0).length}`,
          );
          break;
        }
        case 12: {
          say(
            "every",
            `${name}.every(|v: int| ret bool { return v > -5; })`,
            model.every((v) => v > -5),
          );
          say(
            "some",
            `${name}.some(|v: int| ret bool { return v > 5; })`,
            model.some((v) => v > 5),
          );
          const found = model.find((v) => v > 2);
          code.push(
            `printf("find=%d\\n", ${optionValue(`${name}.find(|v: int| ret bool { return v > 2; })`)});`,
          );
          output.push(`find=${found ?? NONE}`);
          break;
        }
        default: {
          const copy = fresh("copy");
          code.push(
            `local ${copy}: Array<int> = ${name}.clone();`,
            `${copy}.push(1);`,
            `printf("clone=%d %d\\n", ${copy}.len(), ${name}.len());`,
          );
          output.push(`clone=${model.length + 1} ${model.length}`);
          break;
        }
      }
    }
    say("len", `${name}.len()`, model.length);
    model.forEach((value, slot) => say("v", `${name}.get(${slot})`, value));
    return {
      imports: [
        'import [Array] from "std/array.bpl";',
        'import [Option] from "std/option.bpl";',
      ],
      code,
      output,
    };
  };

  const mapBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const name = fresh("m");
    code.push(`local ${name}: Map<int, int> = Map<int, int>.new();`);
    const model = new Map<number, number>();
    const say = (label: string, expr: string, value: number | boolean) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${Number(value)}`);
    };
    for (let index = int(20, 70); index > 0; index--) {
      const key = int(-20, 60);
      const value = int(-99, 99);
      switch (int(0, 6)) {
        case 0:
        case 1:
        case 2:
          code.push(`${name}.set(${key}, ${value});`);
          model.set(key, value);
          break;
        case 3:
          code.push(
            `printf("get=%d\\n", ${optionValue(`${name}.get(${key})`)});`,
          );
          output.push(`get=${model.get(key) ?? NONE}`);
          break;
        case 4:
          say("or", `${name}.getOr(${key}, 777)`, model.get(key) ?? 777);
          say("has", `${name}.has(${key})`, model.has(key));
          break;
        case 5:
          say("rm", `${name}.remove(${key})`, model.delete(key));
          break;
        default:
          say("size", `${name}.size()`, model.size);
          break;
      }
    }
    const keys = fresh("k");
    code.push(`local ${keys}: Array<int> = ${name}.keys();`);
    code.push(
      `local sum${keys}: int = 0;`,
      `loop (local i: int = 0; i < ${keys}.len(); i = i + 1) { sum${keys} = sum${keys} + ${keys}.get(i); }`,
      `printf("keys=%d %d\\n", ${keys}.len(), sum${keys});`,
    );
    output.push(
      `keys=${model.size} ${[...model.keys()].reduce((a, b) => a + b, 0)}`,
    );
    return {
      imports: [
        'import [Map] from "std/map.bpl";',
        'import [Array] from "std/array.bpl";',
        'import [Option] from "std/option.bpl";',
      ],
      code,
      output,
    };
  };

  const setBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const [a, b] = [fresh("a"), fresh("b")];
    code.push(
      `local ${a}: Set<int> = Set<int>.new();`,
      `local ${b}: Set<int> = Set<int>.new();`,
    );
    const left = new Set<number>();
    const right = new Set<number>();
    for (let index = int(10, 40); index > 0; index--) {
      const value = int(0, 20);
      const useLeft = int(0, 1) === 0;
      const [local, model] = useLeft ? [a, left] : [b, right];
      if (int(0, 3) === 0) {
        code.push(`printf("rm=%d\\n", cast<int>(${local}.remove(${value})));`);
        output.push(`rm=${Number(model.delete(value))}`);
      } else {
        code.push(`${local}.add(${value});`);
        model.add(value);
      }
    }
    const report = (label: string, method: string, values: number[]) => {
      const set = fresh("r");
      const items = fresh("items");
      code.push(
        `local ${set}: Set<int> = ${a}.${method}(&${b});`,
        `local ${items}: Array<int> = ${set}.toArray();`,
        `local sum${items}: int = 0;`,
        `loop (local i: int = 0; i < ${items}.len(); i = i + 1) { sum${items} = sum${items} + ${items}.get(i); }`,
        `printf("${label}=%d %d\\n", ${set}.size(), sum${items});`,
      );
      output.push(
        `${label}=${values.length} ${values.reduce((x, y) => x + y, 0)}`,
      );
    };
    report("union", "union", [...new Set([...left, ...right])]);
    report(
      "inter",
      "intersection",
      [...left].filter((value) => right.has(value)),
    );
    report(
      "diff",
      "difference",
      [...left].filter((value) => !right.has(value)),
    );
    code.push(`printf("sub=%d\\n", cast<int>(${a}.isSubsetOf(&${b})));`);
    output.push(`sub=${Number([...left].every((value) => right.has(value)))}`);
    return {
      imports: [
        'import [Set] from "std/set.bpl";',
        'import [Array] from "std/array.bpl";',
      ],
      code,
      output,
    };
  };

  const dequeBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const name = fresh("d");
    code.push(`local ${name}: Deque<int> = Deque<int>.new(${int(1, 3)});`);
    const model: number[] = [];
    const option = (label: string, expr: string, value: number | undefined) => {
      code.push(`printf("${label}=%d\\n", ${optionValue(expr)});`);
      output.push(`${label}=${value ?? NONE}`);
    };
    for (let index = int(15, 60); index > 0; index--) {
      const value = int(-99, 99);
      switch (int(0, 6)) {
        case 0:
        case 1:
          code.push(`${name}.pushBack(${value});`);
          model.push(value);
          break;
        case 2:
          code.push(`${name}.pushFront(${value});`);
          model.unshift(value);
          break;
        case 3:
          option("popF", `${name}.popFront()`, model.shift());
          break;
        case 4:
          option("popB", `${name}.popBack()`, model.pop());
          break;
        case 5: {
          const slot = int(-1, model.length);
          option(
            "get",
            `${name}.get(${slot})`,
            slot >= 0 && slot < model.length ? model[slot] : undefined,
          );
          break;
        }
        default: {
          const slot = int(-1, model.length);
          const ok = slot >= 0 && slot < model.length;
          code.push(
            `printf("set=%d\\n", cast<int>(${name}.set(${slot}, ${value})));`,
          );
          output.push(`set=${Number(ok)}`);
          if (ok) model[slot] = value;
          break;
        }
      }
    }
    option("peekF", `${name}.peekFront()`, model[0]);
    option("peekB", `${name}.peekBack()`, model[model.length - 1]);
    code.push(`printf("size=%d\\n", ${name}.size());`);
    output.push(`size=${model.length}`);
    return {
      imports: [
        'import [Deque] from "std/deque.bpl";',
        'import [Option] from "std/option.bpl";',
      ],
      code,
      output,
    };
  };

  const bigIntBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const digits = () => {
      const size = pick([1, 4, 9, 10, 18, 19, 28, 40]);
      const body = text("0123456789", size) || "0";
      return BigInt(`${int(0, 1) === 0 ? "-" : ""}${body}`);
    };
    const [x, y] = [digits(), digits() || 1n];
    const [a, b] = [fresh("n"), fresh("n")];
    code.push(
      `local ${a}: BigInt = BigInt.parse("${x}");`,
      `local ${b}: BigInt = BigInt.parse("${y}");`,
    );
    const show = (label: string, expr: string, value: bigint) => {
      const local = fresh("r");
      code.push(
        `local ${local}: BigInt = ${expr};`,
        `printf("${label}=%s\\n", ${local}.toString());`,
      );
      output.push(`${label}=${value}`);
    };
    show("self", `${a}.clone()`, x);
    show("add", `${a}.add(&${b})`, x + y);
    show("sub", `${a}.subtract(&${b})`, x - y);
    show("mul", `${a}.multiply(&${b})`, x * y);
    show("neg", `${a}.negate()`, -x);
    show("abs", `${a}.abs()`, x < 0n ? -x : x);
    show("gcd", `${a}.gcd(&${b})`, gcd(x, y));
    const exponent = int(0, 5);
    show("pow", `${a}.pow(${exponent})`, x ** BigInt(exponent));
    if (y !== 0n) {
      const rest = fresh("rem");
      const quotient = fresh("q");
      code.push(
        `local ${rest}: BigInt = BigInt.fromLong(cast<long>(0));`,
        `local ${quotient}: BigInt = ${a}.divide(&${b}, &${rest});`,
        `printf("div=%s rem=%s\\n", ${quotient}.toString(), ${rest}.toString());`,
      );
      output.push(`div=${x / y} rem=${x % y}`);
    }
    code.push(
      `printf("cmp=%d eq=%d\\n", ${a}.compare(&${b}), cast<int>(${a}.equals(&${b})));`,
    );
    output.push(`cmp=${x < y ? -1 : x > y ? 1 : 0} eq=${Number(x === y)}`);
    return {
      imports: ['import [BigInt] from "std/bigint.bpl";'],
      code,
      output,
    };
  };

  const rationalBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const part = () => BigInt(int(-40, 40));
    const denominator = () => BigInt(pick([1, 2, 3, 4, 6, 7, 9, 12, -5, -8]));
    const normal = (n: bigint, d: bigint): [bigint, bigint] => {
      const divisor = gcd(n, d) || 1n;
      const sign = d < 0n ? -1n : 1n;
      return [(n / divisor) * sign, (d / divisor) * sign];
    };
    const [an, ad] = [part(), denominator()];
    const [bn, bd] = [part() || 1n, denominator()];
    const [a, b] = [fresh("q"), fresh("q")];
    code.push(
      `local ${a}: Rational = Rational.new(cast<long>(${an}), cast<long>(${ad}));`,
      `local ${b}: Rational = Rational.new(cast<long>(${bn}), cast<long>(${bd}));`,
    );
    const show = (label: string, expr: string, n: bigint, d: bigint) => {
      const local = fresh("r");
      const [num, den] = normal(n, d);
      code.push(
        `local ${local}: Rational = ${expr};`,
        `printf("${label}=%ld/%ld\\n", ${local}.num, ${local}.den);`,
      );
      output.push(`${label}=${num}/${den}`);
    };
    show("add", `${a}.add(${b})`, an * bd + bn * ad, ad * bd);
    show("sub", `${a}.sub(${b})`, an * bd - bn * ad, ad * bd);
    show("mul", `${a}.mul(${b})`, an * bn, ad * bd);
    if (bn !== 0n) show("div", `${a}.div(${b})`, an * bd, ad * bn);
    show("neg", `${a}.negate()`, -an, ad);
    const [num, den] = normal(an, ad);
    const floor = (num - (((num % den) + den) % den)) / den;
    const remainder = num - floor * den;
    code.push(
      `printf("floor=%ld ceil=%ld round=%ld\\n", ${a}.floor(), ${a}.ceil(), ${a}.round());`,
    );
    output.push(
      `floor=${floor} ceil=${remainder === 0n ? floor : floor + 1n} round=${remainder >= den - remainder ? floor + 1n : floor}`,
    );
    const compared =
      an * bd * (ad * bd > 0n ? 1n : -1n) - bn * ad * (ad * bd > 0n ? 1n : -1n);
    code.push(`printf("cmp=%d\\n", ${a}.compare(&${b}));`);
    output.push(`cmp=${compared < 0n ? -1 : compared > 0n ? 1 : 0}`);
    return {
      imports: ['import [Rational] from "std/rational.bpl";'],
      code,
      output,
    };
  };

  const codecBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const value = text("abcXYZ019 +/-_~.", 40);
    const buffer = Buffer.from(value);
    const line = (label: string, expr: string, expected: string) => {
      code.push(`printf("${label}=[%s]\\n", ${expr});`);
      output.push(`${label}=[${expected}]`);
    };
    const encoded = buffer.toString("base64");
    line("b64", `Base64.encodeString("${value}")`, encoded);
    line(
      "b64url",
      `Base64.encodeStringUrl("${value}")`,
      buffer.toString("base64url"),
    );
    line("b64back", `Base64.decodeToString("${encoded}")`, value);
    const hex = buffer.toString("hex");
    line("hex", `Hex.encodeString("${value}")`, hex);
    line("hexback", `Hex.decodeToString("${hex}")`, value);
    const encoded32 = base32Encode(buffer);
    line("b32", `Base32.encodeString("${value}")`, encoded32);
    line("b32back", `Base32.decodeToString("${encoded32}")`, value);
    line(
      "sha1",
      `Sha1.hex("${value}")`,
      createHash("sha1").update(buffer).digest("hex"),
    );
    return {
      imports: [
        'import [Base32] from "std/base32.bpl";',
        'import [Base64] from "std/base64.bpl";',
        'import [Hex] from "std/hex.bpl";',
        'import [Sha1] from "std/sha1.bpl";',
      ],
      code,
      output,
    };
  };

  const heapBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const name = fresh("pq");
    code.push(
      `local ${name}: PriorityQueue<int> = PriorityQueue<int>.new(${int(1, 3)});`,
    );
    const model: number[] = [];
    for (let index = int(15, 60); index > 0; index--) {
      if (int(0, 2) === 0) {
        model.sort((a, b) => a - b);
        code.push(`printf("pop=%d\\n", ${optionValue(`${name}.pop()`)});`);
        output.push(`pop=${model.shift() ?? NONE}`);
      } else {
        const value = int(-30, 30);
        code.push(`${name}.push(${value});`);
        model.push(value);
      }
    }
    code.push(`printf("len=%d\\n", ${name}.len());`);
    output.push(`len=${model.length}`);
    return {
      imports: [
        'import [PriorityQueue] from "std/priority_queue.bpl";',
        'import [Option] from "std/option.bpl";',
      ],
      code,
      output,
    };
  };

  const listBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const list = fresh("ll");
    const queue = fresh("qq");
    code.push(
      `local ${list}: LinkedList<int> = LinkedList<int>.new();`,
      `local ${queue}: Queue<int> = Queue<int>.new(${int(1, 3)});`,
    );
    const listModel: number[] = [];
    const queueModel: number[] = [];
    const option = (label: string, expr: string, value: number | undefined) => {
      code.push(`printf("${label}=%d\\n", ${optionValue(expr)});`);
      output.push(`${label}=${value ?? NONE}`);
    };
    for (let index = int(20, 60); index > 0; index--) {
      const value = int(-99, 99);
      switch (int(0, 7)) {
        case 0:
          code.push(`${list}.pushBack(${value});`);
          listModel.push(value);
          break;
        case 1:
          code.push(`${list}.pushFront(${value});`);
          listModel.unshift(value);
          break;
        case 2:
          option("lpopB", `${list}.popBack()`, listModel.pop());
          break;
        case 3:
          option("lpopF", `${list}.popFront()`, listModel.shift());
          break;
        case 4:
          option("front", `${list}.front()`, listModel[0]);
          option("back", `${list}.back()`, listModel[listModel.length - 1]);
          break;
        case 5:
        case 6:
          code.push(`${queue}.enqueue(${value});`);
          queueModel.push(value);
          break;
        default:
          option("deq", `${queue}.dequeue()`, queueModel.shift());
          option("peek", `${queue}.peek()`, queueModel[0]);
          break;
      }
    }
    code.push(`printf("sizes=%d %d\\n", ${list}.len(), ${queue}.size());`);
    output.push(`sizes=${listModel.length} ${queueModel.length}`);
    return {
      imports: [
        'import [LinkedList] from "std/linked_list.bpl";',
        'import [Queue] from "std/queue.bpl";',
        'import [Option] from "std/option.bpl";',
      ],
      code,
      output,
    };
  };

  const bitsBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const size = pick([1, 7, 8, 31, 32, 33, 63, 64, 65, 100, 128, 130]);
    const [a, b] = [fresh("ba"), fresh("bb")];
    code.push(
      `local ${a}: BitSet = BitSet.new(${size});`,
      `local ${b}: BitSet = BitSet.new(${size});`,
    );
    const left = Array.from({ length: size }, () => false);
    const right = Array.from({ length: size }, () => false);
    const say = (label: string, expr: string, value: number | boolean) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${Number(value)}`);
    };
    const report = () => {
      say("count", `${a}.count()`, left.filter(Boolean).length);
      say("first", `${a}.firstSet()`, left.indexOf(true));
      say("last", `${a}.lastSet()`, left.lastIndexOf(true));
      say("all", `${a}.all()`, left.every(Boolean));
      say("any", `${a}.any()`, left.some(Boolean));
      say("none", `${a}.none()`, !left.some(Boolean));
    };
    for (let index = int(15, 50); index > 0; index--) {
      const slot = int(0, size - 1);
      const useLeft = int(0, 2) > 0;
      const [local, model] = useLeft ? [a, left] : [b, right];
      switch (int(0, 9)) {
        case 0:
        case 1:
        case 2:
          code.push(`${local}.set(${slot});`);
          model[slot] = true;
          break;
        case 3:
          code.push(`${local}.clear(${slot});`);
          model[slot] = false;
          break;
        case 4:
          code.push(`${local}.flip(${slot});`);
          model[slot] = !model[slot];
          break;
        case 5:
          say("test", `${local}.test(${slot})`, model[slot]!);
          break;
        case 6: {
          const [method, combine] = pick([
            ["andWith", (x: boolean, y: boolean) => x && y],
            ["orWith", (x: boolean, y: boolean) => x || y],
            ["xorWith", (x: boolean, y: boolean) => x !== y],
          ] as const);
          code.push(`${a}.${method}(&${b});`);
          left.forEach((value, bit) => {
            left[bit] = combine(value, right[bit]!);
          });
          break;
        }
        case 7:
          code.push(`${local}.flipAll();`);
          model.forEach((value, bit) => {
            model[bit] = !value;
          });
          break;
        case 8:
          say(
            "eq",
            `${a}.equals(&${b})`,
            left.every((value, bit) => value === right[bit]),
          );
          break;
        default:
          report();
          break;
      }
    }
    report();
    return {
      imports: ['import [BitSet] from "std/bitset.bpl";'],
      code,
      output,
    };
  };

  const parseBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const INT_MAX = 2147483647n;
    const samples = [
      "0",
      "7",
      "-7",
      "+7",
      "007",
      "12a",
      "a12",
      "",
      "-",
      "+",
      " 5",
      "5 ",
      "2147483647",
      "-2147483648",
      "2147483648",
      "-2147483649",
      "9223372036854775807",
      "-9223372036854775808",
      "9223372036854775808",
      "99999999999999999999",
    ];
    for (let index = int(4, 10); index > 0; index--) {
      const value = pick(samples);
      const local = fresh("pv");
      const valid = /^[+-]?\d+$/.test(value);
      const parsed = valid ? BigInt(value) : 0n;
      const fits = (max: bigint) =>
        valid && parsed <= max && parsed >= -max - 1n;
      if (int(0, 1) === 0) {
        const ok = fits(INT_MAX);
        code.push(
          `local ${local}: int = 123;`,
          `printf("int=%d", cast<int>(Parse.int("${value}", &${local})));`,
          `printf(" %d\\n", ${local});`,
        );
        output.push(`int=${Number(ok)} ${ok ? parsed : 123}`);
      } else {
        const ok = fits(9223372036854775807n);
        code.push(
          `local ${local}: long = cast<long>(123);`,
          `printf("long=%d", cast<int>(Parse.long("${value}", &${local})));`,
          `printf(" %ld\\n", ${local});`,
        );
        output.push(`long=${Number(ok)} ${ok ? parsed : 123}`);
      }
    }
    return { imports: ['import [Parse] from "std/parse.bpl";'], code, output };
  };

  const base32Encode = (buffer: Buffer): string => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let result = "";
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
      value &= (1 << bits) - 1;
    }
    if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
    return result.padEnd(Math.ceil(result.length / 8) * 8, "=");
  };

  const literal = (value: string) =>
    `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  /** Prints each line a value is expected to produce, under one label. */
  const expectLines = (output: string[], label: string, value: string) => {
    value.split("\n").forEach((line, index) => {
      output.push(index === 0 ? `${label}=${line}` : line);
    });
  };

  const hashBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    // Message lengths around each padding and block boundary of the hashes.
    const sized = (length: number) =>
      Array.from({ length }, () => "abcXYZ019 -_".charAt(int(0, 11))).join("");
    const edge = () =>
      pick([0, 1, 55, 56, 57, 63, 64, 65, 111, 112, 113, 127, 128, 129, 250]);
    const algorithms = [
      ["sha256", "Sha256", 32],
      ["sha384", "Sha384", 48],
      ["sha512", "Sha512", 64],
    ] as const;
    const printDigest = (buffer: string, size: number) => {
      code.push(
        `loop (local i: int = 0; i < ${size}; i = i + 1) { printf("%02x", cast<int>(${buffer}[i])); }`,
        `printf("\\n");`,
      );
    };
    for (let index = int(2, 4); index > 0; index--) {
      const [algorithm, type, size] = pick(algorithms);
      const message = sized(edge());
      code.push(
        `printf("${algorithm}=%s\\n", ${type}.hex(${literal(message)}));`,
      );
      output.push(
        `${algorithm}=${createHash(algorithm).update(message).digest("hex")}`,
      );

      // The same digest whatever the update boundaries are.
      const state = fresh("h");
      const digest = fresh("d");
      code.push(`local ${state}: ${type} = ${type}.new();`);
      let rest = message;
      while (rest.length > 0) {
        const piece = rest.slice(0, int(1, 70));
        rest = rest.slice(piece.length);
        code.push(
          `${state}.update(cast<*u8>(${literal(piece)}), ${piece.length});`,
        );
      }
      code.push(
        `local ${digest}: u8[${size}];`,
        `${state}.finish(&${digest}[0]);`,
      );
      printDigest(digest, size);
      output.push(createHash(algorithm).update(message).digest("hex"));
    }
    const key = sized(pick([1, 20, 63, 64, 65, 127, 128, 129, 200]));
    const message = sized(edge());
    code.push(
      `printf("hmac=%s\\n", Hmac.hex(${literal(key)}, ${literal(message)}));`,
      `printf("hmac512=%s\\n", HmacSha512.hex(${literal(key)}, ${literal(message)}));`,
    );
    const hmac = (algorithm: string) =>
      createHmac(algorithm, key).update(message).digest("hex");
    output.push(`hmac=${hmac("sha256")}`, `hmac512=${hmac("sha512")}`);
    const mac = fresh("d");
    code.push(
      `local ${mac}: u8[20];`,
      `HmacSha1.digest(cast<*u8>(${literal(key)}), ${key.length}, cast<*u8>(${literal(message)}), ${message.length}, &${mac}[0]);`,
    );
    printDigest(mac, 20);
    output.push(hmac("sha1"));
    return {
      imports: [
        'import [Sha256] from "std/sha256.bpl";',
        'import [Sha384] from "std/sha384.bpl";',
        'import [Sha512] from "std/sha512.bpl";',
        'import [Hmac], [HmacSha512], [HmacSha1] from "std/hmac.bpl";',
      ],
      code,
      output,
    };
  };

  /** `std/hash` checksums and `std/otp` codes against FNV-1a, zlib and RFC 4226. */
  const checksumBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const bytes = (value: string) => Buffer.from(value, "latin1");
    const fnv32 = (value: string) =>
      bytes(value).reduce(
        (hash, byte) => Math.imul(hash ^ byte, 16777619) >>> 0,
        2166136261,
      );
    const fnv64 = (value: string) =>
      bytes(value).reduce(
        (hash, byte) =>
          ((hash ^ BigInt(byte)) * 1099511628211n) & 0xffffffffffffffffn,
        14695981039346656037n,
      );
    const adler32 = (value: string) => {
      let [a, b] = [1, 0];
      for (const byte of bytes(value)) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
      }
      return b * 65536 + a;
    };
    for (let index = int(2, 5); index > 0; index--) {
      const message = text('abcXYZ019 -_"', 40);
      const split = int(0, message.length);
      const text0 = literal(message);
      const tail = literal(message.slice(split));
      code.push(
        `printf("fnv=%u %lu sum=%u\\n", Hash.fnv1a32(${text0}), Hash.fnv1a64(${text0}), Hash.checksum32(${text0}));`,
        `printf("crc=%u %u adler=%u\\n", Hash.crc32String(${text0}), Hash.crc32Update(Hash.crc32(cast<*u8>(${text0}), ${split}), cast<*u8>(${tail}), ${message.length - split}), Hash.adler32(cast<*u8>(${text0}), ${message.length}));`,
      );
      const crc = crc32(bytes(message)) >>> 0;
      output.push(
        `fnv=${fnv32(message)} ${fnv64(message)} sum=${bytes(message).reduce((a, b) => a + b, 0)}`,
        `crc=${crc} ${crc} adler=${adler32(message)}`,
      );
    }
    const [left, right] = [int(0, 0xffffffff), int(0, 0xffffffff)];
    code.push(`printf("combine=%u\\n", Hash.combine32(${left}, ${right}));`);
    output.push(
      `combine=${(left ^ ((right + 2654435769 + ((left << 6) >>> 0) + (left >>> 2)) >>> 0)) >>> 0}`,
    );
    const key = text("abcXYZ019 -_", 70) || "k";
    for (let index = int(1, 3); index > 0; index--) {
      const counter = pick([0, 1, int(0, 1 << 30), int(0, 2 ** 40)]);
      const digits = int(5, 10);
      code.push(
        `printf("hotp=%d\\n", Otp.hotp(cast<*u8>(${literal(key)}), ${key.length}, ${counter}, ${digits}));`,
      );
      const message = Buffer.alloc(8);
      message.writeBigUInt64BE(BigInt(counter));
      const mac = createHmac("sha1", key).update(message).digest();
      const offset = mac[19]! & 0x0f;
      const value = mac.readUInt32BE(offset) & 0x7fffffff;
      output.push(
        `hotp=${digits < 6 || digits > 9 ? -1 : value % 10 ** digits}`,
      );
    }
    return {
      imports: [
        'import [Hash] from "std/hash.bpl";',
        'import [Otp] from "std/otp.bpl";',
      ],
      code,
      output,
    };
  };

  const pathBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const part = () =>
      pick(["a", "bc", "d.txt", ".hid", "e.tar.gz", "f.", "..", "."]);
    const path = (absolute: boolean, parts = int(1, 5)) =>
      (absolute ? "/" : "") +
      Array.from({ length: parts }, part).join("/") +
      (int(0, 3) === 0 ? "/" : "");
    const show = (label: string, expr: string, expected: string) => {
      const name = fresh("p");
      code.push(
        `local ${name}: String = ${expr};`,
        `printf("${label}=[%s]\\n", ${name}.data);`,
      );
      output.push(`${label}=[${expected}]`);
    };
    for (let index = int(3, 8); index > 0; index--) {
      const value = path(int(0, 1) === 0);
      const quoted = literal(value);
      show("dir", `Path.dirname(${quoted})`, posix.dirname(value));
      show("base", `Path.basename(${quoted})`, posix.basename(value));
      show("ext", `Path.extname(${quoted})`, posix.extname(value));
      show(
        "norm",
        `Path.normalize(${quoted})`,
        // Unlike Node, the canonical form has no trailing slash.
        posix.normalize(value).replace(/(?<=.)\/$/, ""),
      );
      code.push(`printf("abs=%d\\n", cast<int>(Path.isAbsolute(${quoted})));`);
      output.push(`abs=${Number(posix.isAbsolute(value))}`);
      const from = path(true);
      const to = path(true);
      show(
        "rel",
        `Path.relative(${literal(from)}, ${literal(to)})`,
        posix.relative(from, to),
      );
    }
    return {
      imports: [
        'import [Path] from "std/path.bpl";',
        'import [String] from "std/string.bpl";',
      ],
      code,
      output,
    };
  };

  const urlBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const encode = (value: string, plus: boolean) =>
      [...Buffer.from(value)]
        .map((byte) => {
          const char = String.fromCharCode(byte);
          if (/[A-Za-z0-9\-_.~]/.test(char)) return char;
          if (plus && byte === 32) return "+";
          return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
        })
        .join("");
    for (let index = int(2, 6); index > 0; index--) {
      const value = text("aZ09-_.~!*'() %+/&=é€", 24);
      const quoted = literal(value);
      const component = encode(value, false);
      const form = encode(value, true);
      code.push(
        `printf("enc=%s\\n", Url.encodeComponent(${quoted}));`,
        `printf("form=%s\\n", Url.encodeForm(${quoted}));`,
        `printf("dec=%s\\n", Url.decode(${literal(component)}));`,
        `printf("defo=%s\\n", Url.decodeForm(${literal(form)}));`,
      );
      output.push(
        `enc=${component}`,
        `form=${form}`,
        `dec=${value}`,
        `defo=${value}`,
      );
    }
    return {
      imports: ['import [Url] from "std/url.bpl";'],
      code,
      output,
    };
  };

  const utf8Block = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const say = (label: string, expr: string, value: number) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${value}`);
    };
    for (let index = int(2, 5); index > 0; index--) {
      const points = Array.from({ length: int(0, 10) }, () =>
        pick([
          int(1, 0x7f),
          int(0x80, 0x7ff),
          int(0x800, 0xd7ff),
          int(0xe000, 0xffff),
          int(0x10000, 0x10ffff),
        ]),
      ).filter((point) => point !== 34 && point !== 92 && point >= 32);
      const value = String.fromCodePoint(...points);
      const quoted = literal(value);
      const bytes = Buffer.byteLength(value);
      say("bytes", `UTF8.byteLength(${quoted})`, bytes);
      say("count", `UTF8.codepointCount(${quoted})`, points.length);
      say("valid", `UTF8.isValid(${quoted})`, 1);
      say(
        "ascii",
        `UTF8.isAsciiString(${quoted})`,
        Number(points.every((point) => point < 0x80)),
      );
      const list = fresh("u");
      code.push(`local ${list}: Array<u32> = UTF8.toCodepoints(${quoted});`);
      say("n", `${list}.len()`, points.length);
      let at = 0;
      points.forEach((point, position) => {
        say("cp", `${list}.get(${position})`, point);
        say("at", `UTF8.decodeCodepoint(${quoted}, ${at})`, point);
        at += Buffer.byteLength(String.fromCodePoint(point));
      });
      for (const point of points) {
        const buffer = fresh("b");
        const written = fresh("w");
        const encoded = Buffer.from(String.fromCodePoint(point));
        code.push(
          `local ${buffer}: u8[5];`,
          `local ${written}: int = UTF8.encodeCodepoint(cast<u32>(${point}), &${buffer}[0]);`,
          `printf("enc=%d:", ${written});`,
          `loop (local i: int = 0; i < ${written}; i = i + 1) { printf("%02x", cast<int>(${buffer}[i])); }`,
          `printf("\\n");`,
        );
        output.push(`enc=${encoded.length}:${encoded.toString("hex")}`);
      }
    }
    // Byte sequences near every rule of well-formed UTF-8.
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (let index = int(4, 12); index > 0; index--) {
      const bytes = Array.from({ length: int(1, 6) }, () =>
        pick([
          int(0x41, 0x5a),
          int(0x80, 0xbf),
          0xa0,
          0x8f,
          0x90,
          int(0xc0, 0xc2),
          int(0xc3, 0xdf),
          0xe0,
          0xed,
          0xef,
          0xf0,
          0xf4,
          0xf5,
          0xff,
        ]),
      );
      const source = bytes
        .map((byte) => `\\x${byte.toString(16).padStart(2, "0")}`)
        .join("");
      let valid = 1;
      try {
        decoder.decode(Buffer.from(bytes));
      } catch {
        valid = 0;
      }
      say("raw", `UTF8.isValid("${source}")`, valid);
    }
    return {
      imports: [
        'import [UTF8] from "std/utf8.bpl";',
        'import [Array] from "std/array.bpl";',
      ],
      code,
      output,
    };
  };

  const jsonBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const scalar = (): unknown =>
      pick([
        () => int(-999, 999),
        () => true,
        () => false,
        () => null,
        () => text('ab {}[],:"\\/', 8),
      ])();
    const value = (depth: number): unknown => {
      const shape = depth <= 0 ? 0 : int(0, 3);
      if (shape === 1) {
        return Array.from({ length: int(0, 4) }, () => value(depth - 1));
      }
      if (shape === 2) {
        const object: Record<string, unknown> = {};
        for (let index = int(0, 4); index > 0; index--) {
          object[`k${text("abc", 2)}`] = value(depth - 1);
        }
        return object;
      }
      return scalar();
    };
    const gap = () => pick(["", "", " ", "\\t", "  "]);
    // JSON source text with arbitrary insignificant whitespace.
    const spaced = (item: unknown): string => {
      if (Array.isArray(item)) {
        return `[${gap()}${item.map((entry) => `${gap()}${spaced(entry)}${gap()}`).join(",")}${gap()}]`;
      }
      if (item !== null && typeof item === "object") {
        const fields = Object.entries(item).map(
          ([key, entry]) =>
            `${gap()}${JSON.stringify(key)}${gap()}:${gap()}${spaced(entry)}${gap()}`,
        );
        return `{${gap()}${fields.join(",")}${gap()}}`;
      }
      return JSON.stringify(item);
    };
    // The text goes straight into a string literal; `\t` above already is one.
    const quote = (source: string) =>
      `"${source.replace(/\\(?!t)/g, "\\\\").replace(/"/g, '\\"')}"`;
    for (let index = int(2, 5); index > 0; index--) {
      const item = value(3);
      const source = quote(spaced(item));
      const indent = int(1, 4);
      code.push(
        `printf("min=%s\\n", JSON.minify(${source}));`,
        `printf("pretty=%s\\n", JSON.pretty(${source}, ${indent}));`,
      );
      output.push(`min=${JSON.stringify(item)}`);
      expectLines(output, "pretty", JSON.stringify(item, null, indent));
    }
    return { imports: ['import [JSON] from "std/json.bpl";'], code, output };
  };

  const regexBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const atom = (depth: number): string =>
      pick([
        () => pick(["a", "b", "c", "1"]),
        () => ".",
        () => "\\d",
        () => pick(["[ab]", "[^a]", "[a-c]", "[0-9b]"]),
        () => (depth > 0 ? `(${alternation(depth - 1)})` : "a"),
      ])();
    const repeated = (depth: number): string =>
      atom(depth) +
      pick([
        "",
        "",
        "",
        "*",
        "+",
        "?",
        `{${int(0, 2)}}`,
        `{${int(0, 1)},${int(1, 3)}}`,
      ]);
    const sequence = (depth: number): string =>
      Array.from({ length: int(1, 3) }, () => repeated(depth)).join("");
    const alternation = (depth: number): string =>
      Array.from({ length: int(1, 2) }, () => sequence(depth)).join("|");
    for (let index = int(2, 5); index > 0; index--) {
      const pattern = alternation(2);
      const full = new RegExp(`^(?:${pattern})$`, "s");
      const name = fresh("r");
      code.push(`local ${name}: Regex = Regex.compile(${literal(pattern)});`);
      for (let round = int(2, 5); round > 0; round--) {
        const subject = text("abc1", 10);
        // Leftmost match, then the longest at that position.
        const find = (begin: number): [number, number] | undefined => {
          for (let start = begin; start <= subject.length; start++) {
            for (let end = subject.length; end >= start; end--) {
              if (full.test(subject.slice(start, end))) return [start, end];
            }
          }
          return undefined;
        };
        const matches: [number, number][] = [];
        for (let at = 0; at <= subject.length;) {
          const found = find(at);
          if (!found) break;
          matches.push(found);
          at = found[0] === found[1] ? found[1] + 1 : found[1];
        }
        let replaced = "";
        let first = "";
        let copied = 0;
        matches.forEach(([start, end], position) => {
          replaced += `${subject.slice(copied, start)}#`;
          copied = end;
          if (start === end && start < subject.length) {
            replaced += subject[start];
            copied = start + 1;
          }
          if (position === 0) {
            first = `${replaced}${subject.slice(copied)}`;
          }
        });
        replaced += subject.slice(copied);
        const pieces: string[] = [];
        let previous = 0;
        for (const [start, end] of matches) {
          pieces.push(subject.slice(previous, start));
          previous = end;
        }
        pieces.push(subject.slice(previous));
        const quoted = literal(subject);
        const list = fresh("q");
        code.push(
          `printf("full=%d\\n", cast<int>(${name}.matches(${quoted})));`,
          `printf("some=%d\\n", cast<int>(${name}.contains(${quoted})));`,
          `printf("count=%ld\\n", ${name}.countMatches(${quoted}));`,
          `printf("all=%s\\n", ${name}.replaceAll(${quoted}, "#"));`,
          `printf("one=%s\\n", ${name}.replaceFirst(${quoted}, "#"));`,
          `local ${list}: Array<string> = ${name}.split(${quoted});`,
          `printf("n=%d\\n", ${list}.len());`,
          `loop (local i: int = 0; i < ${list}.len(); i = i + 1) { printf("[%s]", ${list}.get(i)); }`,
          `printf("\\n");`,
        );
        output.push(
          `full=${Number(full.test(subject))}`,
          `some=${Number(matches.length > 0)}`,
          `count=${matches.length}`,
          `all=${replaced}`,
          `one=${matches.length > 0 ? first : subject}`,
          `n=${pieces.length}`,
          pieces.map((piece) => `[${piece}]`).join(""),
        );
      }
      code.push(`${name}.destroy();`);
    }
    return {
      imports: [
        'import [Regex] from "std/regex.bpl";',
        'import [Array] from "std/array.bpl";',
      ],
      code,
      output,
    };
  };

  const dateBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const DAY = 86400000;
    const lastDay = (year: number, month: number) =>
      new Date(Date.UTC(year, month, 0)).getUTCDate();
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const random = () => {
      const year = int(1900, 2100);
      const month = int(1, 12);
      const day = pick([
        1,
        28,
        lastDay(year, month),
        int(1, lastDay(year, month)),
      ]);
      return { year, month, day, ms: Date.UTC(year, month - 1, day) };
    };
    const shift = (
      from: { year: number; month: number; day: number },
      months: number,
    ) => {
      const total = from.year * 12 + from.month - 1 + months;
      const year = Math.floor(total / 12);
      const month = total - year * 12 + 1;
      return iso(
        Date.UTC(year, month - 1, Math.min(from.day, lastDay(year, month))),
      );
    };
    const isoWeek = (ms: number) => {
      const weekday = (new Date(ms).getUTCDay() + 6) % 7;
      const thursday = new Date(ms + (3 - weekday) * DAY);
      const start = Date.UTC(thursday.getUTCFullYear(), 0, 1);
      return Math.floor((thursday.getTime() - start) / (7 * DAY)) + 1;
    };
    const say = (label: string, expr: string, value: number) => {
      code.push(`printf("${label}=%ld\\n", cast<long>(${expr}));`);
      output.push(`${label}=${value}`);
    };
    for (let index = int(3, 8); index > 0; index--) {
      const date = random();
      const other = random();
      const a = fresh("d");
      const b = fresh("d");
      code.push(
        `local ${a}: Date = Date.new(${date.year}, ${date.month}, ${date.day});`,
        `local ${b}: Date = Date.new(${other.year}, ${other.month}, ${other.day});`,
        `printf("fmt=%s\\n", ${a}.format());`,
      );
      output.push(`fmt=${iso(date.ms)}`);
      const startOfYear = Date.UTC(date.year, 0, 1);
      say("ts", `${a}.toTimestamp()`, date.ms / 1000);
      say("doy", `${a}.dayOfYear()`, (date.ms - startOfYear) / DAY + 1);
      say("dow", `${a}.dayOfWeek()`, new Date(date.ms).getUTCDay());
      say("week", `${a}.weekOfYear()`, isoWeek(date.ms));
      say("dim", `${a}.daysInMonth()`, lastDay(date.year, date.month));
      say("leap", `${a}.isLeapYear()`, Number(lastDay(date.year, 2) === 29));
      say("diff", `${a}.diffDays(&${b})`, (date.ms - other.ms) / DAY);
      say("cmp", `${a}.compare(&${b})`, Math.sign(date.ms - other.ms));
      const moved = [
        ["add", "addDays", int(-40000, 40000), 0],
        ["mon", "addMonths", int(-600, 600), 1],
        ["yr", "addYears", int(-50, 50), 12],
      ] as const;
      for (const [label, method, amount, unit] of moved) {
        const result = fresh("d");
        code.push(
          `local ${result}: Date = ${a}.${method}(${amount});`,
          `printf("${label}=%s\\n", ${result}.format());`,
        );
        output.push(
          `${label}=${unit === 0 ? iso(date.ms + amount * DAY) : shift(date, amount * unit)}`,
        );
      }
      const back = fresh("d");
      code.push(
        `local ${back}: Date = Date.fromTimestamp(${date.ms / 1000 + int(0, 86399)});`,
        `printf("from=%s\\n", ${back}.format());`,
      );
      output.push(`from=${iso(date.ms)}`);
      // Parsing accepts exactly the dates that exist.
      const year = int(1900, 2100);
      const month = int(1, 13);
      const day = int(1, 31);
      const textual = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const parsed = fresh("d");
      code.push(`local ${parsed}: Date = Date.new(1, 1, 1);`);
      say(
        "parse",
        `Date.tryParse("${textual}", &${parsed})`,
        Number(month <= 12 && day <= lastDay(year, month)),
      );
      code.push(`${parsed}.isValid();`);
    }
    return { imports: ['import [Date] from "std/date.bpl";'], code, output };
  };

  const algorithmBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const items = Array.from({ length: int(1, 14) }, () => int(-9, 9));
    const fill = (name: string, values: number[]) => {
      code.push(`local ${name}: Array<int> = Array<int>.new(${int(1, 4)});`);
      for (const value of values) code.push(`${name}.push(${value});`);
    };
    const show = (label: string, name: string, values: number[]) => {
      code.push(
        `printf("${label}=");`,
        `loop (local i: int = 0; i < ${name}.len(); i = i + 1) { printf("%d,", ${name}.get(i)); }`,
        `printf("\\n");`,
      );
      output.push(`${label}=${values.map((value) => `${value},`).join("")}`);
    };
    const say = (label: string, expr: string, value: number) => {
      code.push(`printf("${label}=%ld\\n", cast<long>(${expr}));`);
      output.push(`${label}=${value}`);
    };
    const ascending = [...items].sort((a, b) => a - b);
    const a = fresh("a");
    fill(a, items);
    say(
      "sum",
      `Algorithm.sum(&${a})`,
      items.reduce((x, y) => x + y, 0),
    );
    say("min", `Algorithm.min(&${a})`, ascending[0]!);
    say("max", `Algorithm.max(&${a})`, ascending.at(-1)!);
    const needle = int(-9, 9);
    say(
      "count",
      `Algorithm.count(&${a}, ${needle})`,
      items.filter((value) => value === needle).length,
    );
    say(
      "sorted",
      `Algorithm.isSorted(&${a})`,
      Number(items.every((value, i) => i === 0 || items[i - 1]! <= value)),
    );
    const distinct = fresh("a");
    code.push(`local ${distinct}: Array<int> = Algorithm.unique(&${a});`);
    const uniqueItems = [...new Set(items)];
    show("unique", distinct, uniqueItems);
    const merged = fresh("a");
    code.push(
      `local ${merged}: Array<int> = Algorithm.merge(&${a}, &${distinct});`,
    );
    show("merge", merged, [...items, ...uniqueItems]);
    say(
      "eq",
      `Algorithm.equals(&${a}, &${distinct})`,
      Number(items.length === uniqueItems.length),
    );
    code.push(`Algorithm.reverse(&${a});`);
    show("rev", a, [...items].reverse());
    const sort = pick([
      [".sortAsc", ascending],
      [".quickSort", ascending],
      [".sortDesc", [...ascending].reverse()],
    ] as const);
    code.push(`Algorithm${sort[0]}(&${a});`);
    show("sort", a, [...sort[1]]);
    const sortedUnique = [...new Set(ascending)];
    const b = fresh("a");
    fill(b, sortedUnique);
    for (const target of [-10, 10, ...sortedUnique]) {
      say(
        "bs",
        `Algorithm.binarySearch(&${b}, ${target})`,
        sortedUnique.indexOf(target),
      );
    }

    // Population statistics of the same data, read through a raw array.
    const data = fresh("v");
    code.push(`local ${data}: int[${items.length}] = [${items.join(", ")}];`);
    const float = (label: string, method: string, value: number) => {
      code.push(
        `printf("${label}=%.6f\\n", Stats.${method}(&${data}[0], ${items.length}));`,
      );
      output.push(`${label}=${value.toFixed(6)}`);
    };
    const mean = items.reduce((x, y) => x + y, 0) / items.length;
    const variance =
      items.reduce((x, y) => x + (y - mean) * (y - mean), 0) / items.length;
    float("mean", "mean", mean);
    float("var", "variance", variance);
    float("sd", "stddev", Math.sqrt(variance));
    const middle = Math.floor(items.length / 2);
    float(
      "med",
      "median",
      items.length % 2 === 1
        ? ascending[middle]!
        : (ascending[middle - 1]! + ascending[middle]!) / 2,
    );
    const occurrences = (value: number) =>
      items.filter((other) => other === value).length;
    // `median` above sorted the data in place, and the first mode found wins.
    const mode = ascending.reduce(
      (best, value) => (occurrences(value) > occurrences(best) ? value : best),
      ascending[0]!,
    );
    say("mode", `Stats.mode(&${data}[0], ${items.length})`, mode);
    say(
      "range",
      `Stats.range(&${data}[0], ${items.length})`,
      ascending.at(-1)! - ascending[0]!,
    );

    // A stack against an array model.
    const stack = fresh("st");
    code.push(`local ${stack}: Stack<int> = Stack<int>.new(${int(0, 3)});`);
    const model: number[] = [];
    for (let index = int(10, 40); index > 0; index--) {
      switch (int(0, 3)) {
        case 0: {
          code.push(`printf("pop=%d\\n", ${optionValue(`${stack}.pop()`)});`);
          output.push(`pop=${model.pop() ?? NONE}`);
          break;
        }
        case 1:
          code.push(`printf("top=%d\\n", ${optionValue(`${stack}.peek()`)});`);
          output.push(`top=${model.at(-1) ?? NONE}`);
          break;
        default: {
          const value = int(-50, 50);
          code.push(`${stack}.push(${value});`);
          model.push(value);
        }
      }
    }
    say("size", `${stack}.size()`, model.length);
    say("empty", `${stack}.isEmpty()`, Number(model.length === 0));
    return {
      imports: [
        'import [Algorithm] from "std/algorithm.bpl";',
        'import [Array] from "std/array.bpl";',
        'import [Option] from "std/option.bpl";',
        'import [Stack] from "std/stack.bpl";',
        'import [Stats] from "std/stats.bpl";',
      ],
      code,
      output,
    };
  };

  const textToolsBlock = (): Block => {
    const code: string[] = [];
    const output: string[] = [];
    const say = (label: string, expr: string, value: number) => {
      code.push(`printf("${label}=%d\\n", cast<int>(${expr}));`);
      output.push(`${label}=${value}`);
    };
    const showOwned = (label: string, expr: string, value: string) => {
      const name = fresh("s");
      code.push(
        `local ${name}: String = ${expr};`,
        `printf("${label}=[%s]\\n", ${name}.data);`,
      );
      output.push(`${label}=[${value}]`);
    };
    for (let index = int(2, 5); index > 0; index--) {
      const value = text("ab  c", 14);
      const part = text("ab", 2);
      const quoted = literal(value);
      say(
        "starts",
        `StringUtils.startsWith(${quoted}, "${part}")`,
        Number(value.startsWith(part)),
      );
      say(
        "ends",
        `StringUtils.endsWith(${quoted}, "${part}")`,
        Number(value.endsWith(part)),
      );
      say("find", `StringUtils.find(${quoted}, 'b')`, value.indexOf("b"));
      const from = int(0, value.length);
      if (part.length > 0) {
        say(
          "search",
          `StringUtils.findString(${quoted}, "${part}", ${from})`,
          value.indexOf(part, from),
        );
        const replacement = text("xy", 3);
        showOwned(
          "repl",
          `StringUtils.replace(${quoted}, "${part}", "${replacement}")`,
          value.split(part).join(replacement),
        );
      }
      showOwned(
        "trim",
        `StringUtils.trim(${quoted})`,
        value.replace(/^ +| +$/g, ""),
      );
      showOwned(
        "swap",
        `StringUtils.replaceChar(${quoted}, 'a', 'z')`,
        value.replaceAll("a", "z"),
      );
    }
    const list = fresh("j");
    const parts = Array.from({ length: int(0, 5) }, () => text("ab", 3));
    code.push(`local ${list}: Array<string> = Array<string>.new(1);`);
    for (const part of parts) code.push(`${list}.push("${part}");`);
    code.push(`printf("join=%s\\n", StringUtils.join(&${list}, "--"));`);
    output.push(`join=${parts.join("--")}`);

    const builder = fresh("sb");
    code.push(
      `local ${builder}: StringBuilder = StringBuilder.new(${int(1, 8)});`,
    );
    let built = "";
    for (let index = int(5, 30); index > 0; index--) {
      switch (int(0, 5)) {
        case 0: {
          const piece = text("ab c", 40);
          code.push(`${builder}.append("${piece}");`);
          built += piece;
          break;
        }
        case 1: {
          const code_ = int(97, 122);
          code.push(`${builder}.appendChar(cast<char>(${code_}));`);
          built += String.fromCharCode(code_);
          break;
        }
        case 2: {
          const value = pick([0, -1, 2147483647, -2147483648, int(-999, 999)]);
          code.push(
            `${builder}.appendInt(${value === -2147483648 ? "cast<int>(-2147483648)" : value});`,
          );
          built += String(value);
          break;
        }
        case 3: {
          const value = pick([5000000000, -5000000000, int(-999, 999)]);
          code.push(`${builder}.appendLong(cast<long>(${value}));`);
          built += String(value);
          break;
        }
        case 4: {
          const value = int(0, 1) === 0;
          code.push(`${builder}.appendBool(${value});`);
          built += String(value);
          break;
        }
        default: {
          // Eighths need three places, so no digit is an exact rounding tie
          // (`toFixed` and C's `%f` round those differently).
          const value = int(-5000, 5000) / 8;
          const decimals = int(3, 6);
          code.push(
            `${builder}.appendFixed(${value.toFixed(3)}, ${decimals});`,
          );
          built += value.toFixed(decimals);
        }
      }
      if (int(0, 14) === 0) {
        code.push(`${builder}.clear();`);
        built = "";
      }
    }
    say("len", `${builder}.len()`, Buffer.byteLength(built));
    code.push(`printf("built=[%s]\\n", ${builder}.toString());`);
    output.push(`built=[${built}]`);
    code.push(`${builder}.destroy();`);

    for (const [method, test] of [
      ["isDigit", /[0-9]/],
      ["isHexDigit", /[0-9a-fA-F]/],
      ["isAlpha", /[a-zA-Z]/],
      ["isAlphaNumeric", /[a-zA-Z0-9]/],
      ["isWhitespace", /[ \t\r\n]/],
    ] as const) {
      const byte = int(1, 127);
      say(
        method,
        `CharUtils.${method}(cast<char>(${byte}))`,
        Number(test.test(String.fromCharCode(byte))),
      );
    }
    const byte = int(1, 127);
    const letter = String.fromCharCode(byte);
    say(
      "lower",
      `CharUtils.toLower(cast<char>(${byte}))`,
      /[A-Z]/.test(letter) ? byte + 32 : byte,
    );
    say(
      "upper",
      `CharUtils.toUpper(cast<char>(${byte}))`,
      /[a-z]/.test(letter) ? byte - 32 : byte,
    );
    return {
      imports: [
        'import [StringUtils] from "std/string_utils.bpl";',
        'import [StringBuilder] from "std/string_builder.bpl";',
        'import [CharUtils] from "std/char_utils.bpl";',
        'import [String] from "std/string.bpl";',
        'import [Array] from "std/array.bpl";',
      ],
      code,
      output,
    };
  };

  /** A struct value with its expected JSON text and C layout. */
  interface Reflected {
    type: string;
    expr: string;
    json: string;
    /** Undefined when the type's size is not modelled (`Array<int>`). */
    size?: number;
    align: number;
  }

  const reflectionBlock = (): Block => {
    const declarations: string[] = [];
    const code: string[] = [];
    const output: string[] = [];
    const integer = (type: string, size: number, values: string[]) => {
      const value = pick(values);
      return { type, expr: value, json: value, size, align: size };
    };
    const small = () => String(int(-99, 99));
    const stringField = (): Reflected => {
      const value = text('ab "\\\n\t/é', 8);
      const expr = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t");
      return {
        type: "string",
        expr: `"${expr}"`,
        json: JSON.stringify(value),
        size: 8,
        align: 8,
      };
    };
    const scalar = (): Reflected =>
      pick([
        () => integer("int", 4, ["-2147483648", "2147483647", small()]),
        () =>
          integer("long", 8, [
            "9223372036854775807",
            "-9223372036854775807",
            small(),
          ]),
        () => integer("i8", 1, ["-128", "127", small()]),
        () => integer("i16", 2, ["-32768", "32767", small()]),
        () => integer("u8", 1, ["0", "255", String(int(0, 99))]),
        () => integer("u16", 2, ["0", "65535", String(int(0, 99))]),
        () => integer("u32", 4, ["0", "4294967295", String(int(0, 99))]),
        () =>
          integer("ulong", 8, [
            "0",
            "18446744073709551615",
            String(int(0, 99)),
          ]),
        () => {
          const value = String(int(0, 1) === 0);
          return { type: "bool", expr: value, json: value, size: 1, align: 1 };
        },
        () => {
          const value = (int(-800, 800) * 2 + 1) / 16;
          return {
            type: "double",
            expr: String(value),
            json: String(value),
            size: 8,
            align: 8,
          };
        },
        () => {
          // Sixteenths are exact in binary32; JSON prints them with "%.9g".
          const value = (int(-800, 800) * 2 + 1) / 16;
          return {
            type: "f32",
            expr: `cast<f32>(${value})`,
            json: String(Number(value.toPrecision(9))),
            size: 4,
            align: 4,
          };
        },
        stringField,
      ])();
    const field = (depth: number): Reflected => {
      switch (int(0, 8)) {
        case 0:
          return depth > 0 ? structure(depth - 1) : scalar();
        case 1: {
          const length = int(1, 3);
          const values = Array.from({ length }, small);
          return {
            type: `int[${length}]`,
            expr: `[${values.join(", ")}]`,
            json: `[${values.join(", ")}]`,
            size: 4 * length,
            align: 4,
          };
        }
        case 2: {
          if (int(0, 1) === 0) {
            return {
              type: "*int",
              expr: "nullptr",
              json: "null",
              size: 8,
              align: 8,
            };
          }
          const name = fresh("target");
          const value = small();
          code.push(`local ${name}: int = ${value};`);
          return {
            type: "*int",
            expr: `&${name}`,
            json: value,
            size: 8,
            align: 8,
          };
        }
        case 3: {
          const name = fresh("list");
          const values = Array.from({ length: int(0, 3) }, small);
          code.push(`local ${name}: Array<int> = Array<int>.new(1);`);
          for (const value of values) code.push(`${name}.push(${value});`);
          return {
            type: "Array<int>",
            expr: name,
            json: `[${values.join(", ")}]`,
            align: 8,
          };
        }
        default:
          return scalar();
      }
    };
    const layouts: {
      name: string;
      fields: string[];
      offsets: (number | undefined)[];
      size?: number;
      method: boolean;
      json: string;
      expr: string;
      entries: string[];
    }[] = [];
    function structure(depth: number): Reflected {
      const name = fresh("Reflected");
      const method = int(0, 3) === 0;
      const members = Array.from({ length: int(1, 6) }, () => field(depth));
      const names = members.map((_, index) => `f${index}`);
      let offset: number | undefined = method ? 8 : 0;
      let align = method ? 8 : 1;
      const offsets = members.map((member) => {
        align = Math.max(align, member.align);
        if (offset === undefined) return undefined;
        const at = Math.ceil(offset / member.align) * member.align;
        offset = member.size === undefined ? undefined : at + member.size;
        return at;
      });
      const size =
        offset === undefined ? undefined : Math.ceil(offset / align) * align;
      declarations.push(
        [
          `struct ${name} {`,
          ...members.map((member, index) => `    f${index}: ${member.type},`),
          ...(method
            ? [`    frame tag(this: *${name}) ret int { return 7; }`]
            : []),
          "}",
        ].join("\n"),
      );
      const entries = members.map(
        (member, index) => `"f${index}": ${member.json}`,
      );
      const json = `{${entries.join(", ")}}`;
      const expr = `${name} { ${members
        .map((member, index) => `f${index}: ${member.expr}`)
        .join(", ")} }`;
      layouts.push({
        name,
        fields: names,
        offsets,
        size,
        method,
        json,
        expr,
        entries,
      });
      return { type: name, expr, json, size, align };
    }

    structure(int(0, 2));
    const root = layouts.at(-1)!;
    const value = fresh("v");
    code.push(
      `local ${value}: ${root.name} = ${root.expr};`,
      `local ${value}j: String = JSON.stringify<${root.name}>(&${value});`,
      `printf("json=%s\\n", ${value}j.toString());`,
      `${value}j.destroy();`,
    );
    output.push(`json=${root.json}`);

    // The same object in another key order, with keys the struct lacks.
    const shuffled = [...root.entries];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = int(0, index);
      [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
    }
    shuffled.splice(
      int(0, shuffled.length),
      0,
      `"unknown": ${pick(['[1, {"a": "}"}]', '{"b": []}', "null", '"]"'])}`,
    );
    const parsed = fresh("p");
    code.push(
      `local ${parsed}: *${root.name} = JSON.parse<${root.name}>(${literal(`{${shuffled.join(", ")}}`)});`,
      `if (${parsed} == nullptr) { printf("back=null\\n"); } else {`,
      `    local ${parsed}j: String = JSON.stringify<${root.name}>(${parsed});`,
      `    printf("back=%s\\n", ${parsed}j.toString());`,
      `    ${parsed}j.destroy();`,
      ...(root.method ? [`    printf("tag=%d\\n", ${parsed}.tag());`] : []),
      `    JSON.free<${root.name}>(${parsed});`,
      "}",
    );
    output.push(`back=${root.json}`);
    if (root.method) output.push("tag=7");

    // Reflection metadata agrees with the C layout and with the compiler.
    for (const layout of layouts) {
      const info = fresh("info");
      code.push(
        `local ${info}: *TypeInfo = typeof<${layout.name}>();`,
        `printf("type=%s %d %d\\n", ${info}.name, ${info}.num_fields, cast<int>(${info}.kind));`,
        `printf("same=%d\\n", cast<int>(${info}.size == cast<ulong>(sizeof(${layout.name}))));`,
      );
      output.push(`type=${layout.name} ${layout.fields.length} 1`, "same=1");
      if (layout.size !== undefined) {
        code.push(`printf("size=%d\\n", cast<int>(${info}.size));`);
        output.push(`size=${layout.size}`);
      }
      layout.fields.forEach((field, index) => {
        code.push(
          `printf("${field}=%s %d\\n", ${info}.fields[${index}].name, cast<int>(${info}.fields[${index}].offset == cast<ulong>(offsetof(${layout.name}, ${field}))));`,
        );
        output.push(`${field}=${field} 1`);
        const at = layout.offsets[index];
        if (at !== undefined) {
          code.push(
            `printf("at=%d\\n", cast<int>(offsetof(${layout.name}, ${field})));`,
          );
          output.push(`at=${at}`);
        }
      });
    }
    return {
      declarations,
      imports: [
        'import [JSON] from "std/json.bpl";',
        'import [String] from "std/string.bpl";',
        'import [Array] from "std/array.bpl";',
        'import [TypeInfo] from "std/reflection.bpl";',
      ],
      code,
      output,
    };
  };

  const blocks = [
    stringBlock,
    arrayBlock,
    mapBlock,
    setBlock,
    dequeBlock,
    bigIntBlock,
    rationalBlock,
    codecBlock,
    heapBlock,
    listBlock,
    bitsBlock,
    parseBlock,
    hashBlock,
    checksumBlock,
    pathBlock,
    urlBlock,
    utf8Block,
    jsonBlock,
    regexBlock,
    dateBlock,
    algorithmBlock,
    textToolsBlock,
    reflectionBlock,
  ];
  const chosen = Array.from({ length: int(2, 5) }, () => pick(blocks)());
  const lines = [
    "extern printf(fmt: string, ...);",
    ...new Set(chosen.flatMap((block) => block.imports)),
    ...chosen.flatMap((block) => block.declarations ?? []),
    "frame main() ret int {",
    ...chosen.flatMap((block) => [
      "    {",
      ...block.code.map((line) => `        ${line}`),
      "    }",
    ]),
    "    return 0;",
    "}",
    ...chosen.flatMap((block) =>
      block.output.map((line) => `${EXPECT_MARKER}${line}`),
    ),
  ];
  return {
    source: `${lines.join("\n")}\n`,
    expectedStdout: chosen
      .flatMap((block) => block.output)
      .map((line) => `${line}\n`)
      .join(""),
  };
}
