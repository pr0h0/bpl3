import { expect, test } from "bun:test";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { resolve, join } from "path";
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

test("bash completes docs paths and format/lint directories without dropping spaces", () => {
 const dir=mkdtempSync(join(tmpdir(),'bpl-completion-paths-'));
 try {
  mkdirSync(join(dir,'src folder'));writeFileSync(join(dir,'sample.bpl'),'');writeFileSync(join(dir,'sample.x'),'');writeFileSync(join(dir,'sample.txt'),'');
  const complete=(command:string,prefix:string)=>spawnSync('bash',['-c','source "$TASK_SCRIPT"; COMP_WORDS=(bpl "$TASK_COMMAND" "$TASK_PREFIX"); COMP_CWORD=2; _bpl_completion; printf "%s\\n" "${COMPREPLY[@]}"'],{cwd:dir,encoding:'utf8',env:{...process.env,TASK_SCRIPT:resolve(root,'completions/bpl-completion.bash'),TASK_COMMAND:command,TASK_PREFIX:prefix}});
  for(const command of ['format','lint']){
   expect(complete(command,'src').stdout.trim()).toBe('src folder');
   const paths=complete(command,'sample').stdout.split('\n');expect(paths).toContain('sample.bpl');expect(paths).toContain('sample.x');expect(paths).not.toContain('sample.txt');
  }
  expect(complete('docs','sample.b').stdout.trim()).toBe('sample.bpl');
  expect(complete('docs','--pub').stdout.trim()).toBe('--public-only');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
