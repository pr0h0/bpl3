import { describe, expect, test } from "bun:test";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { join } from "path";

const RELEASE_SMOKE_TIMEOUT_MS = 180 * 1000;
const RELEASE_SMOKE_COMMAND = ["bun", "run", "release:smoke"] as const;

interface ReleaseSmokeFailureContext {
  command: string;
  cwd: string;
}

function expectReleaseSmokeSuccess(
  result: SpawnSyncReturns<string>,
  context: ReleaseSmokeFailureContext,
): void {
  if (result.error || result.status !== 0) {
    throw new Error(formatReleaseSmokeFailure(result, context));
  }
}

function formatReleaseSmokeFailure(
  result: SpawnSyncReturns<string>,
  context: ReleaseSmokeFailureContext,
): string {
  return [
    "Release smoke command failed.",
    `command: ${context.command}`,
    `cwd: ${context.cwd}`,
    `status: ${result.status ?? "none"}`,
    `signal: ${result.signal ?? "none"}`,
    `spawn error: ${formatSpawnError(result.error)}`,
    `stdout:\n${formatChildOutput(result.stdout)}`,
    `stderr:\n${formatChildOutput(result.stderr)}`,
  ].join("\n");
}

function formatSpawnError(error: Error | undefined): string {
  if (!error) {
    return "none";
  }
  return error.stack || error.message;
}

function formatChildOutput(output: string | undefined): string {
  const trimmedOutput = output?.trimEnd();
  return trimmedOutput ? trimmedOutput : "<empty>";
}

describe("Release smoke", () => {
  test("formats child process output when release smoke fails", () => {
    const failedResult: SpawnSyncReturns<string> = {
      error: undefined,
      output: ["", "release stdout\n", "release stderr\n"],
      pid: 123,
      signal: null,
      status: 1,
      stderr: "release stderr\n",
      stdout: "release stdout\n",
    };
    const context = {
      command: "bun run release:smoke",
      cwd: "/repo",
    };

    const message = formatReleaseSmokeFailure(failedResult, context);

    expect(() => expectReleaseSmokeSuccess(failedResult, context)).toThrow(
      message,
    );
    expect(message).toContain("Release smoke command failed.");
    expect(message).toContain("command: bun run release:smoke");
    expect(message).toContain("cwd: /repo");
    expect(message).toContain("status: 1");
    expect(message).toContain("signal: none");
    expect(message).toContain("spawn error: none");
    expect(message).toContain("stdout:\nrelease stdout");
    expect(message).toContain("stderr:\nrelease stderr");
  });

  test("formats release smoke spawn errors", () => {
    const message = formatReleaseSmokeFailure(
      {
        error: new Error("spawn ENOENT"),
        output: ["", "", ""],
        pid: 123,
        signal: null,
        status: null,
        stderr: "",
        stdout: "",
      },
      {
        command: "bun run release:smoke",
        cwd: "/repo",
      },
    );

    expect(message).toContain("status: none");
    expect(message).toContain("spawn error: Error: spawn ENOENT");
    expect(message).toContain("stdout:\n<empty>");
    expect(message).toContain("stderr:\n<empty>");
  });

  test(
    "builds and exercises the standalone and packed CLI binaries",
    () => {
      const repoRoot = join(import.meta.dir, "..");
      const result = spawnSync(
        RELEASE_SMOKE_COMMAND[0],
        RELEASE_SMOKE_COMMAND.slice(1),
        {
          cwd: repoRoot,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
          timeout: RELEASE_SMOKE_TIMEOUT_MS,
        },
      );

      expectReleaseSmokeSuccess(result, {
        command: RELEASE_SMOKE_COMMAND.join(" "),
        cwd: repoRoot,
      });
      expect(result.stdout).toContain("release smoke: pack npm tarball");
      expect(result.stdout).toContain(
        "release smoke: validate packed npm metadata",
      );
      expect(result.stdout).toContain(
        "release smoke: validate packed npm file allowlist",
      );
      expect(result.stdout).toContain("release smoke: install packed npm CLI");
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI doctor JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI doctor failure JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package doctor JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package install JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package list tree JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package-cache list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI package-cache verify JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI check JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI lint JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI bash completion",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI zsh completion",
      );
      expect(result.stdout).toContain(
        "release smoke: scaffold packed npm CLI library template",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI library template",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI run-script list JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI run-script failure JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: run packed npm CLI library example",
      );
      expect(result.stdout).toContain(
        "release smoke: compile tiny program with packed npm CLI",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI build JSON",
      );
      expect(result.stdout).toContain(
        "release smoke: build packed npm CLI wasm artifact",
      );
      expect(result.stdout).toContain(
        "release smoke: build packed npm CLI cached module app",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz artifact repro helper",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz artifact repro usage errors",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz runner usage errors",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz replay usage errors",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI fuzz promote usage errors",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI CI triage helper",
      );
      expect(result.stdout).toContain(
        "release smoke: check packed npm CLI CI triage usage errors",
      );
      expect(result.stdout).toContain("release smoke passed");
    },
    RELEASE_SMOKE_TIMEOUT_MS + 10 * 1000,
  );
});
