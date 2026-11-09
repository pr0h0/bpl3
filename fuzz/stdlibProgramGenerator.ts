/**
 * Random programs that exercise the standard library against exact models:
 * JavaScript strings, arrays, maps and sets, arbitrary-precision BigInt, and
 * Node's base64, hex and SHA-1. Each block of operations prints what it
 * observes, so the first differing line names the failing operation.
 */
import { createHash } from "crypto";

import { EXPECT_MARKER, type GeneratedProgram } from "./programGenerator";

interface Block {
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
  ];
  const chosen = Array.from({ length: int(2, 5) }, () => pick(blocks)());
  const lines = [
    "extern printf(fmt: string, ...);",
    ...new Set(chosen.flatMap((block) => block.imports)),
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
