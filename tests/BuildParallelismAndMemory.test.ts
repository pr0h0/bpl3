import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { splitLlvmModule } from "../cli/IrSplitter";

const CLI = resolve(import.meta.dir, "../index.ts");

// A program with many functions, globals, strings, a vtable, a function
// pointer compared across functions, and small helpers called everywhere.
function program(count: number): string {
  const lines = [
    "extern printf(fmt: string, ...);",
    "global total: long = 0;",
    "struct Acc { n: long, frame add(this: *Acc, v: long) { this.n = this.n + v; } }",
    'struct Base { frame name(this: *Base) ret string { return "base"; } }',
    'struct Kid : Base { frame name(this: *Kid) ret string { return "kid"; } }',
    "frame tiny(x: long) ret long { return x * 3 + 1; }",
  ];
  for (let i = 0; i < count; i++) {
    lines.push(
      `frame f${i}(x: long) ret long { local a: Acc = Acc { n: x }; a.add(tiny(x + ${i})); total = total + a.n; if (x > 1000) { printf("big %d\\n", ${i}); } return a.n % 1000; }`,
    );
  }
  const calls = Array.from(
    { length: count },
    (_, i) => `s = s + f${i}(s);`,
  ).join(" ");
  lines.push(
    `frame main() ret int { local s: long = 1; ${calls} local fp: Func<long>(long) = tiny; local same: bool = fp == tiny; local k: Kid = Kid {}; local b: *Base = cast<*Base>(&k); printf("%lld %lld %d %s\\n", s, total, cast<int>(same), b.name()); return 0; }`,
  );
  return lines.join("\n") + "\n";
}

function build(dir: string, source: string, env: Record<string, string>) {
  const file = join(dir, "main.bpl");
  writeFileSync(file, source);
  const exe = join(dir, `main-${Object.values(env).join("-")}`);
  const result = spawnSync(
    process.execPath,
    [CLI, "build", file, "-O", "2", "-o", exe],
    {
      encoding: "utf8",
      timeout: 120000,
      env: { ...process.env, ...env },
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  return spawnSync(exe, [], { encoding: "utf8", timeout: 30000 });
}

test("a module compiled as parallel parts behaves like the whole module", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-split-"));
  try {
    const source = program(40);
    const whole = build(dir, source, { BPL_SPLIT_IR: "0" });
    const split = build(dir, source, { BPL_SPLIT_IR: "force" });
    expect(whole.status).toBe(0);
    expect(split.stdout).toBe(whole.stdout);
    expect(split.stdout).toContain(" 1 kid\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 240000);

test("the splitter declines modules it does not model", () => {
  expect(
    splitLlvmModule("define void @f() {\nentry:\n  ret void\n}\n", 2),
  ).toBeUndefined();
  const withMetadata =
    Array.from(
      { length: 20 },
      (_, i) => `define void @f${i}() {\nentry:\n  ret void\n}`,
    ).join("\n\n") + "\n!0 = !{}\n";
  expect(splitLlvmModule(withMetadata, 2)).toBeUndefined();
});

test("a build compiled in a worker reports diagnostics and exit status", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-worker-"));
  try {
    const env = { ...process.env, BPL_COMPILE_IN_WORKER: "1" };
    writeFileSync(
      join(dir, "ok.bpl"),
      'extern printf(fmt: string, ...);\nframe main() ret int { printf("ok\\n"); return 3; }\n',
    );
    writeFileSync(
      join(dir, "bad.bpl"),
      'frame main() ret int { local x: int = "s"; return x; }\n',
    );
    const run = spawnSync(process.execPath, [CLI, "run", join(dir, "ok.bpl")], {
      encoding: "utf8",
      env,
      timeout: 60000,
    });
    expect(run.stdout).toBe("ok\n");
    expect(run.status).toBe(3);
    const bad = spawnSync(
      process.execPath,
      [CLI, "build", join(dir, "bad.bpl"), "-o", join(dir, "bad")],
      { encoding: "utf8", env, timeout: 60000 },
    );
    expect(bad.status).toBe(1);
    expect(bad.stdout + bad.stderr).toContain("Type mismatch");
    const json = spawnSync(
      process.execPath,
      [CLI, "build", join(dir, "ok.bpl"), "-o", join(dir, "okbin"), "--json"],
      { encoding: "utf8", env, timeout: 60000 },
    );
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).success).toBe(true);
    expect(readFileSync(join(dir, "okbin")).length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180000);
