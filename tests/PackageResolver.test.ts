import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  getPackageResolutionFailureCode,
  resolvePackageImport,
} from "../compiler/middleend/PackageResolver";

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

  test("resolves local, workspace, global exact, and global versioned candidate roots", () => {
    type CandidateCase = {
      name: string;
      expectedSource: "local" | "workspace" | "global";
      version: string;
      getPackageRoot: (context: {
        appDir: string;
        globalPackageDir: string;
      }) => string;
    };
    const cases: CandidateCase[] = [
      {
        name: "local",
        expectedSource: "local",
        version: "1.0.0",
        getPackageRoot: ({ appDir }) =>
          path.join(appDir, "bpl_modules", "math"),
      },
      {
        name: "workspace",
        expectedSource: "workspace",
        version: "2.0.0",
        getPackageRoot: ({ appDir }) => path.join(appDir, "packages", "math"),
      },
      {
        name: "global-exact",
        expectedSource: "global",
        version: "3.0.0",
        getPackageRoot: ({ globalPackageDir }) =>
          path.join(globalPackageDir, "math"),
      },
      {
        name: "global-versioned",
        expectedSource: "global",
        version: "4.0.0",
        getPackageRoot: ({ globalPackageDir }) =>
          path.join(globalPackageDir, "math-4.0.0"),
      },
    ];

    for (const testCase of cases) {
      const caseDir = path.join(tempDir, testCase.name);
      const appDir = path.join(caseDir, "app");
      const sourceDir = path.join(appDir, "src");
      const globalPackageDir = path.join(caseDir, "global-packages");
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(globalPackageDir, { recursive: true });

      const packageRoot = testCase.getPackageRoot({ appDir, globalPackageDir });
      fs.mkdirSync(packageRoot, { recursive: true });
      fs.writeFileSync(
        path.join(packageRoot, "bpl.json"),
        JSON.stringify(
          { name: "math", version: testCase.version, main: "index.bpl" },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageRoot, "index.bpl"), "export add;");

      const details = resolvePackageImport("math", sourceDir, {
        globalPackageDir,
      });

      expect(details.result).toEqual({
        filePath: path.join(packageRoot, "index.bpl"),
        packageName: "math",
        packageRoot,
        source: testCase.expectedSource,
      });
    }
  });

  test("does not ignore symlinked global versioned package roots", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const outsidePackageDir = path.join(tempDir, "outside-math");
    const lowerPackageDir = path.join(globalPackageDir, "math-1.0.0");
    const linkedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(appDir);
    fs.mkdirSync(globalPackageDir);
    fs.mkdirSync(outsidePackageDir);
    fs.mkdirSync(lowerPackageDir);

    for (const [packageDir, version] of [
      [outsidePackageDir, "9.0.0"],
      [lowerPackageDir, "1.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }, null, 2),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }
    fs.symlinkSync(outsidePackageDir, linkedPackageDir, "dir");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedPackageDir);
    expect(details.trace.searchedPaths).not.toContain(lowerPackageDir);
  });

  test("rejects global versioned package roots that only differ by package-name casing", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const mismatchedPackageDir = path.join(globalPackageDir, "Math-9.0.0");
    const requestedMismatchedPackageDir = path.join(
      globalPackageDir,
      "math-9.0.0",
    );
    const lowerPackageDir = path.join(globalPackageDir, "math-1.0.0");
    fs.mkdirSync(appDir);
    fs.mkdirSync(mismatchedPackageDir, { recursive: true });
    fs.mkdirSync(lowerPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [mismatchedPackageDir, "9.0.0"],
      [lowerPackageDir, "1.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureCode).toBe("BPL_PACKAGE_ROOT_CASE_MISMATCH");
    expect(details.trace.failureMessage).toContain(
      "package root casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      requestedMismatchedPackageDir,
    );
    expect(details.trace.failureMessage).toContain(mismatchedPackageDir);
    expect(details.trace.searchedPaths).not.toContain(lowerPackageDir);
  });

  test("does not ignore non-directory global versioned package roots", () => {
    const appDir = path.join(tempDir, "app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const lowerPackageDir = path.join(globalPackageDir, "math-1.0.0");
    const filePackageRoot = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(appDir);
    fs.mkdirSync(globalPackageDir);
    fs.mkdirSync(lowerPackageDir);
    fs.writeFileSync(filePackageRoot, "not a package directory");
    fs.writeFileSync(
      path.join(lowerPackageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(lowerPackageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("not a directory");
    expect(details.trace.failureMessage).toContain(filePackageRoot);
    expect(details.trace.searchedPaths).not.toContain(lowerPackageDir);
  });

  test("rejects non-directory global package search directories", () => {
    const appDir = path.join(tempDir, "global-search-dir-file-app");
    const globalPackageDir = path.join(tempDir, "global-packages");
    fs.mkdirSync(appDir);
    fs.writeFileSync(globalPackageDir, "not a directory");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureCode).toBe(
      "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
    );
    expect(details.trace.failureMessage).toContain(
      "Global package directory path is not a directory",
    );
    expect(details.trace.failureMessage).toContain(globalPackageDir);
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

  test("keeps deterministic unsafe package import path seeds stable", () => {
    const appDir = path.join(tempDir, "app");
    fs.mkdirSync(path.join(appDir, "bpl_modules", "math"), { recursive: true });

    const unsafeImportSeeds = [
      { name: "empty import", importPath: "" },
      { name: "absolute-looking package", importPath: "/math" },
      { name: "trailing empty segment", importPath: "math/" },
      { name: "middle empty segment", importPath: "math//feature" },
      { name: "windows empty segment", importPath: "math\\\\feature" },
      { name: "single dot package", importPath: "." },
      { name: "single dot-dot package", importPath: ".." },
      { name: "dot subpath segment", importPath: "math/./feature" },
      { name: "dot-dot subpath segment", importPath: "math/../secret" },
      { name: "windows dot subpath", importPath: "math\\.\\feature" },
      { name: "windows dot-dot subpath", importPath: "math\\..\\secret" },
    ] as const;

    for (const seed of unsafeImportSeeds) {
      const details = resolvePackageImport(seed.importPath, appDir);

      expect(details.result, seed.name).toBeNull();
      expect(details.trace.failureReason, seed.name).toBe("invalid-import");
      expect(details.trace.failureMessage, seed.name).toContain(
        "Package imports cannot contain empty, '.' or '..' path segments.",
      );
      expect(details.trace.searchedPaths, seed.name).toEqual([]);
      expect(getPackageResolutionFailureCode(details.trace), seed.name).toBe(
        "BPL_PACKAGE_IMPORT_INVALID",
      );
    }
  });

  test("records structured failure codes on package resolver traces", () => {
    const appDir = path.join(tempDir, "structured-code-app");
    const modulesDir = path.join(appDir, "bpl_modules");
    fs.mkdirSync(modulesDir, { recursive: true });

    const invalidImport = resolvePackageImport("math/../secret", appDir);
    expect(invalidImport.trace.failureCode).toBe(
      "BPL_PACKAGE_IMPORT_INVALID",
    );
    expect(getPackageResolutionFailureCode(invalidImport.trace)).toBe(
      invalidImport.trace.failureCode,
    );

    const missingPackage = resolvePackageImport("missing-package", appDir);
    expect(missingPackage.trace.failureCode).toBe("BPL_PACKAGE_NOT_FOUND");
    expect(getPackageResolutionFailureCode(missingPackage.trace)).toBe(
      missingPackage.trace.failureCode,
    );

    const entryMissingDir = path.join(modulesDir, "entry-missing");
    fs.mkdirSync(entryMissingDir);
    fs.writeFileSync(
      path.join(entryMissingDir, "bpl.json"),
      JSON.stringify({
        name: "entry-missing",
        version: "1.0.0",
        main: "missing.bpl",
      }),
    );
    const entryMissing = resolvePackageImport("entry-missing", appDir);
    expect(entryMissing.trace.failureCode).toBe(
      "BPL_PACKAGE_ENTRYPOINT_NOT_FOUND",
    );
    expect(getPackageResolutionFailureCode(entryMissing.trace)).toBe(
      entryMissing.trace.failureCode,
    );

    const unsafeMainDir = path.join(modulesDir, "unsafe-main");
    fs.mkdirSync(unsafeMainDir);
    fs.writeFileSync(
      path.join(unsafeMainDir, "bpl.json"),
      JSON.stringify({
        name: "unsafe-main",
        version: "1.0.0",
        main: "../outside.bpl",
      }),
    );
    const unsafeMain = resolvePackageImport("unsafe-main", appDir);
    expect(unsafeMain.trace.failureCode).toBe(
      "BPL_PACKAGE_ENTRYPOINT_UNSAFE",
    );
    expect(getPackageResolutionFailureCode(unsafeMain.trace)).toBe(
      unsafeMain.trace.failureCode,
    );

    const mathDir = path.join(modulesDir, "math");
    const featureDir = path.join(mathDir, "features");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(mathDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(mathDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(featureDir, "Add.bpl"), "export add;");

    const missingSubpath = resolvePackageImport("math/features/missing", appDir);
    expect(missingSubpath.trace.failureCode).toBe(
      "BPL_PACKAGE_SUBPATH_NOT_FOUND",
    );
    expect(getPackageResolutionFailureCode(missingSubpath.trace)).toBe(
      missingSubpath.trace.failureCode,
    );

    const caseMismatch = resolvePackageImport("math/features/add", appDir);
    expect(caseMismatch.trace.failureCode).toBe(
      "BPL_PACKAGE_SUBPATH_CASE_MISMATCH",
    );
    expect(getPackageResolutionFailureCode(caseMismatch.trace)).toBe(
      caseMismatch.trace.failureCode,
    );

    const linkedRoot = path.join(modulesDir, "linked-root");
    const outsideRoot = path.join(tempDir, "outside-linked-root");
    fs.mkdirSync(outsideRoot);
    fs.symlinkSync(outsideRoot, linkedRoot, "dir");
    const symlinkRoot = resolvePackageImport("linked-root", appDir);
    expect(symlinkRoot.trace.failureCode).toBe("BPL_PACKAGE_ROOT_SYMLINK");
    expect(getPackageResolutionFailureCode(symlinkRoot.trace)).toBe(
      symlinkRoot.trace.failureCode,
    );

    const badManifestDir = path.join(modulesDir, "bad-manifest");
    fs.mkdirSync(badManifestDir);
    fs.writeFileSync(
      path.join(badManifestDir, "bpl.json"),
      JSON.stringify({
        name: "other-name",
        version: "1.0.0",
        main: "index.bpl",
      }),
    );
    const badManifest = resolvePackageImport("bad-manifest", appDir);
    expect(badManifest.trace.failureCode).toBe(
      "BPL_PACKAGE_MANIFEST_INVALID",
    );
    expect(getPackageResolutionFailureCode(badManifest.trace)).toBe(
      badManifest.trace.failureCode,
    );
  });

  test("keeps deterministic package subpath extension seeds stable", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(featureDir, "add.bpl"), "export add;");
    fs.writeFileSync(path.join(featureDir, "legacy.x"), "export legacy;");
    fs.writeFileSync(path.join(featureDir, "link.x"), "export link;");

    const resolvingSeeds = [
      {
        name: "extensionless bpl subpath",
        importPath: "math/features/add",
        expectedPath: path.join(featureDir, "add.bpl"),
      },
      {
        name: "explicit bpl subpath",
        importPath: "math/features/add.bpl",
        expectedPath: path.join(featureDir, "add.bpl"),
      },
      {
        name: "extensionless legacy x subpath",
        importPath: "math/features/legacy",
        expectedPath: path.join(featureDir, "legacy.x"),
      },
      {
        name: "explicit legacy x subpath",
        importPath: "math/features/legacy.x",
        expectedPath: path.join(featureDir, "legacy.x"),
      },
    ] as const;

    for (const seed of resolvingSeeds) {
      const details = resolvePackageImport(seed.importPath, appDir);

      expect(details.result?.filePath, seed.name).toBe(seed.expectedPath);
      expect(details.result?.packageName, seed.name).toBe("math");
      expect(details.result?.source, seed.name).toBe("local");
      expect(details.trace.failureReason, seed.name).toBeUndefined();
    }

    const missingSubpathSeeds = [
      {
        name: "mixed extension path through bpl file",
        importPath: "math/features/add.bpl/child",
      },
      {
        name: "symlink-looking missing subpath",
        importPath: "math/features/linked-child",
      },
      {
        name: "symlink-looking path through x file",
        importPath: "math/features/link.x/child",
      },
    ] as const;

    for (const seed of missingSubpathSeeds) {
      const details = resolvePackageImport(seed.importPath, appDir);

      expect(details.result, seed.name).toBeNull();
      expect(details.trace.failureReason, seed.name).toBe("subpath-not-found");
      expect(details.trace.failureMessage, seed.name).toContain(
        `subpath '${seed.importPath.slice("math/".length)}' was not found`,
      );
      expect(details.trace.entryCandidates.length, seed.name).toBeGreaterThan(
        0,
      );
      expect(getPackageResolutionFailureCode(details.trace), seed.name).toBe(
        "BPL_PACKAGE_SUBPATH_NOT_FOUND",
      );
    }
  });

  test("deduplicates explicit missing package source candidates", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    fs.mkdirSync(path.join(packageDir, "features"), { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "missing.bpl" }),
    );

    const explicitEntryPoint = path.join(packageDir, "missing.bpl");
    const explicitBplSubpath = path.join(
      packageDir,
      "features",
      "missing.bpl",
    );
    const explicitXSubpath = path.join(packageDir, "features", "missing.x");

    const cases = [
      {
        name: "explicit bpl entrypoint",
        details: resolvePackageImport("math", appDir),
        expectedCandidate: explicitEntryPoint,
      },
      {
        name: "explicit bpl subpath",
        details: resolvePackageImport("math/features/missing.bpl", appDir),
        expectedCandidate: explicitBplSubpath,
      },
      {
        name: "explicit x subpath",
        details: resolvePackageImport("math/features/missing.x", appDir),
        expectedCandidate: explicitXSubpath,
      },
    ] as const;

    for (const testCase of cases) {
      expect(testCase.details.result, testCase.name).toBeNull();
      expect(
        testCase.details.trace.entryCandidates.filter(
          (candidate) => candidate === testCase.expectedCandidate,
        ),
        testCase.name,
      ).toHaveLength(1);
      expect(testCase.details.trace.entryCandidates, testCase.name).toEqual([
        ...new Set(testCase.details.trace.entryCandidates),
      ]);
    }
  });

  test("records extensionless package source candidates in probe order", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "missing" }),
    );

    const cases = [
      {
        name: "extensionless entrypoint",
        details: resolvePackageImport("math", appDir),
        baseCandidate: path.join(packageDir, "missing"),
      },
      {
        name: "extensionless subpath",
        details: resolvePackageImport("math/features/missing", appDir),
        baseCandidate: path.join(featureDir, "missing"),
      },
    ] as const;

    for (const testCase of cases) {
      expect(testCase.details.result, testCase.name).toBeNull();
      expect(testCase.details.trace.entryCandidates, testCase.name).toEqual([
        testCase.baseCandidate,
        `${testCase.baseCandidate}.bpl`,
        `${testCase.baseCandidate}.x`,
      ]);
    }
  });

  test("does not resolve explicit source-file imports through directories", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    const explicitBplDir = path.join(featureDir, "add.bpl");
    const explicitXDir = path.join(featureDir, "legacy.x");
    fs.mkdirSync(explicitBplDir, { recursive: true });
    fs.mkdirSync(explicitXDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(explicitBplDir, "index.bpl"), "export add;");
    fs.writeFileSync(path.join(explicitXDir, "index.bpl"), "export legacy;");

    for (const [importPath, explicitDir] of [
      ["math/features/add.bpl", explicitBplDir],
      ["math/features/legacy.x", explicitXDir],
    ] as const) {
      const details = resolvePackageImport(importPath, appDir);

      expect(details.result, importPath).toBeNull();
      expect(details.trace.failureReason, importPath).toBe("subpath-not-found");
      expect(details.trace.failureMessage, importPath).toContain(
        `subpath '${importPath.slice("math/".length)}' was not found`,
      );
      expect(details.trace.failureMessage, importPath).toContain(
        "explicit package source-file imports ending in .bpl or .x do not fall back to directory indexes",
      );
      expect(details.trace.entryCandidates, importPath).toContain(explicitDir);
      expect(details.trace.entryCandidates, importPath).not.toContain(
        path.join(explicitDir, "index.bpl"),
      );
    }
  });

  test("rejects invalid package import names before searching", () => {
    const appDir = path.join(tempDir, "app");
    fs.mkdirSync(path.join(appDir, "bpl_modules", "bad_name"), {
      recursive: true,
    });

    for (const importPath of [
      "Bad_Name",
      "bad_name",
      "bad.name",
      "space name",
      "@scope/pkg",
    ]) {
      const details = resolvePackageImport(importPath, appDir);

      expect(details.result).toBeNull();
      expect(details.trace.failureReason).toBe("invalid-import");
      expect(details.trace.failureMessage).toContain(
        "Package import names must use lowercase letters, digits, and hyphens only.",
      );
      expect(details.trace.searchedPaths).toEqual([]);
    }
  });

  test("rejects package roots that only differ by filesystem casing", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "Pkg-Math");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "pkg-math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("pkg-math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "package root casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(appDir, "bpl_modules", "pkg-math"),
    );
    expect(details.trace.failureMessage).toContain(packageDir);
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_ROOT_CASE_MISMATCH",
    );
  });

  test("rejects package search directories that only differ by filesystem casing", () => {
    const appDir = path.join(tempDir, "app");
    const modulesDir = path.join(appDir, "Bpl_Modules");
    const packageDir = path.join(modulesDir, "math");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "package search directory casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(appDir, "bpl_modules"),
    );
    expect(details.trace.failureMessage).toContain(modulesDir);
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_SEARCH_DIR_CASE_MISMATCH",
    );
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
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(path.join(modulesDir, "math"));
  });

  test("does not fall back to workspace or global packages after symlinked local package roots", () => {
    const appDir = path.join(tempDir, "app");
    const modulesDir = path.join(appDir, "bpl_modules");
    const outsidePackageDir = path.join(tempDir, "outside-math");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(outsidePackageDir);
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [outsidePackageDir, "1.0.0"],
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }
    fs.symlinkSync(outsidePackageDir, path.join(modulesDir, "math"), "dir");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(path.join(modulesDir, "math"));
  });

  test("does not fall back to workspace or global packages after non-directory local package roots", () => {
    const appDir = path.join(tempDir, "app");
    const modulesDir = path.join(appDir, "bpl_modules");
    const packageRoot = path.join(modulesDir, "math");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });
    fs.writeFileSync(packageRoot, "not a package directory");

    for (const [packageDir, version] of [
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("not a directory");
    expect(details.trace.failureMessage).toContain(packageRoot);
  });

  test("does not fall back to workspace or global packages after local package roots missing manifests", () => {
    const appDir = path.join(tempDir, "app");
    const modulesDir = path.join(appDir, "bpl_modules");
    const packageRoot = path.join(modulesDir, "math");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain("missing bpl.json");
    expect(details.trace.failureMessage).toContain(path.join(packageRoot, "bpl.json"));
  });

  test("does not fall back to workspace or global packages after non-directory local package search directories", () => {
    const appDir = path.join(tempDir, "non-dir-local-search-app");
    const sourceDir = path.join(appDir, "src");
    const modulesPath = path.join(appDir, "bpl_modules");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "non-dir-local-global");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });
    fs.writeFileSync(modulesPath, "not a package search directory");

    for (const [packageDir, version] of [
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }

    const details = resolvePackageImport("math", sourceDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureCode).toBe(
      "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
    );
    expect(details.trace.failureMessage).toContain(
      "package search directory is not a directory",
    );
    expect(details.trace.failureMessage).toContain(modulesPath);
    expect(details.trace.searchedPaths).not.toContain(workspacePackageDir);
    expect(details.trace.searchedPaths).not.toContain(globalVersionedPackageDir);
  });

  test("does not fall back to global packages after non-directory workspace package search directories", () => {
    const appDir = path.join(tempDir, "non-dir-workspace-search-app");
    const sourceDir = path.join(appDir, "src");
    const workspaceSearchPath = path.join(appDir, "packages");
    const globalPackageDir = path.join(tempDir, "non-dir-workspace-global");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });
    fs.writeFileSync(workspaceSearchPath, "not a package search directory");
    fs.writeFileSync(
      path.join(globalVersionedPackageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "9.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(
      path.join(globalVersionedPackageDir, "index.bpl"),
      "export add;",
    );

    const details = resolvePackageImport("math", sourceDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureCode).toBe(
      "BPL_PACKAGE_SEARCH_DIR_NOT_DIRECTORY",
    );
    expect(details.trace.failureMessage).toContain(
      "package search directory is not a directory",
    );
    expect(details.trace.failureMessage).toContain(workspaceSearchPath);
    expect(details.trace.searchedPaths).not.toContain(globalVersionedPackageDir);
  });

  test("does not follow symlinked local package search directories", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const realModulesDir = path.join(tempDir, "outside-bpl-modules");
    const realPackageDir = path.join(realModulesDir, "math");
    const workspacePackageDir = path.join(appDir, "packages", "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.mkdirSync(workspacePackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [realPackageDir, "1.0.0"],
      [workspacePackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }
    fs.symlinkSync(realModulesDir, path.join(appDir, "bpl_modules"), "dir");

    const details = resolvePackageImport("math", sourceDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "package search directory is a symbolic link",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(appDir, "bpl_modules"),
    );
    expect(details.trace.searchedPaths).not.toContain(workspacePackageDir);
    expect(details.trace.searchedPaths).not.toContain(globalVersionedPackageDir);
  });

  test("does not follow symlinked workspace package search directories", () => {
    const appDir = path.join(tempDir, "app");
    const sourceDir = path.join(appDir, "src");
    const realWorkspaceDir = path.join(tempDir, "outside-packages");
    const realPackageDir = path.join(realWorkspaceDir, "math");
    const globalPackageDir = path.join(tempDir, "global-packages");
    const globalVersionedPackageDir = path.join(globalPackageDir, "math-9.0.0");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

    for (const [packageDir, version] of [
      [realPackageDir, "1.0.0"],
      [globalVersionedPackageDir, "9.0.0"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify({ name: "math", version, main: "index.bpl" }),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");
    }
    fs.symlinkSync(realWorkspaceDir, path.join(appDir, "packages"), "dir");

    const details = resolvePackageImport("math", sourceDir, {
      globalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "package search directory is a symbolic link",
    );
    expect(details.trace.failureMessage).toContain(path.join(appDir, "packages"));
    expect(details.trace.searchedPaths).not.toContain(globalVersionedPackageDir);
  });

  test("does not follow symlinked global package search directories", () => {
    const appDir = path.join(tempDir, "app");
    const realGlobalPackageDir = path.join(tempDir, "outside-global-packages");
    const realPackageDir = path.join(realGlobalPackageDir, "math-9.0.0");
    const linkedGlobalPackageDir = path.join(tempDir, "global-packages");
    fs.mkdirSync(appDir);
    fs.mkdirSync(realPackageDir, { recursive: true });
    fs.writeFileSync(
      path.join(realPackageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "9.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(realPackageDir, "index.bpl"), "export add;");
    fs.symlinkSync(realGlobalPackageDir, linkedGlobalPackageDir, "dir");

    const details = resolvePackageImport("math", appDir, {
      globalPackageDir: linkedGlobalPackageDir,
    });

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureCode).toBe("BPL_PACKAGE_SEARCH_DIR_SYMLINK");
    expect(details.trace.failureMessage).toContain(
      "Global package directory path is a symbolic link",
    );
    expect(details.trace.failureMessage).toContain(linkedGlobalPackageDir);
    expect(details.trace.searchedPaths).not.toContain(realPackageDir);
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

  test("does not resolve package entrypoints through symlinked parent directories", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideSourceDir = path.join(tempDir, "outside-src");
    const linkedSourceDir = path.join(packageDir, "src");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(outsideSourceDir);
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "src/index.bpl" }),
    );
    fs.writeFileSync(path.join(outsideSourceDir, "index.bpl"), "export add;");
    fs.symlinkSync(outsideSourceDir, linkedSourceDir, "dir");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("entrypoint-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedSourceDir);
  });

  test("stops package entrypoint fallback after symlinked preferred .bpl candidates", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const linkedEntrypoint = path.join(packageDir, "index.bpl");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index" }),
    );
    fs.symlinkSync(path.join(tempDir, "missing-index.bpl"), linkedEntrypoint);
    fs.writeFileSync(path.join(packageDir, "index.x"), "export legacy;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("entrypoint-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedEntrypoint);
  });

  test("stops package entrypoint directory fallback after symlinked index.bpl candidates", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const sourceDir = path.join(packageDir, "src");
    const linkedIndex = path.join(sourceDir, "index.bpl");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "src" }),
    );
    fs.symlinkSync(path.join(tempDir, "missing-index.bpl"), linkedIndex);
    fs.writeFileSync(path.join(sourceDir, "index.x"), "export legacy;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("entrypoint-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedIndex);
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
    expect(details.trace.failureMessage).toContain(
      "manifest path is a symbolic link",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(packageDir, "bpl.json"),
    );
    expect(details.trace.failureMessage).not.toContain(outsideManifest);
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_MANIFEST_SYMLINK",
    );
  });

  test("does not resolve package manifests that only differ by filesystem casing", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const actualManifestPath = path.join(packageDir, "BPL.JSON");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(
      actualManifestPath,
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("manifest-invalid");
    expect(details.trace.failureMessage).toContain(
      "manifest path casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(packageDir, "bpl.json"),
    );
    expect(details.trace.failureMessage).toContain(actualManifestPath);
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_MANIFEST_CASE_MISMATCH",
    );
  });

  test("reports stable failure codes for unreadable package manifest shapes", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const manifestPath = path.join(packageDir, "bpl.json");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    for (const [manifestFixture, expectedMessage, expectedCode] of [
      [
        "{not-json",
        "manifest is not valid JSON",
        "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
      ],
      [
        "[]",
        "manifest must contain a JSON object",
        "BPL_PACKAGE_MANIFEST_NOT_OBJECT",
      ],
    ] as const) {
      fs.rmSync(manifestPath, { recursive: true, force: true });
      fs.writeFileSync(manifestPath, manifestFixture);

      const details = resolvePackageImport("math", appDir);

      expect(details.result).toBeNull();
      expect(details.trace.failureReason).toBe("manifest-invalid");
      expect(details.trace.failureMessage).toContain(expectedMessage);
      expect(details.trace.failureMessage).toContain(manifestPath);
      expect(getPackageResolutionFailureCode(details.trace)).toBe(
        expectedCode,
      );
    }
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

  test("does not resolve package subpaths through symlinked parent directories", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const outsideFeatureDir = path.join(tempDir, "outside-feature");
    const linkedFeatureDir = path.join(packageDir, "features");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(outsideFeatureDir);
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(outsideFeatureDir, "add.bpl"), "export add;");
    fs.symlinkSync(outsideFeatureDir, linkedFeatureDir, "dir");

    const details = resolvePackageImport("math/features/add", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedFeatureDir);
  });

  test("stops package subpath fallback after symlinked preferred .bpl candidates", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    const linkedFeature = path.join(featureDir, "add.bpl");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.symlinkSync(path.join(tempDir, "missing-add.bpl"), linkedFeature);
    fs.writeFileSync(path.join(featureDir, "add.x"), "export legacy;");

    const details = resolvePackageImport("math/features/add", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedFeature);
  });

  test("stops package subpath directory fallback after symlinked index.bpl candidates", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    const linkedIndex = path.join(featureDir, "index.bpl");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.symlinkSync(path.join(tempDir, "missing-feature-index.bpl"), linkedIndex);
    fs.writeFileSync(path.join(featureDir, "index.x"), "export legacy;");

    const details = resolvePackageImport("math/features", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
    expect(details.trace.failureMessage).toContain("symbolic link");
    expect(details.trace.failureMessage).toContain(linkedIndex);
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

  test("rejects package entrypoints that only differ by filesystem casing", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    fs.mkdirSync(path.join(packageDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "Src/Index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "src", "index.bpl"), "export add;");

    const details = resolvePackageImport("math", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("entrypoint-not-found");
    expect(details.trace.failureMessage).toContain(
      "entrypoint casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(packageDir, "Src"),
    );
    expect(details.trace.failureMessage).toContain(
      path.join(packageDir, "src"),
    );
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_ENTRYPOINT_CASE_MISMATCH",
    );
  });

  test("rejects package subpaths that only differ by filesystem casing", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    const featureDir = path.join(packageDir, "features");
    fs.mkdirSync(featureDir, { recursive: true });
    fs.writeFileSync(
      path.join(packageDir, "bpl.json"),
      JSON.stringify({ name: "math", version: "1.0.0", main: "index.bpl" }),
    );
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export root;");
    fs.writeFileSync(path.join(featureDir, "Add.bpl"), "export add;");

    const details = resolvePackageImport("math/features/add", appDir);

    expect(details.result).toBeNull();
    expect(details.trace.failureReason).toBe("subpath-not-found");
    expect(details.trace.failureMessage).toContain(
      "subpath 'features/add' casing does not match",
    );
    expect(details.trace.failureMessage).toContain(
      path.join(featureDir, "add.bpl"),
    );
    expect(details.trace.failureMessage).toContain(
      path.join(featureDir, "Add.bpl"),
    );
    expect(getPackageResolutionFailureCode(details.trace)).toBe(
      "BPL_PACKAGE_SUBPATH_CASE_MISMATCH",
    );
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

  test("rejects package manifest metadata and entry fields with non-string values", () => {
    const cases = [
      {
        name: "schema-number",
        field: "$schema",
        manifestPatch: { $schema: 42 },
        expectedMessage: "manifest $schema must be a string when present",
      },
      {
        name: "description-number",
        field: "description",
        manifestPatch: { description: 42 },
        expectedMessage: "manifest description must be a string when present",
      },
      {
        name: "author-array",
        field: "author",
        manifestPatch: { author: ["BPL"] },
        expectedMessage: "manifest author must be a string when present",
      },
      {
        name: "license-object",
        field: "license",
        manifestPatch: { license: { name: "MIT" } },
        expectedMessage: "manifest license must be a string when present",
      },
      {
        name: "main-number",
        field: "main",
        manifestPatch: { main: 42 },
        expectedMessage: "manifest main must be a string when present",
      },
      {
        name: "entry-array",
        field: "entry",
        manifestPatch: { entry: ["index.bpl"] },
        expectedMessage: "manifest entry must be a string when present",
      },
    ] as const;

    for (const testCase of cases) {
      const appDir = path.join(tempDir, `app-${testCase.name}`);
      const packageDir = path.join(appDir, "bpl_modules", "math");
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(
          {
            name: "math",
            version: "1.0.0",
            ...testCase.manifestPatch,
          },
          null,
          2,
        ),
      );
      fs.writeFileSync(path.join(packageDir, "index.bpl"), "export fallback;");

      const details = resolvePackageImport("math", appDir);

      expect(details.result, testCase.name).toBeNull();
      expect(details.trace.failureReason, testCase.name).toBe(
        "manifest-invalid",
      );
      expect(details.trace.failureMessage, testCase.name).toContain(
        testCase.expectedMessage,
      );
      expect(details.trace.failureMessage, testCase.name).toContain(
        testCase.field,
      );
      expect(getPackageResolutionFailureCode(details.trace), testCase.name).toBe(
        "BPL_PACKAGE_MANIFEST_INVALID",
      );
    }
  });

  test("does not fall back after unsafe manifest main paths", () => {
    const cases = [
      { name: "parent", main: "../outside.bpl" },
      { name: "posix-absolute", main: "/tmp/outside.bpl" },
      { name: "windows-absolute", main: "C:\\outside.bpl" },
      { name: "empty-segment", main: "src//index.bpl" },
      { name: "dot-segment", main: "src/./index.bpl" },
    ] as const;

    for (const { name, main } of cases) {
      const appDir = path.join(tempDir, `app-${name}`);
      const sourceDir = path.join(appDir, "src");
      const localPackageDir = path.join(appDir, "bpl_modules", "math");
      const workspacePackageDir = path.join(appDir, "packages", "math");
      const globalPackageDir = path.join(tempDir, `global-${name}`);
      const globalVersionedPackageDir = path.join(
        globalPackageDir,
        "math-9.0.0",
      );
      fs.mkdirSync(path.join(localPackageDir, "src"), { recursive: true });
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(workspacePackageDir, { recursive: true });
      fs.mkdirSync(globalVersionedPackageDir, { recursive: true });

      fs.writeFileSync(
        path.join(localPackageDir, "bpl.json"),
        JSON.stringify({ name: "math", version: "1.0.0", main }, null, 2),
      );
      fs.writeFileSync(
        path.join(localPackageDir, "src", "index.bpl"),
        "export local;",
      );

      for (const [packageDir, version] of [
        [workspacePackageDir, "1.0.0"],
        [globalVersionedPackageDir, "9.0.0"],
      ] as const) {
        fs.writeFileSync(
          path.join(packageDir, "bpl.json"),
          JSON.stringify({ name: "math", version, main: "index.bpl" }, null, 2),
        );
        fs.writeFileSync(path.join(packageDir, "index.bpl"), "export fallback;");
      }

      const details = resolvePackageImport("math", sourceDir, {
        globalPackageDir,
      });

      expect(details.result).toBeNull();
      expect(details.trace.foundPackageRoot).toBe(localPackageDir);
      expect(details.trace.failureReason).toBe("manifest-invalid");
      expect(details.trace.failureMessage).toContain("unsafe entrypoint");
      expect(details.trace.failureMessage).toContain(main);
      expect(details.trace.failureMessage).toContain(localPackageDir);
      expect(details.trace.searchedPaths).not.toContain(workspacePackageDir);
      expect(details.trace.searchedPaths).not.toContain(
        globalVersionedPackageDir,
      );
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

  test("does not resolve package roots whose manifest identity fields are malformed", () => {
    const appDir = path.join(tempDir, "app");
    const packageDir = path.join(appDir, "bpl_modules", "math");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.writeFileSync(path.join(packageDir, "index.bpl"), "export add;");

    for (const [manifest, message] of [
      [{ name: 123, version: "1.0.0", main: "index.bpl" }, "manifest name"],
      [{ name: "math", version: 1, main: "index.bpl" }, "manifest version"],
      [{ name: "math", version: "latest", main: "index.bpl" }, "manifest version"],
    ] as const) {
      fs.writeFileSync(
        path.join(packageDir, "bpl.json"),
        JSON.stringify(manifest, null, 2),
      );

      const details = resolvePackageImport("math", appDir);

      expect(details.result).toBeNull();
      expect(details.trace.failureReason).toBe("manifest-invalid");
      expect(details.trace.failureMessage).toContain(message);
      expect(details.trace.failureMessage).toContain("invalid bpl.json");
    }
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
