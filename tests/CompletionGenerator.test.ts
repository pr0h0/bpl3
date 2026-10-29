import { expect, test } from "bun:test";
import { resolve } from "path";

// BUG-438: the hand-written completion scripts offered flags commands do not
// accept and missed ones they do. They are now generated from the commander
// tree; these tests keep the shipped scripts in sync with each command's help.
const root = resolve(import.meta.dir, "..");

function run(args: string[]) {
  return Bun.spawnSync([process.execPath, ...args], {
    cwd: root,
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function bashComplete(words: string[]): string[] {
  const result = Bun.spawnSync(
    [
      "bash",
      "-c",
      'source completions/bpl-completion.bash; COMP_WORDS=("$@"); COMP_CWORD=$((${#COMP_WORDS[@]}-1)); _bpl_completion; printf "%s\\n" "${COMPREPLY[@]}"',
      "_",
      ...words,
    ],
    { cwd: root },
  );
  return result.stdout.toString().split("\n").filter(Boolean);
}

function helpFlags(args: string[]): string[] {
  const help = run(["index.ts", ...args, "--help"]).stdout.toString();
  const options = help.split(/^Options:$/m)[1]?.split(/^Commands:$/m)[0] ?? "";
  return [...options.matchAll(/^ {2}(-\S.*?)(?: {2,}|$)/gm)]
    .flatMap((match) => match[1]!.match(/--[a-z][a-z-]*/g) ?? [])
    .sort();
}

test("generated completion scripts are up to date", () => {
  const result = run(["scripts/generate_completions.ts", "--check"]);
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});

test("bash completes exactly the long flags each command accepts", () => {
  const commands = bashComplete(["bpl", ""]).filter(
    (word) => /^[a-z][a-z-]*$/.test(word) && word !== "help",
  );
  expect(commands).toContain("run");
  expect(commands).toContain("bindgen");
  for (const command of commands) {
    const completed = bashComplete(["bpl", command, "--"])
      .filter((flag) => flag.startsWith("--"))
      .sort();
    expect({ command, flags: completed }).toEqual({
      command,
      flags: helpFlags([command]),
    });
  }
});

test("bash completes package-cache subcommands and their flags", () => {
  expect(bashComplete(["bpl", "package-cache", ""]).sort()).toEqual([
    "clean",
    "list",
    "repair",
    "verify",
  ]);
  expect(bashComplete(["bpl", "package-cache", "verify", "--"]).sort()).toEqual(
    helpFlags(["package-cache", "verify"]),
  );
});

test("zsh offers repeatable options again after they are used", () => {
  const zsh = require("fs").readFileSync(
    resolve(root, "completions/_bpl"),
    "utf8",
  );
  for (const spec of [
    "'*'{-l,--lib}",
    "'*'{-L,--lib-path}",
    "'*--object[",
    "'*--clang-flag[",
  ]) {
    expect(zsh).toContain(spec);
  }
});
