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
  if [ "$TEST_MODE" = different ]; then echo other-commit; else echo "$BPL_REVISION"; fi
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
            GITHUB_SHA: "annotated-tag-object",
            BPL_REVISION: "abc123",
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

for (const scenario of [
  {
    name: "branch verification",
    version: "0.1.1",
    refType: "branch",
    refName: "master",
    valid: true,
  },
  {
    name: "matching release tag",
    version: "0.1.1",
    refType: "tag",
    refName: "v0.1.1",
    valid: true,
  },
  {
    name: "multi-digit patch",
    version: "0.1.123",
    refType: "tag",
    refName: "v0.1.123",
    valid: true,
  },
  {
    name: "mismatched release tag",
    version: "0.1.1",
    refType: "tag",
    refName: "v0.1.2",
    valid: false,
  },
  {
    name: "minor release",
    version: "0.2.0",
    refType: "tag",
    refName: "v0.2.0",
    valid: false,
  },
  {
    name: "major release",
    version: "1.0.0",
    refType: "tag",
    refName: "v1.0.0",
    valid: false,
  },
  {
    name: "prerelease tag",
    version: "0.1.1",
    refType: "tag",
    refName: "v0.1.1-rc.1",
    valid: false,
  },
  {
    name: "leading-zero patch",
    version: "0.1.01",
    refType: "tag",
    refName: "v0.1.01",
    valid: false,
  },
]) {
  test.skipIf(process.platform !== "linux")(
    `container release validation handles ${scenario.name}`,
    () => {
      const dir = mkdtempSync(join(tmpdir(), "bpl-version-test-"));
      try {
        const workflow = readFileSync(
          join(import.meta.dir, "../.github/workflows/container-images.yml"),
          "utf8",
        );
        const match =
          /- name: Validate patch-only release version\n        id: version\n        run: \|\n([\s\S]*?)(?=      - name:)/.exec(
            workflow,
          );
        expect(match).not.toBeNull();
        const script = match![1]!
          .split("\n")
          .map((line) => line.replace(/^ {10}/, ""))
          .join("\n");
        // Use a real manifest and Git checkout, including an annotated tag, to test
        // the commit revision independently of the event's tag-object SHA.
        writeFileSync(
          join(dir, "package.json"),
          JSON.stringify({ version: scenario.version }),
        );
        for (const args of [
          ["init", "--quiet"],
          ["add", "package.json"],
          [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "--quiet",
            "-m",
            "fixture",
          ],
          [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "tag",
            "-a",
            "v0.1.1",
            "-m",
            "release",
          ],
          ["checkout", "--quiet", "--detach", "v0.1.1"],
        ]) {
          const git = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
          expect(git.status, git.stderr).toBe(0);
        }
        const commit = spawnSync("git", ["rev-parse", "HEAD"], {
          cwd: dir,
          encoding: "utf8",
        }).stdout.trim();
        const tagObject = spawnSync("git", ["rev-parse", "v0.1.1"], {
          cwd: dir,
          encoding: "utf8",
        }).stdout.trim();
        expect(commit).not.toBe(tagObject);
        const output = join(dir, "output");
        const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
          cwd: dir,
          encoding: "utf8",
          timeout: 10000,
          env: {
            ...process.env,
            GITHUB_OUTPUT: output,
            GITHUB_SHA: tagObject,
            GITHUB_REF_TYPE: scenario.refType,
            GITHUB_REF_NAME: scenario.refName,
          },
        });
        if (scenario.valid) {
          expect(result.status, result.stderr).toBe(0);
          expect(readFileSync(output, "utf8")).toBe(
            `version=${scenario.version}\nrevision=${commit}\n`,
          );
        } else {
          expect(result.status).not.toBe(0);
          expect(result.stderr).toContain(
            scenario.version === "0.1.1"
              ? "Release tag must equal"
              : "Only 0.1.x versions are allowed",
          );
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
}
