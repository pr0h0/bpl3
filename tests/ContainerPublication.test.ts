import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

for (const mode of ["fresh", "resume", "different", "unavailable"] as const) {
  test.skipIf(process.platform !== "linux")(
    `container publication handles ${mode} registry state without replacing existing tags`,
    () => {
      const dir = mkdtempSync(join(tmpdir(), "bpl-publication-test-"));
      try {
        const workflow = readFileSync(
          join(import.meta.dir, "../.github/workflows/container-images.yml"),
          "utf8",
        );
        const match =
          /- name: Publish verified patch images\s+run: \|\n([\s\S]*)$/.exec(
            workflow,
          );
        expect(match).not.toBeNull();
        const script = match![1]!
          .split("\n")
          .map((line) => line.replace(/^ {10}/, ""))
          .join("\n");
        const log = join(dir, "commands");
        writeFileSync(
          join(dir, "docker"),
          `#!/bin/sh
set -eu
printf '%s\\n' "$*" >> "$COMMAND_LOG"
if [ "$1 $2" = "manifest inspect" ]; then
  case "$TEST_MODE" in
    fresh) echo 'manifest unknown' >&2; exit 1 ;;
    resume) case "$3" in *-compiler:*) exit 0 ;; *) echo 'no such manifest' >&2; exit 1 ;; esac ;;
    different) exit 0 ;;
    unavailable) echo 'registry connection refused' >&2; exit 1 ;;
  esac
fi
if [ "$1 $2" = "image inspect" ]; then
  if [ "$TEST_MODE" = different ]; then echo other-commit; else echo "$GITHUB_SHA"; fi
fi
`,
          { mode: 0o755 },
        );
        const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            TEST_MODE: mode,
            COMMAND_LOG: log,
            GITHUB_REPOSITORY: "Owner/BPL3",
            GITHUB_SHA: "abc123",
            BPL_VERSION: "0.1.1",
          },
        });
        const pushes = readFileSync(log, "utf8")
          .split("\n")
          .filter((line) => line.startsWith("push "));
        if (mode === "fresh") {
          expect(result.status, result.stderr).toBe(0);
          expect(pushes).toEqual([
            "push ghcr.io/owner/bpl3-compiler:0.1.1",
            "push ghcr.io/owner/bpl3-playground:0.1.1",
          ]);
        } else if (mode === "resume") {
          expect(result.status, result.stderr).toBe(0);
          expect(pushes).toEqual(["push ghcr.io/owner/bpl3-playground:0.1.1"]);
        } else {
          expect(result.status).not.toBe(0);
          expect(pushes).toEqual([]);
          expect(result.stderr).toContain(
            mode === "different"
              ? "Refusing to overwrite"
              : "connection refused",
          );
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
