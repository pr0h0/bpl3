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
    new Logger("ColorTest").info("color probe");`;
  const result = spawnSync(process.execPath, ["-e", source], {
    env,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("color probe");
  return result.stdout;
}

test("logs redirected to a pipe have no ANSI color by default", () => {
  expect(logWithTerminal(undefined)).not.toContain("\u001b[");
  expect(logWithTerminal(false)).not.toContain("\u001b[");
});

test("terminal logs retain colors unless NO_COLOR is set", () => {
  expect(logWithTerminal(true)).toContain("\u001b[");
  expect(logWithTerminal(true, "1")).not.toContain("\u001b[");
});
