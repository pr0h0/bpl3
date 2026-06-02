import { describe, expect, test } from "bun:test";

import {
  isPackageFileSource,
  isValidPackageDependencySource,
  isValidPackageName,
  isValidPackageVersion,
  isVersionSelectorSpec,
} from "../compiler/common/PackageDependencySource";

describe("Package dependency source validation", () => {
  test("validates package names and semantic versions without leading zeros", () => {
    for (const name of ["math", "math-core", "math2"]) {
      expect(isValidPackageName(name), `package name accepts ${name}`).toBe(
        true,
      );
    }
    for (const name of ["", "Bad_Name", "math/core", "math core"]) {
      expect(isValidPackageName(name), `package name rejects ${name}`).toBe(
        false,
      );
    }

    for (const version of ["0.0.0", "1.2.3", "10.20.30"]) {
      expect(
        isValidPackageVersion(version),
        `package version accepts ${version}`,
      ).toBe(true);
    }
    for (const version of ["01.0.0", "1.02.0", "1.0.03", "1.0"]) {
      expect(
        isValidPackageVersion(version),
        `package version rejects ${version}`,
      ).toBe(false);
    }
  });

  test("validates dependency version selectors", () => {
    for (const selector of [
      "*",
      "latest",
      "1.2.3",
      "^1.2.3",
      "~1.2.3",
      ">=1.2.3",
      ">=1.0.0 <2.0.0",
    ]) {
      expect(
        isVersionSelectorSpec(selector),
        `selector accepts ${selector}`,
      ).toBe(true);
    }

    for (const selector of ["01.0.0", "^01.0.0", ">01.0.0", ">=1.0"]) {
      expect(
        isVersionSelectorSpec(selector),
        `selector rejects ${selector}`,
      ).toBe(false);
    }
  });

  test("validates package file sources and dependency sources", () => {
    for (const source of [
      "../math-core/math-core-1.0.0.tgz",
      "./math-core-1.0.0.tgz",
      "math-core-1.0.0.tgz",
      "/tmp/math-core-1.0.0.tgz",
      "C:\\tmp\\math-core-1.0.0.tgz",
      "nested/math-core",
    ]) {
      expect(isPackageFileSource(source), `file source accepts ${source}`).toBe(
        true,
      );
    }
    expect(isPackageFileSource("math-core")).toBe(false);

    for (const source of [
      "math-core",
      "1.2.3",
      "^1.2.3",
      ">=1.0.0 <2.0.0",
      "latest",
      "*",
      "file:../math-core/math-core-1.0.0.tgz",
      "../math-core/math-core-1.0.0.tgz",
      "math-core-1.0.0.tgz",
    ]) {
      expect(
        isValidPackageDependencySource(source),
        `dependency source accepts ${source}`,
      ).toBe(true);
    }

    for (const source of [
      "",
      "   ",
      "01.0.0",
      "^01.0.0",
      ">01.0.0",
      ">=1.0",
      "file:math-core",
    ]) {
      expect(
        isValidPackageDependencySource(source),
        `dependency source rejects ${source}`,
      ).toBe(false);
    }
  });
});
