import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { PackageManager } from "../compiler/middleend/PackageManager";

const cli = resolve(__dirname, "../index.ts");
const source = "frame value() ret int { return 7; } export value;";

for (const [field, entry] of [
  ["main", "src/api.x"],
  ["entry", "src\\api.x"],
  ["entry", "api"],
] as const) {
  test(`packed ${field}=${entry} survives installation and package imports`, () => {
    const root = mkdtempSync(join(tmpdir(), "bpl-archive-entry-"));
    try {
      const pkg = join(root, "source");
      const app = join(root, "app");
      mkdirSync(pkg);
      mkdirSync(app);
      const actualEntry = join(pkg, ...entry.split(/[\\/]/));
      mkdirSync(dirname(actualEntry), { recursive: true });
      writeFileSync(actualEntry, source);
      writeFileSync(
        join(pkg, "bpl.json"),
        JSON.stringify({
          name: "archive-entry",
          version: "0.1.0",
          [field]: entry,
        }),
      );
      const options = {
        globalPackageDir: join(root, "cache"),
        globalBinDir: join(root, "bin"),
      };
      const archive = new PackageManager(pkg, options).pack(pkg);
      const members = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
      expect(members.status).toBe(0);
      expect(members.stdout.split("\n")).toContain(
        `package/${entry.replaceAll("\\", "/")}`,
      );
      new PackageManager(app, options).install(archive);
      expect(
        readFileSync(
          join(app, "bpl_modules/archive-entry", ...entry.split(/[\\/]/)),
          "utf8",
        ),
      ).toBe(source);
      writeFileSync(
        join(app, "main.bpl"),
        'import [value] from "archive-entry";frame main()ret int{return value()-7;}',
      );
      const check = spawnSync(
        "bun",
        [cli, "check", join(app, "main.bpl"), "--json"],
        { encoding: "utf8", timeout: 20000 },
      );
      expect(check.status).toBe(0);
      expect(JSON.parse(check.stdout).success).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60000);
}

test("explicit entry validation preserves an existing archive on failure", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-entry-preserve-"));
  try {
    const manifest = {
      name: "entry-preserve",
      version: "0.1.0",
      main: "index.bpl",
    };
    writeFileSync(join(root, "bpl.json"), JSON.stringify(manifest));
    writeFileSync(join(root, "index.bpl"), source);
    const packer = new PackageManager(root, { ensureDirectories: false });
    const archive = packer.pack(root);
    const before = readFileSync(archive);
    for (const target of ["missing.x", "directory", "link.x"]) {
      if (target === "directory") mkdirSync(join(root, target));
      if (target === "link.x")
        symlinkSync(join(root, "index.bpl"), join(root, target));
      writeFileSync(
        join(root, "bpl.json"),
        JSON.stringify({ ...manifest, main: target }),
      );
      expect(() => packer.pack(root)).toThrow(/package entry point/);
      expect(readFileSync(archive)).toEqual(before);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ignored entry alias does not override a valid main source", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-entry-precedence-"));
  try {
    writeFileSync(
      join(root, "bpl.json"),
      JSON.stringify({
        name: "entry-main",
        version: "0.1.0",
        main: "api.x",
        entry: "missing.x",
      }),
    );
    writeFileSync(join(root, "api.x"), source);
    const archive = new PackageManager(root, { ensureDirectories: false }).pack(
      root,
    );
    expect(existsSync(archive)).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
