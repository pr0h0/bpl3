import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { CLI_JSON_CHECKS } from "../compiler/common/JsonContracts";

describe("JSON contract constants", () => {
  test("centralizes package-manager report check names", () => {
    expect(CLI_JSON_CHECKS).toMatchObject({
      packageCacheClean: "package-cache-clean",
      packageCacheRepair: "package-cache-repair",
      packageCacheVerify: "package-cache-verify",
      packages: "packages",
    });

    const source = readFileSync(
      "compiler/middleend/PackageManager.ts",
      "utf8",
    );
    for (const check of [
      "package-cache-clean",
      "package-cache-repair",
      "package-cache-verify",
      "packages",
    ]) {
      expect(source).not.toContain(`check: "${check}"`);
    }
  });
});
