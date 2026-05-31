import { expect } from "bun:test";
import type { SpawnSyncReturns } from "child_process";

export const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/;

export function expectJsonValueHasNoAnsi(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    const match = ANSI_ESCAPE_PATTERN.exec(value);
    if (match) {
      throw new Error(
        `JSON string at ${path} contains ANSI escape sequence ${JSON.stringify(
          match[0],
        )}`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      expectJsonValueHasNoAnsi(item, `${path}[${index}]`),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, childValue] of Object.entries(value)) {
      expectJsonValueHasNoAnsi(childValue, `${path}.${key}`);
    }
  }
}

export function parseJsonObjectStdout<
  T extends Record<string, unknown> = Record<string, unknown>,
>(result: SpawnSyncReturns<string>): T {
  expect(result.stdout.trim()).not.toBe("");
  expect(result.stderr).toBe("");

  const parsed: unknown = JSON.parse(result.stdout);
  expect(parsed).toBeObject();
  expectJsonValueHasNoAnsi(parsed);
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
  expectJsonValueHasNoAnsi(parsed);
  const report = parsed as T;
  expect(report).toMatchObject({
    schemaVersion: expected.schemaVersion ?? 1,
    ...(expected.check === undefined ? {} : { check: expected.check }),
    ...(expected.success === undefined ? {} : { success: expected.success }),
  });
  return report;
}
