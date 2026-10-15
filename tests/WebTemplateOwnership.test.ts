import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

const support = checkBplSanitizerSupport();
test.skipIf(!support.supported)(
  "template generator releases arguments and intermediate strings on success and usage errors",
  () => {
    const dir = mkdtempSync(resolve(".web-template-ownership-"));
    try {
      const views = join(dir, "views");
      mkdirSync(views);
      mkdirSync(join(views, "nested"));
      writeFileSync(
        join(views, "greeting.bte"),
        "@args name: string\n<p>{{ name }}</p>\nplain text\n",
      );
      writeFileSync(join(views, "nested", "plain.bte"), "nested text\n");
      const exe = join(dir, "templ");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          resolve("packages/bpl-templ/src/cli.bpl"),
          "--clang-flag=-fsanitize=address,undefined",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      for (const args of [
        [],
        ["unknown"],
        ["generate"],
        ["generate", views],
        [
          "generate",
          views,
          "-o",
          join(dir, "output"),
          "--ext",
          ".generated.bpl",
        ],
      ]) {
        const result = spawnSync(exe, args, {
          encoding: "utf8",
          timeout: 15000,
          env: {
            ...process.env,
            ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1",
            UBSAN_OPTIONS: "halt_on_error=1",
          },
        });
        expect(result.stderr, `args: ${JSON.stringify(args)}`).not.toContain(
          "Sanitizer",
        );
        expect(result.status, result.stdout + result.stderr).toBe(
          args.length >= 2 ? 0 : 1,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  120000,
);
