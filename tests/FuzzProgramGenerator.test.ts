import { describe, expect, test } from "bun:test";
import {
  createSeededRandom,
  generateFuzzInput,
  generateOracleSource,
  runBplOraclePipeline,
  runGeneratedPipeline,
} from "../fuzz/compilerFuzz";
import {
  EXPECT_MARKER,
  WASM_MARKER,
  generateOracleProgram,
  readExpectedStdout,
} from "../fuzz/programGenerator";

describe("generated fuzz programs", () => {
  test("are deterministic and carry their expected output", () => {
    const first = generateOracleProgram(createSeededRandom(42));
    const second = generateOracleProgram(createSeededRandom(42));
    expect(second).toEqual(first);
    expect(first.source).toContain("frame main() ret int {");
    expect(readExpectedStdout(first.source)).toBe(first.expectedStdout);
    expect(first.expectedStdout.length).toBeGreaterThan(0);
  });

  test("cover the language features they are meant to exercise", () => {
    const sources = Array.from(
      { length: 120 },
      (_, seed) => generateOracleProgram(createSeededRandom(seed)).source,
    ).join("\n");
    for (const feature of [
      /match \(/,
      /\bs\d+\.m\d+\(/,
      /\bmut\d+\(/,
      /\brec\d+\(\(/,
      /gid<[a-z0-9]+>\(/,
      /\.get\(\)/,
      /\bl\d+\(/,
      /\bbreak;/,
      /\bcontinue;/,
      /switch \(/,
      /local ptr\d+: \*/,
      /global g\d+:/,
      /struct C\d+: P\d+/,
      /\bcallv\d+\(&/,
      /local sl\d+: P\d+ = c\d+;/,
      /local \(t\d+: /,
      /\bdefer printf\(/,
      /: f32 = /,
      /%llx/,
      /\btry \{/,
      /\} catch \(e\d+: (int|long|u8)\) \{/,
      /\} catch \{/,
      /\bthrow /,
      /\bthr\d+\(/,
      /\bfallthrough;/,
      /loop \(local i\d+: int = 0; /,
      /loop \{/,
      /\bn\d+ if \(n\d+\) /,
      /local fp\d+: Func</,
      /\bfp\d+\(/,
      /\brl\d+\(\(/,
      /defer printf\("rl\d+\\n"\);/,
      /throw cast<long>\(e\) \* cast<long>\(2\);/,
      /throw mk\d+\(/,
      /catch \(e\d+: S\d+\)/,
      /^\s+s\d+ = mk\d+\(/m,
      /switch \(e\d+\) \{/,
      /case E\d+\.V\d+: \{/,
      /case "[a-z ]*": \{/,
      /[{,] -\d+ => /,
      /\(k\d+(\+\+|--)\)/,
      /\((\+\+|--)k\d+\)/,
      /frame (ov\d+)\([^)]*\)[^]*frame \1\(/,
      /\(s\d+ (==|!=) s\d+\)/,
      /\bav\d+\(a\d+, /,
      /^\s+sl\d+\(a\d+, /m,
      /\*\(pa\d+ \+ \(\(/,
      /^\s+\S+ = \S+ = /m,
      /\(up\d+ is \*C\d+\)/,
      /local uq\d+: \*P\d+ = &/,
      /sizeof\((bool|i8|u16|int|uint|long|double|f32)\)/,
      /\bapply\d+\(l\d+, /,
      /\(-\(\(\(.*\) & 3\) \+ 2\)\)/,
      /& 63\)/,
      /\bo\d+\.inner\.f\d+/,
      /\bo\d+\.arr\[/,
      /O\d+\.mk\(/,
      /local o\d+: O\d+ = o\d+;/,
      /struct S\d+: V\d+ \{/,
      /\btot\d+<S\d+>\(&s\d+, /,
      /\{ (true|false) => /,
      /\(\d+, (true|false)\) => /,
      /\(_, _\) => /,
      /\{ -?\d+\.\d+ => /,
      /defer \{/,
      /global ga\d+: [a-z0-9]+\[4\] = \[/,
      /local cl\d+: Lambda</,
      /frame __add__\(this: /,
      /\(q\d+ [-+] q\d+\)/,
      /\(q\d+ (==|!=) q\d+\)/,
      /^\s+q\d+\[.*\] = /m,
      /^\s+\(\S+, \S+\) = \(/m,
      /local bm\d+: Lambda</,
      /local bu\d+: Lambda<void>\(int\)/,
      /frame m\d+\(this: S\d+, /,
      /\bmkOpt<[a-z0-9]+>\(/,
      /Opt<[a-z0-9]+>\.Pair\(\w+, \w+\) if /,
      /\\u[0-9a-f]{4}/,
      /\bg?str\d+\[\(\(/,
      /\{ '.{1,2}' => /,
      /local sa\d+: S\d+\[2\] = \[/,
      /\bsa\d+\[\(.*\) & 1\] = /,
      /local sp\d+: \*S\d+ = &sa\d+\[/,
      /\\x(80|C3|F0|ff)/,
      /global gs\d+: S\d+;/,
      /^type A\d+ = /m,
      /local const c\d+: /,
      /local m\d+: [a-z0-9]+\[2\]\[2\] = \[\[/,
      /\bm\d+\[\(.*\) & 1\]\[\(/,
      /\bset\d+\(&m\d+\[/,
      /\bsum\d+\(m\d+, /,
      /\bpr\d+\.swap\(\)\.first\(\)/,
      /^\s+pr\d+ = pr\d+\.swap\(\);/m,
      /Box<Box<[a-z0-9]+>>/,
      /\bbb\d+\.get\(\)\.get\(\)/,
      /f: Func<[a-z0-9]+>\(/,
      /^\s+h\d+\.f = h[fg]\d+;/m,
      /\bcur\d+\(.*\)\(/,
      /\badd\d+\(/,
    ]) {
      expect(sources).toMatch(feature);
    }
  });

  test("type-check, verify and round-trip through the formatter", () => {
    for (let seed = 0; seed < 60; seed++) {
      const { source } = generateOracleProgram(createSeededRandom(seed));
      const outcome = runGeneratedPipeline(source, `seed-${seed}.bpl`);
      expect({ seed, ok: outcome.ok, message: outcome.message }).toEqual({
        seed,
        ok: true,
        message: undefined,
      });
    }
  }, 120000);

  test("print exactly their oracle output at -O0 and -O3", () => {
    for (const seed of [7, 8]) {
      const { source } = generateOracleProgram(createSeededRandom(seed));
      const outcome = runBplOraclePipeline(source, `seed-${seed}.bpl`);
      expect({ seed, ok: outcome.ok, message: outcome.message }).toEqual({
        seed,
        ok: true,
        message: undefined,
      });
    }
  }, 120000);

  test("report a program whose output differs from its oracle", () => {
    const { source } = generateOracleProgram(createSeededRandom(9));
    const tampered = source.replace(
      new RegExp(`^${EXPECT_MARKER}(\\w+)=.*$`, "m"),
      `${EXPECT_MARKER}$1=wrong`,
    );
    const outcome = runBplOraclePipeline(tampered, "tampered.bpl");
    expect(outcome.ok).toBe(false);
    expect(outcome.mismatch?.expectedStdout).toContain("=wrong");
    expect(outcome.message).toContain("differs from its oracle");
  }, 60000);

  test("for WebAssembly, carry the target marker and keep exceptions", () => {
    const sources = Array.from(
      { length: 60 },
      (_, seed) =>
        generateOracleProgram(createSeededRandom(seed), { wasm: true }).source,
    );
    for (const source of sources) {
      expect(source.startsWith(WASM_MARKER)).toBe(true);
    }
    expect(sources.join("\n")).toMatch(/\btry \{/);
    expect(generateFuzzInput(0xabc, 3, { wasm: true }).source).toStartWith(
      WASM_MARKER,
    );
  });

  test("deferred expressions contain no calls", () => {
    // A deferred call would run at block exit and could observe later
    // state, while the oracle evaluates the value when `defer` runs.
    const deferred = Array.from(
      // Calls reached through a float cast are rare; seed 1209 has one.
      { length: 1300 },
      (_, seed) => generateOracleProgram(createSeededRandom(seed)).source,
    )
      .flatMap((source) => source.split("\n"))
      .filter((line) => line.includes("defer printf("));
    expect(deferred.length).toBeGreaterThan(10);
    for (const line of deferred) {
      const argument = line.slice(line.indexOf(", ") + 2);
      expect({
        line,
        call: /\b(?:l|h|rec|byval|callv|m|u|ov|fp|mk|thr|rl|av|apply|tot)\d+\(|\.vf\(|\.get\(|gid</.test(
          argument,
        ),
      }).toEqual({ line, call: false });
    }
  });

  test("skip IR verification when no LLVM verifier is installed", () => {
    const { source } = generateOracleProgram(createSeededRandom(5));
    const keys = ["BPL_OPT", "BPL_LLVM_AS", "BPL_LLC", "BPL_CC"] as const;
    const saved = keys.map((key) => process.env[key]);
    for (const key of keys) process.env[key] = "/nonexistent/llvm-tool";
    try {
      expect(runGeneratedPipeline(source, "no-tools.bpl").ok).toBe(true);
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  });

  test("bound array-index nesting below the parser's depth limit", () => {
    // Found by the fuzzer: each index restarted the depth budget, so
    // `a[a[a[...]]]` grew until BPL_SOURCE_COMPLEXITY_LIMIT (seed 0xa568ed5c).
    const source = generateOracleSource(0xa568ed5c, 519);
    expect(runGeneratedPipeline(source, "nested-index.bpl").ok).toBe(true);
    for (let seed = 0; seed < 1500; seed++) {
      const longest = Math.max(
        ...generateOracleSource(seed, 3)
          .split("\n")
          .map((line) => line.length),
      );
      expect({ seed, short: longest < 4000 }).toEqual({ seed, short: true });
    }
  }, 60000);

  test("take dedicated campaign lanes, reproducible from seed and pass", () => {
    const plain = generateFuzzInput(0xabc, 3);
    expect(plain.kind).toBe("generated");
    expect(plain.source).toBe(generateOracleSource(0xabc, 3));
    const differential = [3, 7].map(
      (iteration) =>
        generateFuzzInput(0xabc, iteration, { enableDifferential: true }).kind,
    );
    expect(differential).toEqual(["oracle", "oracle"]);
    const traced = generateOracleSource(0xabc, 3, { trace: true });
    expect(traced).toContain('printf("after statement 0\\n");');
  });
});
