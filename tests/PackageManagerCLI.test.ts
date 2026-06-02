import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  expectJsonStdoutReport,
  parseJsonObjectStdout,
} from "./helpers/cliJson";
import {
  expectPackageManifestConformsToSchema,
  type JsonObject,
} from "./helpers/packageManifestSchema";

describe("Package Manager CLI", () => {
  let tempDir: string;
  let originalCwd: string;
  const bplPath = path.join(__dirname, "..", "index.ts");

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-cli-test-"));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("init command", () => {
    test("should create bpl.json file", () => {
      const result = spawnSync("bun", [bplPath, "init"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(path.join(tempDir, "bpl.json"))).toBe(true);

      const manifest = JSON.parse(fs.readFileSync("bpl.json", "utf-8"));
      expect(manifest.name).toBeTruthy();
      expect(manifest.version).toBe("1.0.0");
      expectPackageManifestConformsToSchema(manifest as JsonObject, "bpl init", {
        requireSchemaUri: true,
      });
    });

    test("should report init success and failures as JSON", () => {
      const projectDir = path.join(tempDir, "init-json-project");
      const existingDir = path.join(tempDir, "init-json-existing");
      fs.mkdirSync(projectDir);
      fs.mkdirSync(existingDir);
      fs.writeFileSync(path.join(existingDir, "bpl.json"), "{}");

      const initResult = spawnSync(
        "bun",
        [bplPath, "init", "init-json-test", "--json"],
        {
          cwd: projectDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const initReport = expectJsonStdoutReport<{
        check: "package-init";
        success: boolean;
        package: string;
        version: string;
        manifestPath: string;
      }>(initResult, {
        status: 0,
        check: "package-init",
        success: true,
      });
      expect(initReport).toMatchObject({
        package: "init-json-test",
        version: "1.0.0",
        manifestPath: path.join(projectDir, "bpl.json"),
      });
      expect(fs.existsSync(path.join(projectDir, "bpl.json"))).toBe(true);
      expectPackageManifestConformsToSchema(
        JSON.parse(
          fs.readFileSync(path.join(projectDir, "bpl.json"), "utf-8"),
        ) as JsonObject,
        "bpl init --json",
        { requireSchemaUri: true },
      );

      const invalidResult = spawnSync(
        "bun",
        [bplPath, "init", "Bad_Name", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const invalidReport = expectJsonStdoutReport<{
        check: "package-init";
        success: boolean;
        package: string;
        manifestPath: string;
        error: string;
        errorCode: string;
      }>(invalidResult, {
        status: 1,
        check: "package-init",
        success: false,
      });
      expect(invalidReport).toMatchObject({
        package: "Bad_Name",
        manifestPath: path.join(tempDir, "bpl.json"),
        error: expect.stringContaining("Invalid package name"),
        errorCode: "BPL_PACKAGE_INIT_NAME_INVALID",
      });

      const existingResult = spawnSync(
        "bun",
        [bplPath, "init", "--json"],
        {
          cwd: existingDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const existingReport = expectJsonStdoutReport<{
        check: "package-init";
        success: boolean;
        package: null;
        manifestPath: string;
        error: string;
        errorCode: string;
      }>(existingResult, {
        status: 1,
        check: "package-init",
        success: false,
      });
      expect(existingReport).toMatchObject({
        package: null,
        manifestPath: path.join(existingDir, "bpl.json"),
        error: expect.stringContaining("already exists"),
        errorCode: "BPL_PACKAGE_INIT_MANIFEST_EXISTS",
      });
    });

    test("should fail if bpl.json already exists", () => {
      fs.writeFileSync("bpl.json", "{}");

      const result = spawnSync("bun", [bplPath, "init"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("already exists");
    });

    test("should reject invalid explicit package names", () => {
      const result = spawnSync("bun", [bplPath, "init", "Bad_Name"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Invalid package name: Bad_Name");
      expect(fs.existsSync(path.join(tempDir, "bpl.json"))).toBe(false);
    });

    test("should normalize the default package name from the directory", () => {
      const projectDir = path.join(tempDir, "My Package_01!");
      fs.mkdirSync(projectDir);

      const result = spawnSync("bun", [bplPath, "init"], {
        cwd: projectDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, "bpl.json"), "utf-8"),
      );
      expect(manifest.name).toBe("my-package-01");
    });
  });

  describe("pack command", () => {
    test("should use the host null device for clang IR verification", () => {
      const packageCommandSource = fs.readFileSync(
        path.join(__dirname, "..", "cli", "commands", "package.ts"),
        "utf-8",
      );

      expect(packageCommandSource).toContain("os.devNull");
      expect(packageCommandSource).not.toContain(
        '"-o",\n                  "/dev/null"',
      );
    });

    test("should create package tarball", () => {
      const manifest = {
        name: "cli-test-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const result = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync("cli-test-pkg-1.0.0.tgz")).toBe(true);
    });

    test("should preserve existing package archive permissions when packing through the CLI", () => {
      if (process.platform === "win32") {
        return;
      }

      const manifest = {
        name: "cli-archive-mode",
        version: "1.0.0",
        main: "index.bpl",
      };
      const archivePath = path.join(tempDir, "cli-archive-mode-1.0.0.tgz");

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export first;");

      const firstPack = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      expect(firstPack.status).toBe(0);
      fs.chmodSync(archivePath, 0o640);

      fs.writeFileSync("index.bpl", "export second;");
      const secondPack = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(secondPack.status).toBe(0);
      expect(fs.statSync(archivePath).mode & 0o777).toBe(0o640);
      expect(fs.existsSync(`${archivePath}.bplmeta.json`)).toBe(true);
    });

    test("should report pack success and failures as JSON", () => {
      const packageDir = path.join(tempDir, "pack-json-package");
      const missingDir = path.join(tempDir, "pack-json-missing");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(missingDir);

      const manifest = {
        name: "pack-json-test",
        version: "1.0.0",
        main: "index.bpl",
      };
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(manifest, null, 2),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");

      const packResult = spawnSync(
        "bun",
        [bplPath, "pack", packageDir, "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const packReport = expectJsonStdoutReport<{
        check: "package-pack";
        success: boolean;
        package: string;
        version: string;
        archivePath: string;
      }>(packResult, {
        status: 0,
        check: "package-pack",
        success: true,
      });
      expect(packReport).toMatchObject({
        package: "pack-json-test",
        version: "1.0.0",
      });
      expect(packReport.archivePath).toEndWith("pack-json-test-1.0.0.tgz");
      expect(fs.existsSync(packReport.archivePath)).toBe(true);

      const missingResult = spawnSync(
        "bun",
        [bplPath, "pack", missingDir, "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const missingReport = expectJsonStdoutReport<{
        check: "package-pack";
        success: boolean;
        packageDir: string;
        outputDir: string;
        error: string;
        errorCode: string;
      }>(missingResult, {
        status: 1,
        check: "package-pack",
        success: false,
      });
      expect(missingReport).toMatchObject({
        packageDir: missingDir,
        outputDir: missingDir,
        error: expect.stringContaining("No bpl.json found"),
        errorCode: "BPL_PACKAGE_MANIFEST_MISSING",
      });
    });

    test("should honor pack output directories", () => {
      const manifest = {
        name: "cli-output-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const outputDir = path.join(tempDir, "dist");

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const result = spawnSync("bun", [bplPath, "pack", "-o", outputDir], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(0);
      expect(
        fs.existsSync(path.join(outputDir, "cli-output-pkg-1.0.0.tgz")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, "cli-output-pkg-1.0.0.tgz")),
      ).toBe(false);
    });

    test("should reject pack output paths whose parent path is a file", () => {
      const manifest = {
        name: "cli-output-parent-pkg",
        version: "1.0.0",
        main: "index.bpl",
      };
      const parentPath = path.join(tempDir, "not-a-dir");
      const outputDir = path.join(parentPath, "packages");

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");
      fs.writeFileSync(parentPath, "not a directory");

      const result = spawnSync("bun", [bplPath, "pack", "-o", outputDir], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Package output parent path is not a directory",
      );
      expect(result.stderr).toContain(parentPath);
      expect(result.stderr).not.toContain("ENOTDIR");
    });

    test("should fail without bpl.json", () => {
      const result = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
    });

    test("should reject invalid package entry paths before verification", () => {
      const dirProject = path.join(tempDir, "dir-entry");
      const linkProject = path.join(tempDir, "link-entry");
      fs.mkdirSync(path.join(dirProject, "src"), { recursive: true });
      fs.mkdirSync(linkProject);

      fs.writeFileSync(
        path.join(dirProject, "bpl.json"),
        JSON.stringify(
          {
            name: "dir-entry-pkg",
            version: "1.0.0",
            main: "src",
          },
          null,
          2,
        ),
      );
      const dirResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: dirProject,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(dirResult.status).toBe(1);
      expect(dirResult.stderr).toContain("Package entry point is not a file");
      expect(dirResult.stderr).not.toContain("EISDIR");

      fs.writeFileSync(
        path.join(linkProject, "bpl.json"),
        JSON.stringify(
          {
            name: "link-entry-pkg",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.symlinkSync(
        path.join(linkProject, "missing.bpl"),
        path.join(linkProject, "index.bpl"),
        "file",
      );
      const linkResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: linkProject,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(linkResult.status).toBe(1);
      expect(linkResult.stderr).toContain(
        "Package entry point is a symbolic link",
      );
      expect(linkResult.stderr).not.toContain("ENOENT");
    });

    test("should reject missing package exports before creating archives", () => {
      const manifest = {
        name: "missing-export-cli",
        version: "1.0.0",
        main: "index.bpl",
        exports: ["features/public.bpl"],
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export root;");

      const result = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Missing package export entry: features/public.bpl",
      );
      expect(result.stderr).not.toContain("ENOENT");
      expect(fs.existsSync("missing-export-cli-1.0.0.tgz")).toBe(false);
    });

    test("should reject ambiguous manifest paths before creating archives", () => {
      const cases = [
        {
          directory: "bad-main-path",
          manifest: {
            name: "bad-main-path",
            version: "1.0.0",
            main: "src//index.bpl",
          },
          expectedDiagnostic: "Invalid package manifest 'main' field",
        },
        {
          directory: "bad-exports-path",
          manifest: {
            name: "bad-exports-path",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["src/./index.bpl"],
          },
          expectedDiagnostic: "Invalid package manifest 'exports' field",
        },
        {
          directory: "bad-bin-path",
          manifest: {
            name: "bad-bin-path",
            version: "1.0.0",
            main: "index.bpl",
            bin: { tool: "bin//tool.bpl" },
          },
          expectedDiagnostic: "Invalid 'bin' path",
        },
      ] as const;

      for (const testCase of cases) {
        const projectDir = path.join(tempDir, testCase.directory);
        fs.mkdirSync(path.join(projectDir, "src"), { recursive: true });
        fs.mkdirSync(path.join(projectDir, "bin"), { recursive: true });
        fs.writeFileSync(
          path.join(projectDir, "bpl.json"),
          JSON.stringify(testCase.manifest, null, 2),
        );
        fs.writeFileSync(path.join(projectDir, "index.bpl"), "export root;");
        fs.writeFileSync(
          path.join(projectDir, "src", "index.bpl"),
          "export nested;",
        );
        fs.writeFileSync(path.join(projectDir, "bin", "tool.bpl"), "export tool;");

        const result = spawnSync("bun", [bplPath, "pack"], {
          cwd: projectDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        });

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(testCase.expectedDiagnostic);
        expect(result.stderr).toContain("without empty, '.', or '..' segments");
        expect(
          fs.existsSync(
            path.join(
              projectDir,
              `${testCase.manifest.name}-${testCase.manifest.version}.tgz`,
            ),
          ),
        ).toBe(false);
      }
    });
  });

  describe("install command", () => {
    test("should install package locally", () => {
      // Create a package
      const packageDir = path.join(tempDir, "package");
      fs.mkdirSync(packageDir);

      const manifest = {
        name: "install-cli-test",
        version: "1.0.0",
      };

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(manifest, null, 2),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      // Pack it
      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const tarballPath = path.join(packageDir, "install-cli-test-1.0.0.tgz");

      // Install it in a different directory
      const projectDir = path.join(tempDir, "project");
      fs.mkdirSync(projectDir);

      const installResult = spawnSync(
        "bun",
        [bplPath, "install", tarballPath],
        {
          cwd: projectDir,
          encoding: "utf-8",
        },
      );

      expect(installResult.status).toBe(0);
      expect(
        fs.existsSync(path.join(projectDir, "bpl_modules", "install-cli-test")),
      ).toBe(true);
    });

    test("should install file-prefixed archive paths through the CLI", () => {
      const packageDir = path.join(tempDir, "file-prefix-package");
      const projectDir = path.join(tempDir, "file-prefix-project");
      const depsDir = path.join(projectDir, "deps");
      fs.mkdirSync(packageDir);
      fs.mkdirSync(depsDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-file-prefix-test",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const archiveName = "cli-file-prefix-test-1.0.0.tgz";
      fs.copyFileSync(
        path.join(packageDir, archiveName),
        path.join(depsDir, archiveName),
      );

      const installResult = spawnSync(
        "bun",
        [bplPath, "install", `file:deps/${archiveName}`],
        {
          cwd: projectDir,
          encoding: "utf-8",
        },
      );

      expect(installResult.status).toBe(0);
      expect(
        fs.existsSync(
          path.join(projectDir, "bpl_modules", "cli-file-prefix-test"),
        ),
      ).toBe(true);
      const lock = JSON.parse(
        fs.readFileSync(path.join(projectDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["cli-file-prefix-test"].source).toBe(
        `file:deps/${archiveName}`,
      );

      fs.rmSync(path.join(projectDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      const restoreResult = spawnSync("bun", [bplPath, "install"], {
        cwd: projectDir,
        encoding: "utf-8",
      });
      expect(restoreResult.status).toBe(0);
      expect(
        fs.existsSync(
          path.join(projectDir, "bpl_modules", "cli-file-prefix-test"),
        ),
      ).toBe(true);
    });

    test("should preserve existing lockfile permissions when installing through the CLI", () => {
      if (process.platform === "win32") {
        return;
      }

      const packageDir = path.join(tempDir, "lock-mode-package");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-lock-mode-test",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export test;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const projectDir = path.join(tempDir, "lock-mode-project");
      const lockPath = path.join(projectDir, "bpl.lock");
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        lockPath,
        JSON.stringify({ lockfileVersion: 1, packages: {} }, null, 2),
      );
      fs.chmodSync(lockPath, 0o640);

      const tarballPath = path.join(
        packageDir,
        "cli-lock-mode-test-1.0.0.tgz",
      );
      const installResult = spawnSync(
        "bun",
        [bplPath, "install", tarballPath],
        {
          cwd: projectDir,
          encoding: "utf-8",
        },
      );

      expect(installResult.status).toBe(0);
      expect(fs.statSync(lockPath).mode & 0o777).toBe(0o640);
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      expect(lock.packages["cli-lock-mode-test"]).toMatchObject({
        version: "1.0.0",
        source: tarballPath,
      });
      expect(
        fs.existsSync(path.join(projectDir, "bpl_modules", "cli-lock-mode-test")),
      ).toBe(true);
    });

    test("should preserve existing global cache archive permissions when installing through the CLI", () => {
      if (process.platform === "win32") {
        return;
      }

      const packageDir = path.join(tempDir, "global-cache-mode-package");
      const homeDir = path.join(tempDir, "global-cache-mode-home");
      const cacheDir = path.join(homeDir, ".bpl", "packages");
      const env = { ...process.env, HOME: homeDir };
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-global-cache-mode",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export old;");

      const firstPack = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(firstPack.status).toBe(0);

      const tarballPath = path.join(
        packageDir,
        "cli-global-cache-mode-1.0.0.tgz",
      );
      const firstInstall = spawnSync(
        "bun",
        [bplPath, "install", tarballPath, "--global"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(firstInstall.status).toBe(0);

      const cachedArchivePath = path.join(
        cacheDir,
        "cli-global-cache-mode-1.0.0.tgz",
      );
      fs.chmodSync(cachedArchivePath, 0o640);

      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export new;");
      const secondPack = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(secondPack.status).toBe(0);

      const secondInstall = spawnSync(
        "bun",
        [bplPath, "install", tarballPath, "--global"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(secondInstall.status).toBe(0);

      expect(fs.statSync(cachedArchivePath).mode & 0o777).toBe(0o640);
      expect(
        fs.readFileSync(
          path.join(cacheDir, "cli-global-cache-mode", "index.bpl"),
          "utf8",
        ),
      ).toBe("export new;");
    });

    test("should enforce --locked package verification", () => {
      const packageDir = path.join(tempDir, "package");
      fs.mkdirSync(packageDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-cli-test",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export original;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const jsonInstallProjectDir = path.join(tempDir, "json-install-project");
      fs.mkdirSync(jsonInstallProjectDir);
      const tarballPath = path.join(packageDir, "locked-cli-test-1.0.0.tgz");
      const installJson = spawnSync(
        "bun",
        [bplPath, "install", tarballPath, "--json"],
        {
          cwd: jsonInstallProjectDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const installJsonReport = expectJsonStdoutReport(installJson, {
        status: 0,
        check: "package-install",
        success: true,
      });
      expect(installJsonReport).toMatchObject({
        mode: "package",
        target: tarballPath,
        locked: false,
      });
      expect(installJsonReport).not.toHaveProperty("action");
      expect(installJsonReport).not.toHaveProperty("packagesChecked");

      const projectDir = path.join(tempDir, "locked-project");
      fs.mkdirSync(projectDir);

      const installResult = spawnSync(
        "bun",
        [bplPath, "install", tarballPath],
        {
          cwd: projectDir,
          encoding: "utf-8",
        },
      );
      expect(installResult.status).toBe(0);

      const lockedOk = spawnSync("bun", [bplPath, "install", "--locked"], {
        cwd: projectDir,
        encoding: "utf-8",
      });
      expect(lockedOk.status).toBe(0);

      const lockedJson = spawnSync(
        "bun",
        [bplPath, "install", "--locked", "--json"],
        {
          cwd: projectDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const lockedReport = expectJsonStdoutReport<{
        action?: string;
        packagesChecked?: number;
      }>(lockedJson, {
        status: 0,
        check: "package-install",
        success: true,
      });
      expect(lockedReport).toMatchObject({
        mode: "project",
        target: null,
        locked: true,
        action: "verified",
        packagesChecked: 1,
      });

      fs.writeFileSync(
        path.join(projectDir, "bpl_modules", "locked-cli-test", "index.bpl"),
        "export tampered;",
      );
      const lockedHash = JSON.parse(
        fs.readFileSync(path.join(projectDir, "bpl.lock"), "utf8"),
      ).packages["locked-cli-test"].hash;

      const lockedFail = spawnSync("bun", [bplPath, "install", "--locked"], {
        cwd: projectDir,
        encoding: "utf-8",
      });
      expect(lockedFail.status).toBe(1);
      expect(lockedFail.stderr).toContain("hash mismatch");

      const lockedJsonFail = spawnSync(
        "bun",
        [bplPath, "install", "--locked", "--json"],
        {
          cwd: projectDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const lockedFailureReport = expectJsonStdoutReport<{
        errorCode?: string;
        action?: string;
        packagesChecked?: number;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{
          packageName: string;
          kind: string;
          path?: string;
          source?: string;
          expectedVersion?: string;
          expectedHash?: string;
          actualHash?: string;
        }>;
      }>(lockedJsonFail, {
        status: 1,
        check: "package-install",
        success: false,
      });
      expect(lockedFailureReport).toMatchObject({
        mode: "project",
        target: null,
        locked: true,
        errorCode: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        action: "verification-failed",
        packagesChecked: 1,
        issuesFound: 1,
        issueKinds: ["hash-mismatch"],
        issues: [
          {
            packageName: "locked-cli-test",
            kind: "hash-mismatch",
            path: path.join(projectDir, "bpl_modules", "locked-cli-test"),
            source: tarballPath,
            expectedVersion: "1.0.0",
            expectedHash: lockedHash,
            actualHash: expect.any(String),
          },
        ],
      });
      const hashIssue = lockedFailureReport.issues?.[0];
      expect(hashIssue?.actualHash).not.toBe(hashIssue?.expectedHash);
    });

    test("should report invalid installed package exports during locked verification JSON", () => {
      const appDir = path.join(tempDir, "locked-export-cli-app");
      const packageDir = path.join(appDir, "bpl_modules", "locked-export-cli");
      const sourceArchive = path.join(appDir, "locked-export-cli-1.0.0.tgz");
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "locked-export-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-export-cli",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "locked-export-cli": {
                version: "1.0.0",
                source: `file:${path.basename(sourceArchive)}`,
                hash: "placeholder",
              },
            },
          },
          null,
          2,
        ),
      );

      const humanResult = spawnSync("bun", [bplPath, "install", "--locked"], {
        cwd: appDir,
        encoding: "utf-8",
      });

      expect(humanResult.status).toBe(1);
      expect(humanResult.stderr).toContain(
        "Missing package export entry: features/public.bpl",
      );
      expect(humanResult.stderr).toContain("Run 'bpl install'");

      const jsonResult = spawnSync(
        "bun",
        [bplPath, "install", "--locked", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        mode: string;
        target: string | null;
        locked: boolean;
        error: string;
        errorCode?: string;
        action?: string;
        packagesChecked?: number;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{
          packageName: string;
          kind: string;
          path?: string;
          expectedVersion?: string;
        }>;
      }>(jsonResult, {
        status: 1,
        check: "package-install",
        success: false,
      });

      expect(report).toMatchObject({
        mode: "project",
        target: null,
        locked: true,
        errorCode: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        action: "verification-failed",
        packagesChecked: 1,
        issuesFound: 1,
        issueKinds: ["invalid-manifest"],
        issues: [
          {
            packageName: "locked-export-cli",
            kind: "invalid-manifest",
            path: packageDir,
            expectedVersion: "1.0.0",
          },
        ],
      });
      expect(report.error).toContain(
        "Missing package export entry: features/public.bpl",
      );
    });

    test("should report lock verification name and version mismatch metadata as JSON", () => {
      const appDir = path.join(tempDir, "locked-metadata-cli-app");
      const packageDir = path.join(appDir, "bpl_modules", "locked-meta");
      const sourceArchive = path.join(appDir, "locked-meta-1.0.0.tgz");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "locked-metadata-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-meta-actual",
            version: "2.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "locked-meta": {
                version: "1.0.0",
                source: `file:${path.basename(sourceArchive)}`,
                hash: "placeholder",
              },
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [bplPath, "install", "--locked", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        issues?: Array<{
          packageName: string;
          kind: string;
          expectedName?: string;
          actualName?: string;
          expectedVersion?: string;
          actualVersion?: string;
        }>;
      }>(result, {
        status: 1,
        check: "package-install",
        success: false,
      });

      expect(report.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            packageName: "locked-meta",
            kind: "name-mismatch",
            expectedName: "locked-meta",
            actualName: "locked-meta-actual",
            expectedVersion: "1.0.0",
            actualVersion: "2.0.0",
          }),
          expect.objectContaining({
            packageName: "locked-meta",
            kind: "version-mismatch",
            expectedVersion: "1.0.0",
            actualVersion: "2.0.0",
          }),
        ]),
      );
    });

    test("should report lock verification transitive dependency metadata as JSON", () => {
      const appDir = path.join(tempDir, "locked-transitive-cli-app");
      const parentDir = path.join(appDir, "bpl_modules", "locked-parent");
      const childDir = path.join(appDir, "bpl_modules", "locked-child");
      const sourceArchive = path.join(appDir, "locked-parent-1.0.0.tgz");
      fs.mkdirSync(parentDir, { recursive: true });
      fs.mkdirSync(childDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "locked-transitive-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(sourceArchive, "archive placeholder");
      fs.writeFileSync(
        path.join(parentDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-parent",
            version: "1.0.0",
            main: "index.bpl",
            dependencies: {
              "locked-child": "1.0.0",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(parentDir, "index.bpl"), "export parent;");
      fs.writeFileSync(
        path.join(childDir, "bpl.json"),
        JSON.stringify(
          {
            name: "locked-child",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(childDir, "index.bpl"), "export child;");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "locked-parent": {
                version: "1.0.0",
                source: `file:${path.basename(sourceArchive)}`,
                hash: "placeholder",
              },
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [bplPath, "install", "--locked", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        issues?: Array<{
          packageName: string;
          kind: string;
          path?: string;
          dependencyOf?: string;
          requestedSource?: string;
        }>;
      }>(result, {
        status: 1,
        check: "package-install",
        success: false,
      });

      expect(report.issues).toContainEqual(
        expect.objectContaining({
          packageName: "locked-child",
          kind: "missing-transitive-lock-entry",
          path: childDir,
          dependencyOf: "locked-parent",
          requestedSource: "1.0.0",
        }),
      );
    });

    test("should check installed package imports from nested sources outside project cwd", () => {
      const packageDir = path.join(tempDir, "import-package");
      fs.mkdirSync(packageDir);

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-import-math",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(packageDir, "index.bpl"),
        [
          "export add;",
          "frame add() ret int {",
          "    return 42;",
          "}",
          "",
        ].join("\n"),
      );

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const appDir = path.join(tempDir, "import-app");
      const sourceDir = path.join(appDir, "src");
      const unrelatedDir = path.join(tempDir, "outside-cwd");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(unrelatedDir, { recursive: true });

      const tarballPath = path.join(packageDir, "cli-import-math-1.0.0.tgz");
      const installResult = spawnSync(
        "bun",
        [bplPath, "install", tarballPath],
        {
          cwd: appDir,
          encoding: "utf-8",
        },
      );
      expect(installResult.status).toBe(0);

      const mainPath = path.join(sourceDir, "main.bpl");
      fs.writeFileSync(
        mainPath,
        [
          'import add from "cli-import-math";',
          "frame main() ret int {",
          "    return add();",
          "}",
          "",
        ].join("\n"),
      );

      const checkResult = spawnSync("bun", [bplPath, "check", mainPath], {
        cwd: unrelatedDir,
        encoding: "utf-8",
      });

      expect(checkResult.status).toBe(0);
      expect(checkResult.stderr).not.toContain("Module not found");
    });

    test("should install transitive package dependencies and restore them from lock", () => {
      const depBDir = path.join(tempDir, "cli-graph-b");
      const depADir = path.join(tempDir, "cli-graph-a");
      const appDir = path.join(tempDir, "cli-graph-app");
      fs.mkdirSync(depBDir);
      fs.mkdirSync(depADir);
      fs.mkdirSync(appDir);

      fs.writeFileSync(
        path.join(depBDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-graph-b", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(depBDir, "index.bpl"),
        [
          "export value;",
          "frame value() ret int {",
          "    return 7;",
          "}",
          "",
        ].join("\n"),
      );

      const packB = spawnSync("bun", [bplPath, "pack"], {
        cwd: depBDir,
        encoding: "utf-8",
      });
      expect(packB.status).toBe(0);

      const depBSource = "../cli-graph-b/cli-graph-b-1.0.0.tgz";
      fs.writeFileSync(
        path.join(depADir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-graph-a",
            version: "1.0.0",
            main: "index.bpl",
            dependencies: {
              "cli-graph-b": `file:${depBSource}`,
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(depADir, "index.bpl"),
        [
          'import value from "cli-graph-b";',
          "export callValue;",
          "frame callValue() ret int {",
          "    return value();",
          "}",
          "",
        ].join("\n"),
      );

      const installBForPack = spawnSync("bun", [bplPath, "install", depBSource], {
        cwd: depADir,
        encoding: "utf-8",
      });
      expect(installBForPack.status).toBe(0);

      const packA = spawnSync("bun", [bplPath, "pack"], {
        cwd: depADir,
        encoding: "utf-8",
      });
      expect(packA.status).toBe(0);

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-graph-app",
            version: "1.0.0",
            dependencies: {
              "cli-graph-a": "file:../cli-graph-a/cli-graph-a-1.0.0.tgz",
            },
          },
          null,
          2,
        ),
      );

      const installGraph = spawnSync("bun", [bplPath, "install"], {
        cwd: appDir,
        encoding: "utf-8",
      });
      expect(installGraph.status).toBe(0);

      const mainPath = path.join(appDir, "src", "main.bpl");
      fs.mkdirSync(path.dirname(mainPath), { recursive: true });
      fs.writeFileSync(
        mainPath,
        [
          'import callValue from "cli-graph-a";',
          "frame main() ret int {",
          "    return callValue();",
          "}",
          "",
        ].join("\n"),
      );

      const initialCheck = spawnSync("bun", [bplPath, "check", mainPath], {
        cwd: appDir,
        encoding: "utf-8",
      });
      expect(initialCheck.status).toBe(0);

      fs.rmSync(path.join(appDir, "bpl_modules"), {
        recursive: true,
        force: true,
      });
      const restoreGraph = spawnSync("bun", [bplPath, "install"], {
        cwd: appDir,
        encoding: "utf-8",
      });
      expect(restoreGraph.status).toBe(0);

      const restoredCheck = spawnSync("bun", [bplPath, "check", mainPath], {
        cwd: path.join(tempDir),
        encoding: "utf-8",
      });
      expect(restoredCheck.status).toBe(0);
      expect(
        fs.existsSync(path.join(appDir, "bpl_modules", "cli-graph-b")),
      ).toBe(true);

      const listTree = spawnSync("bun", [bplPath, "list", "--tree"], {
        cwd: appDir,
        encoding: "utf-8",
      });
      expect(listTree.status).toBe(0);
      expect(listTree.stdout).toContain("Dependency tree (local)");
      expect(listTree.stdout).toContain("cli-graph-a@1.0.0");
      expect(listTree.stdout).toContain("cli-graph-b@1.0.0");

      const listTreeJson = spawnSync(
        "bun",
        [bplPath, "list", "--tree", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
        },
      );
      expect(listTreeJson.status).toBe(0);
      const treeReport = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        scope: string;
        tree: Array<{ name: string }>;
      }>(listTreeJson);
      expect(treeReport.schemaVersion).toBe(1);
      expect(treeReport.check).toBe("package-list-tree");
      expect(treeReport.success).toBe(true);
      expect(treeReport.scope).toBe("local");
      expect(treeReport.tree).toHaveLength(1);
      const rootDependency = treeReport.tree[0];
      expect(rootDependency?.name).toBe("cli-graph-a");
      expect(JSON.stringify(treeReport.tree)).toContain("cli-graph-b");

      fs.rmSync(path.join(appDir, "bpl_modules", "cli-graph-b"), {
        recursive: true,
        force: true,
      });
      const lockedMissing = spawnSync(
        "bun",
        [bplPath, "install", "--locked"],
        {
          cwd: appDir,
          encoding: "utf-8",
        },
      );
      expect(lockedMissing.status).toBe(1);
      expect(lockedMissing.stderr).toContain(
        "cli-graph-a: dependency 'cli-graph-b' is missing",
      );
      expect(lockedMissing.stderr).toContain("bpl list --tree");
    });

    test("should repair lockfiles from installed packages", () => {
      const appDir = path.join(tempDir, "cli-repair-app");
      const packageDir = path.join(appDir, "bpl_modules", "cli-repair");
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "cli-repair-app", version: "1.0.0" }, null, 2),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-repair", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export repaired;");
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify(
          {
            lockfileVersion: 1,
            packages: {
              "cli-repair": {
                version: "1.0.0",
                source: "cli-repair-1.0.0.tgz",
                hash: "wrong",
              },
              "cli-stale": {
                version: "9.9.9",
                source: "cli-stale-9.9.9.tgz",
                hash: "stale",
              },
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync("bun", [bplPath, "install", "--repair-lock"], {
        cwd: appDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Repaired bpl.lock");
      const lock = JSON.parse(
        fs.readFileSync(path.join(appDir, "bpl.lock"), "utf8"),
      );
      expect(lock.packages["cli-repair"].hash).not.toBe("wrong");
      expect(lock.packages["cli-stale"]).toBeUndefined();
    });

    test("should reject lockfile repair for duplicate installed package names", () => {
      const appDir = path.join(tempDir, "cli-repair-duplicate-app");
      const firstPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-repair-duplicate-a",
      );
      const secondPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-repair-duplicate-b",
      );
      fs.mkdirSync(firstPackageDir, { recursive: true });
      fs.mkdirSync(secondPackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-repair-duplicate-app", version: "1.0.0" },
          null,
          2,
        ),
      );

      for (const packageDir of [firstPackageDir, secondPackageDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "cli-repair-duplicate",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const result = spawnSync(
        "bun",
        [bplPath, "install", "--repair-lock", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        mode: string;
        target: string | null;
        repairLock: boolean;
        error: string;
        errorCode?: string;
        action?: string;
        packagesChecked?: number;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{ packageName: string; kind: string; paths?: string[] }>;
      }>(result, {
        status: 1,
        check: "package-install",
        success: false,
      });
      expect(report).toMatchObject({
        mode: "project",
        target: null,
        repairLock: true,
        errorCode: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        action: "verification-failed",
        packagesChecked: 2,
        issuesFound: 1,
        issueKinds: ["duplicate-installed-package"],
        issues: [
          {
            packageName: "cli-repair-duplicate",
            kind: "duplicate-installed-package",
            paths: [firstPackageDir, secondPackageDir],
          },
        ],
      });
      expect(report.error).toContain(
        "Multiple installed directories declare package 'cli-repair-duplicate'",
      );
      expect(fs.existsSync(path.join(appDir, "bpl.lock"))).toBe(false);
    });

    test("should report invalid installed package exports during lockfile repair JSON", () => {
      const appDir = path.join(tempDir, "cli-repair-export-app");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-repair-export",
      );
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "cli-repair-export-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-repair-export",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");

      const humanResult = spawnSync(
        "bun",
        [bplPath, "install", "--repair-lock"],
        {
          cwd: appDir,
          encoding: "utf-8",
        },
      );

      expect(humanResult.status).toBe(1);
      expect(humanResult.stderr).toContain(
        "Missing package export entry: features/public.bpl",
      );
      expect(humanResult.stderr).toContain("bpl install --repair-lock");
      expect(fs.existsSync(path.join(appDir, "bpl.lock"))).toBe(false);

      const jsonResult = spawnSync(
        "bun",
        [bplPath, "install", "--repair-lock", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        mode: string;
        target: string | null;
        repairLock: boolean;
        error: string;
        errorCode?: string;
        action?: string;
        packagesChecked?: number;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{
          packageName: string;
          kind: string;
          path?: string;
          expectedVersion?: string;
        }>;
      }>(jsonResult, {
        status: 1,
        check: "package-install",
        success: false,
      });

      expect(report).toMatchObject({
        mode: "project",
        target: null,
        repairLock: true,
        errorCode: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        action: "verification-failed",
        packagesChecked: 1,
        issuesFound: 1,
        issueKinds: ["invalid-manifest"],
        issues: [
          {
            packageName: "cli-repair-export",
            kind: "invalid-manifest",
            path: packageDir,
            expectedVersion: "1.0.0",
          },
        ],
      });
      expect(report.error).toContain(
        "Missing package export entry: features/public.bpl",
      );
      expect(fs.existsSync(path.join(appDir, "bpl.lock"))).toBe(false);
    });
  });

  describe("list command", () => {
    test("should list installed packages", () => {
      // Create and install a package
      const manifest = {
        name: "list-cli-test",
        version: "1.5.0",
        description: "Test package for listing",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const installResult = spawnSync(
        "bun",
        [bplPath, "install", "list-cli-test-1.5.0.tgz"],
        {
          cwd: tempDir,
          encoding: "utf-8",
        },
      );
      expect(installResult.status).toBe(0);

      // List packages
      const listResult = spawnSync("bun", [bplPath, "list"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(listResult.status).toBe(0);
      expect(listResult.stdout).toContain("list-cli-test@1.5.0");
      expect(listResult.stdout).toContain("Test package for listing");

      const listJson = spawnSync("bun", [bplPath, "list", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      const report = expectJsonStdoutReport<{
        schemaVersion: number;
        check: string;
        success: boolean;
        scope: string;
        packages: Array<{
          name: string;
          version: string;
          description?: string;
          path?: string;
          hash?: string;
        }>;
      }>(listJson, {
        status: 0,
        check: "package-list",
        success: true,
      });
      expect(report.scope).toBe("local");
      expect(report.packages).toHaveLength(1);
      const listedPackage = report.packages[0];
      expect(listedPackage).toMatchObject({
        name: "list-cli-test",
        version: "1.5.0",
        description: "Test package for listing",
      });
      expect(listedPackage?.path).toContain("bpl_modules");
      expect(typeof listedPackage?.hash).toBe("string");
    });

    test("should report invalid installed package exports in list output", () => {
      const appDir = path.join(tempDir, "cli-list-export-app");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-list-export-broken",
      );
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-list-export-app", version: "1.0.0" },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-list-export-broken",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");

      const textResult = spawnSync("bun", [bplPath, "list"], {
        cwd: appDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(textResult.status).toBe(0);
      expect(textResult.stdout).toContain("cli-list-export-broken@1.0.0");
      expect(textResult.stdout).toContain(
        "! invalid exports: Missing package export entry: features/public.bpl",
      );

      const jsonResult = spawnSync("bun", [bplPath, "list", "--json"], {
        cwd: appDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });
      const report = expectJsonStdoutReport<{
        scope: string;
        packages: Array<{
          name: string;
          version: string;
          path?: string;
          hash?: string;
          problems: string[];
        }>;
      }>(jsonResult, {
        status: 0,
        check: "package-list",
        success: true,
      });
      expect(report.scope).toBe("local");
      expect(report.packages[0]).toMatchObject({
        name: "cli-list-export-broken",
        version: "1.0.0",
        path: packageDir,
        problems: [
          expect.stringContaining(
            "invalid exports: Missing package export entry: features/public.bpl",
          ),
        ],
      });
      expect(typeof report.packages[0]?.hash).toBe("string");
    });

    test("should report duplicate installed package names in list JSON", () => {
      const appDir = path.join(tempDir, "cli-list-duplicate-app");
      const firstPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-list-duplicate-a",
      );
      const secondPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-list-duplicate-b",
      );
      fs.mkdirSync(firstPackageDir, { recursive: true });
      fs.mkdirSync(secondPackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-list-duplicate-app", version: "1.0.0" },
          null,
          2,
        ),
      );

      for (const packageDir of [firstPackageDir, secondPackageDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "cli-list-duplicate",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const result = spawnSync("bun", [bplPath, "list", "--json"], {
        cwd: appDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      const report = expectJsonStdoutReport<{
        scope: string;
        packages: unknown[];
        error: string;
        errorCode?: string;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{
          packageName: string;
          kind: string;
          path: string;
          paths: string[];
        }>;
      }>(result, {
        status: 1,
        check: "package-list",
        success: false,
      });
      expect(report).toMatchObject({
        scope: "local",
        packages: [],
        errorCode: "BPL_PACKAGE_DUPLICATE_INSTALLED",
        issuesFound: 1,
        issueKinds: ["duplicate-installed-package"],
        issues: [
          {
            packageName: "cli-list-duplicate",
            kind: "duplicate-installed-package",
            path: expect.stringContaining("cli-list-duplicate-a"),
            paths: [firstPackageDir, secondPackageDir],
          },
        ],
      });
      expect(report.error).toContain(
        "Multiple installed directories declare package 'cli-list-duplicate'",
      );
    });

    test("should report duplicate installed package names in dependency tree JSON", () => {
      const appDir = path.join(tempDir, "cli-tree-duplicate-app");
      const firstPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-tree-duplicate-a",
      );
      const secondPackageDir = path.join(
        appDir,
        "bpl_modules",
        "cli-tree-duplicate-b",
      );
      fs.mkdirSync(firstPackageDir, { recursive: true });
      fs.mkdirSync(secondPackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "cli-tree-duplicate-app", version: "1.0.0" },
          null,
          2,
        ),
      );

      for (const packageDir of [firstPackageDir, secondPackageDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify(
            {
              name: "cli-tree-duplicate",
              version: "1.0.0",
              main: "index.bpl",
            },
            null,
            2,
          ),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const result = spawnSync(
        "bun",
        [bplPath, "list", "--tree", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        scope: string;
        tree: unknown[];
        error: string;
        errorCode?: string;
        issuesFound?: number;
        issueKinds?: string[];
        issues?: Array<{
          packageName: string;
          kind: string;
          path: string;
          paths: string[];
        }>;
      }>(result, {
        status: 1,
        check: "package-list-tree",
        success: false,
      });
      expect(report).toMatchObject({
        scope: "local",
        tree: [],
        errorCode: "BPL_PACKAGE_DUPLICATE_INSTALLED",
        issuesFound: 1,
        issueKinds: ["duplicate-installed-package"],
        issues: [
          {
            packageName: "cli-tree-duplicate",
            kind: "duplicate-installed-package",
            path: expect.stringContaining("cli-tree-duplicate-a"),
            paths: [firstPackageDir, secondPackageDir],
          },
        ],
      });
      expect(report.error).toContain(
        "Multiple installed directories declare package 'cli-tree-duplicate'",
      );
    });

    test("should report invalid installed package exports in dependency tree output", () => {
      const appDir = path.join(tempDir, "cli-tree-export-app");
      const packageRoot = path.join(appDir, "bpl_modules");
      const parentDir = path.join(packageRoot, "cli-tree-export-parent");
      const childDir = path.join(packageRoot, "cli-tree-export-child");
      fs.mkdirSync(path.join(parentDir, "features"), { recursive: true });
      fs.mkdirSync(childDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-tree-export-app",
            version: "1.0.0",
            dependencies: {
              "cli-tree-export-parent": "1.0.0",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(
        path.join(parentDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-tree-export-parent",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
            dependencies: {
              "cli-tree-export-child": "1.0.0",
            },
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(parentDir, "index.bpl"), "export parent;");
      fs.writeFileSync(
        path.join(childDir, "bpl.json"),
        JSON.stringify(
          {
            name: "cli-tree-export-child",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(childDir, "index.bpl"), "export child;");

      const textResult = spawnSync("bun", [bplPath, "list", "--tree"], {
        cwd: appDir,
        encoding: "utf-8",
        env: { ...process.env, NO_COLOR: "1" },
      });

      expect(textResult.status).toBe(0);
      expect(textResult.stdout).toContain("Dependency tree (local)");
      expect(textResult.stdout).toContain("cli-tree-export-parent@1.0.0");
      expect(textResult.stdout).toContain("cli-tree-export-child@1.0.0");
      expect(textResult.stdout).toContain(
        "! invalid exports: Missing package export entry: features/public.bpl",
      );

      const jsonResult = spawnSync(
        "bun",
        [bplPath, "list", "--tree", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );

      const report = expectJsonStdoutReport<{
        scope: string;
        tree: Array<{
          name: string;
          problems: string[];
          dependencies: Array<{ name: string; problems: string[] }>;
        }>;
      }>(jsonResult, {
        status: 0,
        check: "package-list-tree",
        success: true,
      });
      expect(report.scope).toBe("local");
      expect(report.tree[0]).toMatchObject({
        name: "cli-tree-export-parent",
        problems: [
          expect.stringContaining(
            "invalid exports: Missing package export entry: features/public.bpl",
          ),
        ],
        dependencies: [
          {
            name: "cli-tree-export-child",
            problems: [],
          },
        ],
      });
    });

    test("should show message when no packages installed", () => {
      const result = spawnSync("bun", [bplPath, "list"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No packages installed");
    });
  });

  describe("doctor packages command", () => {
    test("should report package diagnostics as JSON", () => {
      const appDir = path.join(tempDir, "doctor-cli-app");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-cli-app",
            version: "1.0.0",
            dependencies: {
              "missing-package": "1.0.0",
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: path.join(tempDir, "doctor-cli-home"),
          },
          encoding: "utf-8",
        },
      );

      expect(result.status).toBe(1);
      const report = expectJsonStdoutReport<{
        ok: boolean;
        projectRoot: string;
        localPackageDir: string;
        globalPackageDir: string;
        lockfile: {
          exists: boolean;
          path: string;
          packages: number;
          verified: boolean;
        };
        cacheVerification: {
          ok: boolean;
          entriesChecked: number;
          issues: unknown[];
        };
        installedPackages: unknown[];
        cacheEntries: unknown[];
        dependencyTree: Array<{
          name: string;
          source: string;
          installed: boolean;
          locked: boolean;
          problems: string[];
          dependencies: unknown[];
        }>;
        issues: Array<{
          severity: string;
          kind: string;
          message: string;
          path?: string;
          hint?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });
      expect(report.ok).toBe(false);
      expect(typeof report.projectRoot).toBe("string");
      expect(report.localPackageDir).toContain("bpl_modules");
      expect(report.globalPackageDir).toContain("doctor-cli-home");
      expect(report.lockfile.exists).toBe(false);
      expect(report.lockfile.path).toContain("bpl.lock");
      expect(report.lockfile.packages).toBe(0);
      expect(report.lockfile.verified).toBe(false);
      expect(report.cacheVerification.ok).toBe(true);
      expect(report.cacheVerification.entriesChecked).toBe(0);
      expect(report.cacheVerification.issues).toEqual([]);
      expect(report.installedPackages).toEqual([]);
      expect(report.cacheEntries).toEqual([]);
      expect(report.dependencyTree).toHaveLength(1);
      expect(report.dependencyTree[0]).toMatchObject({
        name: "missing-package",
        source: "1.0.0",
        installed: false,
        locked: false,
        problems: ["missing from bpl_modules"],
        dependencies: [],
      });
      const missingLockfileIssue = report.issues.find(
        (issue: { kind: string }) => issue.kind === "missing-lockfile",
      );
      expect(missingLockfileIssue).toMatchObject({
        severity: "error",
        kind: "missing-lockfile",
        message: expect.stringContaining("Project has dependencies"),
        path: expect.stringContaining("bpl.lock"),
        hint: expect.stringContaining("bpl install"),
      });
    });

    test("should report invalid project package exports as stable JSON issues", () => {
      const appDir = path.join(tempDir, "doctor-project-export-cli-app");
      fs.mkdirSync(path.join(appDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-project-export-cli-app",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(appDir, "index.bpl"), "export root;");

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          encoding: "utf-8",
          env: {
            ...process.env,
            HOME: path.join(tempDir, "doctor-project-export-cli-home"),
            NO_COLOR: "1",
          },
        },
      );

      const report = expectJsonStdoutReport<{
        ok: boolean;
        issues: Array<{
          severity: string;
          kind: string;
          packageName?: string;
          version?: string;
          message: string;
          path?: string;
          hint?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });
      const issue = report.issues.find(
        (entry) => entry.kind === "invalid-project-package",
      );
      expect(report.ok).toBe(false);
      expect(issue).toMatchObject({
        severity: "error",
        kind: "invalid-project-package",
        packageName: "doctor-project-export-cli-app",
        version: "1.0.0",
        message: expect.stringContaining(
          "Missing package export entry: features/public.bpl",
        ),
        path: path.join(appDir, "bpl.json"),
        hint: expect.stringContaining("Fix exported project files"),
      });
    });

    test("should report package cache provenance warnings as stable JSON issues", () => {
      const appDir = path.join(tempDir, "doctor-cache-cli-app");
      const homeDir = path.join(tempDir, "doctor-cache-cli-home");
      const cacheDir = path.join(homeDir, ".bpl", "packages");
      const cachePath = path.join(cacheDir, "doctor-cache-cli-1.0.0.tgz");
      fs.mkdirSync(appDir);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-cache-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(cachePath, "legacy-cache-entry");

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: homeDir,
          },
          encoding: "utf-8",
        },
      );

      const report = expectJsonStdoutReport<{
        ok: boolean;
        cacheVerification: {
          ok: boolean;
          entriesChecked: number;
          issues: Array<{
            packageName: string;
            version: string;
            kind: string;
            message: string;
            path: string;
            provenancePath: string;
          }>;
        };
        issues: Array<{
          severity: string;
          kind: string;
          packageName?: string;
          version?: string;
          message: string;
          path: string;
          provenancePath?: string;
          paths?: string[];
          hint: string;
        }>;
      }>(result, {
        status: 0,
        check: "packages",
        success: true,
      });
      expect(report.ok).toBe(true);
      expect(report.cacheVerification.ok).toBe(false);
      expect(report.cacheVerification.entriesChecked).toBe(1);
      expect(report.cacheVerification.issues).toHaveLength(1);
      expect(report.cacheVerification.issues[0]).toMatchObject({
        packageName: "doctor-cache-cli",
        version: "1.0.0",
        kind: "missing-provenance",
        message: expect.stringContaining("missing package provenance sidecar"),
        path: cachePath,
        provenancePath: `${cachePath}.bplmeta.json`,
      });
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          kind: "package-cache-missing-provenance",
          packageName: "doctor-cache-cli",
          version: "1.0.0",
          message: expect.stringContaining("missing package provenance sidecar"),
          path: cachePath,
          provenancePath: `${cachePath}.bplmeta.json`,
          hint: expect.stringContaining("bpl package-cache verify doctor-cache-cli"),
        }),
      );
    });

    test("should report installed package metadata issues as stable JSON issues", () => {
      const appDir = path.join(tempDir, "doctor-installed-cli-app");
      const homeDir = path.join(tempDir, "doctor-installed-cli-home");
      const firstPackageDir = path.join(appDir, "bpl_modules", "doctor-one");
      const secondPackageDir = path.join(appDir, "bpl_modules", "doctor-two");
      fs.mkdirSync(firstPackageDir, { recursive: true });
      fs.mkdirSync(secondPackageDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-installed-cli-app", version: "1.0.0" }),
      );

      for (const packageDir of [firstPackageDir, secondPackageDir]) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify({
            name: "doctor-shared",
            version: "1.0.0",
            main: "index.bpl",
          }),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");
      }

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: homeDir,
          },
          encoding: "utf-8",
        },
      );

      expect(result.stderr).toBe("");
      const report = expectJsonStdoutReport<{
        ok: boolean;
        installedPackages: Array<{
          manifest: { name: string };
          path: string;
        }>;
        issues: Array<{
          severity: string;
          kind: string;
          message: string;
          path: string;
          hint: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });

      expect(report.ok).toBe(false);
      expect(report.installedPackages.map((pkg) => pkg.manifest.name)).toEqual(
        ["doctor-shared", "doctor-shared"],
      );
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          kind: "package-name-mismatch",
          message: "Installed directory 'doctor-one' contains package 'doctor-shared'.",
          path: path.join(firstPackageDir, "bpl.json"),
          hint: expect.stringContaining("Reinstall the package"),
        }),
      );
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          kind: "package-name-mismatch",
          message: "Installed directory 'doctor-two' contains package 'doctor-shared'.",
          path: path.join(secondPackageDir, "bpl.json"),
          hint: expect.stringContaining("Reinstall the package"),
        }),
      );
      const duplicateIssue = report.issues.find(
        (issue) => issue.kind === "duplicate-installed-package",
      );
      expect(duplicateIssue).toMatchObject({
        severity: "error",
        kind: "duplicate-installed-package",
        message: "Multiple installed directories declare package 'doctor-shared'.",
        path: [firstPackageDir, secondPackageDir].join(", "),
        paths: [firstPackageDir, secondPackageDir],
        hint: "Keep only one installed directory for each package name.",
      });
      expect(duplicateIssue?.path).toContain(firstPackageDir);
      expect(duplicateIssue?.path).toContain(secondPackageDir);
    });

    test("should report invalid installed package exports as stable JSON issues", () => {
      const appDir = path.join(tempDir, "doctor-export-cli-app");
      const homeDir = path.join(tempDir, "doctor-export-cli-home");
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        "doctor-export-cli",
      );
      fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-export-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-export-cli",
            version: "1.0.0",
            main: "index.bpl",
            exports: ["features/public.bpl"],
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: homeDir,
          },
          encoding: "utf-8",
        },
      );

      expect(result.stderr).toBe("");
      const report = expectJsonStdoutReport<{
        ok: boolean;
        issues: Array<{
          severity: string;
          kind: string;
          packageName?: string;
          version?: string;
          message: string;
          path?: string;
          hint?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });

      expect(report.ok).toBe(false);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          severity: "error",
          kind: "invalid-installed-package",
          packageName: "doctor-export-cli",
          version: "1.0.0",
          message: expect.stringContaining(
            "Missing package export entry: features/public.bpl",
          ),
          path: packageDir,
          hint: expect.stringContaining("reinstall"),
        }),
      );
    });

    test("should keep packages JSON contract for unsafe package directories", () => {
      const scenarios = [
        {
          name: "local",
          setup: (appDir: string, _homeDir: string) => {
            const outsidePackageRoot = path.join(
              tempDir,
              "outside-local-packages",
            );
            fs.mkdirSync(outsidePackageRoot, { recursive: true });
            fs.symlinkSync(
              outsidePackageRoot,
              path.join(appDir, "bpl_modules"),
              "dir",
            );
            return path.join(appDir, "bpl_modules");
          },
        },
        {
          name: "global",
          setup: (_appDir: string, homeDir: string) => {
            const outsidePackageRoot = path.join(
              tempDir,
              "outside-global-packages",
            );
            const bplHomeDir = path.join(homeDir, ".bpl");
            fs.mkdirSync(outsidePackageRoot, { recursive: true });
            fs.mkdirSync(bplHomeDir, { recursive: true });
            fs.symlinkSync(
              outsidePackageRoot,
              path.join(bplHomeDir, "packages"),
              "dir",
            );
            return path.join(bplHomeDir, "packages");
          },
        },
      ] as const;

      for (const scenario of scenarios) {
        const appDir = path.join(
          tempDir,
          `doctor-unsafe-${scenario.name}-cli-app`,
        );
        const homeDir = path.join(
          tempDir,
          `doctor-unsafe-${scenario.name}-cli-home`,
        );
        fs.mkdirSync(appDir);
        fs.writeFileSync(
          path.join(appDir, "bpl.json"),
          JSON.stringify({
            name: `doctor-unsafe-${scenario.name}-cli-app`,
            version: "1.0.0",
          }),
        );
        const unsafePath = scenario.setup(appDir, homeDir);

        const result = spawnSync(
          "bun",
          [bplPath, "doctor", "packages", "--json"],
          {
            cwd: appDir,
            env: {
              ...process.env,
              HOME: homeDir,
            },
            encoding: "utf-8",
          },
        );

        expect(result.stderr).toBe("");
        const report = expectJsonStdoutReport<{
          ok: boolean;
          issues: Array<{
            severity: string;
            kind: string;
            code?: string;
            message: string;
            path?: string;
            hint?: string;
          }>;
        }>(result, {
          status: 1,
          check: "packages",
          success: false,
        });
        expect(report.ok).toBe(false);
        expect(report.issues).toContainEqual(
          expect.objectContaining({
            severity: "error",
            kind: "unsafe-package-directory",
            code: "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
            path: unsafePath,
            hint: expect.stringContaining("bpl doctor packages"),
          }),
        );
      }
    });

    test("should report malformed lockfile schema with a stable JSON code", () => {
      const appDir = path.join(tempDir, "doctor-lock-code-cli-app");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "doctor-lock-code-cli-app", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(appDir, "bpl.lock"),
        JSON.stringify({ lockfileVersion: 2, packages: {} }),
      );

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: path.join(tempDir, "doctor-lock-code-cli-home"),
          },
          encoding: "utf-8",
        },
      );

      const report = expectJsonStdoutReport<{
        issues: Array<{
          severity: string;
          kind: string;
          code?: string;
          path?: string;
          hint?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });
      const invalidLockfileIssue = report.issues.find(
        (issue) => issue.kind === "invalid-lockfile",
      );
      expect(invalidLockfileIssue).toMatchObject({
        severity: "error",
        kind: "invalid-lockfile",
        code: "BPL_LOCKFILE_UNSUPPORTED_VERSION",
        path: expect.stringContaining("bpl.lock"),
        hint: expect.stringContaining("bpl install"),
      });
    });

    test("should report lock verification drift as structured JSON issues", () => {
      const packageDir = path.join(tempDir, "doctor-locked-drift-package");
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "doctor-locked-drift",
            version: "1.0.0",
            main: "index.bpl",
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export original;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const appDir = path.join(tempDir, "doctor-locked-drift-app");
      fs.mkdirSync(appDir);
      const tarballPath = path.join(
        packageDir,
        "doctor-locked-drift-1.0.0.tgz",
      );
      const installResult = spawnSync("bun", [bplPath, "install", tarballPath], {
        cwd: appDir,
        encoding: "utf-8",
      });
      expect(installResult.status).toBe(0);

      const installedSource = path.join(
        appDir,
        "bpl_modules",
        "doctor-locked-drift",
        "index.bpl",
      );
      fs.writeFileSync(installedSource, "export tampered;");

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: path.join(tempDir, "doctor-locked-drift-home"),
            NO_COLOR: "1",
          },
          encoding: "utf-8",
        },
      );

      expect(result.stderr).toBe("");
      const report = expectJsonStdoutReport<{
        lockfile: { verified: boolean };
        issues: Array<{
          severity: string;
          kind: string;
          code?: string;
          packageName?: string;
          source?: string;
          expectedVersion?: string;
          expectedHash?: string;
          actualHash?: string;
          path?: string;
          hint?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });

      expect(report.lockfile.verified).toBe(false);
      const driftIssue = report.issues.find(
        (issue) => issue.kind === "hash-mismatch",
      );
      expect(driftIssue).toMatchObject({
        severity: "error",
        kind: "hash-mismatch",
        code: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        packageName: "doctor-locked-drift",
        source: expect.stringContaining("doctor-locked-drift-1.0.0.tgz"),
        expectedVersion: "1.0.0",
        path: path.join(appDir, "bpl_modules", "doctor-locked-drift"),
        hint: expect.stringContaining("bpl install"),
      });
      expect(driftIssue?.expectedHash).toEqual(expect.any(String));
      expect(driftIssue?.actualHash).toEqual(expect.any(String));
      expect(driftIssue?.actualHash).not.toBe(driftIssue?.expectedHash);
    });

    test("should report stale lock entries as structured JSON issues", () => {
      const appDir = path.join(tempDir, "doctor-stale-lock-cli-app");
      fs.mkdirSync(appDir);
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify(
          { name: "doctor-stale-lock-cli-app", version: "1.0.0" },
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
              "doctor-stale-lock-cli": {
                version: "2.3.4",
                source: "doctor-stale-lock-cli-2.3.4.tgz",
                hash: "cli-stale-hash",
              },
            },
          },
          null,
          2,
        ),
      );

      const result = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env: {
            ...process.env,
            HOME: path.join(tempDir, "doctor-stale-lock-cli-home"),
            NO_COLOR: "1",
          },
          encoding: "utf-8",
        },
      );

      expect(result.stderr).toBe("");
      const report = expectJsonStdoutReport<{
        lockfile: { exists: boolean; packages: number; verified: boolean };
        issues: Array<{
          severity: string;
          kind: string;
          code?: string;
          packageName?: string;
          source?: string;
          expectedVersion?: string;
          expectedHash?: string;
          path?: string;
          hint?: string;
          lockVerificationKind?: string;
        }>;
      }>(result, {
        status: 1,
        check: "packages",
        success: false,
      });

      expect(report.lockfile).toMatchObject({
        exists: true,
        packages: 1,
        verified: false,
      });
      const staleIssue = report.issues.find(
        (issue) => issue.kind === "stale-lock-entry",
      );
      expect(staleIssue).toMatchObject({
        severity: "error",
        kind: "stale-lock-entry",
        code: "BPL_PACKAGE_LOCK_VERIFY_FAILED",
        packageName: "doctor-stale-lock-cli",
        source: "doctor-stale-lock-cli-2.3.4.tgz",
        expectedVersion: "2.3.4",
        expectedHash: "cli-stale-hash",
        path: path.join(appDir, "bpl_modules", "doctor-stale-lock-cli"),
        hint: expect.stringContaining("bpl install"),
        lockVerificationKind: "missing-package",
      });
    });
  });

  describe("package-cache command", () => {
    test("should report empty cache list and verification JSON shapes", () => {
      const homeDir = path.join(tempDir, "empty-cache-home");
      const env = {
        ...process.env,
        HOME: homeDir,
      };

      const listResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "list", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(
        expectJsonStdoutReport<{
          schemaVersion: number;
          check: string;
          success: boolean;
          entries: unknown[];
        }>(listResult, {
          status: 0,
          check: "package-cache-list",
          success: true,
        }),
      ).toMatchObject({
        entries: [],
      });

      const verifyResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "verify", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(
        expectJsonStdoutReport<{
          schemaVersion: number;
          check: string;
          success: boolean;
          ok: boolean;
          entriesChecked: number;
          issues: unknown[];
        }>(verifyResult, {
          status: 0,
          check: "package-cache-verify",
          success: true,
        }),
      ).toMatchObject({
        ok: true,
        entriesChecked: 0,
        issues: [],
      });
    });

    test("should list and clean cached package archives", () => {
      const homeDir = path.join(tempDir, "cache-home");
      const cacheDir = path.join(homeDir, ".bpl", "packages");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, "cache-cli-1.0.0.tgz"), "one");
      fs.writeFileSync(path.join(cacheDir, "cache-cli-2.0.0.tgz"), "two");

      const env = {
        ...process.env,
        HOME: homeDir,
      };

      const listResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "list", "cache-cli", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      const listReport = expectJsonStdoutReport<{
        schemaVersion: number;
        check: string;
        success: boolean;
        entries: Array<{ version: string; provenanceStatus: string }>;
      }>(listResult, {
        status: 0,
        check: "package-cache-list",
        success: true,
      });
      const { entries } = listReport;
      expect(entries.map((entry: { version: string }) => entry.version)).toEqual([
        "2.0.0",
        "1.0.0",
      ]);
      expect(
        entries.every(
          (entry: { provenanceStatus: string }) =>
            entry.provenanceStatus === "missing",
        ),
      ).toBe(true);

      const verifyResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "verify", "cache-cli", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      const verification = expectJsonStdoutReport<{
        ok: boolean;
        entriesChecked: number;
        issues: Array<{
          packageName: string;
          version: string;
          kind: string;
          message: string;
          path: string;
          provenancePath: string;
        }>;
      }>(verifyResult, {
        status: 1,
        check: "package-cache-verify",
        success: false,
      });
      expect(verification.ok).toBe(false);
      expect(verification.entriesChecked).toBe(2);
      const missingProvenanceIssue = verification.issues.find(
        (issue: { packageName: string; version: string }) =>
          issue.packageName === "cache-cli" && issue.version === "1.0.0",
      );
      expect(missingProvenanceIssue).toMatchObject({
        packageName: "cache-cli",
        version: "1.0.0",
        kind: "missing-provenance",
        message: expect.stringContaining("missing package provenance sidecar"),
        path: path.join(cacheDir, "cache-cli-1.0.0.tgz"),
        provenancePath: path.join(
          cacheDir,
          "cache-cli-1.0.0.tgz.bplmeta.json",
        ),
      });

      const dryRunCleanJson = spawnSync(
        "bun",
        [
          bplPath,
          "package-cache",
          "clean",
          "cache-cli",
          "--package-version",
          "1.0.0",
          "--dry-run",
          "--json",
        ],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      const cleanReport = expectJsonStdoutReport<{
        dryRun: boolean;
        removed: Array<{ version: string }>;
      }>(dryRunCleanJson, {
        status: 0,
        check: "package-cache-clean",
        success: true,
      });
      expect(cleanReport.dryRun).toBe(true);
      expect(
        cleanReport.removed.map((entry: { version: string }) => entry.version),
      ).toEqual(["1.0.0"]);
      expect(fs.existsSync(path.join(cacheDir, "cache-cli-1.0.0.tgz"))).toBe(
        true,
      );

      const cleanResult = spawnSync(
        "bun",
        [
          bplPath,
          "package-cache",
          "clean",
          "cache-cli",
          "--package-version",
          "1.0.0",
        ],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(cleanResult.status).toBe(0);
      expect(cleanResult.stdout).toContain("Removed 1 cached archive");
      expect(fs.existsSync(path.join(cacheDir, "cache-cli-1.0.0.tgz"))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(cacheDir, "cache-cli-2.0.0.tgz"))).toBe(
        true,
      );
    });

    test("should report malformed and unsafe cache provenance as JSON issues", () => {
      const appDir = path.join(tempDir, "cache-json-edge-app");
      const homeDir = path.join(tempDir, "cache-json-edge-home");
      const cacheDir = path.join(homeDir, ".bpl", "packages");
      const malformedCachePath = path.join(cacheDir, "cache-bad-1.0.0.tgz");
      const linkedCachePath = path.join(cacheDir, "cache-link-1.0.0.tgz");
      const linkedProvenancePath = `${linkedCachePath}.bplmeta.json`;
      const outsideProvenancePath = path.join(
        tempDir,
        "outside-cache-provenance.json",
      );
      fs.mkdirSync(appDir);
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "bpl.json"),
        JSON.stringify({ name: "cache-json-edge-app", version: "1.0.0" }),
      );
      fs.writeFileSync(malformedCachePath, "legacy malformed provenance");
      fs.writeFileSync(`${malformedCachePath}.bplmeta.json`, "{not-json");
      fs.writeFileSync(linkedCachePath, "legacy linked provenance");
      fs.writeFileSync(outsideProvenancePath, "{}");
      fs.symlinkSync(outsideProvenancePath, linkedProvenancePath, "file");

      const env = {
        ...process.env,
        HOME: homeDir,
      };

      const verifyResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "verify", "--json"],
        {
          cwd: appDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(verifyResult.status).toBe(1);
      const verification = parseJsonObjectStdout<{
        schemaVersion: number;
        check: string;
        success: boolean;
        ok: boolean;
        entriesChecked: number;
        issues: Array<{
          packageName: string;
          kind: string;
          message: string;
          path: string;
          provenancePath: string;
        }>;
      }>(verifyResult);
      expect(verification).toMatchObject({
        schemaVersion: 1,
        check: "package-cache-verify",
        success: false,
        ok: false,
        entriesChecked: 2,
      });
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "cache-bad",
          kind: "invalid-provenance",
          message: expect.stringContaining("invalid package provenance"),
          path: malformedCachePath,
          provenancePath: `${malformedCachePath}.bplmeta.json`,
        }),
      );
      expect(verification.issues).toContainEqual(
        expect.objectContaining({
          packageName: "cache-link",
          kind: "invalid-provenance",
          message: expect.stringContaining("symbolic link"),
          path: linkedCachePath,
          provenancePath: linkedProvenancePath,
        }),
      );

      const doctorResult = spawnSync(
        "bun",
        [bplPath, "doctor", "packages", "--json"],
        {
          cwd: appDir,
          env,
          encoding: "utf-8",
        },
      );
      const doctor = expectJsonStdoutReport<{
        cacheVerification: { issues: Array<{ kind: string; path: string }> };
        issues: Array<{
          severity: string;
          kind: string;
          packageName?: string;
          version?: string;
          path: string;
          provenancePath?: string;
        }>;
      }>(doctorResult, {
        status: 0,
        check: "packages",
        success: true,
      });
      expect(
        doctor.cacheVerification.issues.map((issue) => issue.kind),
      ).toContain("invalid-provenance");
      expect(doctor.issues).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          kind: "package-cache-invalid-provenance",
          packageName: "cache-bad",
          version: "1.0.0",
          path: malformedCachePath,
          provenancePath: `${malformedCachePath}.bplmeta.json`,
        }),
      );
      expect(doctor.issues).toContainEqual(
        expect.objectContaining({
          severity: "warning",
          kind: "package-cache-invalid-provenance",
          packageName: "cache-link",
          version: "1.0.0",
          path: linkedCachePath,
          provenancePath: linkedProvenancePath,
        }),
      );
    });

    test("should repair missing cache provenance for valid archives", () => {
      const homeDir = path.join(tempDir, "cache-repair-home");
      const cacheDir = path.join(homeDir, ".bpl", "packages");
      const packageDir = path.join(tempDir, "cache-repair-package");
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          { name: "cache-repair-cli", version: "1.0.0", main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export value;");

      const packResult = spawnSync("bun", [bplPath, "pack"], {
        cwd: packageDir,
        encoding: "utf-8",
      });
      expect(packResult.status).toBe(0);

      const tarballPath = path.join(packageDir, "cache-repair-cli-1.0.0.tgz");
      fs.copyFileSync(tarballPath, path.join(cacheDir, path.basename(tarballPath)));

      const env = {
        ...process.env,
        HOME: homeDir,
      };

      const repairResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "repair", "cache-repair-cli", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      const repair = expectJsonStdoutReport<{
        dryRun: boolean;
        repaired: unknown[];
        unchanged: unknown[];
        issues: unknown[];
      }>(repairResult, {
        status: 0,
        check: "package-cache-repair",
        success: true,
      });
      expect(repair.dryRun).toBe(false);
      expect(repair.repaired.length).toBe(1);
      expect(repair.unchanged).toEqual([]);
      expect(repair.issues).toEqual([]);

      const verifyResult = spawnSync(
        "bun",
        [bplPath, "package-cache", "verify", "cache-repair-cli", "--json"],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      const verification = expectJsonStdoutReport<{
        ok: boolean;
        entriesChecked: number;
        issues: unknown[];
      }>(verifyResult, {
        status: 0,
        check: "package-cache-verify",
        success: true,
      });
      expect(verification.ok).toBe(true);
      expect(verification.entriesChecked).toBe(1);
      expect(verification.issues).toEqual([]);
    });

    test("should reject invalid package-cache version filters", () => {
      const homeDir = path.join(tempDir, "cache-invalid-version-home");
      fs.mkdirSync(path.join(homeDir, ".bpl", "packages"), {
        recursive: true,
      });
      const env = {
        ...process.env,
        HOME: homeDir,
        NO_COLOR: "1",
      };

      const cleanResult = spawnSync(
        "bun",
        [
          bplPath,
          "package-cache",
          "clean",
          "cache-cli",
          "--package-version",
          "^1.0.0",
        ],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(cleanResult.status).toBe(1);
      expect(cleanResult.stderr).toContain(
        "Invalid package cache version filter: ^1.0.0",
      );

      const repairResult = spawnSync(
        "bun",
        [
          bplPath,
          "package-cache",
          "repair",
          "cache-cli",
          "--package-version",
          "latest",
        ],
        {
          cwd: tempDir,
          env,
          encoding: "utf-8",
        },
      );
      expect(repairResult.status).toBe(1);
      expect(repairResult.stderr).toContain(
        "Invalid package cache version filter: latest",
      );
    });
  });

  describe("uninstall command", () => {
    test("should uninstall installed package", () => {
      // Create and install a package
      const manifest = {
        name: "uninstall-cli-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      spawnSync("bun", [bplPath, "pack"], { cwd: tempDir });
      spawnSync("bun", [bplPath, "install", "uninstall-cli-test-1.0.0.tgz"], {
        cwd: tempDir,
      });

      // Verify it's installed
      let listResult = spawnSync("bun", [bplPath, "list"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      expect(listResult.stdout).toContain("uninstall-cli-test");

      // Uninstall it
      const uninstallResult = spawnSync(
        "bun",
        [bplPath, "uninstall", "uninstall-cli-test"],
        {
          cwd: tempDir,
          encoding: "utf-8",
        },
      );

      expect(uninstallResult.status).toBe(0);
      expect(uninstallResult.stdout).toContain(
        "Uninstalled uninstall-cli-test@1.0.0",
      );

      // Verify it's gone
      listResult = spawnSync("bun", [bplPath, "list"], {
        cwd: tempDir,
        encoding: "utf-8",
      });
      expect(listResult.stdout).toContain("No packages installed");
    });

    test("should report uninstall success and failures as JSON", () => {
      const manifest = {
        name: "uninstall-json-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      spawnSync("bun", [bplPath, "pack"], { cwd: tempDir });
      spawnSync("bun", [bplPath, "install", "uninstall-json-test-1.0.0.tgz"], {
        cwd: tempDir,
      });

      const uninstallResult = spawnSync(
        "bun",
        [bplPath, "uninstall", "uninstall-json-test", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const uninstallReport = expectJsonStdoutReport<{
        check: "package-uninstall";
        success: boolean;
        package: string;
        version: string;
        global: boolean;
      }>(uninstallResult, {
        status: 0,
        check: "package-uninstall",
        success: true,
      });
      expect(uninstallReport).toMatchObject({
        package: "uninstall-json-test",
        version: "1.0.0",
        global: false,
      });

      const missingResult = spawnSync(
        "bun",
        [bplPath, "remove", "missing-json-package", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const missingReport = expectJsonStdoutReport<{
        check: "package-uninstall";
        success: boolean;
        package: string;
        global: boolean;
        error: string;
        errorCode: string;
      }>(missingResult, {
        status: 1,
        check: "package-uninstall",
        success: false,
      });
      expect(missingReport).toMatchObject({
        package: "missing-json-package",
        global: false,
        error: expect.stringContaining("not installed"),
        errorCode: "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED",
      });

      const invalidResult = spawnSync(
        "bun",
        [bplPath, "uninstall", "Bad_Name", "--json"],
        {
          cwd: tempDir,
          encoding: "utf-8",
          env: { ...process.env, NO_COLOR: "1" },
        },
      );
      const invalidReport = expectJsonStdoutReport<{
        check: "package-uninstall";
        success: boolean;
        package: string;
        global: boolean;
        error: string;
        errorCode: string;
      }>(invalidResult, {
        status: 1,
        check: "package-uninstall",
        success: false,
      });
      expect(invalidReport).toMatchObject({
        package: "Bad_Name",
        global: false,
        error: expect.stringContaining("Invalid package name"),
        errorCode: "BPL_PACKAGE_UNINSTALL_NAME_INVALID",
      });
    });

    test("should support remove alias", () => {
      // Create and install a package
      const manifest = {
        name: "remove-cli-test",
        version: "1.0.0",
      };

      fs.writeFileSync("bpl.json", JSON.stringify(manifest, null, 2));
      fs.writeFileSync("index.bpl", "export test;");

      spawnSync("bun", [bplPath, "pack"], { cwd: tempDir });
      spawnSync("bun", [bplPath, "install", "remove-cli-test-1.0.0.tgz"], {
        cwd: tempDir,
      });

      // Use remove alias
      const removeResult = spawnSync(
        "bun",
        [bplPath, "remove", "remove-cli-test"],
        {
          cwd: tempDir,
          encoding: "utf-8",
        },
      );

      expect(removeResult.status).toBe(0);
      expect(removeResult.stdout).toContain("Uninstalled");
    });

    test("should fail when uninstalling non-existent package", () => {
      const result = spawnSync(
        "bun",
        [bplPath, "uninstall", "non-existent-package"],
        {
          cwd: tempDir,
          encoding: "utf-8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("not installed");
    });
  });

  describe("Package import integration", () => {
    test("should compile code that imports from installed package", () => {
      // Create a package with a function
      const packageDir = path.join(tempDir, "math-lib");
      fs.mkdirSync(packageDir);

      const manifest = {
        name: "math-lib",
        version: "1.0.0",
        main: "index.bpl",
      };

      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(manifest, null, 2),
      );

      fs.writeFileSync(
        path.join(packageDir, "index.bpl"),
        `export add;
export multiply;

frame add(a: int, b: int) ret int {
  return a + b;
}

frame multiply(a: int, b: int) ret int {
  return a * b;
}`,
      );

      // Pack and install
      spawnSync("bun", [bplPath, "pack"], { cwd: packageDir });
      const tarball = path.join(packageDir, "math-lib-1.0.0.tgz");

      const projectDir = path.join(tempDir, "app");
      fs.mkdirSync(projectDir);

      spawnSync("bun", [bplPath, "install", tarball], { cwd: projectDir });

      // Create a file that imports from the package
      fs.writeFileSync(
        path.join(projectDir, "main.bpl"),
        `import add, multiply from "math-lib";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    local sum: int = add(5, 3);
    local product: int = multiply(4, 2);
    printf("Sum: %d, Product: %d\\n", sum, product);
    return 0;
}`,
      );

      // Compile it
      const compileResult = spawnSync("bun", [bplPath, "main.bpl"], {
        cwd: projectDir,
        encoding: "utf-8",
      });

      expect(compileResult.status).toBe(0);
      expect(fs.existsSync(path.join(projectDir, "main.ll"))).toBe(true);
    });
  });
});
