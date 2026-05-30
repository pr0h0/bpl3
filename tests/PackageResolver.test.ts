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
});
