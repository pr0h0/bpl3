/**
 * Random multi-file BPL programs with an exact output oracle.
 *
 * Four modules form a diamond: `left` and `right` both import `base`, and
 * `main` imports all three. They exercise what a single file cannot: one
 * instance of a module's globals behind several importers, private symbols
 * that share a name across modules (functions, generics, structs, globals),
 * and every import form (named, aliased, namespace, re-exported).
 *
 * Companion modules travel inside the main source as comment lines, so a
 * saved failing program stays a single, replayable file.
 */
import {
  EXPECT_MARKER,
  type GeneratedProgram,
  WASM_MARKER,
} from "./programGenerator";

const MODULE_MARKER = "# fuzz-module: ";
const MODULE_LINE = "#| ";

/** The companion files embedded in a generated program, by file name. */
export function readFuzzModules(source: string): Map<string, string> {
  const modules = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of source.split("\n")) {
    if (line.startsWith(MODULE_MARKER)) {
      current = [];
      modules.set(line.slice(MODULE_MARKER.length), current);
    } else if (current && line.startsWith(MODULE_LINE)) {
      current.push(line.slice(MODULE_LINE.length));
    } else if (line.trimEnd() === MODULE_LINE.trimEnd() && current) {
      current.push("");
    } else {
      current = undefined;
    }
  }
  return new Map(
    [...modules].map(([name, lines]) => [name, `${lines.join("\n")}\n`]),
  );
}

const wrapInt = (value: bigint): bigint => BigInt.asIntN(32, value);
const wrapLong = (value: bigint): bigint => BigInt.asIntN(64, value);

interface Model {
  counter: bigint;
  leftCounter: bigint;
  rightCounter: bigint;
  table: [bigint, bigint, bigint];
}

interface Op {
  /** One statement of `main`. */
  code: string;
  /** Runs against the model and returns the line it prints. */
  run(model: Model): string;
}

export function generateModuleProgram(
  rng: () => number,
  options: { wasm?: boolean } = {},
): GeneratedProgram {
  const int = (min: number, max: number) =>
    min + Math.floor(rng() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)]!;
  const small = () => BigInt(int(-50, 50));
  const positive = () => BigInt(int(1, 50));
  const lit = (value: bigint) => (value < 0n ? `(${value})` : `${value}`);

  const counterStart = small();
  const leftStart = small();
  const rightStart = small();
  const offsets = { base: small(), left: small(), right: small() };
  const hiddenLeft = positive();
  const hiddenRight = positive();
  const pickOffsetLeft = small();
  const pickOffsetRight = small();
  const table: [bigint, bigint, bigint] = [small(), small(), small()];
  const sizeLeft = positive();
  const sizeRight = positive();

  const base = `global counter: int = ${lit(counterStart)};
global table: int[3] = [${table.map(lit).join(", ")}];
struct Point {
    x: int,
    y: int,
    frame sum(this: *Point) ret int {
        return this.x + this.y * 2;
    }
}
spec Sized {
    frame size(this: *Self) ret int;
}
enum Shade { Light, Dark(int), Mid { v: int } }
struct Hidden {
    a: int,
    frame get(this: *Hidden) ret int {
        return this.a;
    }
}
frame helper(x: int) ret int {
    return x + ${lit(offsets.base)};
}
frame viaHelper(x: int) ret int {
    local h: Hidden = Hidden { a: helper(x) };
    return h.get();
}
frame bump(k: int) ret int {
    counter = counter + k;
    return counter;
}
frame pickOne<T>(a: T, b: T, first: bool) ret T {
    if (first) {
        return a;
    }
    return b;
}
frame total<T: Sized>(p: *T, extra: int) ret int {
    return p.size() + extra;
}
export counter;
export table;
export [Point];
export [Sized];
export [Shade];
export viaHelper;
export bump;
export pickOne;
export total;
`;
  // Same private names as base, with other meanings.
  const left = `import bump, [Sized] from "./base.bpl";
global counter: int = ${lit(leftStart)};
struct Hidden {
    a: long,
    b: int,
    frame get(this: *Hidden) ret int {
        return cast<int>(this.a) + this.b;
    }
}
struct Left: Sized {
    n: int,
    frame size(this: *Left) ret int {
        return this.n + ${lit(sizeLeft)};
    }
}
frame helper(x: int) ret int {
    return x * 3 + ${lit(offsets.left)};
}
frame leftCall(x: int) ret int {
    counter = counter + 1;
    return helper(x) + bump(x) + counter;
}
frame leftHidden(x: int) ret int {
    local h: Hidden = Hidden { a: cast<long>(x), b: ${lit(hiddenLeft)} };
    return h.get();
}
frame pickOne<T>(a: T, b: T, first: bool) ret T {
    local offset: T = cast<T>(${lit(pickOffsetLeft)});
    if (first) {
        return b + offset;
    }
    return a + offset;
}
frame leftCounter() ret int {
    return counter;
}
export [Left];
export leftCall;
export leftHidden;
export pickOne;
export leftCounter;
`;
  const right = `import * as b from "./base.bpl";
import viaHelper from "./base.bpl";
global counter: int = ${lit(rightStart)};
struct Hidden {
    a: u8,
    frame get(this: *Hidden) ret int {
        return cast<int>(this.a) * 2;
    }
}
struct Right: b.Sized {
    n: int,
    frame size(this: *Right) ret int {
        return this.n * ${lit(sizeRight)};
    }
}
frame helper(x: int) ret int {
    return x - ${lit(offsets.right)};
}
frame rightCall(x: int) ret int {
    counter = counter + 2;
    local p: b.Point = b.Point { x: helper(x), y: counter };
    return p.sum() + b.bump(1);
}
frame rightHidden(x: int) ret int {
    local h: Hidden = Hidden { a: cast<u8>(x + ${lit(hiddenRight)}) };
    return h.get();
}
frame shadeOf(x: int) ret b.Shade {
    if ((x & 3) == 0) {
        return b.Shade.Light;
    }
    if ((x & 3) == 1) {
        return b.Shade.Dark(x);
    }
    return b.Shade.Mid { v: x + 1 };
}
frame pickOne<T>(a: T, _b: T, _first: bool) ret T {
    return a + cast<T>(${lit(pickOffsetRight)});
}
frame rightCounter() ret int {
    return counter;
}
export viaHelper;
export [Right];
export rightCall;
export rightHidden;
export shadeOf;
export pickOne;
export rightCounter;
`;

  const opSources: (() => Op)[] = [
    () => {
      const k = small();
      return {
        code: `printf("bump=%d\\n", bump(${lit(k)}));`,
        run: (m) => {
          m.counter = wrapInt(m.counter + k);
          return `bump=${m.counter}`;
        },
      };
    },
    () => {
      const k = small();
      return {
        code: `printf("nsbump=%d\\n", base.bump(${lit(k)}));`,
        run: (m) => {
          m.counter = wrapInt(m.counter + k);
          return `nsbump=${m.counter}`;
        },
      };
    },
    () => {
      const v = small();
      return {
        code: `counter = ${lit(v)};\n    printf("set=%d\\n", base.counter);`,
        run: (m) => {
          m.counter = v;
          return `set=${v}`;
        },
      };
    },
    () => {
      const x = small();
      return {
        code: `printf("left=%d\\n", leftCall(${lit(x)}));`,
        run: (m) => {
          m.leftCounter = wrapInt(m.leftCounter + 1n);
          const local = wrapInt(x * 3n + offsets.left);
          m.counter = wrapInt(m.counter + x);
          return `left=${wrapInt(local + m.counter + m.leftCounter)}`;
        },
      };
    },
    () => {
      const x = small();
      return {
        code: `printf("right=%d\\n", rightCall(${lit(x)}));`,
        run: (m) => {
          m.rightCounter = wrapInt(m.rightCounter + 2n);
          const sum = wrapInt(x - offsets.right + m.rightCounter * 2n);
          m.counter = wrapInt(m.counter + 1n);
          return `right=${wrapInt(sum + m.counter)}`;
        },
      };
    },
    () => {
      const x = small();
      return {
        code: `printf("via=%d\\n", reexported(${lit(x)}));`,
        run: () => `via=${wrapInt(x + offsets.base)}`,
      };
    },
    () => {
      const x = small();
      return {
        code: `printf("hl=%d hr=%d\\n", leftHidden(${lit(x)}), rightHidden(${lit(x)}));`,
        run: () => {
          const l = wrapInt(x + hiddenLeft);
          const r = BigInt.asUintN(8, x + hiddenRight) * 2n;
          return `hl=${l} hr=${r}`;
        },
      };
    },
    () => {
      const [a, b] = [small(), small()];
      const first = int(0, 1) === 1;
      const type = pick(["int", "long"] as const);
      const flag = first ? "true" : "false";
      const wrapType = type === "int" ? wrapInt : wrapLong;
      const args = `cast<${type}>(${lit(a)}), cast<${type}>(${lit(b)}), ${flag}`;
      return {
        code: `printf("picks=%lld %lld %lld\\n", cast<long>(pickOne<${type}>(${args})), cast<long>(leftPick<${type}>(${args})), cast<long>(rightPick<${type}>(${args})));`,
        run: () => {
          const fromBase = first ? a : b;
          const fromLeft = wrapType((first ? b : a) + pickOffsetLeft);
          const fromRight = wrapType(a + pickOffsetRight);
          return `picks=${fromBase} ${fromLeft} ${fromRight}`;
        },
      };
    },
    () => {
      const [n, extra] = [small(), small()];
      return {
        code: `local l${int(0, 1 << 20)}: Left = Left { n: ${lit(n)} };\n    printf("total=%d\\n", total<Left>(&__L__, ${lit(extra)}));`,
        run: () => `total=${wrapInt(n + sizeLeft + extra)}`,
      };
    },
    () => {
      const [n, extra] = [small(), small()];
      return {
        code: `local r${int(0, 1 << 20)}: Right = Right { n: ${lit(n)} };\n    printf("total=%d\\n", total<Right>(&__R__, ${lit(extra)}));`,
        run: () => `total=${wrapInt(n * sizeRight + extra)}`,
      };
    },
    () => {
      const [x, y] = [small(), small()];
      return {
        code: `printf("pt=%d\\n", makePoint(${lit(x)}, ${lit(y)}).sum());`,
        run: () => `pt=${wrapInt(x + y * 2n)}`,
      };
    },
    () => {
      const x = small();
      const form = x & 3n;
      return {
        code: `printf("shade=%d\\n", match (shadeOf(${lit(x)})) { base.Shade.Light => 7, base.Shade.Dark(n) => n * 2, base.Shade.Mid { v: w } => w - 1 });`,
        run: () => {
          if (form === 0n) return "shade=7";
          return form === 1n ? `shade=${x * 2n}` : `shade=${x}`;
        },
      };
    },
    () => {
      const x = small();
      const form = x & 3n;
      return {
        code: `printf("case=%d\\n", caseOf(shadeOf(${lit(x)})));`,
        run: () => `case=${form === 0n ? 1 : form === 1n ? 2 : 3}`,
      };
    },
    () => {
      const slot = int(0, 2);
      const v = small();
      return {
        code: `table[${slot}] = table[${slot}] + ${lit(v)};\n    printf("table=%d\\n", base.table[${slot}]);`,
        run: (m) => {
          m.table[slot] = wrapInt(m.table[slot]! + v);
          return `table=${m.table[slot]}`;
        },
      };
    },
    () => ({
      code: `printf("counters=%d %d %d\\n", counter, leftCounter(), rightCounter());`,
      run: (m) => `counters=${m.counter} ${m.leftCounter} ${m.rightCounter}`,
    }),
  ];

  const model: Model = {
    counter: counterStart,
    leftCounter: leftStart,
    rightCounter: rightStart,
    table: [table[0], table[1], table[2]],
  };
  const output: string[] = [];
  const statements = Array.from({ length: int(6, 24) }, (_, position) => {
    const op = pick(opSources)();
    output.push(op.run(model));
    // A local's name must be unique, and is then used by its own statement.
    return `{\n    ${op.code
      .replace(/local [lr]\d+:/, (found) =>
        found.replace(/[lr]\d+:/, `${found[6]}${position}:`),
      )
      .replace("__L__", `l${position}`)
      .replace("__R__", `r${position}`)}\n    }`;
  });

  const main = [
    ...(options.wasm ? [WASM_MARKER] : []),
    "extern printf(fmt: string, ...);",
    'import counter, table, bump, pickOne, total, [Point], [Shade] from "./base.bpl";',
    'import * as base from "./base.bpl";',
    'import [Left], leftCall, leftHidden, leftCounter from "./left.bpl";',
    'import pickOne as leftPick from "./left.bpl";',
    'import [Right], rightCall, rightHidden, shadeOf, rightCounter from "./right.bpl";',
    'import pickOne as rightPick, viaHelper as reexported from "./right.bpl";',
    "frame makePoint(x: int, y: int) ret Point {\n    return Point { x: x, y: y };\n}",
    "frame caseOf(s: Shade) ret int {\n    switch (s) {\n        case base.Shade.Light: {\n            return 1;\n        }\n        case Shade.Dark: {\n            return 2;\n        }\n        default: {\n            return 3;\n        }\n    }\n}",
    "frame main() ret int {",
    ...statements.map((statement) => `    ${statement}`),
    "    return 0;",
    "}",
    ...[
      ["base.bpl", base],
      ["left.bpl", left],
      ["right.bpl", right],
    ].flatMap(([name, text]) => [
      `${MODULE_MARKER}${name}`,
      ...text!
        .trimEnd()
        .split("\n")
        .map((line) => `${MODULE_LINE}${line}`),
    ]),
    ...output.map((line) => `${EXPECT_MARKER}${line}`),
  ];
  return {
    source: `${main.join("\n")}\n`,
    expectedStdout: output.map((line) => `${line}\n`).join(""),
  };
}
