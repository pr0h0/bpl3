import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Private declarations with the same name in different modules must stay
// distinct after modules are merged for code generation.

const root = mkdtempSync(join(tmpdir(), "bpl-module-isolation-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function project(name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  for (const [file, source] of Object.entries(files)) {
    const path = join(dir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return join(dir, "main.bpl");
}

function run(entry: string, extra: string[] = []) {
  const binary = entry.replace(/\.bpl$/, `-${extra.join("") || "plain"}`);
  const build = spawnSync(
    "bun",
    [resolve("index.ts"), "build", entry, "-o", binary, ...extra],
    { encoding: "utf8", timeout: 60000 },
  );
  expect(build.stderr).toBe("");
  expect(build.status).toBe(0);
  const result = spawnSync(binary, [], { encoding: "utf8", timeout: 5000 });
  expect(result.status).toBe(0);
  return result.stdout;
}

function check(entry: string) {
  return spawnSync("bun", [resolve("index.ts"), "check", entry, "--json"], {
    encoding: "utf8",
    timeout: 60000,
  });
}

const LIB = `import [printf] from "std/c.bpl";
export [pub1];
struct H { x: int, }
frame helper(h: H) ret int { return h.x + 1; }
frame pub1() ret int { local h: H; h.x = 41; return helper(h); }
frame pub2() ret int { return 7; }
`;

const cases: {
  name: string;
  files: Record<string, string>;
  stdout: string;
}[] = [
  {
    name: "importer struct and function named like private helpers",
    files: {
      "lib.bpl": LIB,
      "main.bpl": `import [printf] from "std/c.bpl";
import [pub1] from "./lib.bpl";
struct H { a: double, b: double, c: long, }
frame helper(h: H) ret int { return cast<int>(h.c); }
frame pub2() ret int { return 100; }
frame main() ret int { local h: H; h.c = 99; printf("%d %d %d\\n", pub1(), helper(h), pub2()); return 0; }
`,
    },
    stdout: "42 99 100\n",
  },
  {
    name: "two imported modules with same private struct and function",
    files: {
      "m1.bpl": `export [g1];
struct Hid { x: int, }
frame helper() ret long { return 1; }
frame g1() ret long { local h: Hid; h.x = 1; return cast<long>(h.x) + helper(); }
`,
      "m2.bpl": `export [g2];
struct Hid { x: long, }
frame helper() ret long { return 2; }
frame g2() ret long { local h: Hid; h.x = 5000000000; return h.x + helper(); }
`,
      "main.bpl": `import [printf] from "std/c.bpl";
import [g1] from "./m1.bpl";
import [g2] from "./m2.bpl";
frame main() ret int { printf("%ld %ld\\n", g1(), g2()); return 0; }
`,
    },
    stdout: "2 5000000002\n",
  },
  {
    name: "exported struct method uses a private type the importer also defines",
    files: {
      "lib.bpl": `export [Pub];
struct Inner { n: int, }
frame mk(n: int) ret Inner { local i: Inner; i.n = n; return i; }
struct Pub { inner: Inner, frame val(this: *Pub) ret int { this.inner = mk(9); return this.inner.n; } }
`,
      "main.bpl": `import [printf] from "std/c.bpl";
import [Pub] from "./lib.bpl";
struct Inner { q: long, r: long, }
frame main() ret int { local p: Pub; local i: Inner; i.r = 3; printf("%d %ld\\n", p.val(), i.r); return 0; }
`,
    },
    stdout: "9 3\n",
  },
  {
    name: "transitive private function named like an importer function",
    files: {
      "c.bpl": "export [deep];\nframe deep() ret int { return 3; }\n",
      "b.bpl": `import [deep] from "./c.bpl";
export [mid];
frame mid() ret int { return deep() + 1; }
`,
      "main.bpl": `import [printf] from "std/c.bpl";
import [mid] from "./b.bpl";
frame deep() ret int { return 50; }
frame main() ret int { printf("%d %d\\n", mid(), deep()); return 0; }
`,
    },
    stdout: "4 50\n",
  },
  {
    name: "renamed struct keeps its source name in reflection",
    files: {
      "lib.bpl": `import [TypeInfo] from "std/reflection.bpl";
export [describe];
struct Shape { sides: int, }
frame describe() ret string { local info: *TypeInfo = typeof<Shape>(); return info.name; }
`,
      "main.bpl": `import [printf] from "std/c.bpl";
import [describe] from "./lib.bpl";
struct Shape { radius: double, }
frame main() ret int { printf("%s\\n", describe()); return 0; }
`,
    },
    stdout: "Shape\n",
  },
];

for (const testCase of cases) {
  test(`module isolation: ${testCase.name}`, () => {
    const entry = project(testCase.name.replace(/\W+/g, "-"), testCase.files);
    const checked = check(entry);
    expect(checked.stdout + checked.stderr).not.toContain("Duplicate symbol");
    expect(checked.status).toBe(0);
    expect(run(entry)).toBe(testCase.stdout);
    expect(run(entry, ["--cache"])).toBe(testCase.stdout);
  }, 120000);
}
