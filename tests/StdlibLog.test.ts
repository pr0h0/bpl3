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
});
