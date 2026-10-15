import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("template generator rejects incomplete options, unknown arguments and unreadable inputs", () => {
  const dir = mkdtempSync(resolve(".web-template-args-"));
  try {
    const views = join(dir, "views");
    mkdirSync(views);
    writeFileSync(join(views, "page.bte"), "<p>fixture</p>\n");
    const exe = join(dir, "templ");
    const build = spawnSync(
      "bun",
      [
        resolve("index.ts"),
        "build",
        resolve("packages/bpl-templ/src/cli.bpl"),
        "-o",
        exe,
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    for (const args of [
      ["generate", views, "-o"],
      ["generate", views, "--out"],
      ["generate", views, "--ext"],
      ["generate", views, "-o", ""],
      ["generate", views, "--unknown"],
      ["generate", views, "-o", "--ext", ".bpl"],
      ["generate", views, join(dir, "extra")],
      ["generate", join(dir, "missing")],
      ["generate", join(views, "page.bte")],
      ["generate", views, "-o", join(views, "page.bte")],
    ]) {
      const result = spawnSync(exe, args, {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
      });
      expect(
        result.status,
        `args: ${JSON.stringify(args)}\n${result.stdout}${result.stderr}`,
      ).toBe(1);
      expect(readdirSync(views)).toEqual(["page.bte"]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
