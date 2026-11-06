import { describe, expect, test } from "bun:test";
import { compileAndRunFull } from "./helpers/compileAndRun";

// Levels, prefixes and BPL_LOG_LEVEL on standard output are covered by
// examples/stdlib_log.
describe("std/log.bpl", () => {
  test("useStderr keeps log lines out of standard output", () => {
    const result =
      compileAndRunFull(`import [Log], [LogLevel] from "std/log.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    Log.useStderr(true);
    Log.setPrefix(true);
    Log.setLevel(LogLevel.Info);
    Log.debug("hidden");
    Log.info("starting");
    printf("result\\n");
    Log.error("failed");
    return 0;
}
`);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("result\n");
    expect(result.stderr).toBe("[INFO] starting\n[ERROR] failed\n");
  }, 60000);

  test("levelFromEnv leaves the level unchanged for unknown values", () => {
    const source = `import [Log] from "std/log.bpl";
import printf from "std/c.bpl";

frame main() ret int {
    printf("%d\\n", Log.levelFromEnv());
    Log.debug("debug");
    Log.error("error");
    return 0;
}
`;
    expect(
      compileAndRunFull(source, { env: { BPL_LOG_LEVEL: "verbose" } }).stdout,
    ).toBe("0\ndebug\nerror\n");
    expect(
      compileAndRunFull(source, { env: { BPL_LOG_LEVEL: "ERROR" } }).stdout,
    ).toBe("1\nerror\n");
  }, 60000);

  test("setTimestamps starts lines with the UTC time before the level", () => {
    const before = Date.now();
    const result = compileAndRunFull(`import [Log] from "std/log.bpl";

frame main() ret int {
    Log.setTimestamps(true);
    Log.setPrefix(true);
    Log.info("started");
    Log.setTimestamps(false);
    Log.info("plain");
    return 0;
}
`);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trimEnd().split("\n");
    const match = lines[0]!.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) \[INFO\] started$/,
    );
    expect(match).not.toBeNull();
    const logged = Date.parse(match![1]!);
    expect(logged).toBeGreaterThanOrEqual(before - 1000);
    expect(logged).toBeLessThanOrEqual(Date.now() + 1000);
    expect(lines[1]).toBe("[INFO] plain");
  }, 60000);
});
