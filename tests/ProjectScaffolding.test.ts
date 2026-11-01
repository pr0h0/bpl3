import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { mergeRepeatableOptions } from "../cli/commands/compileOptions";

// BUG-444: project scaffolding gaps.
const CLI = resolve("index.ts");

function bpl(args: string[], cwd: string, home: string) {
  const result = Bun.spawnSync([process.execPath, CLI, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: "1", HOME: home, TMPDIR: home },
  });
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function withRoot(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bpl-scaffolding-"));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("init creates a runnable entry and a newline-terminated bpl.json", () => {
  withRoot((root) => {
    const app = join(root, "demo");
    mkdirSync(app);
    expect(bpl(["init"], app, root).status).toBe(0);
    expect(readFileSync(join(app, "bpl.json"), "utf8").endsWith("}\n")).toBe(
      true,
    );
    expect(existsSync(join(app, "index.bpl"))).toBe(true);
    const run = bpl(["run"], app, root);
    expect(run.stdout).toBe("Hello from demo\n");
    expect(bpl(["pack"], app, root).status).toBe(0);
  });
});

test("installing an archive records it so lock and --locked keep it", () => {
  withRoot((root) => {
    const lib = join(root, "mathx");
    const app = join(root, "app");
    mkdirSync(lib);
    mkdirSync(app);
    expect(bpl(["init"], lib, root).status).toBe(0);
    expect(bpl(["pack"], lib, root).status).toBe(0);
    expect(bpl(["init"], app, root).status).toBe(0);
    expect(bpl(["install", "../mathx/mathx-1.0.0.tgz"], app, root).status).toBe(
      0,
    );
    const manifest = JSON.parse(readFileSync(join(app, "bpl.json"), "utf8"));
    expect(manifest.dependencies).toEqual({
      mathx: "file:../mathx/mathx-1.0.0.tgz",
    });
    expect(bpl(["lock"], app, root).status).toBe(0);
    const lock = JSON.parse(readFileSync(join(app, "bpl.lock"), "utf8"));
    expect(Object.keys(lock.packages)).toEqual(["mathx"]);
    expect(bpl(["install", "--locked"], app, root).status).toBe(0);
  });
});

test("new projects ignore pack artifacts", () => {
  withRoot((root) => {
    expect(
      bpl(["new", "lib-demo", "--template", "library", "--no-git"], root, root)
        .status,
    ).toBe(0);
    const ignore = readFileSync(join(root, "lib-demo", ".gitignore"), "utf8");
    expect(ignore).toContain("*.tgz");
    expect(ignore).toContain("*.bplmeta.json");
  });
});

test("new projects of both templates come with tests that bpl test passes", () => {
  withRoot((root) => {
    for (const [template, testFile] of [
      ["app", "lib/math_test.bpl"],
      ["library", "src/index_test.bpl"],
    ] as const) {
      const name = `${template}-tested`;
      expect(
        bpl(["new", name, "--template", template, "--no-git"], root, root)
          .status,
      ).toBe(0);
      expect(existsSync(join(root, name, testFile))).toBe(true);
      const run = bpl(["test"], join(root, name), root);
      expect({ template, status: run.status, stdout: run.stdout }).toEqual({
        template,
        status: 0,
        stdout: expect.stringContaining("1 passed, 0 failed"),
      });
    }
  });
}, 120000);

test("init rejects an entry path that is not a regular file", () => {
  withRoot((root) => {
    const app = join(root, "dirapp");
    mkdirSync(join(app, "index.bpl"), { recursive: true });
    const result = bpl(["init", "--json"], app, root);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).errorCode).toBe(
      "BPL_PACKAGE_INIT_ENTRY_INVALID",
    );
    expect(existsSync(join(app, "bpl.json"))).toBe(false);
  });
});

test("linker options are repeatable and do not swallow the source file", () => {
  withRoot((root) => {
    const file = join(root, "m.bpl");
    require("fs").writeFileSync(
      file,
      'import printf from "std/c.bpl";\nextern cbrt(x: double) ret double;\nframe main() ret int { printf("%.1f\\n", cbrt(27.0)); return 0; }\n',
    );
    for (const args of [
      ["run", "--lib", "m", "m.bpl"],
      ["run", "-l", "m", "-l", "c", "m.bpl"],
      ["--lib", "m", "run", "m.bpl"],
    ]) {
      expect(bpl(args, root, root).stdout).toBe("3.0\n");
    }
  });
});

test("repeatable options before and after the subcommand are combined", () => {
  expect(
    mergeRepeatableOptions(
      { lib: ["a"], clangFlag: "-O1" },
      { lib: ["b"], object: ["x.o"] },
    ),
  ).toEqual({ lib: ["a", "b"], object: ["x.o"], clangFlag: ["-O1"] });
});
