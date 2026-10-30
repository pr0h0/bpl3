import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

// BUG-440: `bpl docs` ignored `#` comments, dropped error locations and
// nested method headings at the wrong level.
function withSource(source: string, run: (file: string, out: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "bpl-docs-"));
  try {
    const file = join(dir, "api.bpl");
    writeFileSync(file, source);
    run(file, join(dir, "api.md"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function docs(args: string[]) {
  const result = Bun.spawnSync(
    [process.execPath, resolve("index.ts"), "docs", ...args],
    {
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  return {
    status: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

test("line comments document declarations; trailing comments do not", () => {
  withSource(
    `# Adds two numbers.
# Returns their sum.
frame add(a: int, b: int) ret int { return a + b; }
struct P {
    x: int, # not documentation
    # The y value.
    y: int,
    # Scales the point.
    frame scale(this: *P, k: int) ret int { return this.x * k; }
}
`,
    (file, out) => {
      expect(docs([file, "-o", out]).status).toBe(0);
      const markdown = readFileSync(out, "utf8");
      expect(markdown).toContain("Adds two numbers.\nReturns their sum.");
      expect(markdown).toContain("- **y**: The y value.");
      expect(markdown).not.toContain("not documentation");
      expect(markdown).toContain("#### Methods\n##### `P.scale`");
      expect(markdown).toContain("Scales the point.");
    },
  );
});

test("a block comment followed by code on its line documents nothing", () => {
  withSource(
    `struct Q {
    /# not for y #/ x: int,
    y: int,
    /# The z value. #/
    z: int,
}
`,
    (file, out) => {
      expect(docs([file, "-o", out]).status).toBe(0);
      const markdown = readFileSync(out, "utf8");
      expect(markdown).not.toContain("not for y");
      expect(markdown).toContain("The z value.");
    },
  );
});

test("parse errors report their location", () => {
  withSource("frame main( {\n", (file, out) => {
    const human = docs([file, "-o", out]);
    expect(human.status).toBe(1);
    expect(human.stderr).toContain("error[api.bpl:1:1]");
    const json = JSON.parse(docs(["--json", file, "-o", out]).stdout);
    expect(json.error).toContain("api.bpl:1:1:");
  });
});
