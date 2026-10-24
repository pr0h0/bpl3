import { expect, test } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "fs";
import { tmpdir } from "os";
import { resolve, join } from "path";
import { spawnSync, type SpawnSyncReturns } from "child_process";
import { expandSourceInputs } from "../cli/SourceInputs";
import { DocumentationGenerator } from "../compiler/docs/DocumentationGenerator";
const root = resolve(import.meta.dir, "..");
function fixture(
  work: (
    dir: string,
    run: (args: string[], input?: string) => SpawnSyncReturns<string>,
  ) => void,
) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-qol-test-"));
  try {
    work(dir, (args, input) =>
      spawnSync(process.execPath, [join(root, "index.ts"), ...args], {
        cwd: dir,
        input,
        encoding: "utf8",
        timeout: 30000,
        env: { ...process.env, BPL_HOME: root },
      }),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("directory discovery skips dependencies, hidden paths, symlinks and ignore globs", () =>
  fixture((dir) => {
    for (const d of ["src", "vendor", "node_modules", ".cache", "generated"])
      mkdirSync(join(dir, d));
    for (const f of [
      "main.bpl",
      "src/child.x",
      "vendor/no.bpl",
      "node_modules/no.bpl",
      ".cache/no.bpl",
      "generated/no.bpl",
    ])
      writeFileSync(join(dir, f), "frame main(){}");
    writeFileSync(join(dir, ".bplignore"), "generated/\n");
    symlinkSync(join(dir, "src"), join(dir, "linked"));
    expect(
      expandSourceInputs([dir]).map((f) => f.slice(dir.length + 1)),
    ).toEqual(["main.bpl", "src/child.x"]);
    expect(expandSourceInputs([dir, join(dir, "main.bpl")])).toHaveLength(2);
  }));
test("stdin formatting respects virtual project config, and rejects writes without touching files", () =>
  fixture((dir, run) => {
    writeFileSync(join(dir, ".bplfmt.json"), '{"indentWidth":2}');
    const result = run(
      ["format", "-", "--stdin-filepath", "src/virtual.bpl"],
      "frame main(){return;}",
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("  return;");
    const reject = run(["format", "-", "--write"], "frame main(){}");
    expect(reject.status).toBe(1);
    expect(reject.stderr).toContain("stdin");
    expect(
      run(["format", "-", "--check", "--json"], "frame main(){}").status,
    ).toBe(1);
  }));
test("lint hooks are accepted, warning exit policy is explicit and errors still fail", () =>
  fixture((_dir, run) => {
    const hooks =
      "struct Value {frame __add__(this:Value, other:Value) ret Value{return this;} } frame main(){}";
    expect(run(["lint", "-", "--json"], hooks).status).toBe(0);
    const warn = "frame Bad_Name(){}";
    expect(run(["lint", "-"], warn).status).toBe(1);
    const result = run(["lint", "-", "--no-fail-on-warnings", "--json"], warn);
    expect(result.status).toBe(0);
    expect(
      JSON.parse(result.stdout as string).files[0].diagnostics[0].severity,
    ).toBe("warning");
    expect(run(["lint", "-", "--no-fail-on-warnings"], "frame {").status).toBe(
      1,
    );
  }));
test("docs preserve existing output unless forced and use portable public-only paths", () =>
  fixture((dir, run) => {
    writeFileSync(
      join(dir, "main.bpl"),
      "export visible; frame visible(){} frame hidden(){}",
    );
    writeFileSync(join(dir, "docs.md"), "my prose");
    const blocked = run(["docs", "main.bpl", "--json"]);
    expect(blocked.status).toBe(1);
    expect(readFileSync(join(dir, "docs.md"), "utf8")).toBe("my prose");
    const result = run([
      "docs",
      "main.bpl",
      "--force",
      "--public-only",
      "--json",
    ]);
    expect(result.status).toBe(0);
    const output = readFileSync(join(dir, "docs.md"), "utf8");
    expect(output).toContain("visible");
    expect(output).not.toContain("hidden");
    expect(output).not.toContain(dir);
    expect(
      new DocumentationGenerator().generate(join(dir, "main.bpl")),
    ).toContain("hidden");
  }));
test("project builds use only the cwd manifest, with main before entry", () =>
  fixture((dir, run) => {
    writeFileSync(
      join(dir, "bpl.json"),
      '{"main":"src/app.bpl","entry":"missing.bpl"}',
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/app.bpl"), "frame main(){}");
    expect(run(["build", "--project", "--emit", "tokens"]).status).toBe(0);
    expect(
      run(["build", "src/app.bpl", "--project", "--emit", "tokens"]).status,
    ).toBe(1);
    writeFileSync(join(dir, "bpl.json"), '{"main":"../escape.bpl"}');
    expect(run(["build", "--project", "--emit", "tokens"]).status).toBe(1);
  }));

test("project run rejects a file before the delimiter but forwards program operands after it", () =>
  fixture((dir, run) => {
    writeFileSync(join(dir, "bpl.json"), '{"main":"main.bpl"}');
    writeFileSync(
      join(dir, "main.bpl"),
      'extern printf(fmt:string,...); frame main(argc:int, argv:**char) ret int { if(argc < 2){return 1;} printf("%s",argv[1]); return 0; }',
    );
    const conflict = run(["run", "main.bpl", "--project", "--", "foo"]);
    expect(conflict.status).toBe(1);
    expect(conflict.stderr).toContain("either an explicit file or --project");
    const valid = run(["run", "--project", "--", "foo"]);
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("foo");
    const matchingOptionValue = run([
      "run",
      "--project",
      "--debug-ir-path",
      "foo",
      "--",
      "foo",
    ]);
    expect(matchingOptionValue.status).toBe(0);
    expect(matchingOptionValue.stdout).toContain("foo");
  }));
