import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";
import {
  PackageLockVerificationError,
  PackageManager,
} from "../compiler/middleend/PackageManager";
import { writeNodeCommandShim } from "./helpers/executableShim";

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
    fs.copyFileSync(`${tarballPath}.bplmeta.json`, `${cachePath}.bplmeta.json`);
    return cachePath;
  }

  function createSymlinkedCacheRoot(label: string): {
    globalPackageDir: string;
    outsideCacheRoot: string;
  } {
    const outsideParent = path.join(tempDir, `${label}-outside-parent`);
    const outsideCacheRoot = path.join(outsideParent, "packages");
    const symlinkParent = path.join(tempDir, `${label}-link`);
    fs.mkdirSync(outsideCacheRoot, { recursive: true });
    fs.symlinkSync(outsideParent, symlinkParent, "dir");

    return {
      globalPackageDir: path.join(symlinkParent, "packages"),
      outsideCacheRoot,
    };
  }

  function createTarProxy(label: string): { fakeTar: string; logPath: string } {
    const toolDir = path.join(tempDir, `${label}-bin`);
    const logPath = path.join(tempDir, `${label}.log`);
    const fakeTar = path.join(toolDir, "tar-proxy.js");
    fs.mkdirSync(toolDir);

    const commandPath = writeNodeCommandShim(
      fakeTar,
      [
        'const { spawnSync } = require("child_process");',
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        `fs.appendFileSync(${JSON.stringify(logPath)}, args.join(" ") + "\\n");`,
        `const result = spawnSync(${JSON.stringify(process.env.TAR || "tar")}, args, { encoding: "buffer" });`,
        "if (result.stdout) process.stdout.write(result.stdout);",
        "if (result.stderr) process.stderr.write(result.stderr);",
        "if (result.error) {",
        "  console.error(result.error.message);",
        "  process.exit(127);",
        "}",
        "process.exit(result.status ?? 1);",
      ],
    );

    return { fakeTar: commandPath, logPath };
  }

  describe("Package Initialization", () => {
    test("should create package-safe default names when initializing", () => {
      const projectDir = path.join(tempDir, "My Package_01!");
      fs.mkdirSync(projectDir);

      packageManager.init(projectDir);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, "bpl.json"), "utf-8"),
      );
      expect(manifest.name).toBe("my-package-01");
    });

    test("should reject invalid explicit init names", () => {
      expect(() => packageManager.init(tempDir, "Bad_Name")).toThrow(
        /Invalid package name: Bad_Name/,
      );
      expect(fs.existsSync(path.join(tempDir, "bpl.json"))).toBe(false);
    });

    test("should reject init when bpl.json is a symlink", () => {
      const projectDir = path.join(tempDir, "init-symlink-manifest");
      const manifestPath = path.join(projectDir, "bpl.json");
      fs.mkdirSync(projectDir);
      fs.symlinkSync(path.join(tempDir, "missing-manifest"), manifestPath);

      expect(() => packageManager.init(projectDir)).toThrow(
        /bpl\.json already exists/,
      );
    });

    test("should not follow atomic temp symlinks while initializing", () => {
      const projectDir = path.join(tempDir, "init-temp-symlink-manifest");
      const outsideManifest = path.join(tempDir, "outside-manifest.json");
      const originalDateNow = Date.now;
      const originalRandom = Math.random;
      const fixedTimestamp = 1700000000000;
      const poisonedTempPath = path.join(
        projectDir,
        `.bpl.json.${process.pid}-${fixedTimestamp}-8-0.tmp`,
      );

      try {
        fs.mkdirSync(projectDir);
        fs.writeFileSync(outsideManifest, "outside\n");
        fs.symlinkSync(outsideManifest, poisonedTempPath, "file");
        Date.now = () => fixedTimestamp;
        Math.random = () => 0.5;

        packageManager.init(projectDir, "temp-symlink-safe");

        const manifest = JSON.parse(
          fs.readFileSync(path.join(projectDir, "bpl.json"), "utf-8"),
        );
        expect(manifest.name).toBe("temp-symlink-safe");
        expect(fs.readFileSync(outsideManifest, "utf-8")).toBe("outside\n");
        expect(fs.lstatSync(poisonedTempPath).isSymbolicLink()).toBe(true);
      } finally {
        Date.now = originalDateNow;
        Math.random = originalRandom;
      }
    });

    test("should reject package roots whose bpl_modules path is a file", () => {
      const projectDir = path.join(tempDir, "bad-local-package-dir");
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(path.join(projectDir, "bpl_modules"), "not a directory");

      expect(() => new PackageManager(projectDir)).toThrow(
        /Local package directory path is not a directory/,
      );
    });

    test("should reject package roots whose parent path is a file", () => {
      const projectFile = path.join(tempDir, "bad-package-root-parent");
      fs.writeFileSync(projectFile, "not a directory");

      let errorMessage = "";
      try {
        new PackageManager(projectFile);
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toContain(
        "Local package directory parent path is not a directory",
      );
      expect(errorMessage).toContain(projectFile);
      expect(errorMessage).not.toContain("ENOTDIR");
    });

    test("should reject package roots whose bpl_modules path is a symlink", () => {
      const projectDir = path.join(tempDir, "symlink-local-package-dir");
      const targetDir = path.join(tempDir, "outside-package-root");
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(targetDir);
      fs.symlinkSync(targetDir, path.join(projectDir, "bpl_modules"));

      expect(() => new PackageManager(projectDir)).toThrow(
        /Local package directory path is a symbolic link/,
      );
    });

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
      expect(fs.existsSync(`${tarballPath}.bplmeta.json`)).toBe(true);
      expect(tarballPath).toContain("test-pkg-1.0.0.tgz");

      const provenance = JSON.parse(
        fs.readFileSync(`${tarballPath}.bplmeta.json`, "utf-8"),
      );
      expect(provenance.name).toBe("test-pkg");
      expect(provenance.version).toBe("1.0.0");
      expect(provenance.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(provenance.packageHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test("should preserve existing package provenance permissions when rewriting", () => {
      if (process.platform === "win32") {
        return;
      }

      const manifest = {
        name: "provenance-mode-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export first;");

      const tarballPath = packageManager.pack(tempDir);
      const provenancePath = `${tarballPath}.bplmeta.json`;
      const firstProvenance = JSON.parse(
        fs.readFileSync(provenancePath, "utf-8"),
      );
      fs.chmodSync(provenancePath, 0o640);

      fs.writeFileSync("index.bpl", "export second;");
      expect(packageManager.pack(tempDir)).toBe(tarballPath);

      expect(fs.statSync(provenancePath).mode & 0o777).toBe(0o640);
      const secondProvenance = JSON.parse(
        fs.readFileSync(provenancePath, "utf-8"),
      );
      expect(secondProvenance.name).toBe("provenance-mode-pkg");
      expect(secondProvenance.packageHash).not.toBe(
        firstProvenance.packageHash,
      );
      expect(secondProvenance.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (file) =>
              file.startsWith(".provenance-mode-pkg-1.0.0.tgz.bplmeta.json.") &&
              file.endsWith(".tmp"),
        ),
      ).toBe(false);
    });

    test("should preserve existing package archive permissions when rewriting", () => {
      if (process.platform === "win32") {
        return;
      }

      const manifest = {
        name: "archive-mode-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export first;");

      const tarballPath = packageManager.pack(tempDir);
      fs.chmodSync(tarballPath, 0o640);

      fs.writeFileSync("index.bpl", "export second;");
      expect(packageManager.pack(tempDir)).toBe(tarballPath);

      expect(fs.statSync(tarballPath).mode & 0o777).toBe(0o640);
      expect(fs.existsSync(`${tarballPath}.bplmeta.json`)).toBe(true);
      expect(
        fs
          .readdirSync(tempDir)
          .some(
            (file) =>
              file.startsWith(".archive-mode-pkg-1.0.0.tgz.") &&
              file.endsWith(".tmp"),
          ),
      ).toBe(false);
    });

    test("should report tar spawn failures while creating package archives", () => {
      const manifest = {
        name: "missing-tar-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const missingTar = path.join(tempDir, "definitely-missing-tar");
      const originalBplTar = process.env.BPL_TAR;

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      process.env.BPL_TAR = missingTar;
      try {
        let error: unknown;
        try {
          packageManager.pack(tempDir);
        } catch (caught) {
          error = caught;
        }

        expect(error).toBeInstanceOf(CompilerError);
        expect((error as Error).message).toContain(
          "Failed to create tarball: command not found",
        );
        expect((error as Error).message).not.toContain("ENOENT");
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }
      }
    });

    test("should time out hanging tar tools while creating package archives", () => {
      const manifest = {
        name: "timeout-tar-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const originalBplTar = process.env.BPL_TAR;
      const originalPackageToolTimeout = process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS;
      const fakeTar = writeNodeCommandShim(path.join(tempDir, "hanging-tar"), [
        "setInterval(() => {}, 1000);",
      ]);

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      process.env.BPL_TAR = fakeTar;
      process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS = "100";
      try {
        expect(() => packageManager.pack(tempDir)).toThrow(
          /Failed to create tarball: timed out/,
        );
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }

        if (originalPackageToolTimeout === undefined) {
          delete process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS;
        } else {
          process.env.BPL_PACKAGE_TOOL_TIMEOUT_MS = originalPackageToolTimeout;
        }
      }
    });

    test("should preserve existing package archives when tar fails after writing output", () => {
      const manifest = {
        name: "partial-tar-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const tarballPath = path.join(tempDir, "partial-tar-pkg-1.0.0.tgz");
      const originalBplTar = process.env.BPL_TAR;
      const fakeTar = writeNodeCommandShim(path.join(tempDir, "partial-tar"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.indexOf("-czf") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        'fs.writeFileSync(args[outputIndex], "partial archive\\n");',
        'process.stderr.write("simulated archive failure\\n");',
        "process.exit(1);",
      ]);

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync(tarballPath, "existing archive\n");

      process.env.BPL_TAR = fakeTar;
      try {
        expect(() => packageManager.pack(tempDir)).toThrow(
          /Failed to create tarball: simulated archive failure/,
        );
        expect(fs.readFileSync(tarballPath, "utf-8")).toBe(
          "existing archive\n",
        );
        expect(
          fs
            .readdirSync(tempDir)
            .some(
              (file) =>
                file.startsWith(".partial-tar-pkg-1.0.0.tgz.") &&
                file.endsWith(".tmp"),
            ),
        ).toBe(false);
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }
      }
    });

    test("should clean package archive temp directories from successful tar tools", () => {
      const manifest = {
        name: "dir-tar-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const originalBplTar = process.env.BPL_TAR;
      const fakeTar = writeNodeCommandShim(path.join(tempDir, "dir-tar"), [
        'const fs = require("fs");',
        "const args = process.argv.slice(2);",
        'const outputIndex = args.indexOf("-czf") + 1;',
        "if (outputIndex <= 0 || !args[outputIndex]) process.exit(2);",
        "fs.mkdirSync(args[outputIndex]);",
      ]);

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      process.env.BPL_TAR = fakeTar;
      try {
        expect(() => packageManager.pack(tempDir)).toThrow(
          /Package archive tool did not create a regular file/,
        );
        expect(
          fs
            .readdirSync(tempDir)
            .some(
              (file) =>
                file.startsWith(".dir-tar-pkg-1.0.0.tgz.") &&
                file.endsWith(".tmp"),
            ),
        ).toBe(false);
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }
      }
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

    test("should create missing package output directories", () => {
      const outputDir = path.join(tempDir, "dist", "packages");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "output-dir-pkg", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir, outputDir);

      expect(tarballPath).toBe(
        path.join(outputDir, "output-dir-pkg-1.0.0.tgz"),
      );
      expect(fs.existsSync(tarballPath)).toBe(true);
      expect(fs.existsSync(`${tarballPath}.bplmeta.json`)).toBe(true);
    });

    test("should reject package output paths that are files", () => {
      const outputPath = path.join(tempDir, "package-output");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "bad-output-pkg", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync(outputPath, "not a directory");

      expect(() => packageManager.pack(tempDir, outputPath)).toThrow(
        /Package output path is not a directory/,
      );
    });

    test("should reject package output paths whose parent path is a file", () => {
      const parentPath = path.join(tempDir, "package-output-parent");
      const outputPath = path.join(parentPath, "packages");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          { name: "bad-output-parent-pkg", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync(parentPath, "not a directory");

      let errorMessage = "";
      try {
        packageManager.pack(tempDir, outputPath);
      } catch (error: unknown) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      expect(errorMessage).toContain(
        "Package output parent path is not a directory",
      );
      expect(errorMessage).toContain(parentPath);
      expect(errorMessage).not.toContain("ENOTDIR");
    });

    test("should reject package output paths that are symbolic links", () => {
      const outputPath = path.join(tempDir, "package-output-link");
      const targetDir = path.join(tempDir, "outside-output");
      fs.mkdirSync(targetDir);
      fs.symlinkSync(targetDir, outputPath, "dir");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "bad-output-link-pkg", version: "1.0.0" }),
      );
      fs.writeFileSync("index.bpl", "export test;");

      expect(() => packageManager.pack(tempDir, outputPath)).toThrow(
        /Package output path is a symbolic link/,
      );
      expect(fs.readdirSync(targetDir)).toEqual([]);
    });

    test("should reject package archive output paths that are directories", () => {
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          { name: "archive-output-dir-pkg", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.mkdirSync(path.join(tempDir, "archive-output-dir-pkg-1.0.0.tgz"));

      expect(() => packageManager.pack(tempDir)).toThrow(
        /Package archive path is not a file/,
      );
    });

    test("should reject package archive output paths that are symbolic links", () => {
      const archivePath = path.join(
        tempDir,
        "archive-output-link-pkg-1.0.0.tgz",
      );
      const targetPath = path.join(tempDir, "outside-archive.tgz");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "archive-output-link-pkg", version: "1.0.0" }),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.symlinkSync(targetPath, archivePath, "file");

      expect(() => packageManager.pack(tempDir)).toThrow(
        /Package archive path is a symbolic link/,
      );
      expect(fs.existsSync(targetPath)).toBe(false);
    });

    test("should reject package provenance paths that are not files", () => {
      const outputDir = path.join(tempDir, "provenance-output");
      const provenancePath = path.join(
        outputDir,
        "provenance-pkg-1.0.0.tgz.bplmeta.json",
      );
      fs.mkdirSync(provenancePath, { recursive: true });
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "provenance-pkg", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync("index.bpl", "export test;");

      expect(() => packageManager.pack(tempDir, outputDir)).toThrow(
        /Package provenance path is not a file/,
      );
    });

    test("should reject package provenance paths that are symbolic links", () => {
      const outputDir = path.join(tempDir, "provenance-link-output");
      const provenancePath = path.join(
        outputDir,
        "provenance-link-pkg-1.0.0.tgz.bplmeta.json",
      );
      const targetPath = path.join(tempDir, "outside-provenance.json");
      fs.mkdirSync(outputDir);
      fs.symlinkSync(targetPath, provenancePath, "file");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          { name: "provenance-link-pkg", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export test;");

      expect(() => packageManager.pack(tempDir, outputDir)).toThrow(
        /Package provenance path is a symbolic link/,
      );
      expect(fs.existsSync(targetPath)).toBe(false);
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

    test("should not follow symlinked source files while packing", () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-outside-"));
      const outsideSource = path.join(outsideDir, "secret.bpl");
      const linkedSource = path.join(tempDir, "linked.bpl");
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ name: "symlink-source", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync("index.bpl", "frame test() ret int { return 0; }");
      fs.writeFileSync(outsideSource, "frame secret() ret int { return 99; }");

      try {
        fs.symlinkSync(outsideSource, linkedSource);
      } catch {
        fs.rmSync(outsideDir, { recursive: true, force: true });
        return;
      }

      try {
        const tarballPath = packageManager.pack(tempDir);
        const listing = spawnSync("tar", ["-tzf", tarballPath], {
          encoding: "utf-8",
        });

        expect(listing.status).toBe(0);
        expect(listing.stdout).toContain("package/index.bpl");
        expect(listing.stdout).not.toContain("package/linked.bpl");
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
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

    test("should reject symlinked package bin entries", () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-outside-"));
      const outsideTool = path.join(outsideDir, "tool.sh");
      fs.mkdirSync(path.join(tempDir, "bin"));
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          {
            name: "symlink-bin-package",
            version: "1.0.0",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync(outsideTool, "#!/usr/bin/env sh\necho outside\n");

      try {
        fs.symlinkSync(outsideTool, path.join(tempDir, "bin", "tool.sh"));
      } catch {
        fs.rmSync(outsideDir, { recursive: true, force: true });
        return;
      }

      try {
        expect(() => packageManager.pack(tempDir)).toThrow(
          /Unsupported package bin entry/,
        );
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    test("should reject broken symlink package bin entries as symlinks", () => {
      fs.mkdirSync(path.join(tempDir, "bin"));
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          {
            name: "broken-symlink-bin-package",
            version: "1.0.0",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export test;");
      fs.symlinkSync(
        path.join(tempDir, "missing-tool.sh"),
        path.join(tempDir, "bin", "tool.sh"),
      );

      expect(() => packageManager.pack(tempDir)).toThrow(
        /Unsupported package bin entry/,
      );
    });

    test("should reject missing package bin entries", () => {
      const packageDir = path.join(tempDir, "missing-bin-package");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "missing-bin-package",
            version: "1.0.0",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      expect(() => packageManager.pack(packageDir)).toThrow(
        /Missing package bin entry/,
      );
    });

    test("should reject package exports that do not point to regular files", () => {
      const directoryProject = path.join(tempDir, "directory-export-package");
      const missingProject = path.join(tempDir, "missing-export-package");
      const symlinkProject = path.join(tempDir, "symlink-export-package");
      fs.mkdirSync(path.join(directoryProject, "features"), {
        recursive: true,
      });
      fs.mkdirSync(missingProject);
      fs.mkdirSync(path.join(symlinkProject, "features"), { recursive: true });

      fs.writeFileSync(
        path.join(directoryProject, "bpl.json"),
        JSON.stringify(
          {
            name: "directory-export-package",
            version: "1.0.0",
            exports: ["features"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(directoryProject, "index.bpl"),
        "export test;",
      );

      expect(() => packageManager.pack(directoryProject)).toThrow(
        /Unsupported package export entry: features/,
      );

      fs.writeFileSync(
        path.join(missingProject, "bpl.json"),
        JSON.stringify(
          {
            name: "missing-export-package",
            version: "1.0.0",
            exports: ["features/missing.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(missingProject, "index.bpl"), "export test;");

      expect(() => packageManager.pack(missingProject)).toThrow(
        /Missing package export entry: features\/missing\.bpl/,
      );

      fs.writeFileSync(
        path.join(symlinkProject, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-export-package",
            version: "1.0.0",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(symlinkProject, "index.bpl"), "export test;");
      fs.symlinkSync(
        path.join(symlinkProject, "missing-public.bpl"),
        path.join(symlinkProject, "features", "public.bpl"),
      );

      expect(() => packageManager.pack(symlinkProject)).toThrow(
        /Unsupported package export entry: features\/public\.bpl/,
      );
    });

    test("should accept package exports that point to regular source files", () => {
      fs.mkdirSync(path.join(tempDir, "features"), { recursive: true });
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify(
          {
            name: "valid-export-package",
            version: "1.0.0",
            exports: ["features/public.bpl", "features/native.x"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync("index.bpl", "export root;");
      fs.writeFileSync("features/public.bpl", "export publicFeature;");
      fs.writeFileSync("features/native.x", "extern nativeFeature;");

      const tarballPath = packageManager.pack(tempDir);

      expect(fs.existsSync(tarballPath)).toBe(true);
      const listing = spawnSync("tar", ["-tzf", tarballPath], {
        encoding: "utf-8",
      });
      expect(listing.status).toBe(0);
      expect(listing.stdout).toContain("package/features/public.bpl");
      expect(listing.stdout).toContain("package/features/native.x");
    });
  });

  describe("Package Installation", () => {
    function createInstallArchive(packageName: string): string {
      const packageDir = path.join(tempDir, `${packageName}-source`);
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      return new PackageManager(packageDir).pack(packageDir);
    }

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

    test("should preserve existing installs when staged package copy fails", () => {
      const createPackageArchive = (rootName: string, source: string) => {
        const packageDir = path.join(tempDir, rootName);
        fs.mkdirSync(packageDir);
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "copy-failure-pkg",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), source);

        return new PackageManager(packageDir).pack(packageDir);
      };

      const originalTarball = createPackageArchive(
        "copy-failure-original",
        "export original;",
      );
      const updatedTarball = createPackageArchive(
        "copy-failure-updated",
        "export updated;",
      );
      const installDir = path.join(tempDir, "copy-failure-install");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(originalTarball, { global: false, verbose: false });

      const installedPath = path.join(
        installDir,
        "bpl_modules",
        "copy-failure-pkg",
      );
      expect(
        fs.readFileSync(path.join(installedPath, "index.bpl"), "utf-8"),
      ).toBe("export original;");

      const patchedPM = localPM as unknown as {
        copyDir: (src: string, dest: string) => void;
      };
      patchedPM.copyDir = () => {
        throw new Error("simulated staged copy failure");
      };

      expect(() =>
        localPM.install(updatedTarball, { global: false, verbose: false }),
      ).toThrow(/simulated staged copy failure/);
      expect(
        fs.readFileSync(path.join(installedPath, "index.bpl"), "utf-8"),
      ).toBe("export original;");
      expect(
        fs
          .readdirSync(path.join(installDir, "bpl_modules"))
          .some((entry) => entry.includes(".tmp")),
      ).toBe(false);
    });

    test("should reject package install targets that are regular files", () => {
      const packageDir = path.join(tempDir, "file-target-package");
      const installDir = path.join(tempDir, "file-target-install");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "file-target-package",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const targetPath = path.join(
        installDir,
        "bpl_modules",
        "file-target-package",
      );
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, "user-owned file\n");

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Cannot install package 'file-target-package'/);
      expect(fs.lstatSync(targetPath).isFile()).toBe(true);
      expect(fs.readFileSync(targetPath, "utf-8")).toBe("user-owned file\n");
    });

    test("should reject package install targets that are symlinks", () => {
      const packageDir = path.join(tempDir, "symlink-target-package");
      const installDir = path.join(tempDir, "symlink-target-install");
      const outsideTarget = path.join(tempDir, "outside-install-target");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(outsideTarget);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-target-package",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const targetPath = path.join(
        installDir,
        "bpl_modules",
        "symlink-target-package",
      );
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.symlinkSync(outsideTarget, targetPath, "dir");

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Cannot install package 'symlink-target-package'/);
      expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(outsideTarget, "bpl.json"))).toBe(false);
    });

    test("should reject swapped local package roots that become symlinks before install", () => {
      const tarballPath = createInstallArchive("swapped-local-root");
      const installDir = path.join(tempDir, "swapped-local-root-install");
      const outsidePackageRoot = path.join(tempDir, "outside-local-root");
      fs.mkdirSync(installDir);
      fs.mkdirSync(outsidePackageRoot);

      const localPM = new PackageManager(installDir);
      const localPackageDir = path.join(installDir, "bpl_modules");
      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsidePackageRoot, localPackageDir, "dir");

      expect(() =>
        localPM.install(tarballPath, { global: false, verbose: false }),
      ).toThrow(/Local package directory path is a symbolic link/);
      expect(fs.lstatSync(localPackageDir).isSymbolicLink()).toBe(true);
      expect(
        fs.existsSync(path.join(outsidePackageRoot, "swapped-local-root")),
      ).toBe(false);
    });

    test("should reject swapped global package roots that become symlinks before install", () => {
      const tarballPath = createInstallArchive("swapped-global-root");
      const installDir = path.join(tempDir, "swapped-global-root-install");
      const globalPackageDir = path.join(tempDir, "swapped-global-packages");
      const outsidePackageRoot = path.join(tempDir, "outside-global-root");
      fs.mkdirSync(installDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(outsidePackageRoot);

      const localPM = new PackageManager(installDir);
      localPM["globalPackageDir"] = globalPackageDir;
      fs.rmSync(globalPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsidePackageRoot, globalPackageDir, "dir");

      expect(() =>
        localPM.install(tarballPath, { global: true, verbose: false }),
      ).toThrow(/Global package directory path is a symbolic link/);
      expect(fs.lstatSync(globalPackageDir).isSymbolicLink()).toBe(true);
      expect(
        fs.existsSync(path.join(outsidePackageRoot, "swapped-global-root")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(outsidePackageRoot, "swapped-global-root-1.0.0.tgz"),
        ),
      ).toBe(false);
    });

    test("should recreate missing package roots before direct archive installs", () => {
      const localTarballPath = createInstallArchive("missing-local-root");
      const globalTarballPath = createInstallArchive("missing-global-root");
      const installDir = path.join(tempDir, "missing-root-install");
      const globalPackageDir = path.join(tempDir, "missing-root-global");
      fs.mkdirSync(installDir);

      const localPM = new PackageManager(installDir);
      localPM["globalPackageDir"] = globalPackageDir;
      fs.rmSync(path.join(installDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });

      localPM.install(localTarballPath, { global: false, verbose: false });
      expect(
        fs.existsSync(
          path.join(installDir, "bpl_modules", "missing-local-root"),
        ),
      ).toBe(true);

      localPM.install(globalTarballPath, { global: true, verbose: false });
      expect(
        fs.existsSync(path.join(globalPackageDir, "missing-global-root")),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(globalPackageDir, "missing-global-root-1.0.0.tgz"),
        ),
      ).toBe(true);
    });

    test("should isolate package extraction from stale temp directories", () => {
      const manifest = {
        name: "stale-temp-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const fixedTimestamp = 1234567890;
      const staleTempDir = path.join(
        os.tmpdir(),
        `bpl-install-${fixedTimestamp}`,
      );

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const tarballPath = packageManager.pack(tempDir);
      const installDir = path.join(tempDir, "stale-temp-install");
      fs.mkdirSync(path.join(staleTempDir, "package"), { recursive: true });
      fs.writeFileSync(
        path.join(staleTempDir, "package", "stale.bpl"),
        "frame stale() ret int { return 99; }",
      );
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const originalDateNow = Date.now;
      Date.now = () => fixedTimestamp;
      try {
        new PackageManager().install(tarballPath, {
          global: false,
          verbose: false,
        });
      } finally {
        Date.now = originalDateNow;
        fs.rmSync(staleTempDir, { recursive: true, force: true });
      }

      const installedPath = path.join(
        installDir,
        "bpl_modules",
        "stale-temp-pkg",
      );
      expect(fs.existsSync(path.join(installedPath, "index.bpl"))).toBe(true);
      expect(fs.existsSync(path.join(installedPath, "stale.bpl"))).toBe(false);
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

    test("should reject local binary directories that are files", () => {
      const packageDir = path.join(tempDir, "bin-dir-package");
      const installDir = path.join(tempDir, "bin-dir-install");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "bin-dir-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.mkdirSync(path.join(installDir, "bpl_modules"), { recursive: true });
      fs.writeFileSync(
        path.join(installDir, "bpl_modules", ".bin"),
        "not a directory",
      );

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Local binary directory path is not a directory/);
    });

    test("should reject local binary directories that are symlinks", () => {
      const packageDir = path.join(tempDir, "bin-symlink-package");
      const installDir = path.join(tempDir, "bin-symlink-install");
      const outsideBinDir = path.join(tempDir, "outside-bin");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "bin-symlink-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.mkdirSync(path.join(installDir, "bpl_modules"), { recursive: true });
      fs.mkdirSync(outsideBinDir);
      fs.symlinkSync(outsideBinDir, path.join(installDir, "bpl_modules", ".bin"));

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Local binary directory path is a symbolic link/);
    });

    test("should reject package binary link targets that are directories", () => {
      const packageDir = path.join(tempDir, "bin-target-package");
      const installDir = path.join(tempDir, "bin-target-install");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "bin-target-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const targetPath = path.join(installDir, "bpl_modules", ".bin", "tool");
      fs.mkdirSync(targetPath, { recursive: true });

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Cannot link package binary 'tool'/);
    });

    test("should reject package binary link targets that are regular files", () => {
      const packageDir = path.join(tempDir, "bin-file-target-package");
      const installDir = path.join(tempDir, "bin-file-target-install");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "bin-file-target-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const targetPath = path.join(installDir, "bpl_modules", ".bin", "tool");
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, "user-owned command\n");

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Cannot link package binary 'tool'/);
      expect(fs.lstatSync(targetPath).isFile()).toBe(true);
      expect(fs.readFileSync(targetPath, "utf-8")).toBe("user-owned command\n");
      expect(
        fs.existsSync(
          path.join(installDir, "bpl_modules", "bin-file-target-package"),
        ),
      ).toBe(false);
    });

    test("should keep existing installs when binary link targets are blocked", () => {
      const installDir = path.join(tempDir, "bin-preflight-install");

      const createPackage = (version: string, source: string): string => {
        const packageDir = path.join(tempDir, `bin-preflight-${version}`);
        fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "bin-preflight",
              version,
              main: "index.bpl",
              bin: {
                tool: "bin/tool.sh",
              },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), source);
        fs.writeFileSync(
          path.join(packageDir, "bin", "tool.sh"),
          "#!/usr/bin/env sh\necho tool\n",
        );
        return new PackageManager(packageDir).pack(packageDir);
      };

      const firstTarball = createPackage("1.0.0", "export old;");
      const secondTarball = createPackage("2.0.0", "export new;");
      const manager = new PackageManager(installDir);
      manager.install(firstTarball, { global: false, verbose: false });

      const binTarget = path.join(installDir, "bpl_modules", ".bin", "tool");
      fs.unlinkSync(binTarget);
      fs.mkdirSync(binTarget);

      expect(() =>
        manager.install(secondTarball, { global: false, verbose: false }),
      ).toThrow(/Cannot link package binary 'tool'/);

      const installedPath = path.join(
        installDir,
        "bpl_modules",
        "bin-preflight",
      );
      const installedManifest = JSON.parse(
        fs.readFileSync(path.join(installedPath, "bpl.json"), "utf-8"),
      );
      expect(installedManifest.version).toBe("1.0.0");
      expect(
        fs.readFileSync(path.join(installedPath, "index.bpl"), "utf-8"),
      ).toBe("export old;");
    });

    test("should preserve existing binary links when staged link creation fails", () => {
      const installDir = path.join(tempDir, "bin-link-preserve-install");

      const createPackage = (version: string, source: string): string => {
        const packageDir = path.join(tempDir, `bin-link-preserve-${version}`);
        fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "bin-link-preserve",
              version,
              main: "index.bpl",
              bin: {
                tool: "bin/tool.sh",
              },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), source);
        fs.writeFileSync(
          path.join(packageDir, "bin", "tool.sh"),
          "#!/usr/bin/env sh\necho tool\n",
        );
        return new PackageManager(packageDir).pack(packageDir);
      };

      const firstTarball = createPackage("1.0.0", "export old;");
      const secondTarball = createPackage("2.0.0", "export new;");
      const manager = new PackageManager(installDir);
      manager.install(firstTarball, { global: false, verbose: false });

      const binTarget = path.join(installDir, "bpl_modules", ".bin", "tool");
      const originalLinkTarget = fs.readlinkSync(binTarget);
      const fixedTimestamp = 246813579;
      const fixedRandom = 0.5;
      const randomText = fixedRandom.toString(16).slice(2);

      for (let attempt = 0; attempt < 10; attempt++) {
        fs.writeFileSync(
          path.join(
            path.dirname(binTarget),
            `.${path.basename(binTarget)}.${process.pid}-${fixedTimestamp}-${randomText}-${attempt}.tmp`,
          ),
          "stale temp link placeholder",
        );
      }

      const originalDateNow = Date.now;
      const originalRandom = Math.random;
      const originalWarn = console.warn;
      const warnings: string[] = [];
      Date.now = () => fixedTimestamp;
      Math.random = () => fixedRandom;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };

      try {
        manager.install(secondTarball, { global: false, verbose: false });
      } finally {
        Date.now = originalDateNow;
        Math.random = originalRandom;
        console.warn = originalWarn;
      }

      expect(warnings.some((entry) => entry.includes("Failed to link binary tool"))).toBe(
        true,
      );
      expect(fs.readlinkSync(binTarget)).toBe(originalLinkTarget);
      expect(
        fs.readFileSync(
          path.join(installDir, "bpl_modules", "bin-link-preserve", "index.bpl"),
          "utf-8",
        ),
      ).toBe("export new;");
    });

    test("should reject package archives with missing bin entries", () => {
      const sourceDir = path.join(tempDir, "missing-bin-archive-source");
      const packageRoot = path.join(sourceDir, "package");
      const installDir = path.join(tempDir, "missing-bin-archive-install");
      const tarballPath = path.join(tempDir, "missing-bin-archive-1.0.0.tgz");
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          {
            name: "missing-bin-archive",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export test;");

      const packResult = spawnSync(
        "tar",
        ["-czf", tarballPath, "-C", sourceDir, "package"],
        { encoding: "utf-8" },
      );
      expect(packResult.status).toBe(0);

      expect(() =>
        new PackageManager(installDir).install(tarballPath, {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Missing package bin entry/);
    });

    test("should reject package archives with invalid export entries", () => {
      const cases = [
        {
          label: "missing",
          exports: ["features/public.bpl"],
          expected: /Missing package export entry: features\/public\.bpl/,
          setup(packageRoot: string) {
            fs.mkdirSync(path.join(packageRoot, "features"));
          },
        },
        {
          label: "directory",
          exports: ["features/public.bpl"],
          expected: /Unsupported package export entry: features\/public\.bpl/,
          setup(packageRoot: string) {
            fs.mkdirSync(path.join(packageRoot, "features", "public.bpl"), {
              recursive: true,
            });
          },
        },
      ] as const;

      for (const testCase of cases) {
        const sourceDir = path.join(
          tempDir,
          `${testCase.label}-export-archive-source`,
        );
        const packageRoot = path.join(sourceDir, "package");
        const installDir = path.join(
          tempDir,
          `${testCase.label}-export-archive-install`,
        );
        const tarballPath = path.join(
          tempDir,
          `${testCase.label}-export-archive-1.0.0.tgz`,
        );
        fs.mkdirSync(packageRoot, { recursive: true });
        fs.mkdirSync(installDir);
        fs.writeFileSync(
          path.join(packageRoot, "bpl.json"),
          JSON.stringify(
            {
              name: `${testCase.label}-export-archive`,
              version: "1.0.0",
              main: "index.bpl",
              exports: testCase.exports,
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export test;");
        testCase.setup(packageRoot);

        const packResult = spawnSync(
          "tar",
          ["-czf", tarballPath, "-C", sourceDir, "package"],
          { encoding: "utf-8" },
        );
        expect(packResult.status).toBe(0);

        expect(() =>
          new PackageManager(installDir).install(tarballPath, {
            global: false,
            verbose: false,
          }),
        ).toThrow(testCase.expected);
        expect(
          fs.existsSync(
            path.join(
              installDir,
              "bpl_modules",
              `${testCase.label}-export-archive`,
            ),
          ),
        ).toBe(false);
      }
    });

    test("should keep existing installs when replacement archive has invalid exports", () => {
      const packageDir = path.join(tempDir, "replace-export-package");
      const sourceDir = path.join(tempDir, "replace-export-archive-source");
      const packageRoot = path.join(sourceDir, "package");
      const installDir = path.join(tempDir, "replace-export-install");
      const badTarballPath = path.join(
        tempDir,
        "replace-export-archive-2.0.0.tgz",
      );
      fs.mkdirSync(packageDir);
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.mkdirSync(installDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "replace-export-archive",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export old;");
      const goodTarballPath = new PackageManager(packageDir).pack(packageDir);
      const installer = new PackageManager(installDir);
      installer.install(goodTarballPath, { global: false, verbose: false });

      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          {
            name: "replace-export-archive",
            version: "2.0.0",
            main: "index.bpl",
            exports: ["features/missing.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export new;");
      const packResult = spawnSync(
        "tar",
        ["-czf", badTarballPath, "-C", sourceDir, "package"],
        { encoding: "utf-8" },
      );
      expect(packResult.status).toBe(0);

      expect(() =>
        installer.install(badTarballPath, { global: false, verbose: false }),
      ).toThrow(/Missing package export entry/);
      expect(
        fs.readFileSync(
          path.join(
            installDir,
            "bpl_modules",
            "replace-export-archive",
            "index.bpl",
          ),
          "utf-8",
        ),
      ).toBe("export old;");
    });

    test("should track exported non-bpl files in installed package hashes", () => {
      const packageDir = path.join(tempDir, "export-hash-package");
      const installDir = path.join(tempDir, "export-hash-install");
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "export-hash-package",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/native.x"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(packageDir, "features", "native.x"),
        "extern nativeFeature;",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const localPM = new PackageManager(installDir);
      localPM.install(tarballPath, { global: false, verbose: false });

      expect(localPM.verifyLockFile().ok).toBe(true);

      fs.writeFileSync(
        path.join(
          installDir,
          "bpl_modules",
          "export-hash-package",
          "features",
          "native.x",
        ),
        "extern changedNativeFeature;",
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.errors.join("\n")).toContain("hash mismatch");
    });

    test("should reject global cache archive targets that are directories", () => {
      const packageDir = path.join(tempDir, "global-cache-target-package");
      const globalPackageDir = path.join(tempDir, "global-cache-target");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "global-cache-target",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.mkdirSync(path.join(globalPackageDir, "global-cache-target-1.0.0.tgz"));

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.install(tarballPath, { global: true, verbose: false }),
      ).toThrow(/Package archive path is not a file/);
    });

    test("should preserve existing global cache archive permissions when replacing", () => {
      if (process.platform === "win32") {
        return;
      }

      const packageDir = path.join(tempDir, "global-cache-mode-package");
      const globalPackageDir = path.join(tempDir, "global-cache-mode");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "global-cache-mode",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export old;");

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install(new PackageManager(packageDir).pack(packageDir), {
        global: true,
        verbose: false,
      });

      const cachedArchivePath = path.join(
        globalPackageDir,
        "global-cache-mode-1.0.0.tgz",
      );
      fs.chmodSync(cachedArchivePath, 0o640);

      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export new;");
      const replacementTarball = new PackageManager(packageDir).pack(packageDir);
      localPM.install(replacementTarball, { global: true, verbose: false });

      expect(fs.statSync(cachedArchivePath).mode & 0o777).toBe(0o640);
      expect(
        fs.readFileSync(
          path.join(globalPackageDir, "global-cache-mode", "index.bpl"),
          "utf8",
        ),
      ).toBe("export new;");
      expect(
        fs
          .readdirSync(globalPackageDir)
          .some(
            (file) =>
              file.startsWith(".global-cache-mode-1.0.0.tgz.") &&
              file.endsWith(".tmp"),
          ),
      ).toBe(false);
    });

    test("should preserve existing global installs when cache provenance is blocked", () => {
      const packageDir = path.join(tempDir, "global-provenance-package");
      const globalPackageDir = path.join(tempDir, "global-provenance-cache");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "global-provenance",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export oldVersion;");
      const firstTarballPath = new PackageManager(packageDir).pack(packageDir);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install(firstTarballPath, { global: true, verbose: false });

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "global-provenance",
            version: "2.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export newVersion;");
      const secondTarballPath = new PackageManager(packageDir).pack(packageDir);
      const blockedProvenancePath = path.join(
        globalPackageDir,
        "global-provenance-2.0.0.tgz.bplmeta.json",
      );
      const outsidePath = path.join(tempDir, "outside-provenance.json");
      fs.writeFileSync(outsidePath, "{}\n");
      fs.symlinkSync(outsidePath, blockedProvenancePath, "file");

      expect(() =>
        localPM.install(secondTarballPath, { global: true, verbose: false }),
      ).toThrow(/Package provenance path is a symbolic link/);
      expect(
        fs.readFileSync(
          path.join(globalPackageDir, "global-provenance", "index.bpl"),
          "utf8",
        ),
      ).toBe("export oldVersion;");
    });

    test("should not follow atomic temp symlinks while caching global package archives", () => {
      const packageDir = path.join(tempDir, "global-cache-temp-package");
      const installDir = path.join(tempDir, "global-cache-temp-install");
      const globalPackageDir = path.join(tempDir, "global-cache-temp");
      const originalDateNow = Date.now;
      const originalRandom = Math.random;
      const fixedTimestamp = 1700000000000;
      fs.mkdirSync(packageDir);
      fs.mkdirSync(installDir);
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "global-cache-temp",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const cachedArchivePath = path.join(
        globalPackageDir,
        "global-cache-temp-1.0.0.tgz",
      );
      const outsideArchive = path.join(tempDir, "outside-cache.tgz");
      const poisonedTempArchive = path.join(
        globalPackageDir,
        `.global-cache-temp-1.0.0.tgz.${process.pid}-${fixedTimestamp}-8-0.tmp`,
      );
      fs.writeFileSync(outsideArchive, "outside\n");
      fs.symlinkSync(outsideArchive, poisonedTempArchive, "file");

      try {
        Date.now = () => fixedTimestamp;
        Math.random = () => 0.5;

        const localPM = new PackageManager(installDir);
        localPM["globalPackageDir"] = globalPackageDir;
        localPM.install(tarballPath, { global: true, verbose: false });

        expect(fs.existsSync(cachedArchivePath)).toBe(true);
        expect(fs.existsSync(`${cachedArchivePath}.bplmeta.json`)).toBe(true);
        expect(fs.readFileSync(outsideArchive, "utf-8")).toBe("outside\n");
        expect(fs.lstatSync(poisonedTempArchive).isSymbolicLink()).toBe(true);
      } finally {
        Date.now = originalDateNow;
        Math.random = originalRandom;
      }
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

    test("should reject package archives whose exported entries are symlinks", () => {
      const sourceDir = path.join(tempDir, "export-symlink-archive-source");
      const installDir = path.join(tempDir, "export-symlink-archive-install");
      const tarballPath = path.join(tempDir, "export-symlink-archive.tgz");
      const externalSourcePath = path.join(tempDir, "external-public.bpl");
      fs.mkdirSync(path.join(sourceDir, "features"), { recursive: true });
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(sourceDir, "bpl.json"),
        JSON.stringify(
          {
            name: "export-symlink-archive",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(sourceDir, "index.bpl"), "export root;");
      fs.writeFileSync(externalSourcePath, "export escaped;");
      fs.symlinkSync(
        externalSourcePath,
        path.join(sourceDir, "features", "public.bpl"),
      );

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
          "--transform=s|features/public.bpl|package/features/public.bpl|",
          "features/public.bpl",
        ],
        { stdio: "pipe" },
      );

      expect(fs.existsSync(tarballPath)).toBe(true);

      const localPM = new PackageManager(installDir);

      expect(() =>
        localPM.install(tarballPath, { global: false, verbose: false }),
      ).toThrow(/Unsupported package archive entry/);
      expect(
        fs.existsSync(
          path.join(installDir, "bpl_modules", "export-symlink-archive"),
        ),
      ).toBe(false);
    });

    test("should reject package archives containing hard links", () => {
      const sourceDir = path.join(tempDir, "hardlink-archive-source");
      const packageDir = path.join(sourceDir, "package");
      const installDir = path.join(tempDir, "hardlink-archive-install");
      const tarballPath = path.join(tempDir, "hardlink-archive.tgz");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.mkdirSync(installDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "hardlink-archive",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.linkSync(
        path.join(packageDir, "index.bpl"),
        path.join(packageDir, "alias.bpl"),
      );

      spawnSync("tar", ["-czf", tarballPath, "-C", sourceDir, "package"], {
        stdio: "pipe",
      });

      expect(fs.existsSync(tarballPath)).toBe(true);

      process.chdir(installDir);
      const localPM = new PackageManager(installDir);

      expect(() =>
        localPM.install(tarballPath, { global: false, verbose: false }),
      ).toThrow(/Unsupported package archive entry: package\/alias\.bpl/);
      expect(
        fs.existsSync(path.join(installDir, "bpl_modules", "hardlink-archive")),
      ).toBe(false);
    });

    test("should reject package archive paths that are not files", () => {
      const archivePath = path.join(tempDir, "archive-dir.tgz");
      fs.mkdirSync(archivePath);

      expect(() => packageManager.install(archivePath)).toThrow(
        /Package archive path is not a file/,
      );
    });

    test("should reject package archive paths that are symbolic links", () => {
      const manifest = {
        name: "archive-link-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");
      const tarballPath = packageManager.pack(tempDir);
      const linkedArchivePath = path.join(tempDir, "archive-link.tgz");
      fs.symlinkSync(tarballPath, linkedArchivePath, "file");

      expect(() => packageManager.install(linkedArchivePath)).toThrow(
        /Package archive path is a symbolic link/,
      );
      expect(
        fs.existsSync(path.join(tempDir, "bpl_modules", "archive-link-pkg")),
      ).toBe(false);
    });

    test("should reject package archive paths through symlinked parent directories", () => {
      const packageDir = path.join(tempDir, "archive-parent-link-pkg-src");
      const outsideArchiveDir = path.join(tempDir, "outside-archive-parent");
      const archiveParentLink = path.join(tempDir, "archive-parent-link");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(outsideArchiveDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "archive-parent-link-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const linkedParentArchivePath = path.join(
        archiveParentLink,
        path.basename(tarballPath),
      );
      fs.copyFileSync(
        tarballPath,
        path.join(outsideArchiveDir, path.basename(tarballPath)),
      );
      fs.symlinkSync(outsideArchiveDir, archiveParentLink, "dir");

      expect(() => packageManager.install(linkedParentArchivePath)).toThrow(
        /Package archive parent path is a symbolic link/,
      );
      expect(
        fs.existsSync(
          path.join(tempDir, "bpl_modules", "archive-parent-link-pkg"),
        ),
      ).toBe(false);
    });

    test("should reject broken package archive symlinks before package resolution", () => {
      const linkedArchivePath = path.join(tempDir, "broken-archive-link.tgz");
      fs.symlinkSync(path.join(tempDir, "missing-archive.tgz"), linkedArchivePath);

      expect(() => packageManager.install(linkedArchivePath)).toThrow(
        /Package archive path is a symbolic link/,
      );
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
      expect(
        fs
          .readdirSync(installDir)
          .some(
            (file) => file.startsWith(".bpl.lock.") && file.endsWith(".tmp"),
          ),
      ).toBe(false);
    });

    test("should install direct archive paths with Windows separators", () => {
      const packageDir = path.join(tempDir, "direct-windows-source-pkg");
      const appDir = path.join(tempDir, "direct-windows-source-app");
      const depsDir = path.join(appDir, "deps");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(depsDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "direct-windows-source-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export direct;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.copyFileSync(tarballPath, path.join(depsDir, path.basename(tarballPath)));

      process.chdir(appDir);
      const localPM = new PackageManager();
      localPM.install(`deps\\${path.basename(tarballPath)}`, {
        global: false,
        verbose: false,
      });

      const installedPath = path.join(
        appDir,
        "bpl_modules",
        "direct-windows-source-pkg",
        "index.bpl",
      );
      expect(fs.existsSync(installedPath)).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["direct-windows-source-pkg"].source).toBe(
        "deps/direct-windows-source-pkg-1.0.0.tgz",
      );

      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      localPM.installProject({ global: false, verbose: false });
      expect(fs.existsSync(installedPath)).toBe(true);
    });

    test("should install direct file-prefixed archive paths", () => {
      const packageDir = path.join(tempDir, "direct-file-source-pkg");
      const appDir = path.join(tempDir, "direct-file-source-app");
      const depsDir = path.join(appDir, "deps");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(depsDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "direct-file-source-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export direct;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.copyFileSync(tarballPath, path.join(depsDir, path.basename(tarballPath)));

      process.chdir(appDir);
      const localPM = new PackageManager();
      localPM.install(`file:deps/${path.basename(tarballPath)}`, {
        global: false,
        verbose: false,
      });

      const installedPath = path.join(
        appDir,
        "bpl_modules",
        "direct-file-source-pkg",
        "index.bpl",
      );
      expect(fs.existsSync(installedPath)).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["direct-file-source-pkg"].source).toBe(
        "file:deps/direct-file-source-pkg-1.0.0.tgz",
      );

      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      localPM.installProject({ global: false, verbose: false });
      expect(fs.existsSync(installedPath)).toBe(true);
    });

    test("should restore locked file archive sources from the global package cache", () => {
      const packageDir = path.join(tempDir, "cached-file-source-pkg");
      const appDir = path.join(tempDir, "cached-file-source-app");
      const depsDir = path.join(appDir, "deps");
      const globalPackageDir = path.join(tempDir, "cached-file-source-cache");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(depsDir, { recursive: true });
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cached-file-source-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export cached;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const archiveName = path.basename(tarballPath);
      const appArchivePath = path.join(depsDir, archiveName);
      fs.copyFileSync(tarballPath, appArchivePath);
      fs.copyFileSync(tarballPath, path.join(globalPackageDir, archiveName));
      fs.copyFileSync(
        `${tarballPath}.bplmeta.json`,
        path.join(globalPackageDir, `${archiveName}.bplmeta.json`),
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cached-file-source-app",
            version: "1.0.0",
            dependencies: {
              "cached-file-source-pkg": `file:deps/${archiveName}`,
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      fs.rmSync(appArchivePath);
      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      localPM.installProject({ global: false, verbose: false });

      expect(
        fs.existsSync(
          path.join(appDir, "bpl_modules", "cached-file-source-pkg", "bpl.json"),
        ),
      ).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["cached-file-source-pkg"].source).toBe(
        `file:deps/${archiveName}`,
      );
    });

    test("should preserve existing lockfile permissions when rewriting", () => {
      if (process.platform === "win32") {
        return;
      }

      const appDir = path.join(tempDir, "lock-mode-app");
      const lockPath = path.join(appDir, "bpl.lock");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ lockfileVersion: 1, packages: {} }, null, 2),
      );
      fs.chmodSync(lockPath, 0o640);

      new PackageManager(appDir)["saveLockFile"]({
        lockfileVersion: 1,
        packages: {
          "mode-test-pkg": {
            version: "1.0.0",
            source: "mode-test-pkg-1.0.0.tgz",
            hash: "mode-test-hash",
          },
        },
      });

      expect(fs.statSync(lockPath).mode & 0o777).toBe(0o640);
      expect(
        fs
          .readdirSync(appDir)
          .some(
            (file) => file.startsWith(".bpl.lock.") && file.endsWith(".tmp"),
          ),
      ).toBe(false);
    });

    test("should preserve existing installs when the local lockfile is invalid", () => {
      const manifest = {
        name: "lock-preflight-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export oldVersion;");
      const firstTarballPath = packageManager.pack(tempDir);

      const installDir = path.join(tempDir, "lock-preflight-install");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager();
      localPM.install(firstTarballPath, { global: false, verbose: false });

      process.chdir(tempDir);
      fs.writeFileSync(
        "bpl.json",
        JSON.stringify({ ...manifest, version: "2.0.0" }, null, 2),
      );
      fs.writeFileSync("index.bpl", "export newVersion;");
      const secondTarballPath = packageManager.pack(tempDir);

      process.chdir(installDir);
      fs.writeFileSync(
        path.join(installDir, "bpl.lock"),
        JSON.stringify({ lockfileVersion: 2, packages: {} }, null, 2),
      );

      expect(() =>
        localPM.install(secondTarballPath, { global: false, verbose: false }),
      ).toThrow(/Invalid bpl\.lock/);
      expect(
        fs.readFileSync(
          path.join(
            installDir,
            "bpl_modules",
            "lock-preflight-pkg",
            "index.bpl",
          ),
          "utf8",
        ),
      ).toBe("export oldVersion;");
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

    test("should reject broken symlink lockfiles before project install mutates packages", () => {
      const packageDir = path.join(tempDir, "broken-lock-install-pkg");
      const appDir = path.join(tempDir, "broken-lock-install-app");
      const lockPath = path.join(appDir, "bpl.lock");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "broken-lock-install-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "broken-lock-install-app",
            version: "1.0.0",
            dependencies: {
              "broken-lock-install-pkg": `file:${tarballPath}`,
            },
          },
          null,
          2,
        ),
      );
      fs.symlinkSync(path.join(tempDir, "missing-lock-target.json"), lockPath);

      const localPM = new PackageManager(appDir);
      expect(() =>
        localPM.installProject({ global: false, verbose: false }),
      ).toThrow(/symbolic link/);
      expect(
        fs.existsSync(
          path.join(appDir, "bpl_modules", "broken-lock-install-pkg"),
        ),
      ).toBe(false);
    });

    test("should reject broken symlink lockfiles during project install without dependencies", () => {
      const appDir = path.join(tempDir, "broken-lock-empty-install-app");
      const lockPath = path.join(appDir, "bpl.lock");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "broken-lock-empty-install-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.symlinkSync(path.join(tempDir, "missing-empty-lock.json"), lockPath);

      expect(() =>
        new PackageManager(appDir).installProject({
          global: false,
          verbose: false,
        }),
      ).toThrow(/symbolic link/);
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

    test("should verify installed package exports against bpl.lock", () => {
      const appDir = path.join(tempDir, "export-lock-app");
      const sourceArchive = path.join(appDir, "source.tgz");
      const cases = [
        {
          packageName: "export-lock-missing",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features"));
          },
          expected: "Missing package export entry: features/public.bpl",
        },
        {
          packageName: "export-lock-directory",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features", "public.bpl"), {
              recursive: true,
            });
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
      ] as const;

      fs.mkdirSync(path.join(appDir, "bpl_modules"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "export-lock-app", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync(sourceArchive, "archive placeholder");

      const localPM = new PackageManager(appDir);
      const packages: Record<
        string,
        { version: string; source: string; hash: string }
      > = {};

      for (const testCase of cases) {
        const packageDir = path.join(
          appDir,
          "bpl_modules",
          testCase.packageName,
        );
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              exports: ["features/public.bpl"],
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        testCase.setup(packageDir);
        packages[testCase.packageName] = {
          version: "1.0.0",
          source: "file:source.tgz",
          hash: localPM["calculatePackageHash"](packageDir),
        };
      }

      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify({ lockfileVersion: 1, packages }, null, 2),
      );

      const verification = localPM.verifyLockFile();

      expect(verification.ok).toBe(false);
      expect(verification.issues).toEqual(
        expect.arrayContaining(
          cases.map((testCase) =>
            expect.objectContaining({
              packageName: testCase.packageName,
              kind: "invalid-manifest",
              message: expect.stringContaining(testCase.expected),
            }),
          ),
        ),
      );
    });

    test("should reject lock entries whose installed manifest name differs from the lock key", () => {
      const appDir = path.join(tempDir, "manifest-name-lock-app");
      const sourceArchive = path.join(appDir, "source.tgz");
      const installedDir = path.join(
        appDir,
        "bpl_modules",
        "manifest-name-alias",
      );
      fs.mkdirSync(installedDir, { recursive: true });
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "manifest-name-app", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync(
        path.join(installedDir, "bpl.json"),
        JSON.stringify(
          {
            name: "manifest-name-actual",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(installedDir, "index.bpl"), "export stable;");

      const localPM = new PackageManager(appDir);
      const hash = localPM["calculatePackageHash"](installedDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "manifest-name-alias": {
                version: "1.0.0",
                source: "file:source.tgz",
                hash,
              },
            },
          },
          null,
          2,
        ),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "manifest-name-alias",
          kind: "name-mismatch",
          expectedName: "manifest-name-alias",
          actualName: "manifest-name-actual",
        }),
      );
      expect(verification.errors.join("\n")).toContain(
        "manifest-name-alias: manifest name mismatch, lock entry is manifest-name-alias but installed package declares manifest-name-actual",
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/manifest name mismatch/);
    });

    test("should reject symlinked package roots during lock verification", () => {
      const appDir = path.join(tempDir, "symlink-lock-app");
      const outsidePackageDir = path.join(tempDir, "outside-symlink-lock-pkg");
      const sourceArchive = path.join(appDir, "source.tgz");
      const packagePath = path.join(
        appDir,
        "bpl_modules",
        "symlink-lock-pkg",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageDir);
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "symlink-lock-app", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-lock-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "index.bpl"),
        "export stable;",
      );

      const localPM = new PackageManager(appDir);
      const hash = localPM["calculatePackageHash"](outsidePackageDir);
      fs.symlinkSync(outsidePackageDir, packagePath, "dir");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "symlink-lock-pkg": {
                version: "1.0.0",
                source: "file:source.tgz",
                hash,
              },
            },
          },
          null,
          2,
        ),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "symlink-lock-pkg",
          kind: "invalid-package-root",
        }),
      );
      expect(verification.errors.join("\n")).toContain(
        "symlink-lock-pkg: installed package root is a symbolic link",
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/installed package root is a symbolic link/);
    });

    test("should reject swapped local package directories during lock verification", () => {
      const appDir = path.join(tempDir, "swapped-lock-root-app");
      const outsidePackageRoot = path.join(tempDir, "outside-lock-root");
      const outsidePackageDir = path.join(
        outsidePackageRoot,
        "swapped-lock-root-pkg",
      );
      const sourceArchive = path.join(appDir, "source.tgz");
      const localPackageDir = path.join(appDir, "bpl_modules");

      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageDir, { recursive: true });
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "swapped-lock-root-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "swapped-lock-root-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "index.bpl"),
        "export stable;",
      );

      const localPM = new PackageManager(appDir);
      const hash = localPM["calculatePackageHash"](outsidePackageDir);
      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsidePackageRoot, localPackageDir, "dir");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "swapped-lock-root-pkg": {
                version: "1.0.0",
                source: "file:source.tgz",
                hash,
              },
            },
          },
          null,
          2,
        ),
      );

      expect(() => localPM.verifyLockFile()).toThrow(
        /Local package directory path is a symbolic link/,
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/Local package directory path is a symbolic link/);
      expect(fs.lstatSync(localPackageDir).isSymbolicLink()).toBe(true);
    });

    test("should report missing locked packages when the local package directory is absent", () => {
      const appDir = path.join(tempDir, "missing-lock-root-app");
      const sourceArchive = path.join(appDir, "source.tgz");
      const localPackageDir = path.join(appDir, "bpl_modules");
      fs.mkdirSync(appDir);
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "missing-lock-root-app", version: "1.0.0" }),
      );

      const localPM = new PackageManager(appDir);
      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "missing-lock-root-pkg": {
                version: "1.0.0",
                source: "file:source.tgz",
                hash: "missing-hash",
              },
            },
          },
          null,
          2,
        ),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "missing-lock-root-pkg",
          kind: "missing-package",
        }),
      );
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

    test("should verify lockfile sources remain reachable", () => {
      const manifest = {
        name: "source-lock-test",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export stable;");

      const tarballPath = packageManager.pack(tempDir);
      const installDir = path.join(tempDir, "source-lock-app");
      fs.mkdirSync(installDir);
      process.chdir(installDir);

      const localPM = new PackageManager(installDir);
      localPM.install(tarballPath, { global: false, verbose: false });
      fs.unlinkSync(tarballPath);

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues.map((issue) => issue.kind)).toContain(
        "unreachable-source",
      );
      expect(verification.errors.join("\n")).toContain(
        "source-lock-test: lock source is not reachable",
      );
    });

    test("should reject symlinked lockfile sources during locked verification", () => {
      const appDir = path.join(tempDir, "symlink-source-lock-app");
      const installedDir = path.join(
        appDir,
        "bpl_modules",
        "symlink-source-lock-test",
      );
      const realSourceArchive = path.join(appDir, "real-source.tgz");
      const sourceArchiveLink = path.join(appDir, "source.tgz");
      fs.mkdirSync(installedDir, { recursive: true });
      fs.writeFileSync(realSourceArchive, "archive placeholder");
      fs.symlinkSync(realSourceArchive, sourceArchiveLink, "file");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "symlink-source-lock-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(installedDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-source-lock-test",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(installedDir, "index.bpl"), "export stable;");

      const localPM = new PackageManager(appDir);
      const hash = localPM["calculatePackageHash"](installedDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "symlink-source-lock-test": {
                version: "1.0.0",
                source: "file:source.tgz",
                hash,
              },
            },
          },
          null,
          2,
        ),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "symlink-source-lock-test",
          kind: "unreachable-source",
          source: "file:source.tgz",
        }),
      );
      expect(verification.errors.join("\n")).toContain(
        "symlink-source-lock-test: lock source is not reachable",
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/lock source is not reachable/);
    });

    test("should reject lockfile sources through symlinked parent directories during locked verification", () => {
      const appDir = path.join(tempDir, "symlink-parent-source-lock-app");
      const installedDir = path.join(
        appDir,
        "bpl_modules",
        "symlink-parent-source-lock-test",
      );
      const outsideSourceDir = path.join(tempDir, "outside-lock-source-parent");
      const sourceParentLink = path.join(appDir, "deps");
      fs.mkdirSync(installedDir, { recursive: true });
      fs.mkdirSync(outsideSourceDir);
      fs.writeFileSync(
        path.join(outsideSourceDir, "source.tgz"),
        "archive placeholder",
      );
      fs.symlinkSync(outsideSourceDir, sourceParentLink, "dir");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "symlink-parent-source-lock-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(installedDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-parent-source-lock-test",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(installedDir, "index.bpl"), "export stable;");

      const localPM = new PackageManager(appDir);
      const hash = localPM["calculatePackageHash"](installedDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "symlink-parent-source-lock-test": {
                version: "1.0.0",
                source: "file:deps/source.tgz",
                hash,
              },
            },
          },
          null,
          2,
        ),
      );

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "symlink-parent-source-lock-test",
          kind: "unreachable-source",
          source: "file:deps/source.tgz",
        }),
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/lock source is not reachable/);
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

    test("should reject broken symlink exact archives from the global package cache", () => {
      const globalPackageDir = path.join(tempDir, "global-broken-archive-cache");
      const appDir = path.join(tempDir, "global-broken-archive-app");
      const cachedArchiveName = "global-broken-archive-1.0.0.tgz";
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);
      fs.symlinkSync(
        path.join(tempDir, "missing-global-archive.tgz"),
        path.join(globalPackageDir, cachedArchiveName),
        "file",
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.install(cachedArchiveName, { global: false, verbose: false }),
      ).toThrow(/Package archive path is a symbolic link/);
      expect(
        fs.existsSync(
          path.join(appDir, "bpl_modules", "global-broken-archive"),
        ),
      ).toBe(false);
    });

    test("should ignore symlinked package cache archives during package-name resolution", () => {
      const globalPackageDir = path.join(tempDir, "global-cache-link-select");
      const appDir = path.join(tempDir, "global-cache-link-app");
      const outsideArchive = path.join(tempDir, "outside-cache-select.tgz");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);
      fs.writeFileSync(outsideArchive, "not a real archive");
      fs.symlinkSync(
        outsideArchive,
        path.join(globalPackageDir, "cache-select-9.0.0.tgz"),
        "file",
      );
      createCachedPackage(
        "cache-select",
        "1.0.0",
        "export realVersion;",
        globalPackageDir,
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install("cache-select", { global: false, verbose: false });

      const installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "cache-select", "bpl.json"),
          "utf8",
        ),
      );
      const installedSource = fs.readFileSync(
        path.join(appDir, "bpl_modules", "cache-select", "index.bpl"),
        "utf8",
      );

      expect(installedManifest.version).toBe("1.0.0");
      expect(installedSource).toContain("export realVersion;");
    });

    test("should reject broken symlink file dependency archives", () => {
      const appDir = path.join(tempDir, "broken-file-dependency-app");
      const depsDir = path.join(appDir, "deps");
      const brokenArchive = path.join(depsDir, "broken-file-dep-1.0.0.tgz");
      fs.mkdirSync(depsDir, { recursive: true });
      fs.symlinkSync(path.join(tempDir, "missing-file-dep.tgz"), brokenArchive);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "broken-file-dependency-app",
            version: "1.0.0",
            dependencies: {
              "broken-file-dep": "file:deps/broken-file-dep-1.0.0.tgz",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);

      expect(() =>
        localPM.installProject({ global: false, verbose: false }),
      ).toThrow(/Package archive path is a symbolic link/);
      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "broken-file-dep")),
      ).toBe(false);
    });

    test("should reject file dependency archives through symlinked parent directories", () => {
      const appDir = path.join(tempDir, "symlink-parent-file-dependency-app");
      const sourceDir = path.join(tempDir, "symlink-parent-file-dep-src");
      const outsideDepsDir = path.join(tempDir, "outside-file-deps");
      const depsLink = path.join(appDir, "deps");
      fs.mkdirSync(appDir);
      fs.mkdirSync(sourceDir);
      fs.mkdirSync(outsideDepsDir);
      fs.writeFileSync(
        path.join(sourceDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-parent-file-dep",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(sourceDir, "index.bpl"), "export test;");

      const tarballPath = new PackageManager(sourceDir).pack(sourceDir);
      const linkedParentArchivePath = path.join(
        outsideDepsDir,
        path.basename(tarballPath),
      );
      fs.copyFileSync(tarballPath, linkedParentArchivePath);
      fs.symlinkSync(outsideDepsDir, depsLink, "dir");
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "symlink-parent-file-dependency-app",
            version: "1.0.0",
            dependencies: {
              "symlink-parent-file-dep": `file:deps/${path.basename(
                tarballPath,
              )}`,
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);

      expect(() =>
        localPM.installProject({ global: false, verbose: false }),
      ).toThrow(/Package archive parent path is a symbolic link/);
      expect(
        fs.existsSync(
          path.join(appDir, "bpl_modules", "symlink-parent-file-dep"),
        ),
      ).toBe(false);
    });

    test("should resolve package dependency semver ranges from the global package cache", () => {
      const globalPackageDir = path.join(tempDir, "range-cache");
      const appDir = path.join(tempDir, "range-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "range-math",
        "1.2.0",
        "export oldVersion;",
        globalPackageDir,
      );
      createCachedPackage(
        "range-math",
        "1.5.0",
        "export selectedVersion;",
        globalPackageDir,
      );
      createCachedPackage(
        "range-math",
        "2.0.0",
        "export wrongMajor;",
        globalPackageDir,
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "range-app",
            version: "1.0.0",
            dependencies: {
              "range-math": "^1.2.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      const installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "range-math", "bpl.json"),
          "utf8",
        ),
      );
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );

      expect(installedManifest.version).toBe("1.5.0");
      expect(lock.packages["range-math"].source).toBe("range-math-1.5.0.tgz");
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

    test("should update package locks by re-resolving manifest dependency ranges", () => {
      const globalPackageDir = path.join(tempDir, "update-cache");
      const appDir = path.join(tempDir, "update-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "update-math",
        "1.0.0",
        "export firstVersion;",
        globalPackageDir,
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "update-app",
            version: "1.0.0",
            dependencies: {
              "update-math": "^1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      createCachedPackage(
        "update-math",
        "1.5.0",
        "export secondVersion;",
        globalPackageDir,
      );
      localPM.installProject({ global: false, verbose: false });
      let installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "update-math", "bpl.json"),
          "utf8",
        ),
      );
      expect(installedManifest.version).toBe("1.0.0");

      localPM.installProject({ global: false, verbose: false, update: true });
      installedManifest = JSON.parse(
        fs.readFileSync(
          path.join(appDir, "bpl_modules", "update-math", "bpl.json"),
          "utf8",
        ),
      );
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );

      expect(installedManifest.version).toBe("1.5.0");
      expect(lock.packages["update-math"].version).toBe("1.5.0");
    });

    test("should repair lockfiles from currently installed packages", () => {
      const globalPackageDir = path.join(tempDir, "repair-cache");
      const appDir = path.join(tempDir, "repair-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "repair-math",
        "1.0.0",
        "export original;",
        globalPackageDir,
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "repair-app",
            version: "1.0.0",
            dependencies: {
              "repair-math": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      fs.writeFileSync(
        path.join(appDir, "bpl_modules", "repair-math", "index.bpl"),
        "export repaired;",
      );
      const lockPath = path.join(appDir, "bpl.lock");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock.packages.stale = {
        version: "9.9.9",
        source: "stale-9.9.9.tgz",
        hash: "stale",
      };
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

      const result = localPM.repairLockFile();
      expect(result.updated).toContain("repair-math");
      expect(result.removed).toContain("stale");
      expect(localPM.verifyLockFile().ok).toBe(true);
    });

    test("should reject invalid installed package exports when repairing lockfiles", () => {
      const appDir = path.join(tempDir, "repair-export-invalid-app");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "repair-export-invalid",
      );
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "repair-export-invalid-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "repair-export-invalid",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");

      const localPM = new PackageManager(appDir);

      expect(() => localPM.repairLockFile()).toThrow(
        PackageLockVerificationError,
      );
      expect(fs.existsSync(path.join(appDir, "bpl.lock"))).toBe(false);
    });

    test("should repair lockfiles with valid exported non-bpl package files", () => {
      const appDir = path.join(tempDir, "repair-export-valid-app");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "repair-export-valid",
      );
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "repair-export-valid-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(appDir, "repair-export-valid-1.0.0.tgz"), "");
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "repair-export-valid",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/native.x"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(packageDir, "features", "native.x"),
        "extern nativeFeature;",
      );

      const localPM = new PackageManager(appDir);

      const result = localPM.repairLockFile();

      expect(result.updated).toContain("repair-export-valid");
      expect(localPM.verifyLockFile().ok).toBe(true);
    });

    test("should reject duplicate installed package names when repairing lockfiles", () => {
      const appDir = path.join(tempDir, "repair-duplicate-installed-app");
      const firstDir = path.join(appDir, "bpl_modules", "repair-duplicate-a");
      const secondDir = path.join(appDir, "bpl_modules", "repair-duplicate-b");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "repair-duplicate-installed-app", version: "1.0.0" },
          null,
          2,
        ),
      );

      for (const packageDir of [firstDir, secondDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            { name: "repair-duplicate", version: "1.0.0", main: "index.bpl" },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const localPM = new PackageManager(appDir);
      let error: unknown;
      try {
        localPM.repairLockFile();
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(PackageLockVerificationError);
      expect((error as PackageLockVerificationError).verification).toMatchObject({
        ok: false,
        packagesChecked: 2,
        issues: [
          {
            packageName: "repair-duplicate",
            kind: "duplicate-installed-package",
            packagePath: expect.stringContaining("repair-duplicate-a"),
            paths: [firstDir, secondDir],
          },
        ],
      });
      expect(fs.existsSync(path.join(appDir, "bpl.lock"))).toBe(false);
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

    test("should resolve transitive file dependencies relative to the declaring package archive", () => {
      const appDir = path.join(tempDir, "relative-app");
      const packagesDir = path.join(tempDir, "relative-packages");
      const depADir = path.join(packagesDir, "relative-a");
      const depBDir = path.join(packagesDir, "relative-b");
      fs.mkdirSync(appDir);
      fs.mkdirSync(depADir, { recursive: true });
      fs.mkdirSync(depBDir);

      fs.writeFileSync(
        path.join(depBDir, "bpl.json"),
        JSON.stringify(
          { name: "relative-b", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(depBDir, "index.bpl"), "export value;");
      const depBTarball = new PackageManager(depBDir).pack(depBDir);

      fs.writeFileSync(
        path.join(depADir, "bpl.json"),
        JSON.stringify(
          {
            name: "relative-a",
            version: "1.0.0",
            main: "index.bpl",
            dependencies: {
              "relative-b": `file:../relative-b/${path.basename(depBTarball)}`,
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(depADir, "index.bpl"),
        'import value from "relative-b";\nexport value;',
      );
      const depATarball = new PackageManager(depADir).pack(depADir);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "relative-app",
            version: "1.0.0",
            dependencies: {
              "relative-a": `file:../relative-packages/relative-a/${path.basename(depATarball)}`,
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM.installProject({ global: false, verbose: false });

      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "relative-a", "bpl.json")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "relative-b", "bpl.json")),
      ).toBe(true);

      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["relative-b"].source).toBe(
        "file:../relative-packages/relative-b/relative-b-1.0.0.tgz",
      );
    });

    test("should resolve dependency file sources with Windows separators", () => {
      const appDir = path.join(tempDir, "windows-source-app");
      const depsDir = path.join(appDir, "deps");
      const packageDir = path.join(tempDir, "windows-source-package");
      fs.mkdirSync(depsDir, { recursive: true });
      fs.mkdirSync(packageDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "windows-source-package",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const appRelativeTarballPath = path.join(
        depsDir,
        path.basename(tarballPath),
      );
      fs.copyFileSync(tarballPath, appRelativeTarballPath);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "windows-source-app",
            version: "1.0.0",
            dependencies: {
              "windows-source-package": `file:deps\\${path.basename(
                tarballPath,
              )}`,
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM.installProject({ global: false, verbose: false });

      expect(
        fs.existsSync(
          path.join(appDir, "bpl_modules", "windows-source-package", "bpl.json"),
        ),
      ).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["windows-source-package"].source).toBe(
        "file:deps/windows-source-package-1.0.0.tgz",
      );
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

    test("should report installed transitive dependencies missing from bpl.lock", () => {
      const globalPackageDir = path.join(tempDir, "locked-complete-cache");
      const appDir = path.join(tempDir, "locked-complete-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "locked-complete-b",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      createCachedPackage(
        "locked-complete-a",
        "1.0.0",
        'import value from "locked-complete-b";\nexport value;',
        globalPackageDir,
        { "locked-complete-b": "1.0.0" },
      );

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-complete-app",
            version: "1.0.0",
            dependencies: {
              "locked-complete-a": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      const lockPath = path.join(appDir, "bpl.lock");
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      delete lock.packages["locked-complete-b"];
      fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

      const verification = localPM.verifyLockFile();
      expect(verification.ok).toBe(false);
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "locked-complete-b",
          kind: "missing-transitive-lock-entry",
          dependencyOf: "locked-complete-a",
          requestedSource: "1.0.0",
        }),
      );
      expect(verification.errors.join("\n")).toContain(
        "locked-complete-a: dependency 'locked-complete-b' is installed but missing from bpl.lock",
      );
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/missing from bpl\.lock/);
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

    test("should report invalid installed package exports in dependency trees", () => {
      const appDir = path.join(tempDir, "tree-export-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "tree-export-app",
            version: "1.0.0",
            dependencies: {
              "tree-export-directory": "1.0.0",
              "tree-export-missing": "1.0.0",
              "tree-export-symlink": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const writeInstalledPackage = (
        packageName: string,
        manifestFields: Record<string, unknown>,
        setup?: (packageDir: string) => void,
      ) => {
        const packageDir = path.join(packageRoot, packageName);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: packageName,
              version: "1.0.0",
              main: "index.bpl",
              ...manifestFields,
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        setup?.(packageDir);
      };

      writeInstalledPackage("tree-export-child", {});
      writeInstalledPackage(
        "tree-export-missing",
        {
          exports: ["features/public.bpl"],
          dependencies: {
            "tree-export-child": "1.0.0",
          },
        },
        (packageDir) => {
          fs.mkdirSync(path.join(packageDir, "features"));
        },
      );
      writeInstalledPackage(
        "tree-export-directory",
        { exports: ["features/public.bpl"] },
        (packageDir) => {
          fs.mkdirSync(path.join(packageDir, "features", "public.bpl"), {
            recursive: true,
          });
        },
      );
      writeInstalledPackage(
        "tree-export-symlink",
        { exports: ["features/public.bpl"] },
        (packageDir) => {
          fs.mkdirSync(path.join(packageDir, "features"));
          fs.writeFileSync(
            path.join(packageDir, "features", "actual.bpl"),
            "export actual;",
          );
          fs.symlinkSync(
            "actual.bpl",
            path.join(packageDir, "features", "public.bpl"),
          );
        },
      );

      const tree = new PackageManager(appDir).getDependencyTree({ global: false });
      const nodeByName = new Map(tree.map((node) => [node.name, node]));

      expect(nodeByName.get("tree-export-missing")?.problems).toEqual([
        expect.stringContaining(
          "invalid exports: Missing package export entry: features/public.bpl",
        ),
      ]);
      expect(nodeByName.get("tree-export-directory")?.problems).toEqual([
        expect.stringContaining(
          "invalid exports: Unsupported package export entry: features/public.bpl",
        ),
      ]);
      expect(nodeByName.get("tree-export-symlink")?.problems).toEqual([
        expect.stringContaining(
          "invalid exports: Unsupported package export entry: features/public.bpl",
        ),
      ]);
      expect(
        nodeByName.get("tree-export-missing")?.dependencies.map((node) => ({
          name: node.name,
          installed: node.installed,
          problems: node.problems,
        })),
      ).toEqual([
        {
          name: "tree-export-child",
          installed: true,
          problems: [],
        },
      ]);
    });

    test("should reject broken symlink lockfiles before building dependency trees", () => {
      const globalPackageDir = path.join(tempDir, "tree-broken-lock-cache");
      const appDir = path.join(tempDir, "tree-broken-lock-app");
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(appDir);

      createCachedPackage(
        "tree-broken-lock-pkg",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "tree-broken-lock-app",
            version: "1.0.0",
            dependencies: {
              "tree-broken-lock-pkg": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.installProject({ global: false, verbose: false });

      const lockPath = path.join(appDir, "bpl.lock");
      fs.unlinkSync(lockPath);
      fs.symlinkSync(path.join(tempDir, "missing-tree-lock.json"), lockPath);

      expect(() => localPM.getDependencyTree({ global: false })).toThrow(
        /symbolic link/,
      );
    });

    test("should report symlinked package roots in dependency trees without following them", () => {
      const appDir = path.join(tempDir, "tree-linked-root-app");
      const outsidePackageDir = path.join(tempDir, "outside-tree-linked-root");
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "tree-linked-root-app",
            version: "1.0.0",
            dependencies: {
              "tree-linked-root": "1.0.0",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "tree-linked-root",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");

      const localPM = new PackageManager(appDir);
      const linkedPackagePath = path.join(
        appDir,
        "bpl_modules",
        "tree-linked-root",
      );
      fs.symlinkSync(outsidePackageDir, linkedPackagePath, "dir");

      const tree = localPM.getDependencyTree({ global: false });

      expect(tree[0]).toMatchObject({
        name: "tree-linked-root",
        installed: false,
        locked: false,
        path: linkedPackagePath,
      });
      expect(tree[0]?.problems.join("\n")).toContain("symbolic link");
      expect(tree[0]?.dependencies).toEqual([]);
    });

    test("should reject duplicate installed package names before building fallback dependency trees", () => {
      const appDir = path.join(tempDir, "tree-duplicate-installed-app");
      const firstDir = path.join(appDir, "bpl_modules", "tree-duplicate-a");
      const secondDir = path.join(appDir, "bpl_modules", "tree-duplicate-b");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "tree-duplicate-installed-app", version: "1.0.0" },
          null,
          2,
        ),
      );

      for (const packageDir of [firstDir, secondDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            { name: "tree-duplicate", version: "1.0.0", main: "index.bpl" },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const localPM = new PackageManager(appDir);

      expect(() => localPM.getDependencyTree({ global: false })).toThrow(
        /Multiple installed directories declare package 'tree-duplicate'/,
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

    test("should reject dependency sources whose manifest name does not match", () => {
      const appDir = path.join(tempDir, "mismatch-app");
      const packageDir = path.join(tempDir, "actual-package");
      fs.mkdirSync(appDir);
      fs.mkdirSync(packageDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          { name: "actual-package", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "mismatch-app",
            version: "1.0.0",
            dependencies: {
              "expected-package": `file:${tarballPath}`,
            },
          },
          null,
          2,
        ),
      );

      const localPM = new PackageManager(appDir);
      expect(() =>
        localPM.installProject({ global: false, verbose: false }),
      ).toThrow(
        /Package name mismatch: requested 'expected-package' but archive contains 'actual-package'/,
      );
    });

    test("should list and clean package cache archives", () => {
      const globalPackageDir = path.join(tempDir, "cache-clean-packages");
      fs.mkdirSync(globalPackageDir);

      createCachedPackage(
        "cache-math",
        "1.0.0",
        "export oldVersion;",
        globalPackageDir,
      );
      createCachedPackage(
        "cache-math",
        "2.0.0",
        "export newVersion;",
        globalPackageDir,
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      let entries = localPM.listPackageCache("cache-math");
      expect(entries.map((entry) => entry.version)).toEqual(["2.0.0", "1.0.0"]);
      expect(entries.every((entry) => entry.provenanceStatus === "verified")).toBe(
        true,
      );

      const dryRun = localPM.cleanPackageCache({
        packageName: "cache-math",
        version: "1.0.0",
        dryRun: true,
      });
      expect(dryRun.removed.length).toBe(1);
      expect(fs.existsSync(dryRun.removed[0]!.path)).toBe(true);
      expect(fs.existsSync(dryRun.removed[0]!.provenancePath)).toBe(true);

      const clean = localPM.cleanPackageCache({
        packageName: "cache-math",
        version: "1.0.0",
      });
      expect(clean.removed.length).toBe(1);
      expect(fs.existsSync(clean.removed[0]!.path)).toBe(false);
      expect(fs.existsSync(clean.removed[0]!.provenancePath)).toBe(false);

      entries = localPM.listPackageCache("cache-math");
      expect(entries.map((entry) => entry.version)).toEqual(["2.0.0"]);
    });

    test("should ignore symlinked package cache archives", () => {
      const globalPackageDir = path.join(tempDir, "cache-symlink-packages");
      const outsideArchive = path.join(tempDir, "outside-cache.tgz");
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(outsideArchive, "not a real archive");
      fs.symlinkSync(
        outsideArchive,
        path.join(globalPackageDir, "cache-link-1.0.0.tgz"),
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(localPM.listPackageCache("cache-link")).toEqual([]);
      expect(localPM.verifyPackageCache("cache-link").entriesChecked).toBe(0);
    });

    test("should reject symlinked global package cache roots during package-name install lookup", () => {
      const appDir = path.join(tempDir, "cache-root-symlink-name-app");
      const globalPackageDir = path.join(tempDir, "cache-root-symlink-name");
      const outsideCacheRoot = path.join(
        tempDir,
        "outside-cache-root-name",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(outsideCacheRoot);
      createCachedPackage(
        "cache-root-name",
        "1.0.0",
        "export value;",
        outsideCacheRoot,
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      fs.rmSync(globalPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsideCacheRoot, globalPackageDir, "dir");

      expect(() =>
        localPM.install("cache-root-name", {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Global package directory path is a symbolic link/);
      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "cache-root-name")),
      ).toBe(false);
    });

    test("should reject symlinked global package cache roots during exact archive install lookup", () => {
      const appDir = path.join(tempDir, "cache-root-symlink-exact-app");
      const globalPackageDir = path.join(tempDir, "cache-root-symlink-exact");
      const outsideCacheRoot = path.join(
        tempDir,
        "outside-cache-root-exact",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(outsideCacheRoot);
      createCachedPackage(
        "cache-root-exact",
        "1.0.0",
        "export value;",
        outsideCacheRoot,
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      fs.rmSync(globalPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsideCacheRoot, globalPackageDir, "dir");

      expect(() =>
        localPM.install("cache-root-exact-1.0.0.tgz", {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Global package directory path is a symbolic link/);
      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "cache-root-exact")),
      ).toBe(false);
    });

    test("should report missing global package cache directories as package misses during install lookup", () => {
      const appDir = path.join(tempDir, "cache-root-missing-app");
      const globalPackageDir = path.join(tempDir, "cache-root-missing");
      fs.mkdirSync(appDir);

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.install("missing-cache-package", {
          global: false,
          verbose: false,
        }),
      ).toThrow(/Package not found: missing-cache-package/);
    });

    test("should reject package cache verification through symlinked parent directories", () => {
      const { globalPackageDir, outsideCacheRoot } =
        createSymlinkedCacheRoot("cache-parent-verify");
      createCachedPackage(
        "cache-parent-verify",
        "1.0.0",
        "export value;",
        outsideCacheRoot,
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() => localPM.verifyPackageCache("cache-parent-verify")).toThrow(
        /Global package directory parent path is a symbolic link/,
      );
    });

    test("should reject package cache repair through symlinked parent directories", () => {
      const { globalPackageDir, outsideCacheRoot } =
        createSymlinkedCacheRoot("cache-parent-repair");
      const cachePath = createCachedPackage(
        "cache-parent-repair",
        "1.0.0",
        "export value;",
        outsideCacheRoot,
      );
      fs.unlinkSync(`${cachePath}.bplmeta.json`);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() => localPM.repairPackageCache("cache-parent-repair")).toThrow(
        /Global package directory parent path is a symbolic link/,
      );
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(false);
    });

    test("should reject package cache clean through symlinked parent directories without deleting outside files", () => {
      const { globalPackageDir, outsideCacheRoot } =
        createSymlinkedCacheRoot("cache-parent-clean");
      const cachePath = createCachedPackage(
        "cache-parent-clean",
        "1.0.0",
        "export value;",
        outsideCacheRoot,
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.cleanPackageCache({ packageName: "cache-parent-clean" }),
      ).toThrow(/Global package directory parent path is a symbolic link/);
      expect(fs.existsSync(cachePath)).toBe(true);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(true);
    });

    test("should reject global installs when the cache root has a symlinked parent directory", () => {
      const { globalPackageDir, outsideCacheRoot } =
        createSymlinkedCacheRoot("cache-parent-global-install");
      const packageDir = path.join(tempDir, "cache-parent-global-source");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cache-parent-global",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      expect(() =>
        localPM.install(tarballPath, { global: true, verbose: false }),
      ).toThrow(/Global package directory parent path is a symbolic link/);
      expect(
        fs.existsSync(path.join(outsideCacheRoot, "cache-parent-global")),
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(outsideCacheRoot, "cache-parent-global-1.0.0.tgz"),
        ),
      ).toBe(false);
    });

    test("should clean malformed package cache provenance directories", () => {
      const globalPackageDir = path.join(tempDir, "cache-clean-provenance-dir");
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-provenance-dir",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      const provenancePath = `${cachePath}.bplmeta.json`;
      fs.rmSync(provenancePath, { force: true });
      fs.mkdirSync(provenancePath);
      fs.writeFileSync(path.join(provenancePath, "stale"), "stale metadata");

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const clean = localPM.cleanPackageCache({
        packageName: "cache-provenance-dir",
      });

      expect(clean.removed.length).toBe(1);
      expect(fs.existsSync(cachePath)).toBe(false);
      expect(fs.existsSync(provenancePath)).toBe(false);
    });

    test("should report and clean symlinked package cache provenance without following it", () => {
      const globalPackageDir = path.join(tempDir, "cache-provenance-link-dir");
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-provenance-link",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      const provenancePath = `${cachePath}.bplmeta.json`;
      const outsideProvenancePath = path.join(
        tempDir,
        "outside-cache-provenance.json",
      );
      fs.writeFileSync(outsideProvenancePath, '{"outside":true}');
      fs.unlinkSync(provenancePath);
      fs.symlinkSync(outsideProvenancePath, provenancePath, "file");

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const entries = localPM.listPackageCache("cache-provenance-link");
      expect(entries.length).toBe(1);
      expect(entries[0]!.provenanceStatus).toBe("invalid");
      expect(entries[0]!.provenanceIssue).toContain("symbolic link");

      const report = localPM.verifyPackageCache("cache-provenance-link");
      expect(report.ok).toBe(false);
      expect(report.issues[0]).toMatchObject({
        kind: "invalid-provenance",
        provenancePath,
      });

      const repair = localPM.repairPackageCache("cache-provenance-link");
      expect(repair.repaired).toEqual([]);
      expect(repair.issues[0]).toMatchObject({
        kind: "invalid-provenance",
        provenancePath,
      });
      expect(fs.readFileSync(outsideProvenancePath, "utf-8")).toBe(
        '{"outside":true}',
      );

      const clean = localPM.cleanPackageCache({
        packageName: "cache-provenance-link",
      });
      expect(clean.removed.length).toBe(1);
      expect(fs.existsSync(cachePath)).toBe(false);
      expect(fs.existsSync(provenancePath)).toBe(false);
      expect(fs.existsSync(outsideProvenancePath)).toBe(true);
    });

    test("should clean broken symlink package cache provenance", () => {
      const globalPackageDir = path.join(tempDir, "cache-broken-provenance-link");
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-broken-provenance-link",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      const provenancePath = `${cachePath}.bplmeta.json`;
      fs.unlinkSync(provenancePath);
      fs.symlinkSync(
        path.join(tempDir, "missing-cache-provenance.json"),
        provenancePath,
        "file",
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const entries = localPM.listPackageCache("cache-broken-provenance-link");
      expect(entries.length).toBe(1);
      expect(entries[0]!.provenanceStatus).toBe("invalid");
      expect(entries[0]!.provenanceIssue).toContain("symbolic link");

      const clean = localPM.cleanPackageCache({
        packageName: "cache-broken-provenance-link",
      });

      expect(clean.removed.length).toBe(1);
      expect(fs.existsSync(cachePath)).toBe(false);
      expect(() => fs.lstatSync(provenancePath)).toThrow();
    });

    test("should verify package cache provenance and report tampered archives", () => {
      const globalPackageDir = path.join(tempDir, "cache-verify-packages");
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-provenance",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const entries = localPM.listPackageCache("cache-provenance");
      expect(entries.length).toBe(1);
      expect(entries[0]!.provenanceStatus).toBe("verified");
      expect(entries[0]!.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entries[0]!.packageHash).toMatch(/^[a-f0-9]{64}$/);

      const okReport = localPM.verifyPackageCache("cache-provenance");
      expect(okReport.ok).toBe(true);
      expect(okReport.entriesChecked).toBe(1);
      expect(okReport.issues).toEqual([]);

      fs.appendFileSync(cachePath, "tamper");

      const tamperedReport = localPM.verifyPackageCache("cache-provenance");
      expect(tamperedReport.ok).toBe(false);
      expect(tamperedReport.issues.map((issue) => issue.kind)).toContain(
        "archive-hash-mismatch",
      );
    });

    test("should report cached package archives with invalid exports", () => {
      const globalPackageDir = path.join(tempDir, "cache-export-packages");
      fs.mkdirSync(globalPackageDir);

      const createInvalidExportArchive = (
        packageName: string,
        setupExportPath: (packageRoot: string) => void,
      ) => {
        const sourceDir = path.join(tempDir, `${packageName}-source`);
        const packageRoot = path.join(sourceDir, "package");
        const cachePath = path.join(globalPackageDir, `${packageName}-1.0.0.tgz`);
        fs.mkdirSync(packageRoot, { recursive: true });
        fs.writeFileSync(
          path.join(packageRoot, "bpl.json"),
          JSON.stringify(
            {
              name: packageName,
              version: "1.0.0",
              main: "index.bpl",
              exports: ["features/public.bpl"],
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export root;");
        setupExportPath(packageRoot);

        const packResult = spawnSync(
          "tar",
          ["-czf", cachePath, "-C", sourceDir, "package"],
          { encoding: "utf-8" },
        );
        expect(packResult.status).toBe(0);

        const localPM = new PackageManager(tempDir);
        localPM["writeArchiveProvenance"](
          cachePath,
          packageRoot,
          JSON.parse(
            fs.readFileSync(path.join(packageRoot, "bpl.json"), "utf-8"),
          ),
        );
      };

      createInvalidExportArchive("cache-export-missing", (packageRoot) => {
        fs.mkdirSync(path.join(packageRoot, "features"));
      });
      createInvalidExportArchive("cache-export-directory", (packageRoot) => {
        fs.mkdirSync(path.join(packageRoot, "features", "public.bpl"), {
          recursive: true,
        });
      });

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const report = localPM.verifyPackageCache();

      expect(report.ok).toBe(false);
      expect(report.entriesChecked).toBe(2);
      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            packageName: "cache-export-directory",
            kind: "invalid-archive",
            message: expect.stringContaining(
              "Unsupported package export entry: features/public.bpl",
            ),
          }),
          expect.objectContaining({
            packageName: "cache-export-missing",
            kind: "invalid-archive",
            message: expect.stringContaining(
              "Missing package export entry: features/public.bpl",
            ),
          }),
        ]),
      );
    });

    test("should report cached package archives with invalid bin files", () => {
      const globalPackageDir = path.join(tempDir, "cache-bin-packages");
      const sourceDir = path.join(tempDir, "cache-bin-source");
      const packageRoot = path.join(sourceDir, "package");
      const cachePath = path.join(globalPackageDir, "cache-bin-1.0.0.tgz");
      fs.mkdirSync(path.join(packageRoot, "bin"), { recursive: true });
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          {
            name: "cache-bin",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              broken: "bin/missing.bpl",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export root;");

      const packResult = spawnSync(
        "tar",
        ["-czf", cachePath, "-C", sourceDir, "package"],
        { encoding: "utf-8" },
      );
      expect(packResult.status).toBe(0);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM["writeArchiveProvenance"](
        cachePath,
        packageRoot,
        JSON.parse(fs.readFileSync(path.join(packageRoot, "bpl.json"), "utf-8")),
      );

      const report = localPM.verifyPackageCache("cache-bin");

      expect(report.ok).toBe(false);
      expect(report.entriesChecked).toBe(1);
      expect(report.issues).toEqual([
        expect.objectContaining({
          packageName: "cache-bin",
          kind: "invalid-archive",
          message: expect.stringContaining(
            "Missing package bin entry: bin/missing.bpl",
          ),
        }),
      ]);
    });

    test("should use the configured archive tool while verifying package cache entries", () => {
      const globalPackageDir = path.join(tempDir, "cache-tar-tool-packages");
      fs.mkdirSync(globalPackageDir);

      createCachedPackage(
        "cache-tar-tool",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );

      const { fakeTar, logPath } = createTarProxy("cache-tar-tool");

      const originalBplTar = process.env.BPL_TAR;
      process.env.BPL_TAR = fakeTar;

      try {
        const localPM = new PackageManager(tempDir);
        localPM["globalPackageDir"] = globalPackageDir;

        const report = localPM.verifyPackageCache("cache-tar-tool");

        expect(report.ok).toBe(true);
        const invocations = fs.readFileSync(logPath, "utf-8").trim().split("\n");
        expect(invocations.some((line) => line.startsWith("-tzf "))).toBe(true);
        expect(invocations.some((line) => line.startsWith("-xzf "))).toBe(true);
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }
      }
    });

    test("should use the configured archive tool while repairing package cache provenance", () => {
      const globalPackageDir = path.join(
        tempDir,
        "cache-repair-tar-tool-packages",
      );
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-repair-tar-tool",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      fs.unlinkSync(`${cachePath}.bplmeta.json`);

      const { fakeTar, logPath } = createTarProxy("cache-repair-tar-tool");

      const originalBplTar = process.env.BPL_TAR;
      process.env.BPL_TAR = fakeTar;

      try {
        const localPM = new PackageManager(tempDir);
        localPM["globalPackageDir"] = globalPackageDir;

        const repair = localPM.repairPackageCache("cache-repair-tar-tool");

        expect(repair.repaired.length).toBe(1);
        expect(repair.issues).toEqual([]);
        expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(true);
        const invocations = fs.readFileSync(logPath, "utf-8").trim().split("\n");
        expect(invocations.some((line) => line.startsWith("-tzf "))).toBe(true);
        expect(invocations.some((line) => line.startsWith("-xzf "))).toBe(true);
      } finally {
        if (originalBplTar === undefined) {
          delete process.env.BPL_TAR;
        } else {
          process.env.BPL_TAR = originalBplTar;
        }
      }
    });

    test("should refuse package cache repair for archives with invalid exports", () => {
      const globalPackageDir = path.join(tempDir, "cache-repair-export-packages");
      const sourceDir = path.join(tempDir, "cache-repair-export-source");
      const packageRoot = path.join(sourceDir, "package");
      const cachePath = path.join(globalPackageDir, "cache-repair-export-1.0.0.tgz");
      fs.mkdirSync(path.join(packageRoot, "features"), { recursive: true });
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          {
            name: "cache-repair-export",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export root;");

      const packResult = spawnSync(
        "tar",
        ["-czf", cachePath, "-C", sourceDir, "package"],
        { encoding: "utf-8" },
      );
      expect(packResult.status).toBe(0);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const repair = localPM.repairPackageCache("cache-repair-export");

      expect(repair.success).toBe(false);
      expect(repair.repaired).toEqual([]);
      expect(repair.issues).toEqual([
        expect.objectContaining({
          packageName: "cache-repair-export",
          kind: "invalid-archive",
          message: expect.stringContaining(
            "Missing package export entry: features/public.bpl",
          ),
        }),
      ]);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(false);
    });

    test("should refuse package cache repair for archives with invalid bin files", () => {
      const globalPackageDir = path.join(tempDir, "cache-repair-bin-packages");
      const sourceDir = path.join(tempDir, "cache-repair-bin-source");
      const packageRoot = path.join(sourceDir, "package");
      const cachePath = path.join(globalPackageDir, "cache-repair-bin-1.0.0.tgz");
      fs.mkdirSync(path.join(packageRoot, "bin"), { recursive: true });
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          {
            name: "cache-repair-bin",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              broken: "bin/missing.bpl",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export root;");

      const packResult = spawnSync(
        "tar",
        ["-czf", cachePath, "-C", sourceDir, "package"],
        { encoding: "utf-8" },
      );
      expect(packResult.status).toBe(0);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const repair = localPM.repairPackageCache("cache-repair-bin");

      expect(repair.success).toBe(false);
      expect(repair.repaired).toEqual([]);
      expect(repair.issues).toEqual([
        expect.objectContaining({
          packageName: "cache-repair-bin",
          kind: "invalid-archive",
          message: expect.stringContaining(
            "Missing package bin entry: bin/missing.bpl",
          ),
        }),
      ]);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(false);
    });

    test("should repair missing package cache provenance for valid archives", () => {
      const globalPackageDir = path.join(tempDir, "cache-repair-packages");
      fs.mkdirSync(globalPackageDir);

      const cachePath = createCachedPackage(
        "cache-repair",
        "1.0.0",
        "export value;",
        globalPackageDir,
      );
      fs.unlinkSync(`${cachePath}.bplmeta.json`);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const dryRun = localPM.repairPackageCache("cache-repair", {
        dryRun: true,
      });
      expect(dryRun.dryRun).toBe(true);
      expect(dryRun.repaired.length).toBe(1);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(false);

      const repair = localPM.repairPackageCache("cache-repair");
      expect(repair.dryRun).toBe(false);
      expect(repair.repaired.length).toBe(1);
      expect(repair.issues).toEqual([]);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(true);

      const report = localPM.verifyPackageCache("cache-repair");
      expect(report.ok).toBe(true);
    });

    test("should repair and verify cached archives with exported non-bpl files", () => {
      const packageDir = path.join(tempDir, "cache-export-valid-source");
      const globalPackageDir = path.join(tempDir, "cache-export-valid-packages");
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cache-export-valid",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/native.x"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(packageDir, "features", "native.x"),
        "extern nativeFeature;",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const cachePath = path.join(globalPackageDir, path.basename(tarballPath));
      fs.copyFileSync(tarballPath, cachePath);

      const localPM = new PackageManager(tempDir);
      localPM["globalPackageDir"] = globalPackageDir;

      const repair = localPM.repairPackageCache("cache-export-valid");
      expect(repair.success).toBe(true);
      expect(repair.repaired.length).toBe(1);
      expect(fs.existsSync(`${cachePath}.bplmeta.json`)).toBe(true);

      const report = localPM.verifyPackageCache("cache-export-valid");
      expect(report.ok).toBe(true);
      expect(report.issues).toEqual([]);
    });

    test("should report package doctor issues for missing lockfiles and duplicate installed names", () => {
      const appDir = path.join(tempDir, "doctor-app");
      const firstDir = path.join(appDir, "bpl_modules", "doctor-one");
      const secondDir = path.join(appDir, "bpl_modules", "doctor-two");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-app",
            version: "1.0.0",
            dependencies: {
              "doctor-dep": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      for (const packageDir of [firstDir, secondDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            { name: "doctor-shared", version: "1.0.0", main: "index.bpl" },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const report = new PackageManager(appDir).doctorPackages();
      expect(report.ok).toBe(false);
      expect(report.issues.map((issue) => issue.kind)).toEqual(
        expect.arrayContaining([
          "missing-lockfile",
          "package-name-mismatch",
          "duplicate-installed-package",
        ]),
      );
    });

    test("should report duplicate installed package doctor paths deterministically", () => {
      const appDir = path.join(tempDir, "doctor-duplicate-order-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const firstDir = path.join(packageRoot, "aaa-doctor-duplicate");
      const secondDir = path.join(packageRoot, "zzz-doctor-duplicate");
      fs.mkdirSync(firstDir, { recursive: true });
      fs.mkdirSync(secondDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-duplicate-order-app", version: "1.0.0" }),
      );

      for (const packageDir of [firstDir, secondDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "doctor-duplicate-order",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = spyOn(fs, "readdirSync").mockImplementation(
        ((dirPath: fs.PathLike, options?: Parameters<typeof fs.readdirSync>[1]) => {
          if (path.resolve(String(dirPath)) === path.resolve(packageRoot)) {
            return ["zzz-doctor-duplicate", "aaa-doctor-duplicate"];
          }
          return originalReaddirSync(dirPath, options as never) as never;
        }) as typeof fs.readdirSync,
      );

      let report: ReturnType<PackageManager["doctorPackages"]>;
      try {
        report = new PackageManager(appDir).doctorPackages();
      } finally {
        readdirSpy.mockRestore();
      }

      const duplicateIssue = report.issues.find(
        (issue) => issue.kind === "duplicate-installed-package",
      );
      expect(
        duplicateIssue?.path
          ?.split(", ")
          .map((entry) => path.basename(entry)),
      ).toEqual(["aaa-doctor-duplicate", "zzz-doctor-duplicate"]);
      expect(duplicateIssue?.paths?.map((entry) => path.basename(entry))).toEqual(
        ["aaa-doctor-duplicate", "zzz-doctor-duplicate"],
      );
    });

    test("should report invalid project package exports during doctor checks", () => {
      const cases = [
        {
          packageName: "doctor-project-export-missing",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "features"));
          },
          expected: "Missing package export entry: features/public.bpl",
        },
        {
          packageName: "doctor-project-export-directory",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "features", "public.bpl"), {
              recursive: true,
            });
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
        {
          packageName: "doctor-project-export-symlink",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "features"));
            fs.writeFileSync(
              path.join(appDir, "features", "actual.bpl"),
              "export actual;",
            );
            fs.symlinkSync(
              "actual.bpl",
              path.join(appDir, "features", "public.bpl"),
            );
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
      ] as const;

      for (const testCase of cases) {
        const appDir = path.join(tempDir, `${testCase.packageName}-app`);
        fs.mkdirSync(appDir);
        fs.writeFileSync(
          path.join(appDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              exports: ["features/public.bpl"],
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(appDir, "index.bpl"), "export root;");
        testCase.setup(appDir);

        const report = new PackageManager(appDir).doctorPackages();
        const projectIssue = report.issues.find(
          (issue) => issue.kind === "invalid-project-package",
        );

        expect(report.ok).toBe(false);
        expect(projectIssue).toMatchObject({
          severity: "error",
          kind: "invalid-project-package",
          packageName: testCase.packageName,
          version: "1.0.0",
          path: path.join(appDir, "bpl.json"),
          message: expect.stringContaining(testCase.expected),
          hint: expect.stringContaining("Fix exported project files"),
        });
      }
    });

    test("should report invalid project package bin files during doctor checks", () => {
      const cases = [
        {
          packageName: "doctor-project-bin-missing",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "bin"));
          },
          expected: "Missing package bin entry: bin/tool.sh",
        },
        {
          packageName: "doctor-project-bin-directory",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "bin", "tool.sh"), {
              recursive: true,
            });
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
        {
          packageName: "doctor-project-bin-symlink",
          setup(appDir: string) {
            fs.mkdirSync(path.join(appDir, "bin"));
            fs.writeFileSync(
              path.join(appDir, "bin", "actual.sh"),
              "#!/usr/bin/env sh\necho tool\n",
            );
            fs.symlinkSync("actual.sh", path.join(appDir, "bin", "tool.sh"));
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
      ] as const;

      for (const testCase of cases) {
        const appDir = path.join(tempDir, `${testCase.packageName}-app`);
        fs.mkdirSync(appDir);
        fs.writeFileSync(
          path.join(appDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              bin: { tool: "bin/tool.sh" },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(appDir, "index.bpl"), "export root;");
        testCase.setup(appDir);

        const report = new PackageManager(appDir).doctorPackages();
        const projectIssue = report.issues.find(
          (issue) => issue.kind === "invalid-project-package",
        );

        expect(report.ok).toBe(false);
        expect(projectIssue).toMatchObject({
          severity: "error",
          kind: "invalid-project-package",
          packageName: testCase.packageName,
          version: "1.0.0",
          path: path.join(appDir, "bpl.json"),
          message: expect.stringContaining(testCase.expected),
          hint: expect.stringContaining("Fix package bin files"),
        });
      }
    });

    test("should report invalid installed package exports during doctor checks", () => {
      const appDir = path.join(tempDir, "doctor-export-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const cases = [
        {
          packageName: "doctor-export-missing",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features"));
          },
          expected: "Missing package export entry: features/public.bpl",
        },
        {
          packageName: "doctor-export-directory",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features", "public.bpl"), {
              recursive: true,
            });
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
        {
          packageName: "doctor-export-symlink",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features"));
            fs.writeFileSync(
              path.join(packageDir, "features", "actual.bpl"),
              "export actual;",
            );
            fs.symlinkSync(
              "actual.bpl",
              path.join(packageDir, "features", "public.bpl"),
            );
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
      ] as const;

      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-export-app", version: "1.0.0" }, null, 2),
      );

      for (const testCase of cases) {
        const packageDir = path.join(packageRoot, testCase.packageName);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              exports: ["features/public.bpl"],
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        testCase.setup(packageDir);
      }

      const report = new PackageManager(appDir).doctorPackages();

      expect(report.ok).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining(
          cases.map((testCase) =>
            expect.objectContaining({
              severity: "error",
              kind: "invalid-installed-package",
              packageName: testCase.packageName,
              version: "1.0.0",
              path: path.join(packageRoot, testCase.packageName),
              message: expect.stringContaining(testCase.expected),
              hint: expect.stringContaining("reinstall"),
            }),
          ),
        ),
      );
    });

    test("should report invalid installed package bin files during doctor checks", () => {
      const appDir = path.join(tempDir, "doctor-bin-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const cases = [
        {
          packageName: "doctor-bin-missing",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin"));
          },
          expected: "Missing package bin entry: bin/tool.sh",
        },
        {
          packageName: "doctor-bin-directory",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin", "tool.sh"), {
              recursive: true,
            });
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
        {
          packageName: "doctor-bin-symlink",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin"));
            fs.writeFileSync(
              path.join(packageDir, "bin", "actual.sh"),
              "#!/usr/bin/env sh\necho tool\n",
            );
            fs.symlinkSync(
              "actual.sh",
              path.join(packageDir, "bin", "tool.sh"),
            );
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
      ] as const;

      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-bin-app", version: "1.0.0" }, null, 2),
      );

      for (const testCase of cases) {
        const packageDir = path.join(packageRoot, testCase.packageName);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              bin: { tool: "bin/tool.sh" },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        testCase.setup(packageDir);
      }

      const report = new PackageManager(appDir).doctorPackages();

      expect(report.ok).toBe(false);
      expect(report.issues).toEqual(
        expect.arrayContaining(
          cases.map((testCase) =>
            expect.objectContaining({
              severity: "error",
              kind: "invalid-installed-package",
              packageName: testCase.packageName,
              version: "1.0.0",
              path: path.join(packageRoot, testCase.packageName),
              message: expect.stringContaining(testCase.expected),
              hint: expect.stringContaining("reinstall"),
            }),
          ),
        ),
      );
    });

    test("should keep valid installed package exports clean during doctor checks", () => {
      const appDir = path.join(tempDir, "doctor-export-valid-app");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "doctor-export-valid",
      );

      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "doctor-export-valid-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-export-valid",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl", "features/native.x"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(packageDir, "features", "public.bpl"),
        "export publicFeature;",
      );
      fs.writeFileSync(
        path.join(packageDir, "features", "native.x"),
        "extern nativeFeature;",
      );

      const report = new PackageManager(appDir).doctorPackages();

      expect(report.ok).toBe(true);
      expect(report.issues).not.toContainEqual(
        expect.objectContaining({ kind: "invalid-installed-package" }),
      );
    });

    test("should ignore symlinked installed package entries during doctor checks", () => {
      const appDir = path.join(tempDir, "doctor-symlink-app");
      const outsidePackageDir = path.join(tempDir, "doctor-outside-package");
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-symlink-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          { name: "outside-doctor-package", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");

      const localPM = new PackageManager(appDir);
      fs.symlinkSync(
        outsidePackageDir,
        path.join(appDir, "bpl_modules", "linked-package"),
      );

      const report = localPM.doctorPackages();
      expect(report.issues).not.toContainEqual(
        expect.objectContaining({ kind: "package-name-mismatch" }),
      );
      expect(report.installedPackages).toEqual([]);
    });

    test("should report symlinked local package directories during doctor checks without following them", () => {
      const appDir = path.join(tempDir, "doctor-swapped-local-package-dir-app");
      const outsidePackageRoot = path.join(
        tempDir,
        "doctor-swapped-package-root",
      );
      const outsidePackageDir = path.join(outsidePackageRoot, "escaped-doctor");
      const localPackageDir = path.join(appDir, "bpl_modules");

      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({
          name: "doctor-swapped-local-package-dir-app",
          version: "1.0.0",
        }),
      );

      const localPM = new PackageManager(appDir);

      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.mkdirSync(outsidePackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          { name: "escaped-doctor", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");
      fs.symlinkSync(outsidePackageRoot, localPackageDir, "dir");

      const report = localPM.doctorPackages();

      expect(report.ok).toBe(false);
      expect(report.installedPackages).toEqual([]);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          kind: "unsafe-package-directory",
          path: localPackageDir,
        }),
      );
    });

    test("should report symlinked global package cache directories during doctor checks without following them", () => {
      const appDir = path.join(tempDir, "doctor-swapped-global-cache-app");
      const globalPackageDir = path.join(tempDir, "doctor-swapped-cache-root");
      const outsideCacheRoot = path.join(tempDir, "doctor-outside-cache-root");

      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(outsideCacheRoot);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({
          name: "doctor-swapped-global-cache-app",
          version: "1.0.0",
        }),
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;

      fs.rmSync(globalPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsideCacheRoot, globalPackageDir, "dir");

      const report = localPM.doctorPackages();

      expect(report.ok).toBe(false);
      expect(report.cacheEntries).toEqual([]);
      expect(report.cacheVerification.ok).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          kind: "unsafe-package-directory",
          path: globalPackageDir,
        }),
      );
    });

    test("should surface package cache provenance issues as doctor warnings", () => {
      const appDir = path.join(tempDir, "doctor-cache-app");
      const globalPackageDir = path.join(tempDir, "doctor-cache-packages");
      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-cache-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(globalPackageDir, "doctor-cache-1.0.0.tgz"),
        "legacy-cache-entry",
      );

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      const report = localPM.doctorPackages();

      expect(report.ok).toBe(true);
      expect(report.cacheVerification.ok).toBe(false);
      expect(report.cacheVerification.entriesChecked).toBe(1);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          kind: "package-cache-missing-provenance",
        }),
      );
    });

    test("should preserve lock verification details in doctor issues", () => {
      const packageDir = path.join(tempDir, "doctor-lock-detail-pkg");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-lock-detail",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export original;");
      const tarballPath = new PackageManager(packageDir).pack(packageDir);

      const appDir = path.join(tempDir, "doctor-lock-detail-app");
      fs.mkdirSync(appDir);
      const localPM = new PackageManager(appDir);
      localPM.install(tarballPath, { global: false, verbose: false });

      fs.writeFileSync(
        path.join(appDir, "bpl_modules", "doctor-lock-detail", "index.bpl"),
        "export tampered;",
      );

      const report = localPM.doctorPackages();
      const driftIssue = report.issues.find(
        (issue) => issue.kind === "hash-mismatch",
      );

      expect(report.ok).toBe(false);
      expect(report.lockfile.verified).toBe(false);
      expect(driftIssue).toMatchObject({
        severity: "error",
        kind: "hash-mismatch",
        code: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        packageName: "doctor-lock-detail",
        source: tarballPath,
        expectedVersion: "1.0.0",
        path: path.join(appDir, "bpl_modules", "doctor-lock-detail"),
      });
      expect(driftIssue?.expectedHash).toEqual(expect.any(String));
      expect(driftIssue?.actualHash).toEqual(expect.any(String));
      expect(driftIssue?.actualHash).not.toBe(driftIssue?.expectedHash);
    });

    test("should report stale lock entries when locked packages are no longer installed", () => {
      const appDir = path.join(tempDir, "doctor-stale-lock-entry-app");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "doctor-stale-lock-entry-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "doctor-stale-lock-entry": {
                version: "1.2.3",
                source: "doctor-stale-lock-entry-1.2.3.tgz",
                hash: "stale-lock-hash",
              },
            },
          },
          null,
          2,
        ),
      );

      const report = new PackageManager(appDir).doctorPackages();
      const staleIssue = report.issues.find(
        (issue) => issue.kind === "stale-lock-entry",
      );

      expect(report.ok).toBe(false);
      expect(report.lockfile).toMatchObject({
        exists: true,
        packages: 1,
        verified: false,
      });
      expect(staleIssue).toMatchObject({
        severity: "error",
        kind: "stale-lock-entry",
        code: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        packageName: "doctor-stale-lock-entry",
        source: "doctor-stale-lock-entry-1.2.3.tgz",
        expectedVersion: "1.2.3",
        expectedHash: "stale-lock-hash",
        path: path.join(appDir, "bpl_modules", "doctor-stale-lock-entry"),
        hint: expect.stringContaining("bpl install"),
        lockVerificationKind: "missing-package",
      });
    });

    test("should report invalid package lockfiles without throwing", () => {
      const appDir = path.join(tempDir, "doctor-invalid-lock-app");
      fs.mkdirSync(appDir);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-invalid-lock-app", version: "1.0.0" }),
      );
      fs.writeFileSync(path.join(appDir, "bpl.lock"), "{ invalid json");

      const report = new PackageManager(appDir).doctorPackages();
      expect(report.ok).toBe(false);
      expect(report.lockfile.exists).toBe(true);
      expect(report.lockfile.verified).toBe(false);
      expect(report.issues.map((issue) => issue.kind)).toContain(
        "invalid-lockfile",
      );
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          kind: "invalid-lockfile",
          code: "BPL_LOCKFILE_INVALID_JSON",
          path: path.join(appDir, "bpl.lock"),
        }),
      );
    });

    test("should report symlinked package lockfiles without throwing", () => {
      const appDir = path.join(tempDir, "doctor-symlink-lock-app");
      const targetLock = path.join(tempDir, "outside-lock.json");
      fs.mkdirSync(appDir);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-symlink-lock-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        targetLock,
        JSON.stringify({ lockfileVersion: 1, packages: {} }),
      );
      fs.symlinkSync(targetLock, path.join(appDir, "bpl.lock"), "file");

      const report = new PackageManager(appDir).doctorPackages();
      expect(report.ok).toBe(false);
      expect(report.lockfile.exists).toBe(true);
      expect(report.lockfile.verified).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          kind: "invalid-lockfile",
          code: "BPL_LOCKFILE_SYMLINK",
          message: expect.stringContaining("symbolic link"),
        }),
      );
    });

    test("should reject malformed package lockfile schema", () => {
      const appDir = path.join(tempDir, "invalid-lock-schema-app");
      fs.mkdirSync(appDir);
      const lockPath = path.join(appDir, "bpl.lock");
      const invalidLocks = [
        {
          code: "BPL_LOCKFILE_UNSUPPORTED_VERSION",
          lock: {
            lockfileVersion: 2,
            packages: {},
          },
        },
        {
          code: "BPL_LOCKFILE_INVALID_PACKAGES",
          lock: {
            lockfileVersion: 1,
            packages: [],
          },
        },
        {
          code: "BPL_LOCKFILE_INVALID_ENTRY_NAME",
          lock: {
            lockfileVersion: 1,
            packages: {
              "Bad_Name": {
                version: "1.0.0",
                source: "bad-name-1.0.0.tgz",
                hash: "abc",
              },
            },
          },
        },
        {
          code: "BPL_LOCKFILE_INVALID_ENTRY_HASH",
          lock: {
            lockfileVersion: 1,
            packages: {
              "missing-hash": {
                version: "1.0.0",
                source: "missing-hash-1.0.0.tgz",
              },
            },
          },
        },
      ];

      for (const { lock, code } of invalidLocks) {
        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

        expect(() => new PackageManager(appDir).loadLockFile()).toThrow(
          /Invalid bpl\.lock/,
        );

        try {
          new PackageManager(appDir).loadLockFile();
          throw new Error("expected lockfile validation to fail");
        } catch (error) {
          expect(error).toBeInstanceOf(CompilerError);
          expect((error as CompilerError).code).toBe(code);
        }
      }
    });

    test("should reject package lockfile paths that are not files", () => {
      const appDir = path.join(tempDir, "invalid-lock-path-app");
      fs.mkdirSync(appDir);
      fs.mkdirSync(path.join(appDir, "bpl.lock"));

      expect(() => new PackageManager(appDir).loadLockFile()).toThrow(
        /Invalid bpl\.lock path/,
      );

      try {
        new PackageManager(appDir).loadLockFile();
        throw new Error("expected lockfile path validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(CompilerError);
        expect((error as CompilerError).code).toBe("BPL_LOCKFILE_NOT_FILE");
      }

      const symlinkAppDir = path.join(tempDir, "invalid-lock-symlink-app");
      const targetLock = path.join(tempDir, "target-lock.json");
      fs.mkdirSync(symlinkAppDir);
      fs.writeFileSync(
        targetLock,
        JSON.stringify({ lockfileVersion: 1, packages: {} }),
      );
      fs.symlinkSync(
        targetLock,
        path.join(symlinkAppDir, "bpl.lock"),
        "file",
      );

      expect(() => new PackageManager(symlinkAppDir).loadLockFile()).toThrow(
        /symbolic link/,
      );

      try {
        new PackageManager(symlinkAppDir).loadLockFile();
        throw new Error("expected lockfile symlink validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(CompilerError);
        expect((error as CompilerError).code).toBe("BPL_LOCKFILE_SYMLINK");
      }
      expect(() =>
        new PackageManager(symlinkAppDir)["saveLockFile"]({
          lockfileVersion: 1,
          packages: {},
        }),
      ).toThrow(/symbolic link/);
      expect(fs.readFileSync(targetLock, "utf8")).toContain(
        '"lockfileVersion":1',
      );
    });

    test("should reject broken symlink lockfiles during locked verification", () => {
      const appDir = path.join(tempDir, "broken-lock-symlink-app");
      const lockPath = path.join(appDir, "bpl.lock");
      const missingTarget = path.join(tempDir, "missing-lock-target.json");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "broken-lock-symlink-app", version: "1.0.0" }),
      );
      fs.symlinkSync(missingTarget, lockPath, "file");

      const localPM = new PackageManager(appDir);
      expect(() => localPM.verifyLockFile()).toThrow(/symbolic link/);
      expect(() =>
        localPM.installProject({ global: false, verbose: false, locked: true }),
      ).toThrow(/symbolic link/);
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

    test("should report invalid installed package exports when listing packages", () => {
      const appDir = path.join(tempDir, "list-export-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const cases = [
        {
          packageName: "list-export-missing",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features"));
          },
          expected: "Missing package export entry: features/public.bpl",
        },
        {
          packageName: "list-export-directory",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features", "public.bpl"), {
              recursive: true,
            });
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
        {
          packageName: "list-export-symlink",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "features"));
            fs.writeFileSync(
              path.join(packageDir, "features", "actual.bpl"),
              "export actual;",
            );
            fs.symlinkSync(
              "actual.bpl",
              path.join(packageDir, "features", "public.bpl"),
            );
          },
          expected: "Unsupported package export entry: features/public.bpl",
        },
      ] as const;

      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "list-export-app", version: "1.0.0" }, null, 2),
      );

      for (const testCase of cases) {
        const packageDir = path.join(packageRoot, testCase.packageName);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              exports: ["features/public.bpl"],
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        testCase.setup(packageDir);
      }

      const validDir = path.join(packageRoot, "list-export-valid");
      fs.mkdirSync(validDir, { recursive: true });
      fs.writeFileSync(
        path.join(validDir, "bpl.json"),
        JSON.stringify(
          {
            name: "list-export-valid",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(validDir, "index.bpl"), "export root;");

      const packages = new PackageManager(appDir).list({ global: false });
      const packageByName = new Map(
        packages.map((pkg) => [pkg.manifest.name, pkg]),
      );

      for (const testCase of cases) {
        expect(packageByName.get(testCase.packageName)?.problems).toEqual([
          expect.stringContaining(`invalid exports: ${testCase.expected}`),
        ]);
      }
      expect(packageByName.get("list-export-valid")?.problems).toEqual([]);
    });

    test("should report invalid installed package bin files when listing packages", () => {
      const appDir = path.join(tempDir, "list-bin-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const cases = [
        {
          packageName: "list-bin-missing",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin"));
          },
          expected: "Missing package bin entry: bin/tool.sh",
        },
        {
          packageName: "list-bin-directory",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin", "tool.sh"), {
              recursive: true,
            });
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
        {
          packageName: "list-bin-symlink",
          setup(packageDir: string) {
            fs.mkdirSync(path.join(packageDir, "bin"));
            fs.writeFileSync(
              path.join(packageDir, "bin", "actual.sh"),
              "#!/usr/bin/env sh\necho tool\n",
            );
            fs.symlinkSync("actual.sh", path.join(packageDir, "bin", "tool.sh"));
          },
          expected: "Unsupported package bin entry: bin/tool.sh",
        },
      ] as const;

      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "list-bin-app", version: "1.0.0" }, null, 2),
      );

      for (const testCase of cases) {
        const packageDir = path.join(packageRoot, testCase.packageName);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: testCase.packageName,
              version: "1.0.0",
              main: "index.bpl",
              bin: { tool: "bin/tool.sh" },
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
        testCase.setup(packageDir);
      }

      const validDir = path.join(packageRoot, "list-bin-valid");
      fs.mkdirSync(path.join(validDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(validDir, "bpl.json"),
        JSON.stringify(
          {
            name: "list-bin-valid",
            version: "1.0.0",
            main: "index.bpl",
            bin: { tool: "bin/tool.sh" },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(validDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(validDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const packages = new PackageManager(appDir).list({ global: false });
      const packageByName = new Map(
        packages.map((pkg) => [pkg.manifest.name, pkg]),
      );

      for (const testCase of cases) {
        expect(packageByName.get(testCase.packageName)?.problems).toEqual([
          expect.stringContaining(`invalid bin: ${testCase.expected}`),
        ]);
      }
      expect(packageByName.get("list-bin-valid")?.problems).toEqual([]);
    });

    test("should list installed packages in deterministic manifest-name order", () => {
      const appDir = path.join(tempDir, "list-order-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      fs.mkdirSync(appDir);

      for (const installed of [
        { directory: "aaa-zeta-list-order", name: "zeta-list-order" },
        { directory: "zzz-alpha-list-order", name: "alpha-list-order" },
      ]) {
        const packageDir = path.join(packageRoot, installed.directory);
        fs.mkdirSync(packageDir, { recursive: true });
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: installed.name,
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const originalReaddirSync = fs.readdirSync;
      const readdirSpy = spyOn(fs, "readdirSync").mockImplementation(
        ((dirPath: fs.PathLike, options?: Parameters<typeof fs.readdirSync>[1]) => {
          if (path.resolve(String(dirPath)) === path.resolve(packageRoot)) {
            return ["aaa-zeta-list-order", "zzz-alpha-list-order"];
          }
          return originalReaddirSync(dirPath, options as never) as never;
        }) as typeof fs.readdirSync,
      );

      let packages: ReturnType<PackageManager["list"]>;
      try {
        packages = new PackageManager(appDir).list({ global: false });
      } finally {
        readdirSpy.mockRestore();
      }

      expect(packages.map((pkg) => pkg.manifest.name)).toEqual([
        "alpha-list-order",
        "zeta-list-order",
      ]);
    });

    test("should return empty list when no packages installed", () => {
      const packages = packageManager.list({ global: false });
      expect(packages.length).toBe(0);
    });

    test("should ignore symlinked entries when listing installed packages", () => {
      const appDir = path.join(tempDir, "list-symlink-app");
      const outsidePackageDir = path.join(tempDir, "outside-list-package");
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageDir);
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          { name: "outside-list-package", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");

      const localPM = new PackageManager(appDir);
      fs.symlinkSync(
        outsidePackageDir,
        path.join(appDir, "bpl_modules", "linked-package"),
      );

      expect(localPM.list({ global: false })).toEqual([]);
    });

    test("should reject symlinked local package directories when listing after construction", () => {
      const appDir = path.join(tempDir, "list-swapped-local-package-dir-app");
      const outsidePackageRoot = path.join(tempDir, "list-swapped-package-root");
      const outsidePackageDir = path.join(outsidePackageRoot, "escaped-list");
      const localPackageDir = path.join(appDir, "bpl_modules");

      fs.mkdirSync(appDir);
      const localPM = new PackageManager(appDir);

      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.mkdirSync(outsidePackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          { name: "escaped-list", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");
      fs.symlinkSync(outsidePackageRoot, localPackageDir, "dir");

      expect(() => localPM.list({ global: false })).toThrow(
        /Local package directory path is a symbolic link/,
      );
    });
  });

  describe("Package Uninstallation", () => {
    function createUninstallArchive(packageName: string): string {
      const packageDir = path.join(tempDir, `${packageName}-source`);
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      return new PackageManager(packageDir).pack(packageDir);
    }

    function createUninstallArchiveWithBin(
      packageName: string,
      commandName = "tool",
    ): string {
      const packageDir = path.join(tempDir, `${packageName}-source`);
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              [commandName]: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      return new PackageManager(packageDir).pack(packageDir);
    }

    function writeInstalledPackage(rootDir: string, packageName: string): string {
      const packagePath = path.join(rootDir, packageName);
      fs.mkdirSync(packagePath, { recursive: true });
      fs.writeFileSync(
        path.join(packagePath, "bpl.json"),
        JSON.stringify(
          {
            name: packageName,
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packagePath, "index.bpl"), "export test;");
      return packagePath;
    }

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

    test("should uninstall a globally installed package", () => {
      const tarballPath = createUninstallArchive("global-uninstall-test-pkg");
      const installDir = path.join(tempDir, "global-uninstall-test");
      const globalPackageDir = path.join(tempDir, "global-uninstall-packages");
      fs.mkdirSync(installDir);
      fs.mkdirSync(globalPackageDir);

      const localPM = new PackageManager(installDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM.install(tarballPath, { global: true, verbose: false });

      const packagePath = path.join(
        globalPackageDir,
        "global-uninstall-test-pkg",
      );
      expect(fs.existsSync(packagePath)).toBe(true);

      localPM.uninstall("global-uninstall-test-pkg", { global: true });
      expect(fs.existsSync(packagePath)).toBe(false);
    });

    test("should reject swapped local package roots that become symlinks before uninstall", () => {
      const appDir = path.join(tempDir, "swapped-local-uninstall-app");
      const outsidePackageRoot = path.join(
        tempDir,
        "outside-local-uninstall-root",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsidePackageRoot);

      const localPM = new PackageManager(appDir);
      const localPackageDir = path.join(appDir, "bpl_modules");
      const outsidePackagePath = writeInstalledPackage(
        outsidePackageRoot,
        "swapped-local-uninstall",
      );
      fs.rmSync(localPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsidePackageRoot, localPackageDir, "dir");

      expect(() =>
        localPM.uninstall("swapped-local-uninstall", { global: false }),
      ).toThrow(/Local package directory path is a symbolic link/);
      expect(fs.lstatSync(localPackageDir).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(outsidePackagePath, "bpl.json"))).toBe(
        true,
      );
    });

    test("should reject swapped global package roots that become symlinks before uninstall", () => {
      const appDir = path.join(tempDir, "swapped-global-uninstall-app");
      const globalPackageDir = path.join(
        tempDir,
        "swapped-global-uninstall-packages",
      );
      const outsidePackageRoot = path.join(
        tempDir,
        "outside-global-uninstall-root",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(outsidePackageRoot);

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      const outsidePackagePath = writeInstalledPackage(
        outsidePackageRoot,
        "swapped-global-uninstall",
      );
      fs.rmSync(globalPackageDir, { recursive: true, force: true });
      fs.symlinkSync(outsidePackageRoot, globalPackageDir, "dir");

      expect(() =>
        localPM.uninstall("swapped-global-uninstall", { global: true }),
      ).toThrow(/Global package directory path is a symbolic link/);
      expect(fs.lstatSync(globalPackageDir).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(outsidePackagePath, "bpl.json"))).toBe(
        true,
      );
    });

    test("should reject swapped local binary directories that become symlinks before uninstall", () => {
      const tarballPath = createUninstallArchiveWithBin(
        "swapped-local-bin-uninstall",
        "local-tool",
      );
      const appDir = path.join(tempDir, "swapped-local-bin-uninstall-app");
      const outsideBinDir = path.join(tempDir, "outside-local-bin-dir");
      fs.mkdirSync(appDir);
      fs.mkdirSync(outsideBinDir);

      const localPM = new PackageManager(appDir);
      localPM.install(tarballPath, { global: false, verbose: false });

      const packagePath = path.join(
        appDir,
        "bpl_modules",
        "swapped-local-bin-uninstall",
      );
      const localBinDir = path.join(appDir, "bpl_modules", ".bin");
      const outsideTool = path.join(outsideBinDir, "local-tool");
      fs.rmSync(localBinDir, { recursive: true, force: true });
      fs.symlinkSync(path.join(packagePath, "bin", "tool.sh"), outsideTool);
      fs.symlinkSync(outsideBinDir, localBinDir, "dir");

      expect(() =>
        localPM.uninstall("swapped-local-bin-uninstall", { global: false }),
      ).toThrow(/Local binary directory path is a symbolic link/);
      expect(fs.lstatSync(localBinDir).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(outsideTool).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    test("should reject swapped global binary directories that become symlinks before uninstall", () => {
      const tarballPath = createUninstallArchiveWithBin(
        "swapped-global-bin-uninstall",
        "global-tool",
      );
      const appDir = path.join(tempDir, "swapped-global-bin-uninstall-app");
      const globalPackageDir = path.join(
        tempDir,
        "swapped-global-bin-packages",
      );
      const globalBinDir = path.join(tempDir, "swapped-global-bin");
      const outsideBinDir = path.join(tempDir, "outside-global-bin-dir");
      fs.mkdirSync(appDir);
      fs.mkdirSync(globalPackageDir);
      fs.mkdirSync(globalBinDir);
      fs.mkdirSync(outsideBinDir);

      const localPM = new PackageManager(appDir);
      localPM["globalPackageDir"] = globalPackageDir;
      localPM["globalBinDir"] = globalBinDir;
      localPM.install(tarballPath, { global: true, verbose: false });

      const packagePath = path.join(
        globalPackageDir,
        "swapped-global-bin-uninstall",
      );
      const outsideTool = path.join(outsideBinDir, "global-tool");
      fs.rmSync(globalBinDir, { recursive: true, force: true });
      fs.symlinkSync(path.join(packagePath, "bin", "tool.sh"), outsideTool);
      fs.symlinkSync(outsideBinDir, globalBinDir, "dir");

      expect(() =>
        localPM.uninstall("swapped-global-bin-uninstall", { global: true }),
      ).toThrow(/Global binary directory path is a symbolic link/);
      expect(fs.lstatSync(globalBinDir).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(outsideTool).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(packagePath)).toBe(true);
    });

    test("should tolerate missing binary directories during uninstall", () => {
      const tarballPath = createUninstallArchiveWithBin(
        "missing-bin-dir-uninstall",
      );
      const appDir = path.join(tempDir, "missing-bin-dir-uninstall-app");
      fs.mkdirSync(appDir);

      const localPM = new PackageManager(appDir);
      localPM.install(tarballPath, { global: false, verbose: false });

      const packagePath = path.join(
        appDir,
        "bpl_modules",
        "missing-bin-dir-uninstall",
      );
      fs.rmSync(path.join(appDir, "bpl_modules", ".bin"), {
        recursive: true,
        force: true,
      });

      localPM.uninstall("missing-bin-dir-uninstall", { global: false });
      expect(fs.existsSync(packagePath)).toBe(false);
    });

    test("should reject broken symlink lockfiles before uninstall removes packages", () => {
      const packageDir = path.join(tempDir, "broken-lock-uninstall-pkg-src");
      const appDir = path.join(tempDir, "broken-lock-uninstall-app");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "broken-lock-uninstall-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const localPM = new PackageManager(appDir);
      localPM.install(tarballPath, { global: false, verbose: false });

      const packagePath = path.join(
        appDir,
        "bpl_modules",
        "broken-lock-uninstall-pkg",
      );
      const lockPath = path.join(appDir, "bpl.lock");
      fs.unlinkSync(lockPath);
      fs.symlinkSync(path.join(tempDir, "missing-uninstall-lock.json"), lockPath);

      expect(() =>
        localPM.uninstall("broken-lock-uninstall-pkg", { global: false }),
      ).toThrow(/symbolic link/);
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.lstatSync(lockPath).isSymbolicLink()).toBe(true);
    });

    test("should throw error when uninstalling non-existent package", () => {
      expect(() => {
        packageManager.uninstall("non-existent-pkg", { global: false });
      }).toThrow(/not installed/);
    });

    test("should reject invalid package names during uninstall", () => {
      const outsideDir = path.join(tempDir, "outside-package");
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(
        path.join(outsideDir, "bpl.json"),
        JSON.stringify({ name: "outside-package", version: "1.0.0" }, null, 2),
      );

      expect(() => {
        packageManager.uninstall("../outside-package", { global: false });
      }).toThrow(/Invalid package name/);
      expect(fs.existsSync(outsideDir)).toBe(true);
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

    test("should reject broken symlink package manifests during uninstall", () => {
      const packagePath = path.join(
        tempDir,
        "bpl_modules",
        "broken-manifest-pkg",
      );
      const manifestPath = path.join(packagePath, "bpl.json");
      fs.mkdirSync(packagePath, { recursive: true });
      fs.symlinkSync(path.join(tempDir, "missing-bpl.json"), manifestPath);

      expect(() => {
        packageManager.uninstall("broken-manifest-pkg", { global: false });
      }).toThrow(/Invalid package manifest path: symbolic link/);
      expect(fs.lstatSync(manifestPath).isSymbolicLink()).toBe(true);
    });

    test("should reject symlinked package roots during uninstall", () => {
      const outsidePackageDir = path.join(tempDir, "outside-uninstall-package");
      const packagePath = path.join(tempDir, "bpl_modules", "linked-pkg");
      fs.mkdirSync(outsidePackageDir);
      fs.writeFileSync(
        path.join(outsidePackageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "linked-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export x;");
      fs.symlinkSync(outsidePackageDir, packagePath, "dir");

      expect(() => {
        packageManager.uninstall("linked-pkg", { global: false });
      }).toThrow(/Package root is a symbolic link/);
      expect(fs.lstatSync(packagePath).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(outsidePackageDir, "bpl.json"))).toBe(
        true,
      );
    });

    test("should reject package binary unlink targets that are directories", () => {
      const packageDir = path.join(tempDir, "uninstall-bin-package");
      const installDir = path.join(tempDir, "uninstall-bin-install");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "uninstall-bin-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const localPM = new PackageManager(installDir);
      localPM.install(tarballPath, { global: false, verbose: false });
      const targetPath = path.join(installDir, "bpl_modules", ".bin", "tool");
      fs.rmSync(targetPath, { force: true });
      fs.mkdirSync(targetPath, { recursive: true });

      expect(() =>
        localPM.uninstall("uninstall-bin-package", { global: false }),
      ).toThrow(/Cannot unlink package binary 'tool'/);
      expect(
        fs.existsSync(
          path.join(installDir, "bpl_modules", "uninstall-bin-package"),
        ),
      ).toBe(true);
    });

    test("should reject package binary unlink targets that are regular files", () => {
      const packageDir = path.join(tempDir, "uninstall-bin-file-package");
      const installDir = path.join(tempDir, "uninstall-bin-file-install");
      fs.mkdirSync(path.join(packageDir, "bin"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "uninstall-bin-file-package",
            version: "1.0.0",
            main: "index.bpl",
            bin: {
              tool: "bin/tool.sh",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");
      fs.writeFileSync(
        path.join(packageDir, "bin", "tool.sh"),
        "#!/usr/bin/env sh\necho tool\n",
      );

      const tarballPath = new PackageManager(packageDir).pack(packageDir);
      const localPM = new PackageManager(installDir);
      localPM.install(tarballPath, { global: false, verbose: false });
      const targetPath = path.join(installDir, "bpl_modules", ".bin", "tool");
      fs.unlinkSync(targetPath);
      fs.writeFileSync(targetPath, "user-owned command");

      expect(() =>
        localPM.uninstall("uninstall-bin-file-package", { global: false }),
      ).toThrow(/Cannot unlink package binary 'tool'/);
      expect(fs.readFileSync(targetPath, "utf-8")).toBe("user-owned command");
      expect(
        fs.existsSync(
          path.join(installDir, "bpl_modules", "uninstall-bin-file-package"),
        ),
      ).toBe(true);
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

    test("should reject invalid package names", () => {
      const invalidNames = ["Bad_Name", "../escape", "with/slash", "space name"];

      invalidNames.forEach((name) => {
        const manifest = {
          name,
          version: "1.0.0",
        };

        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          /Invalid package name/,
        );
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

    test("should reject malformed manifest metadata fields", () => {
      const manifests = [
        ["[]", /Invalid package manifest/],
        [
          JSON.stringify({ name: 123, version: "1.0.0" }, null, 2),
          /Invalid package manifest 'name' field/,
        ],
        [
          JSON.stringify({ name: "bad-version-type", version: 1 }, null, 2),
          /Invalid package manifest 'version' field/,
        ],
        [
          JSON.stringify(
            {
              name: "bad-schema-uri",
              version: "1.0.0",
              $schema: 1,
            },
            null,
            2,
          ),
          /Invalid package manifest '\$schema' field/,
        ],
        [
          JSON.stringify(
            {
              name: "unsafe-main",
              version: "1.0.0",
              main: "../index.bpl",
            },
            null,
            2,
          ),
          /Invalid package manifest 'main' field/,
        ],
        [
          JSON.stringify(
            {
              name: "unsafe-entry",
              version: "1.0.0",
              entry: "src//index.bpl",
            },
            null,
            2,
          ),
          /Invalid package manifest 'entry' field/,
        ],
        [
          JSON.stringify(
            {
              name: "non-string-entry",
              version: "1.0.0",
              entry: ["index.bpl"],
            },
            null,
            2,
          ),
          /Invalid package manifest 'entry' field/,
        ],
        [
          JSON.stringify(
            {
              name: "bad-exports",
              version: "1.0.0",
              exports: ["src/index.bpl", "../secret.bpl"],
            },
            null,
            2,
          ),
          /Invalid package manifest 'exports' field/,
        ],
        [
          JSON.stringify(
            {
              name: "bad-keywords",
              version: "1.0.0",
              keywords: ["good", 99],
            },
            null,
            2,
          ),
          /Invalid package manifest 'keywords' field/,
        ],
      ] as const;

      for (const [content, errorPattern] of manifests) {
        fs.writeFileSync("bpl.json", content);

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          errorPattern,
        );
      }
    });

    test("should reject ambiguous manifest path segments", () => {
      const manifests = [
        {
          manifest: {
            name: "bad-main-empty-segment",
            version: "1.0.0",
            main: "src//index.bpl",
          },
          errorPattern: /Invalid package manifest 'main' field/,
        },
        {
          manifest: {
            name: "bad-main-dot-segment",
            version: "1.0.0",
            main: "src/./index.bpl",
          },
          errorPattern: /Invalid package manifest 'main' field/,
        },
        {
          manifest: {
            name: "bad-exports-empty-segment",
            version: "1.0.0",
            exports: ["src//index.bpl"],
          },
          errorPattern: /Invalid package manifest 'exports' field/,
        },
        {
          manifest: {
            name: "bad-exports-dot-segment",
            version: "1.0.0",
            exports: ["src/./index.bpl"],
          },
          errorPattern: /Invalid package manifest 'exports' field/,
        },
        {
          manifest: {
            name: "bad-bin-empty-segment",
            version: "1.0.0",
            bin: { tool: "bin//tool.bpl" },
          },
          errorPattern: /Invalid 'bin' path/,
        },
        {
          manifest: {
            name: "bad-bin-dot-segment",
            version: "1.0.0",
            bin: { tool: "bin/./tool.bpl" },
          },
          errorPattern: /Invalid 'bin' path/,
        },
      ] as const;

      for (const { manifest, errorPattern } of manifests) {
        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          errorPattern,
        );
      }
    });

    test("should reject package manifest paths that are not files", () => {
      fs.mkdirSync("bpl.json");

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /Invalid package manifest path/,
      );

      fs.rmSync("bpl.json", { recursive: true, force: true });
      const targetManifest = path.join(tempDir, "target-manifest.json");
      fs.writeFileSync(
        targetManifest,
        JSON.stringify({ name: "target-manifest", version: "1.0.0" }),
      );
      fs.symlinkSync(targetManifest, "bpl.json", "file");

      expect(() => packageManager.loadManifest(tempDir)).toThrow(
        /symbolic link/,
      );
    });

    test("should reject invalid package script commands", () => {
      const manifests = [
        {
          name: "script-validation",
          version: "1.0.0",
          scripts: null,
        },
        {
          name: "script-validation",
          version: "1.0.0",
          scripts: {
            bad: ["bpl", "check"],
          },
        },
        {
          name: "script-validation",
          version: "1.0.0",
          scripts: {
            empty: "   ",
          },
        },
      ];

      for (const manifest of manifests) {
        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          /Invalid 'scripts' field/,
        );
      }
    });

    test("should reject invalid package bin maps", () => {
      const manifests = [
        {
          name: "bin-validation",
          version: "1.0.0",
          bin: null,
        },
        {
          name: "bin-validation",
          version: "1.0.0",
          bin: {
            "../tool": "bin/tool.sh",
          },
        },
        {
          name: "bin-validation",
          version: "1.0.0",
          bin: {
            tool: null,
          },
        },
      ];

      for (const manifest of manifests) {
        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          /Invalid 'bin'/,
        );
      }
    });

    test("should reject malformed dependency maps", () => {
      const manifests = [
        {
          name: "dependency-validation",
          version: "1.0.0",
          dependencies: null,
        },
        {
          name: "dependency-validation",
          version: "1.0.0",
          dependencies: ["math-core"],
        },
        {
          name: "dependency-validation",
          version: "1.0.0",
          dependencies: {
            "Bad_Name": "1.0.0",
          },
        },
        {
          name: "dependency-validation",
          version: "1.0.0",
          devDependencies: null,
        },
        {
          name: "dependency-validation",
          version: "1.0.0",
          devDependencies: {
            "test-tools": ["file:../test-tools.tgz"],
          },
        },
        {
          name: "dependency-validation",
          version: "1.0.0",
          dependencies: {
            "math-core": "   ",
          },
        },
      ];

      for (const manifest of manifests) {
        fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));

        expect(() => packageManager.loadManifest(tempDir)).toThrow(
          /Invalid '(dependencies|devDependencies)'/,
        );
      }
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
