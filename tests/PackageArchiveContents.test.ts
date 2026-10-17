import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
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

test("archives retain standard root documentation and legal files through installation", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-package-metadata-"));
  try {
    const pkg = join(root, "source"),
      app = join(root, "app");
    mkdirSync(pkg);
    mkdirSync(app);
    writeFileSync(
      join(pkg, "bpl.json"),
      JSON.stringify({
        name: "metadata-package",
        version: "0.1.0",
        main: "index.bpl",
      }),
    );
    writeFileSync(join(pkg, "index.bpl"), source);
    const metadata: Record<string, string> = {
      "ReadMe.md": "# Package documentation\n",
      LICENSE: "License text\n",
      "LICENCE.txt": "License notice\n",
      NOTICE: "Notices\n",
      "COPYING.rst": "Copyright\n",
    };
    for (const [name, contents] of Object.entries(metadata))
      writeFileSync(join(pkg, name), contents);
    for (const name of [".env", "notes.txt", "README.env"])
      writeFileSync(join(pkg, name), "private data");
    const options = {
      globalPackageDir: join(root, "cache"),
      globalBinDir: join(root, "bin"),
    };
    const archive = new PackageManager(pkg, options).pack(pkg);
    const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    const members = listing.stdout.split("\n");
    new PackageManager(app, options).install(archive);
    for (const [name, contents] of Object.entries(metadata)) {
      expect(members).toContain(`package/${name}`);
      expect(
        readFileSync(join(app, "bpl_modules/metadata-package", name), "utf8"),
      ).toBe(contents);
    }
    for (const name of [".env", "notes.txt", "README.env"])
      expect(members).not.toContain(`package/${name}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("automatic metadata discovery skips links and directories", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-package-metadata-links-"));
  try {
    const pkg = join(root, "source");
    mkdirSync(pkg);
    writeFileSync(
      join(pkg, "bpl.json"),
      JSON.stringify({ name: "metadata-links", version: "0.1.0" }),
    );
    writeFileSync(join(pkg, "index.bpl"), source);
    writeFileSync(join(root, "outside.txt"), "outside data");
    symlinkSync(join(root, "outside.txt"), join(pkg, "README.txt"));
    mkdirSync(join(pkg, "LICENSE.md"));
    writeFileSync(join(pkg, "LICENSE.md/private.txt"), "not metadata");
    const archive = new PackageManager(pkg, { ensureDirectories: false }).pack(
      pkg,
    );
    const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
    expect(listing.status).toBe(0);
    expect(listing.stdout).not.toContain("README.txt");
    expect(listing.stdout).not.toContain("LICENSE.md");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("metadata alone cannot substitute for source files", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-package-metadata-only-"));
  try {
    writeFileSync(
      join(root, "bpl.json"),
      JSON.stringify({ name: "metadata-only", version: "0.1.0" }),
    );
    writeFileSync(join(root, "README.md"), "# No source\n");
    writeFileSync(join(root, "LICENSE"), "License\n");
    expect(() =>
      new PackageManager(root, { ensureDirectories: false }).pack(root),
    ).toThrow("No .bpl files found");
    expect(existsSync(join(root, "metadata-only-0.1.0.tgz"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("listing and provenance hashes cover the selected non-.bpl entry", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-entry-hash-"));
  try {
    const pkg = join(root, "source"),
      app = join(root, "app");
    mkdirSync(pkg);
    mkdirSync(app);
    writeFileSync(
      join(pkg, "bpl.json"),
      JSON.stringify({ name: "entry-hash", version: "0.1.0", entry: "api.x" }),
    );
    writeFileSync(join(pkg, "api.x"), source);
    writeFileSync(join(pkg, "README.md"), "Documentation\n");
    const options = {
      globalPackageDir: join(root, "cache"),
      globalBinDir: join(root, "bin"),
    };
    const packer = new PackageManager(pkg, options);
    const archive = packer.pack(pkg);
    const before = JSON.parse(
      readFileSync(`${archive}.bplmeta.json`, "utf8"),
    ).packageHash;
    const installer = new PackageManager(app, options);
    installer.install(archive);
    const listed = installer.list()[0]!.hash;
    writeFileSync(
      join(app, "bpl_modules/entry-hash/api.x"),
      source.replace("return 7", "return 8"),
    );
    expect(installer.list()[0]!.hash).not.toBe(listed);
    writeFileSync(join(pkg, "api.x"), source.replace("return 7", "return 8"));
    packer.pack(pkg);
    const changed = JSON.parse(
      readFileSync(`${archive}.bplmeta.json`, "utf8"),
    ).packageHash;
    expect(changed).not.toBe(before);
    writeFileSync(join(pkg, "README.md"), "Changed documentation\n");
    packer.pack(pkg);
    expect(
      JSON.parse(readFileSync(`${archive}.bplmeta.json`, "utf8")).packageHash,
    ).toBe(changed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy hash collection does not follow an entry outside its package", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-entry-hash-links-"));
  try {
    const pkg = join(root, "source");
    mkdirSync(pkg);
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "api.x"), source);
    symlinkSync(outside, join(pkg, "linked"), "dir");
    writeFileSync(
      join(pkg, "bpl.json"),
      JSON.stringify({
        name: "entry-hash-links",
        version: "0.1.0",
        entry: "linked/api.x",
      }),
    );
    const packer = new PackageManager(pkg, { ensureDirectories: false });
    const before = packer["calculatePackageHash"](pkg);
    writeFileSync(
      join(outside, "api.x"),
      source.replace("return 7", "return 8"),
    );
    expect(packer["calculatePackageHash"](pkg)).toBe(before);
    symlinkSync(join(outside, "api.x"), join(pkg, "link.x"));
    writeFileSync(
      join(pkg, "bpl.json"),
      JSON.stringify({
        name: "entry-hash-links",
        version: "0.1.0",
        main: "link.x",
      }),
    );
    const linked = packer["calculatePackageHash"](pkg);
    writeFileSync(join(outside, "api.x"), source);
    expect(packer["calculatePackageHash"](pkg)).toBe(linked);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy hashes that omitted an entry fail closed and migrate with explicit update", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-entry-legacy-lock-"));
  try {
    const pkg = join(root, "source"),
      app = join(root, "app");
    mkdirSync(pkg);
    mkdirSync(app);
    const manifest = JSON.stringify({
      name: "legacy-entry",
      version: "0.1.0",
      entry: "api.x",
    });
    writeFileSync(join(pkg, "bpl.json"), manifest);
    writeFileSync(join(pkg, "api.x"), source);
    const options = {
      globalPackageDir: join(root, "cache"),
      globalBinDir: join(root, "bin"),
    };
    const archive = new PackageManager(pkg, options).pack(pkg);
    writeFileSync(
      join(app, "bpl.json"),
      JSON.stringify({
        name: "app",
        version: "0.1.0",
        dependencies: { "legacy-entry": `file:${archive}` },
      }),
    );
    const installer = new PackageManager(app, options);
    installer.install(archive);
    const lockPath = join(app, "bpl.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    // Historical legacy selection included only bpl.json for this package.
    lock.packages["legacy-entry"].hash = createHash("sha256")
      .update("bpl.json\0")
      .update(manifest)
      .update("\0")
      .digest("hex");
    delete lock.packages["legacy-entry"].hashAlgorithm;
    delete lock.packages["legacy-entry"].archiveSha256;
    const original = JSON.stringify(lock);
    writeFileSync(lockPath, original);
    const report = installer.verifyLockFile();
    expect(report.ok).toBe(false);
    expect(report.issues.some((issue) => issue.kind === "hash-mismatch")).toBe(
      true,
    );
    expect(readFileSync(lockPath, "utf8")).toBe(original);
    installer.installProject({ global: false, verbose: false, update: true });
    expect(installer.verifyLockFile().ok).toBe(true);
    expect(
      JSON.parse(readFileSync(lockPath, "utf8")).packages["legacy-entry"]
        .hashAlgorithm,
    ).toBe("sha256-tree-v2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
