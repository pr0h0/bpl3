import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import {
  getBashCompletionScript,
  getZshCompletionScript,
} from "../cli/completions";
const root = resolve(import.meta.dir, "..");
test("shipped and embedded completion scripts match exactly", () => {
  expect(getBashCompletionScript()).toBe(
    readFileSync(resolve(root, "completions/bpl-completion.bash"), "utf8"),
  );
  expect(getZshCompletionScript()).toBe(
    readFileSync(resolve(root, "completions/_bpl"), "utf8"),
  );
});
for (const command of ["format", "lint", "docs"]) {
  test(`${command} options appear in both completion scripts`, () => {
    const source = readFileSync(
      resolve(root, `cli/commands/${command}.ts`),
      "utf8",
    );
    const flags = [...source.matchAll(/\.option\(\s*"([^"]+)"/g)].flatMap(
      (m) => m[1]!.match(/--[a-z][a-z-]*/g) || [],
    );
    const bash = getBashCompletionScript();
    const zsh = getZshCompletionScript();
    for (const flag of flags) {
      expect(bash).toContain(flag);
      expect(zsh).toContain(flag);
    }
  });
}
test("bash actually completes formatter check and config flags", () => {
  const result = spawnSync(
    "bash",
    [
      "-c",
      'source completions/bpl-completion.bash; COMP_WORDS=(bpl format --); COMP_CWORD=2; _bpl_completion; printf "%s\\n" "${COMPREPLY[@]}"',
    ],
    { cwd: root, encoding: "utf8" },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("--check");
  expect(result.stdout).toContain("--config");
});
