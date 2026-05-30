import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { ModuleResolver } from "../compiler/middleend/ModuleResolver";
import { PackageManager } from "../compiler/middleend/PackageManager";

describe("PackageManager", () => {
  let tempDir: string;
  let packageManager: PackageManager;
  let originalCwd: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    packageManager = new PackageManager();
  });

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function createCachedPackage(
    packageName: string,
    version: string,
    source: string,
    globalPackageDir: string,
    dependencies: Record<string, string> = {},
  ): string {
    const packageDir = path.join(tempDir, `${packageName}-${version}`);
    fs.mkdirSync(packageDir);
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        {
          name: packageName,
          version,
          main: "index.bpl",
          dependencies,
        },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), source);

    const packer = new PackageManager(packageDir);
    const tarballPath = packer.pack(packageDir);
    const cachePath = path.join(globalPackageDir, path.basename(tarballPath));
    fs.copyFileSync(tarballPath, cachePath);
    return cachePath;
  }

  describe("Package Initialization", () => {
    test("should create a valid bpl.json manifest", () => {
      const manifestPath = path.join(tempDir, "bpl.json");

      const manifest = {
        name: "test-package",
        version: "1.0.0",
        description: "Test package",
        main: "index.bpl",
        license: "MIT",
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      const loaded = packageManager.loadManifest(tempDir);
      expect(loaded.name).toBe("test-package");
      expect(loaded.version).toBe("1.0.0");
      expect(loaded.description).toBe("Test package");
    });

    test("should throw error for missing name field", () => {
      const manifestPath = path.join(tempDir, "bpl.json");

      const manifest = {
        version: "1.0.0",
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /missing 'name'/,
      );
    });

    test("should throw error for missing version field", () => {
      const manifestPath = path.join(tempDir, "bpl.json");

      const manifest = {
        name: "test-package",
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /missing 'version'/,
      );
    });

    test("should validate semantic version format", () => {
      const manifestPath = path.join(tempDir, "bpl.json");

      const manifest = {
        name: "test-package",
        version: "invalid-version",
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /Invalid version format/,
      );
    });
  });

  describe("Package Creation", () => {
    test("should create a package tarball", () => {
      // Create a simple package
      const manifest = {
        name: "test-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "frame test() ret int { return 42; }");

      const tarballPath = packageManager.pack(tempDir);

      expect(fs.existsSync(tarballPath)).toBe(true);
      expect(tarballPath).toContain("test-pkg-1.0.0.tgz");
    });

    test("should include all source files in package", () => {
      const manifest = {
        name: "multi-file-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync("utils.bpl", "frame helper() ret int { return 1; }");
      fs.writeFileSync("README.md", "# Test Package");

      const tarballPath = packageManager.pack(tempDir);

      expect(fs.existsSync(tarballPath)).toBe(true);
    });

    test("should exclude node_modules and bpl_modules from package", () => {
      const manifest = {
        name: "exclude-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "frame test() ret int { return 0; }");

      // Create directories that should be excluded
      fs.mkdirSync("node_modules", { recursive: true });
      fs.mkdirSync("bpl_modules", { recursive: true });
      fs.writeFileSync("node_modules/test.js", "module.exports = {};");
      fs.writeFileSync("bpl_modules/test.bpl", "frame test() {}");

      const tarballPath = packageManager.pack(tempDir);

      expect(fs.existsSync(tarballPath)).toBe(true);
      // If the test passes, the package was created without errors
    });

    test("should reject bin paths that escape the package root", () => {
      const packageDir = path.join(tempDir, "unsafe-bin-package");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "unsafe-bin-package",
            version: "1.0.0",
            bin: {
              unsafe: "../outside-tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(tempDir, "outside-tool.sh"),
        "#!/usr/bin/env sh\necho outside\n",
      );

      expect(() => packageManager.pack(packageDir)).toThrow(
        /Invalid 'bin' path/,
      );
    });
  });

  describe("Package Installation", () => {
    test("should install package locally", () => {
      // Create a package
      const manifest = {
        name: "local-test-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);

      // Create a new directory to install into
      const installDir = path.join(tempDir, "install-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      // Create a new PackageManager instance after changing directory
      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      const installedPath = path.join(
        installDir,
        "bpl_modules",
        "local-test-pkg",
      );
      expect(fs.existsSync(installedPath)).toBe(true);
      expect(fs.existsSync(path.join(installedPath, "bpl.json"))).toBe(true);
      expect(fs.existsSync(path.join(installedPath, "index.bpl"))).toBe(true);
    });

    test("should reject bin command names that escape the bin directory", () => {
      const manifest = {
        name: "unsafe-bin-name",
        version: "1.0.0",
        main: "index.bpl",
        bin: {
          "../escape": "index.bpl",
        },
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /Invalid 'bin' command/,
      );
    });

    test("should reject package archives with unsafe member paths", () => {
      const sourceDir = path.join(tempDir, "unsafe-archive-source");
      const installDir = path.join(tempDir, "unsafe-archive-install");
      const tarballPath = path.join(tempDir, "unsafe-archive.tgz");
      fs.mkdirSync(sourceDir);
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(sourceDir, "bpl.json"),
        JSON.stringify(
          {
            name: "unsafe-archive",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(sourceDir, "index.bpl"), "export test;");
      fs.writeFileSync(path.join(sourceDir, "escaped.txt"), "escaped");

      spawnSync(
        "tar",
        [
          "-czf",
          tarballPath,
          "-C",
          sourceDir,
          "--transform=s|bpl.json|package/bpl.json|",
          "bpl.json",
          "--transform=s|index.bpl|package/index.bpl|",
          "index.bpl",
          "--transform=s|escaped.txt|package/../escaped.txt|",
          "escaped.txt",
        ],
        { stdio: "pipe" },
      );

      expect(fs.existsSync(tarballPath)).toBe(true);

      process.chdir(installDir);
      const localPM = new PackageManager(installDir);

      expect(() =>
        localPM.install(tarballPath, { global: false, verbose: false }),
      ).toThrow(/Unsafe package archive member/);
      expect(
        fs.existsSync(path.join(installDir, "bpl_modules", "unsafe-archive")),
      ).toBe(false);
    });

    test("should reject package archives containing symlinks", () => {
      const sourceDir = path.join(tempDir, "symlink-archive-source");
      const installDir = path.join(tempDir, "symlink-archive-install");
      const tarballPath = path.join(tempDir, "symlink-archive.tgz");
      const externalSourcePath = path.join(tempDir, "external-index.bpl");
      fs.mkdirSync(sourceDir);
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(sourceDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-archive",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(externalSourcePath, "export escaped;");
      fs.symlinkSync(externalSourcePath, path.join(sourceDir, "index.bpl"));

      spawnSync(
        "tar",
        [
          "-czf",
          tarballPath,
          "-C",
          sourceDir,
          "--transform=s|bpl.json|package/bpl.json|",
          "bpl.json",
          "--transform=s|index.bpl|package/index.bpl|",
          "index.bpl",
        ],
        { stdio: "pipe" },
      );

      expect(fs.existsSync(tarballPath)).toBe(true);

      process.chdir(installDir);
      const localPM = new PackageManager(installDir);

      expect(() =>
        localPM.install(tarballPath, { global: false, verbose: false }),
      ).toThrow(/Unsupported package archive entry/);
      expect(
        fs.existsSync(path.join(installDir, "bpl_modules", "symlink-archive")),
      ).toBe(false);
    });

    test("should write a lockfile for local installs", () => {
      const manifest = {
        name: "lock-test-pkg",
        version: "1.2.3",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "lock-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      const lockPath = path.join(installDir, "bpl.lock");
      expect(fs.existsSync(lockPath)).toBe(true);

      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      expect(lock.lockfileVersion).toBe(1);
      expect(lock.packages["lock-test-pkg"]).toMatchObject({
        version: "1.2.3",
        source: tarballPath,
      });
      expect(lock.packages["lock-test-pkg"].hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("should restore local packages from bpl.lock", () => {
      const manifest = {
        name: "restore-test-pkg",
        version: "1.2.3",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export restored;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "restore-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      fs.rmSync(path.join(installDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });

      localPM.installProject({ global: false, verbose: false });

      const restoredPath = path.join(
        installDir,
        "bpl_modules",
        "restore-test-pkg",
        "index.bpl",
      );
      expect(fs.existsSync(restoredPath)).toBe(true);
      expect(fs.readFileSync(restoredPath, "utf8")).toContain(
        "export restored;",
      );
    });

    test("should verify installed packages against bpl.lock", () => {
      const manifest = {
        name: "verify-test-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export original;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "verify-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      expect(localPM.verifyLockFile().ok).toBe(true);

      fs.writeFileSync(
        path.join(installDir, "bpl_modules", "verify-test-pkg", "index.bpl"),
        "export tampered;",
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.errors.join("\n")).toContain("hash mismatch");
    });

    test("should verify installed package manifests against bpl.lock", () => {
      const manifest = {
        name: "manifest-lock-test",
        version: "1.0.0",
        main: "index.bpl",
        description: "original manifest",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export stable;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "manifest-lock-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      const installedManifestPath = path.join(
        installDir,
        "bpl_modules",
        "manifest-lock-test",
        "bpl.json",
      );
      const installedManifest = JSON.parse(
        fs.readFileSync(installedManifestPath, "utf8"),
      );
      installedManifest.description = "tampered manifest";
      fs.writeFileSync(
        installedManifestPath,
        JSON.stringify(installedManifest, null, 2),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.errors.join("\n")).toContain("hash mismatch");
    });

    test("should verify installed package binaries against bpl.lock", () => {
      const manifest = {
        name: "bin-lock-test",
        version: "1.0.0",
        main: "index.bpl",
        bin: {
          "bin-lock-tool": "bin/tool.sh",
        },
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export stable;");
      fs.mkdirSync("bin");
      fs.writeFileSync("bin/tool.sh", "#!/usr/bin/env sh\necho original\n");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "bin-lock-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      fs.writeFileSync(
        path.join(installDir, "bpl_modules", "bin-lock-test", "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tampered\n",
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.errors.join("\n")).toContain("hash mismatch");
    });

    test("should install the highest exact semver match from the global package cache", () => {
      const globalPackageDir = path.join(tempDir, "global-packages");
      const appDir = path.join(tempDir, "semver-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      const createCachedPackage = (
        name: string,
        version: string,
        exportName: string,
      ) => {
        const packageDir = path.join(tempDir, `${name}-${version}`);
        fs.mkdirSync(packageDir);
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify({ name, version, main: "index.bpl" }, null, 2),
        );
        fs.writeFileSync(
          path.join(packageDir, "index.bpl"),
          `export ${exportName};`,
        );

        const packer = new PackageManager(packageDir);
        const tarballPath = packer.pack(packageDir);
        fs.copyFileSync(
          tarballPath,
          path.join(globalPackageDir, path.basename(tarballPath)),
        );
      };

      createCachedPackage("math", "1.2.0", "v120");
      createCachedPackage("math", "1.10.0", "v1100");
      createCachedPackage("math-extra", "9.9.9", "wrongPackage");

      process.chdir(appDir);
      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install("math", { global: false, verbose: false });

      const installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "math", "bpl.json"),
          "utf8",
        ),
      );
      const installedSource = fs.readFileSync(
        path.join(appDir, "bpl_modules", "math", "index.bpl"),
        "utf8",
      );
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );

      expect(installedManifest.name).toBe("math");
      expect(installedManifest.version).toBe("1.10.0");
      expect(installedSource).toContain("export v1100;");
      expect(lock.packages.math.source).toBe("math-1.10.0.tgz");
    });

    test("should install versioned dependency tarballs from the global package cache", () => {
      const globalPackageDir = path.join(tempDir, "dependency-cache");
      const appDir = path.join(tempDir, "dependency-app");
      const packageDir = path.join(tempDir, "dependency-math");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);
      fs.mkdirSync(packageDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          { name: "dependency-math", version: "1.2.3", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

      const packer = new PackageManager(packageDir);
      const tarballPath = packer.pack(packageDir);
      fs.copyFileSync(
        tarballPath,
        path.join(globalPackageDir, path.basename(tarballPath)),
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "dependency-app",
            version: "1.0.0",
            dependencies: {
              "dependency-math": "1.2.3",
            },
          },
          null,
          2,
        ),
      );

      process.chdir(appDir);
      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      const installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "dependency-math", "bpl.json"),
          "utf8",
        ),
      );

      expect(installedManifest.version).toBe("1.2.3");
    });

    test("should restore the locked global package version when newer cache versions exist", () => {
      const globalPackageDir = path.join(tempDir, "locked-global-cache");
      const appDir = path.join(tempDir, "locked-global-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      const createCachedPackage = (version: string, exportName: string) => {
        const packageDir = path.join(tempDir, `locked-math-${version}`);
        fs.mkdirSync(packageDir);
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            { name: "locked-math", version, main: "index.bpl" },
            null,
            2,
          ),
        );
        fs.writeFileSync(
          path.join(packageDir, "index.bpl"),
          `export ${exportName};`,
        );

        const packer = new PackageManager(packageDir);
        const tarballPath = packer.pack(packageDir);
        fs.copyFileSync(
          tarballPath,
          path.join(globalPackageDir, path.basename(tarballPath)),
        );
      };

      createCachedPackage("1.0.0", "v100");

      process.chdir(appDir);
      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install("locked-math", { global: false, verbose: false });

      createCachedPackage("2.0.0", "v200");
      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });

      localPM.installProject({ global: false, verbose: false });

      const installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "locked-math", "bpl.json"),
          "utf8",
        ),
      );
      const installedSource = fs.readFileSync(
        path.join(appDir, "bpl_modules", "locked-math", "index.bpl"),
        "utf8",
      );
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );

      expect(installedManifest.version).toBe("1.0.0");
      expect(installedSource).toContain("export v100;");
      expect(lock.packages["locked-math"].version).toBe("1.0.0");
    });

    test("should install transitive package dependencies and keep lock restores local", () => {
      const globalPackageDir = path.join(tempDir, "graph-cache");
      const appDir = path.join(tempDir, "graph-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      const createCachedPackage = (
        packageName: string,
        version: string,
        source: string,
        dependencies: Record<string, string> = {},
      ) => {
        const packageDir = path.join(tempDir, `${packageName}-${version}`);
        fs.mkdirSync(packageDir);
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: packageName,
              version,
              main: "index.bpl",
              dependencies,
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), source);

        const packer = new PackageManager(packageDir);
        const tarballPath = packer.pack(packageDir);
        fs.copyFileSync(
          tarballPath,
          path.join(globalPackageDir, path.basename(tarballPath)),
        );
      };

      createCachedPackage(
        "graph-b",
        "1.0.0",
        [
          "export value;",
          "frame value() ret int {",
          "    return 10;",
          "}",
          "",
        ].join("\n"),
      );
      createCachedPackage(
        "graph-a",
        "1.0.0",
        [
          'import value from "graph-b";',
          "export callValue;",
          "frame callValue() ret int {",
          "    return value();",
          "}",
          "",
        ].join("\n"),
        { "graph-b": "1.0.0" },
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "graph-app",
            version: "1.0.0",
            dependencies: {
              "graph-a": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      process.chdir(appDir);
      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      const mainPath = path.join(appDir, "src", "main.bpl");
      fs.mkdirSync(path.dirname(mainPath), { recursive: true });
      fs.writeFileSync(
        mainPath,
        [
          'import callValue from "graph-a";',
          "frame main() ret int {",
          "    return callValue();",
          "}",
          "",
        ].join("\n"),
      );

      const stdLibPath = path.join(__dirname, "..", "lib");
      let resolver = new ModuleResolver({ stdLibPath });
      let modules = resolver.resolveModules(mainPath);
      expect(
        modules.some(
          (module) =>
            module.path ===
            path.join(appDir, "bpl_modules", "graph-a", "index.bpl"),
        ),
      ).toBe(true);
      expect(
        modules.some(
          (module) =>
            module.path ===
            path.join(appDir, "bpl_modules", "graph-b", "index.bpl"),
        ),
      ).toBe(true);

      createCachedPackage(
        "graph-b",
        "2.0.0",
        [
          "export wrongValue;",
          "frame wrongValue() ret int {",
          "    return 999;",
          "}",
          "",
        ].join("\n"),
      );
      const globalShadowDir = path.join(globalPackageDir, "graph-b");
      fs.mkdirSync(globalShadowDir, { recursive: true });
      fs.writeFileSync(
        path.join(globalShadowDir, "bpl.json"),
        JSON.stringify(
          { name: "graph-b", version: "2.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(globalShadowDir, "index.bpl"),
        "export wrongValue;",
      );

      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      localPM.installProject({ global: false, verbose: false });

      const installedB = fs.readFileSync(
        path.join(appDir, "bpl_modules", "graph-b", "index.bpl"),
        "utf8",
      );
      const graphBResolution = localPM.resolvePackageWithDiagnostics(
        "graph-b",
        path.dirname(mainPath),
      );

      expect(installedB).toContain("return 10;");
      expect(graphBResolution.result?.source).toBe("local");
      expect(graphBResolution.result?.filePath).toBe(
        path.join(appDir, "bpl_modules", "graph-b", "index.bpl"),
      );

      resolver = new ModuleResolver({ stdLibPath });
      modules = resolver.resolveModules(mainPath);
      expect(
        modules.some(
          (module) =>
            module.path ===
            path.join(appDir, "bpl_modules", "graph-b", "index.bpl"),
        ),
      ).toBe(true);
      expect(
        modules.some((module) => module.path === path.join(globalShadowDir, "index.bpl")),
      ).toBe(false);
    });

    test("should report missing transitive dependencies during locked verification", () => {
      const globalPackageDir = path.join(tempDir, "locked-graph-cache");
      const appDir = path.join(tempDir, "locked-graph-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "locked-graph-b",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      createCachedPackage(
        "locked-graph-a",
        "1.0.0",
        'import value from "locked-graph-b";\nexport value;',
        globalPackageDir,
        { "locked-graph-b": "1.0.0" },
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-graph-app",
            version: "1.0.0",
            dependencies: {
              "locked-graph-a": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      fs.rmSync(path.join(appDir, "bpl_modules", "locked-graph-b"), {
        recursive: true,
        force: true,
      });

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(
        verification.issues.some(
          (issue) => issue.kind === "missing-transitive-dependency",
        ),
      ).toBe(true);
      expect(verification.errors.join("\n")).toContain(
        "locked-graph-a: dependency 'locked-graph-b' is missing",
      );
    });

    test("should build dependency trees with transitive packages and missing nodes", () => {
      const globalPackageDir = path.join(tempDir, "tree-graph-cache");
      const appDir = path.join(tempDir, "tree-graph-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "tree-graph-b",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      createCachedPackage(
        "tree-graph-a",
        "1.0.0",
        'import value from "tree-graph-b";\nexport value;',
        globalPackageDir,
        { "tree-graph-b": "1.0.0" },
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "tree-graph-app",
            version: "1.0.0",
            dependencies: {
              "tree-graph-a": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      let tree = localPM.getDependencyTree({ global: false });
      expect(tree.map((node) => node.name)).toEqual(["tree-graph-a"]);
      expect(tree[0]?.dependencies[0]?.name).toBe("tree-graph-b");
      expect(tree[0]?.dependencies[0]?.installed).toBe(true);

      fs.rmSync(path.join(appDir, "bpl_modules", "tree-graph-b"), {
        recursive: true,
        force: true,
      });

      tree = localPM.getDependencyTree({ global: false });
      expect(tree[0]?.dependencies[0]).toMatchObject({
        name: "tree-graph-b",
        installed: false,
        locked: true,
        version: "1.0.0",
      });
      expect(tree[0]?.dependencies[0]?.problems.join("\n")).toContain(
        "missing from bpl_modules",
      );
    });

    test("should reject cyclic package dependencies with the full chain", () => {
      const globalPackageDir = path.join(tempDir, "cycle-cache");
      const appDir = path.join(tempDir, "cycle-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "cycle-a",
        "1.0.0",
        "export a;",
        globalPackageDir,
        { "cycle-b": "1.0.0" },
      );
      createCachedPackage(
        "cycle-b",
        "1.0.0",
        "export b;",
        globalPackageDir,
        { "cycle-a": "1.0.0" },
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cycle-app",
            version: "1.0.0",
            dependencies: {
              "cycle-a": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.installProject({ global: false, verbose: false }),
      ).toThrow(/cycle-a -> cycle-b -> cycle-a/);
    });

    test("should list installed packages", () => {
      // Create and install a package
      const manifest = {
        name: "list-test-pkg",
        version: "2.0.0",
        description: "Test listing",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "list-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      packageManager.install(tarballPath, { global: false, verbose: false });

      const packages = packageManager.list({ global: false });

      expect(packages.length).toBe(1);
      expect(packages[0]?.manifest.name).toBe("list-test-pkg");
      expect(packages[0]?.manifest.version).toBe("2.0.0");
    });

    test("should return empty list when no packages installed", () => {
      const packages = packageManager.list({ global: false });
      expect(packages.length).toBe(0);
    });
  });

  describe("Package Uninstallation", () => {
    test("should uninstall a locally installed package", () => {
      // Create and install a package
      const manifest = {
        name: "uninstall-test-pkg",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "uninstall-test");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      packageManager.install(tarballPath, { global: false, verbose: false });

      // Verify it's installed
      let packages = packageManager.list({ global: false });
      expect(packages.length).toBe(1);

      // Uninstall it
      packageManager.uninstall("uninstall-test-pkg", { global: false });

      // Verify it's gone
      packages = packageManager.list({ global: false });
      expect(packages.length).toBe(0);
    });

    test("should throw error when uninstalling non-existent package", () => {
      expect(() => {
        packageManager.uninstall("non-existent-pkg", { global: false });
      }).toThrow(/not installed/);
    });

    test("should throw error for invalid package directory", () => {
      // Create a directory without bpl.json
      const fakePackageDir = path.join(tempDir, "bpl_modules", "fake-pkg");
      fs.mkdirSync(fakePackageDir, { recursive: true });
      fs.writeFileSync(path.join(fakePackageDir, "index.bpl"), "// fake");

      expect(() => {
        packageManager.uninstall("fake-pkg", { global: false });
      }).toThrow(/Invalid package directory/);
    });
  });

  describe("Package Resolution", () => {
    test("should resolve local package import", () => {
      // Create and install a package
      const manifest = {
        name: "resolve-test-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);

      const projectDir = path.join(tempDir, "project");
      fs.mkdirSync(projectDir);
      process.chdir(projectDir);

      // Create a new PackageManager instance after changing directory
      const localPM = new PackageManager();
      localPM.install(tarballPath, { global: false, verbose: false });

      const resolved = localPM.resolvePackage("resolve-test-pkg", projectDir);

      expect(resolved).toBeTruthy();
      expect(resolved).toContain("index.bpl");
      expect(fs.existsSync(resolved!)).toBe(true);
    });

    test("should return nullptr for non-existent package", () => {
      const resolved = packageManager.resolvePackage("non-existent", tempDir);
      expect(resolved).toBeNull();
    });

    test("should resolve workspace package import from packages directory", () => {
      const workspaceDir = path.join(tempDir, "workspace");
      const packageDir = path.join(workspaceDir, "packages", "workspace-pkg");
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "workspace-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const resolved = packageManager.resolvePackage(
        "workspace-pkg",
        workspaceDir,
      );

      expect(resolved).toBe(path.join(packageDir, "index.bpl"));
    });

    test("should resolve packages by walking up from nested source directories", () => {
      const appDir = path.join(tempDir, "nested-app");
      const sourceDir = path.join(appDir, "src", "features");
      const packageDir = path.join(appDir, "bpl_modules", "nested-math");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "nested-math",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

      const resolved = packageManager.resolvePackage(
        "nested-math",
        sourceDir,
      );

      expect(resolved).toBe(path.join(packageDir, "index.bpl"));
    });

    test("should prefer the nearest project package over an unrelated cwd package", () => {
      const appDir = path.join(tempDir, "shadow-app");
      const sourceDir = path.join(appDir, "src");
      const cwdDir = path.join(tempDir, "unrelated-cwd");
      const appPackageDir = path.join(appDir, "bpl_modules", "shared-math");
      const cwdPackageDir = path.join(cwdDir, "bpl_modules", "shared-math");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(appPackageDir, { recursive: true });
      fs.mkdirSync(cwdPackageDir, { recursive: true });

      const packages: Array<[string, string]> = [
        [appPackageDir, "appAdd"],
        [cwdPackageDir, "wrongAdd"],
      ];
      for (const [packageDir, marker] of packages) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "shared-math",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(
          path.join(packageDir, "index.bpl"),
          `export ${marker};`,
        );
      }

      process.chdir(cwdDir);
      const resolved = packageManager.resolvePackage("shared-math", sourceDir);

      expect(resolved).toBe(path.join(appPackageDir, "index.bpl"));
      expect(fs.readFileSync(resolved!, "utf8")).toContain("appAdd");
    });

    test("should resolve package subpath directories through index files", () => {
      const appDir = path.join(tempDir, "subpath-app");
      const featureDir = path.join(
        appDir,
        "bpl_modules",
        "subpath-pkg",
        "features",
        "math",
      );
      fs.mkdirSync(featureDir, { recursive: true });

      fs.writeFileSync(
        path.join(appDir, "bpl_modules", "subpath-pkg", "bpl.json"),
        JSON.stringify(
          {
            name: "subpath-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(appDir, "bpl_modules", "subpath-pkg", "index.bpl"),
        "export root;",
      );
      fs.writeFileSync(path.join(featureDir, "index.bpl"), "export add;");

      const resolved = packageManager.resolvePackage(
        "subpath-pkg/features/math",
        appDir,
      );

      expect(resolved).toBe(path.join(featureDir, "index.bpl"));
    });
  });

  describe("Package Manifest Validation", () => {
    test("should accept valid package names", () => {
      const validNames = [
        "simple-package",
        "my-package",
        "package123",
        "test-pkg-123",
      ];

      validNames.forEach((name) => {
        const manifest = {
          name,
          version: "1.0.0",
        };

        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).not.toThrow();
      });
    });

    test("should accept valid semantic versions", () => {
      const validVersions = ["1.0.0", "0.0.1", "2.1.3", "10.20.30"];

      validVersions.forEach((version) => {
        const manifest = {
          name: "test-pkg",
          version,
        };

        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).not.toThrow();
      });
    });

    test("should reject invalid semantic versions", () => {
      const invalidVersions = ["1.0", "1", "v1.0.0", "1.0.0-beta", "latest"];

      invalidVersions.forEach((version) => {
        const manifest = {
          name: "test-pkg",
          version,
        };

        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          /Invalid version format/,
        );
      });
    });
  });

  describe("Package Hash Calculation", () => {
    test("should calculate consistent hash for same content", () => {
      const manifest = {
        name: "hash-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const hash1 = packageManager["calculatePackageHash"](tempDir);
      const hash2 = packageManager["calculatePackageHash"](tempDir);

      expect(hash1).toBe(hash2);
    });

    test("should calculate different hash for different content", () => {
      const manifest = {
        name: "hash-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const hash1 = packageManager["calculatePackageHash"](tempDir);

      // Modify content
      fs.writeFileSync("index.bpl", "export modified;");

      const hash2 = packageManager["calculatePackageHash"](tempDir);

      expect(hash1).not.toBe(hash2);
    });
  });
});
