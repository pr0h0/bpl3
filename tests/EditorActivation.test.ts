import { expect, test } from "bun:test";
import path from "node:path";
import { spawnSync } from "node:child_process";

for (const [mode, expectedCalls] of [
  ["default", 1],
  ["native-off", 0],
  ["native-on", 0],
  ["bpl-off", 0],
] as const) {
  test(`editor activation respects save preferences without changing settings: ${mode}`, () => {
    const child = spawnSync(
      process.execPath,
      [path.join(import.meta.dir, "helpers/editorActivationHarness.ts"), mode],
      { encoding: "utf8", timeout: 30000, env: process.env },
    );
    expect({ status: child.status, error: child.error?.message }).toEqual({
      status: 0,
      error: undefined,
    });
    const result = JSON.parse(child.stdout.trim());
    expect(result.updates).toBe(0);
    expect(result.formatCalls).toBe(expectedCalls);
    expect(result.selector).toEqual({ language: "bpl", scheme: "untitled" });
    expect(result.edits[0].newText).toContain("\n  local value");
    expect(result.invalid).toEqual([]);
  });
}
