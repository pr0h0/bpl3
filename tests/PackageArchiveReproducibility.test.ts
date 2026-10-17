import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { PackageManager } from "../compiler/middleend/PackageManager";

const source = "frame value() ret int { return 7; } export value;";

test("unchanged packages produce identical archives despite time, creation order and umask", async () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-reproducible-archive-"));
  const originalUmask = process.umask();
  try {
    const paths = [
      "index.bpl",
      "README.md",
      `src/${"long-directory-".repeat(9)}/module.bpl`,
      "src/café.bpl",
      "bin/runner",
      ...(process.platform === "win32" ? [] : ["src/line\nbreak.bpl"]),
    ];
    const options = { ensureDirectories: false };
    const archives: Buffer[] = [];
    for (const [index, order] of [paths, [...paths].reverse()].entries()) {
      process.umask(index === 0 ? 0o077 : 0o022);
      const pkg = join(root, `source-${index}`);
      mkdirSync(pkg);
      writeFileSync(
        join(pkg, "bpl.json"),
        JSON.stringify({
          name: "repeatable",
          version: "0.1.0",
          main: "index.bpl",
          bin: { runner: "bin/runner" },
        }),
      );
      for (const name of order) {
        const file = join(pkg, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          name === "README.md" ? "Package documentation\n" : source,
        );
        chmodSync(file, name === "bin/runner" ? 0o755 : 0o644);
        utimesSync(file, 123456789 + index, 123456789 + index);
      }
      const archive = new PackageManager(pkg, options).pack(pkg);
      archives.push(readFileSync(archive));
      // Cross a timestamp boundary even on filesystems with whole-second mtimes.
      if (index === 0) await Bun.sleep(1200);
    }
    expect(archives[1]).toEqual(archives[0]);

    const extracted = join(root, "extracted");
    mkdirSync(extracted);
    const result = spawnSync("tar", [
      "-xzf",
      join(root, "source-1/repeatable-0.1.0.tgz"),
      "-C",
      extracted,
    ]);
    expect(result.status).toBe(0);
    for (const name of ["bpl.json", ...paths]) {
      const file = join(extracted, "package", name);
      expect(readFileSync(file)).toEqual(
        readFileSync(join(root, "source-1", name)),
      );
      expect(statSync(file).mtimeMs).toBe(0);
      expect(statSync(join(root, "source-1", name)).mtimeMs).not.toBe(0);
      if (process.platform !== "win32") {
        expect(statSync(file).mode & 0o777).toBe(
          name === "bin/runner" ? 0o755 : 0o644,
        );
      }
    }
    expect(statSync(join(extracted, "package/src")).mtimeMs).toBe(0);

    const pkg = join(root, "source-1");
    writeFileSync(
      join(pkg, "index.bpl"),
      source.replace("return 7", "return 8"),
    );
    const changed = new PackageManager(pkg, options).pack(pkg);
    expect(readFileSync(changed)).not.toEqual(archives[0]);
  } finally {
    process.umask(originalUmask);
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);

test("ambient tar and gzip options cannot change packed contents or bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-archive-environment-"));
  const oldTarOptions = process.env.TAR_OPTIONS;
  const oldGzip = process.env.GZIP;
  try {
    writeFileSync(
      join(root, "bpl.json"),
      JSON.stringify({ name: "ambient", version: "0.1.0" }),
    );
    writeFileSync(join(root, "index.bpl"), source);
    delete process.env.TAR_OPTIONS;
    delete process.env.GZIP;
    const packer = new PackageManager(root, { ensureDirectories: false });
    const before = readFileSync(packer.pack(root));
    process.env.TAR_OPTIONS = "--exclude=*";
    process.env.GZIP = "-N";
    expect(readFileSync(packer.pack(root))).toEqual(before);
  } finally {
    if (oldTarOptions === undefined) delete process.env.TAR_OPTIONS;
    else process.env.TAR_OPTIONS = oldTarOptions;
    if (oldGzip === undefined) delete process.env.GZIP;
    else process.env.GZIP = oldGzip;
    rmSync(root, { recursive: true, force: true });
  }
});
