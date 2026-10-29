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
        call: /\b(?:l|h|rec|byval|callv|m|u)\d+\(|\.vf\(|\.get\(|gid</.test(
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
