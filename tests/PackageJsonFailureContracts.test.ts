import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { parseJsonObjectStdout } from "./helpers/cliJson";

const BPL_CLI = join(import.meta.dir, "..", "index.ts");

type CommandContext = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

describe("Package JSON failure contracts", () => {
  test("inventories package command empty failure shapes", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bpl-package-json-failures-"));

    try {
      const cases: Array<{
        name: string;
        args: string[];
        context: () => CommandContext;
        expected: Record<string, unknown>;
      }> = [
        {
          name: "list",
          args: ["list", "--json"],
          context: () => unsafeLocalPackageRoot(tempDir, "list"),
          expected: {
            schemaVersion: 1,
            check: "package-list",
            success: false,
            scope: "local",
            packages: [],
          },
        },
        {
          name: "list-tree",
          args: ["list", "--tree", "--json"],
          context: () => unsafeLocalPackageRoot(tempDir, "list-tree"),
          expected: {
            schemaVersion: 1,
            check: "package-list-tree",
            success: false,
            scope: "local",
            tree: [],
          },
        },
        {
          name: "cache-list",
          args: ["package-cache", "list", "--json"],
          context: () => unsafeCacheRoot(tempDir, "cache-list"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-list",
            success: false,
            entries: [],
          },
        },
        {
          name: "cache-verify",
          args: ["package-cache", "verify", "--json"],
          context: () => unsafeCacheRoot(tempDir, "cache-verify"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-verify",
            success: false,
            ok: false,
            entriesChecked: 0,
            issues: [],
          },
        },
        {
          name: "cache-clean",
          args: [
            "package-cache",
            "clean",
            "pkg",
            "--package-version",
            "^1.0.0",
            "--dry-run",
            "--json",
          ],
          context: () => cleanPackageRoot(tempDir, "cache-clean"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-clean",
            success: false,
            removed: [],
            dryRun: true,
          },
        },
        {
          name: "cache-repair",
          args: [
            "package-cache",
            "repair",
            "pkg",
            "--package-version",
            "latest",
            "--dry-run",
            "--json",
          ],
          context: () => cleanPackageRoot(tempDir, "cache-repair"),
          expected: {
            schemaVersion: 1,
            check: "package-cache-repair",
            success: false,
            dryRun: true,
            repaired: [],
            unchanged: [],
            issues: [],
          },
        },
      ];

      for (const testCase of cases) {
        const context = testCase.context();
        const result = runCli(testCase.args, context);
        expect(result.status).toBe(1);
        expect(parseJsonObjectStdout(result)).toMatchObject({
          ...testCase.expected,
          error: expect.any(String),
        });
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function runCli(
  args: string[],
  context: CommandContext,
): SpawnSyncReturns<string> {
  return spawnSync("bun", [BPL_CLI, ...args], {
    cwd: context.cwd,
    encoding: "utf-8",
    env: { ...process.env, NO_COLOR: "1", ...context.env },
  });
}

function unsafeLocalPackageRoot(root: string, name: string): CommandContext {
  const cwd = join(root, name);
  const home = join(root, `${name}-home`);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(cwd, "bpl_modules"), "not a directory");
  return { cwd, env: { HOME: home } };
}

function unsafeCacheRoot(root: string, name: string): CommandContext {
  const cwd = join(root, `${name}-cwd`);
  const home = join(root, `${name}-home`);
  const bplHome = join(home, ".bpl");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(bplHome, { recursive: true });
  writeFileSync(join(bplHome, "packages"), "not a directory");
  return { cwd, env: { HOME: home } };
}

function cleanPackageRoot(root: string, name: string): CommandContext {
  const cwd = join(root, `${name}-cwd`);
  const home = join(root, `${name}-home`);
  mkdirSync(cwd, { recursive: true });
  mkdirSync(home, { recursive: true });
  return { cwd, env: { HOME: home } };
}
