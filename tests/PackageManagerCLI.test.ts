import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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

      const projectDir = path.join(tempDir, "locked-project");
      fs.mkdirSync(projectDir);
      const tarballPath = path.join(packageDir, "locked-cli-test-1.0.0.tgz");

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

      fs.writeFileSync(
        path.join(projectDir, "bpl_modules", "locked-cli-test", "index.bpl"),
        "export tampered;",
      );

      const lockedFail = spawnSync("bun", [bplPath, "install", "--locked"], {
        cwd: projectDir,
        encoding: "utf-8",
      });
      expect(lockedFail.status).toBe(1);
      expect(lockedFail.stderr).toContain("hash mismatch");
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
      const treeReport = JSON.parse(listTreeJson.stdout);
      expect(treeReport.schemaVersion).toBe(1);
      expect(treeReport.check).toBe("package-list-tree");
      expect(treeReport.success).toBe(true);
      expect(treeReport.scope).toBe("local");
      expect(treeReport.tree[0].name).toBe("cli-graph-a");
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
      expect(listJson.status).toBe(0);
      const report = JSON.parse(listJson.stdout);
      expect(report.schemaVersion).toBe(1);
      expect(report.check).toBe("package-list");
      expect(report.success).toBe(true);
      expect(report.scope).toBe("local");
      expect(report.packages).toHaveLength(1);
      expect(report.packages[0]).toMatchObject({
        name: "list-cli-test",
        version: "1.5.0",
        description: "Test package for listing",
      });
      expect(report.packages[0].path).toContain("bpl_modules");
      expect(typeof report.packages[0].hash).toBe("string");
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
      const report = JSON.parse(result.stdout);
      expect(report.schemaVersion).toBe(1);
      expect(report.check).toBe("packages");
      expect(report.success).toBe(false);
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

      expect(result.status).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.schemaVersion).toBe(1);
      expect(report.check).toBe("packages");
      expect(report.success).toBe(true);
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
          message: expect.stringContaining("missing package provenance sidecar"),
          path: cachePath,
          hint: expect.stringContaining("bpl package-cache verify doctor-cache-cli"),
        }),
      );
    });
  });

  describe("package-cache command", () => {
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
      expect(listResult.status).toBe(0);
      const entries = JSON.parse(listResult.stdout);
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
      expect(verifyResult.status).toBe(1);
      const verification = JSON.parse(verifyResult.stdout);
      expect(verification.schemaVersion).toBe(1);
      expect(verification.check).toBe("package-cache-verify");
      expect(verification.success).toBe(false);
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
      expect(dryRunCleanJson.status).toBe(0);
      const cleanReport = JSON.parse(dryRunCleanJson.stdout);
      expect(cleanReport.schemaVersion).toBe(1);
      expect(cleanReport.check).toBe("package-cache-clean");
      expect(cleanReport.success).toBe(true);
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
      expect(repairResult.status).toBe(0);
      const repair = JSON.parse(repairResult.stdout);
      expect(repair.schemaVersion).toBe(1);
      expect(repair.check).toBe("package-cache-repair");
      expect(repair.success).toBe(true);
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
      expect(verifyResult.status).toBe(0);
      const verification = JSON.parse(verifyResult.stdout);
      expect(verification.schemaVersion).toBe(1);
      expect(verification.check).toBe("package-cache-verify");
      expect(verification.success).toBe(true);
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
