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
});
