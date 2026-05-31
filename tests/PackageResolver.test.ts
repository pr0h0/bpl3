import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { resolvePackageImport } from "../compiler/middleend/PackageResolver";

describe("PackageResolver", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-package-resolver-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("resolves global versioned package directories by semantic version", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    fs.mkdirSync(appDir);
    fs.mkdirSync(globalPackageDir);

    for (const version of ["1.10.0", "2.0.0", "10.0.0"]) {
      const packageDir = path.join(globalPackageDir, `math-${version}`);
      fs.mkdirSync(packageDir);
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }, null, 2),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), `export v${version};`);
    }

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result?.packageRoot).toBe(
      path.join(globalPackageDir, "math-10.0.0"),
    );
    expect(details.result?.filePath).toBe(
      path.join(globalPackageDir, "math-10.0.0", "index.bpl"),
    );
  });

  test("does not throw when the global package directory path is a file", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    fs.mkdirSync(appDir);
    fs.writeFileSync(globalPackageDir, "not a directory");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("package-not-found");
  });

  test("rejects invalid package import path segments before searching", () => {
    const appDir = path.join(tempDir, "app");
    fs.mkdirSync(path.join(appDir, "bpl_modules", "math"), { recursive: true });

    for (const importPath of [
      "",
      "/math",
      "math/",
      "math//feature",
      ".",
      "..",
      "math/./feature",
      "math/../secret",
    ]) {
      const details = resolvePackageImport(importPath, appDir);

      expect(details.result).toBeNull();
      expect(details.trace.failureReason).toBe("invalid-import");
      expect(details.trace.failureMessage).toContain(
        "Package imports cannot contain empty, '.' or '..' path segments.",
      );
      expect(details.trace.searchedPaths).toEqual([]);
    }
  });

  test("does not follow symlinked package roots", () => {
    const appDir = path.join(tempDir, "app");
    const modulesDir = path.join(appDir, "bpl_modules");
    const outsidePackageDir = path.join(tempDir, "outside-math");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(outsidePackageDir);
    fs.writeFileSync(
      path.join(outsidePackageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(outsidePackageDir, "index.bpl"), "export add;");
    fs.symlinkSync(outsidePackageDir, path.join(modulesDir, "math"));

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("package-not-found");
  });

  test("does not resolve symlinked package entry files", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideEntrypoint = path.join(tempDir, "outside-index.bpl");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(outsideEntrypoint, "export add;");
    fs.symlinkSync(outsideEntrypoint, path.join(packageDir, "index.bpl"));

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("entrypoint-not-found");
  });

  test("does not resolve symlinked package manifests", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideManifest = path.join(tempDir, "outside-bpl.json");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      outsideManifest,
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    fs.symlinkSync(outsideManifest, path.join(packageDir, "bpl.json"), "file");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
  });

  test("does not resolve symlinked package subpath files", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    const outsideFeature = path.join(tempDir, "outside-feature.bpl");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(outsideFeature, "export add;");
    fs.symlinkSync(outsideFeature, path.join(featureDir, "add.bpl"), "file");

    const details = resolvePackageImport("math/features/add", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
  });

  test("does not resolve symlinked package subpath directories", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideFeatureDir = path.join(tempDir, "outside-feature");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(outsideFeatureDir);
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(outsideFeatureDir, "index.bpl"), "export add;");
    fs.symlinkSync(outsideFeatureDir, path.join(packageDir, "features"), "dir");

    const details = resolvePackageImport("math/features", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
  });

  test("does not resolve package entrypoints outside the package root", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideEntrypoint = path.join(appDir, "bpl_modules", "outside.bpl");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "../outside.bpl" }),
    );
    fs.writeFileSync(outsideEntrypoint, "export add;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("unsafe entrypoint");
  });

  test("does not normalize ambiguous package entrypoint segments", () => {
    const appDir = path.join(tempDir, "app");

    for (const main of ["src//index.bpl", "src/./index.bpl"]) {
      const packageDir = path.join(
        appDir,
        "bpl_modules",
        `math-${main.includes("//") ? "empty" : "dot"}`,
      );
      fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: path.basename(packageDir),
            version: "1.0.0",
            main,
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "src", "index.bpl"), "export add;");

      const details = resolvePackageImport(path.basename(packageDir), appDir);

      expect(details.result).toBeNull();
      expect(details.trace.failureReason).toBe("manifest-invalid");
      expect(details.trace.failureMessage).toContain("unsafe entrypoint");
      expect(details.trace.failureMessage).toContain(main);
    }
  });

  test("does not resolve package roots whose manifest name does not match the import", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        { name: "not-math", version: "1.0.0", main: "index.bpl" },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "manifest name 'not-math' does not match requested package 'math'",
    );
  });

  test("does not fall back to workspace or global packages after malformed local metadata", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const localPackageDir = path.join(appDir, "bpl_modules", "math");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(localPackageDir, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

    fs.writeFileSync(
      path.join(localPackageDir, "bpl.json"),
      JSON.stringify(
        { name: "not-math", version: "1.0.0", main: "index.bpl" },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(localPackageDir, "index.bpl"), "export bad;");

    for (const [packageDir, version] of [
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }, null, 2),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export good;");
    }

    const details = resolvePackageImport("math", sourceDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.foundPackageRoot).toBe(localPackageDir);
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("manifest name 'not-math'");
    expect(details.trace.searchedPaths).not.toContain(workspacePackageDir);
    expect(details.trace.searchedPaths).not.toContain(globalVersionedPackageDir);
  });

  test("does not resolve versioned global directories whose manifest version does not match the directory", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const packageDir = path.join(globalPackageDir, "math-2.0.0");
    fs.mkdirSync(appDir);
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify(
        { name: "math", version: "1.0.0", main: "index.bpl" },
        null,
        2,
      ),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "manifest version '1.0.0' does not match package directory version '2.0.0'",
    );
  });
});
