import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function logWithTerminal(terminal: boolean | undefined, noColor?: string) {
  const env = { ...process.env };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  if (noColor !== undefined) env.NO_COLOR = noColor;
  const source = `import { Logger } from ${JSON.stringify(resolve("compiler/common/Logger.ts"))};
    ${terminal === undefined ? "" : `Object.defineProperty(process.stdout, "isTTY", { value: ${terminal} });`}
    new Logger("ColorTest").warn("color probe");`;
  const result = spawnSync(process.execPath, ["-e", source], {
    env,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  // Warnings go to stderr; color follows the configured terminal detection.
  expect(result.stderr).toContain("color probe");
  return result.stderr;
}

test("logs redirected to a pipe have no ANSI color by default", () => {
  expect(logWithTerminal(undefined)).not.toContain("\u001b[");
  expect(logWithTerminal(false)).not.toContain("\u001b[");
});

test("terminal logs retain colors unless NO_COLOR is set", () => {
  expect(logWithTerminal(true)).toContain("\u001b[");
  expect(logWithTerminal(true, "1")).not.toContain("\u001b[");
});

test("non-verbose logs use compiler-style prefixes without timestamps", () => {
  const source = `import { Logger } from ${JSON.stringify(resolve("compiler/common/Logger.ts"))};
    const log = new Logger("Prefix");
    log.info("plain info");
    log.error("broken thing");`;
  const env: Record<string, string | undefined> = {
    ...process.env,
    NO_COLOR: "1",
  };
  delete env.BPL_VERBOSE;
  delete env.BPL_DEBUG;
  const result = spawnSync(process.execPath, ["-e", source], {
    env,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("plain info\n");
  expect(result.stderr).toBe("error: broken thing\n");
});
