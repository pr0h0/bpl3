import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const cli = resolve("index.ts");

for (const declaredField of ["main", "entry"] as const) {
  test(`pack verifies ${declaredField} and returns parseable JSON for compiler errors`, () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-pack-entry-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "bpl.json"),
        JSON.stringify({
          name: "entry-test",
          version: "0.1.0",
          [declaredField]: "src/api.bpl",
        }),
      );
      writeFileSync(
        join(dir, "src/api.bpl"),
        'frame value()ret int{return "wrong";} export value;',
      );
      const result = spawnSync("bun", [cli, "pack", "--json"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 20000,
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.check).toBe("package-pack");
      expect(report.success).toBe(false);
      expect(report.error).toContain("Return type mismatch");
      expect(report.errorCode).toBe("BPL_RETURN_TYPE_MISMATCH");
      expect(result.stderr).toBe("");
      expect(existsSync(join(dir, "entry-test-0.1.0.tgz"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("pack accepts a valid entry alias and preserves main precedence", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-pack-entry-success-"));
  try {
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src/api.bpl"),
      "frame value()ret int{return 7;} export value;",
    );
    writeFileSync(
      join(dir, "index.bpl"),
      'frame invalid()ret int{return "wrong";} export invalid;',
    );
    const manifest = {
      name: "entry-test",
      version: "0.1.0",
      entry: "src/api.bpl",
    };
    writeFileSync(join(dir, "bpl.json"), JSON.stringify(manifest));
    const pack = () =>
      spawnSync("bun", [cli, "pack", "--json"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 20000,
      });
    const viaEntry = pack();
    expect(viaEntry.status).toBe(0);
    expect(JSON.parse(viaEntry.stdout).success).toBe(true);
    const archive = join(dir, "entry-test-0.1.0.tgz");
    const previousArchive = readFileSync(archive);
    writeFileSync(
      join(dir, "bpl.json"),
      JSON.stringify({ ...manifest, main: "index.bpl" }),
    );
    const viaMain = pack();
    expect(viaMain.status).toBe(1);
    expect(JSON.parse(viaMain.stdout).errorCode).toBe(
      "BPL_RETURN_TYPE_MISMATCH",
    );
    expect(readFileSync(archive)).toEqual(previousArchive);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
