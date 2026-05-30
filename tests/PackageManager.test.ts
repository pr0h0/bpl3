import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CompilerError } from "../compiler/common/CompilerError";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";
import { PackageManager } from "../compiler/middleend/PackageManager";
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
          lockfileVersion: 2,
          packages: {},
        },
        {
          lockfileVersion: 1,
          packages: [],
        },
        {
          lockfileVersion: 1,
          packages: {
            "Bad_Name": {
              version: "1.0.0",
              source: "bad-name-1.0.0.tgz",
              hash: "abc",
            },
          },
        },
        {
          lockfileVersion: 1,
          packages: {
            "missing-hash": {
              version: "1.0.0",
              source: "missing-hash-1.0.0.tgz",
            },
          },
        },
      ];

      for (const lock of invalidLocks) {
        fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));

        expect(() => new PackageManager(appDir).loadLockFile()).toThrow(
          /Invalid bpl\.lock/,
        );
      }
    });

    test("should reject package lockfile paths that are not files", () => {
      const appDir = path.join(tempDir, "invalid-lock-path-app");
      fs.mkdirSync(appDir);
      fs.mkdirSync(path.join(appDir, "bpl.lock"));

      expect(() => new PackageManager(appDir).loadLockFile()).toThrow(
        /Invalid bpl\.lock path/,
      );

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

    test("should reject malformed dependency maps", () => {
      const manifests = [
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
