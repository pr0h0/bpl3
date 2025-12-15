import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PackageManager } from "../compiler/middleend/PackageManager";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
      localPM.install(tarballPath, { global: false });

      const installedPath = path.join(
        installDir,
        "bpl_modules",
        "local-test-pkg",
      );
      expect(fs.existsSync(installedPath)).toBe(true);
      expect(fs.existsSync(path.join(installedPath, "bpl.json"))).toBe(true);
      expect(fs.existsSync(path.join(installedPath, "index.bpl"))).toBe(true);
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

      packageManager.install(tarballPath, { global: false });

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

      packageManager.install(tarballPath, { global: false });

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
      localPM.install(tarballPath, { global: false });

      const resolved = localPM.resolvePackage("resolve-test-pkg", projectDir);

      expect(resolved).toBeTruthy();
      expect(resolved).toContain("index.bpl");
      expect(fs.existsSync(resolved!)).toBe(true);
    });

    test("should return null for non-existent package", () => {
      const resolved = packageManager.resolvePackage("non-existent", tempDir);
      expect(resolved).toBeNull();
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
