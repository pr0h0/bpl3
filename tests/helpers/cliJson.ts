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

export function expectJsonStdoutReport<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  result: SpawnSyncReturns<string>,
  expected: {
    status?: number;
    schemaVersion?: number;
    check?: string;
    success?: boolean;
    stderr?: "empty" | "allow";
  },
): T {
  if (expected.status !== undefined) {
    expect(result.status).toBe(expected.status);
  }

  if (expected.stderr === "allow") {
    expect(result.stdout.trim()).not.toBe("");
  } else {
    expect(result.stderr).toBe("");
  }

  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toBeObject();
  const report = parsed as T;
  expect(report).toMatchObject({
    schemaVersion: expected.schemaVersion ?? 1,
    ...(expected.check === undefined ? {} : { check: expected.check }),
    ...(expected.success === undefined ? {} : { success: expected.success }),
  });
  return report;
}
