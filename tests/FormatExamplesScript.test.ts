import { expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { scripts } from "../package.json";

test("format:examples formats nested BPL/X examples while preserving siblings and excluded sources", () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-format-examples-"));
  const source = "frame main()ret int{return 0;}";
  const included = ["examples/main.bpl", "examples/nested/deeper/module.x"];
  const excluded = [
    "lib/main.bpl",
    "packages/main.bpl",
    "tmp/main.bpl",
    "examples/skipped.bpl",
    "examples/node_modules/ignored.bpl",
    "examples/bpl_modules/ignored.x",
    "examples/.hidden/ignored.bpl",
  ];
  try {
    // Execute the actual package script and CLI from an isolated fixture tree.
    writeFileSync(
      join(directory, "package.json"),
      JSON.stringify({
        scripts: { "format:examples": scripts["format:examples"] },
      }),
    );
    writeFileSync(
      join(directory, "index.ts"),
      `import ${JSON.stringify(resolve("index.ts"))};`,
    );
    for (const file of [...included, ...excluded]) {
      mkdirSync(join(directory, file, ".."), { recursive: true });
      writeFileSync(join(directory, file), source);
    }
    writeFileSync(join(directory, "examples/.bplignore"), "skipped.bpl\n");
    const result = Bun.spawnSync([process.execPath, "run", "format:examples"], {
      cwd: directory,
      env: { ...process.env, NO_COLOR: "1" },
      timeout: 15000,
    });
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    for (const file of included) {
      const formatted = readFileSync(join(directory, file), "utf8");
      expect(formatted).not.toBe(source);
      expect(formatted).toContain("frame main() ret int");
    }
    for (const file of excluded) {
      expect(readFileSync(join(directory, file), "utf8")).toBe(source);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
