import { expect } from "bun:test";
import type { SpawnSyncReturns } from "child_process";

export function parseJsonObjectStdout<
  T extends Record<string, unknown> = Record<string, unknown>,
>(result: SpawnSyncReturns<string>): T {
  expect(result.stdout.trim()).not.toBe("");
  expect(result.stderr).toBe("");

  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toBeObject();
  return parsed as T;
}
