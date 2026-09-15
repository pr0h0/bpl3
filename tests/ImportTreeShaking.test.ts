import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Importing one item compiles only what reachable code uses: unused
// functions, unused structs' methods, and unused methods of used structs are
// left out, while methods the compiler calls implicitly are still emitted.

const root = mkdtempSync(join(tmpdir(), "bpl-import-tree-shaking-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function buildIr(files: Record<string, string>) {
  const dir = join(root, String(Object.keys(files).length) + Math.random());
  mkdirSync(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(dir, name), source);
  }
  const irPath = join(dir, "debug.ll");
  const binary = join(dir, "main");
  const build = spawnSync(
    "bun",
    [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", binary],
    {
      encoding: "utf8",
      timeout: 60000,
      env: { ...process.env, BPL_DEBUG_IR: irPath },
    },
  );
  expect(build.stderr).toBe("");
  expect(build.status).toBe(0);
  const run = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 });
  const defined = new Set(
    [
      ...readFileSync(irPath, "utf8").matchAll(/^define [^@]*@([\w.]+)\(/gm),
    ].map((match) => match[1]!),
  );
  return { run, defined };
}

test("imported modules contribute only reachable functions and methods", () => {
  const { run, defined } = buildIr({
    "lib.bpl": `import [printf] from "std/c.bpl";
export [Counter];
export [unusedFree];
struct Counter {
    value: int,
    frame bump(this: *Counter) { this.value = this.value + 1; }
    frame neverCalled(this: *Counter) ret int { return this.value * 2; }
    frame destroy(this: *Counter) {}
}
struct Unused {
    n: int,
    frame get(this: *Unused) ret int { return this.n; }
}
frame unusedFree() ret int { local u: Unused; u.n = 3; return u.get(); }
`,
    "main.bpl": `import [printf] from "std/c.bpl";
import [Counter] from "./lib.bpl";
frame main() ret int {
    local c: Counter;
    c.value = 1;
    c.bump();
    printf("%d\\n", c.value);
    return 0;
}
`,
  });
  expect(run.status).toBe(0);
  expect(run.stdout).toBe("2\n");
  const names = [...defined];
  expect(names.some((name) => name.startsWith("Counter_bump_"))).toBe(true);
  expect(names.some((name) => name.startsWith("Counter_destroy_"))).toBe(true);
  expect(names.some((name) => name.startsWith("Counter_neverCalled_"))).toBe(
    false,
  );
  expect(names.some((name) => name.startsWith("Unused_"))).toBe(false);
  expect(names.some((name) => name.startsWith("unusedFree"))).toBe(false);
}, 60000);

test("std String import keeps implicitly used methods and drops the rest", () => {
  const { run, defined } = buildIr({
    "main.bpl": `import [String] from "std/string.bpl";
import [printf] from "std/c.bpl";
frame main() ret int {
    local s: String = String.new("hi");
    s.assign("there");
    printf("%s %d\\n", s.data, s.length);
    s.destroy();
    return 0;
}
`,
  });
  expect(run.status).toBe(0);
  expect(run.stdout).toBe("there 5\n");
  const names = [...defined];
  expect(names.some((name) => name.startsWith("String_reverse_"))).toBe(false);
  expect(names.some((name) => name.startsWith("String_padLeft_"))).toBe(false);
}, 60000);
