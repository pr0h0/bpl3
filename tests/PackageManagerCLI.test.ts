import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
  });

  describe("pack command", () => {
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

    test("should fail without bpl.json", () => {
      const result = spawnSync("bun", [bplPath, "pack"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.status).toBe(1);
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
