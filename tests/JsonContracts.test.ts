import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import {
  CLI_JSON_CHECKS,
  CLI_JSON_CONTRACTS,
} from "../compiler/common/JsonContracts";

describe("JSON contract constants", () => {
  test("keeps an inventory of documented CLI JSON reports", () => {
    expect(CLI_JSON_CONTRACTS).toEqual([
      { command: "bpl build --json", check: "build" },
      { command: "bpl check --json", check: "check" },
      { command: "bpl lint --json", check: "lint" },
      { command: "bpl doctor --json", check: "toolchain" },
      { command: "bpl doctor <unknown> --json", check: "doctor" },
      { command: "bpl doctor packages --json", check: "packages" },
      {
        command: "bpl package-cache list [package] --json",
        check: "package-cache-list",
      },
      {
        command: "bpl package-cache verify [package] --json",
        check: "package-cache-verify",
      },
      {
        command: "bpl package-cache clean [package] --json",
        check: "package-cache-clean",
      },
      {
        command: "bpl package-cache repair [package] --json",
        check: "package-cache-repair",
      },
      { command: "bpl run-script --list --json", check: "run-script-list" },
      { command: "bpl run-script <name> --json", check: "run-script" },
      { command: "bpl clean --dry-run --json", check: "clean" },
      { command: "bpl list --json", check: "package-list" },
      { command: "bpl list --tree --json", check: "package-list-tree" },
    ]);

    expect(
      [...new Set(CLI_JSON_CONTRACTS.map((contract) => contract.check))].sort(),
    ).toEqual(Object.values(CLI_JSON_CHECKS).sort());

    const docs = readFileSync("docs/39-compiler-options.md", "utf8");
    for (const contract of CLI_JSON_CONTRACTS) {
      expect(docs).toContain(contract.command);
      expect(docs).toContain(`check: "${contract.check}"`);
    }
  });

  test("keeps report emitters on shared check constants", () => {
    const emitterFiles = [
      "cli/CompilationRunner.ts",
      "cli/commands/check.ts",
      "cli/commands/clean.ts",
      "cli/commands/doctor.ts",
      "cli/commands/lint.ts",
      "cli/commands/package.ts",
      "cli/commands/runScript.ts",
      "compiler/middleend/PackageManager.ts",
    ];

    for (const file of emitterFiles) {
      const source = readFileSync(file, "utf8");
      for (const { check } of CLI_JSON_CONTRACTS) {
        expect(source).not.toContain(`createJsonReport("${check}"`);
        expect(source).not.toContain(`createJsonReport('${check}'`);
        expect(source).not.toContain(`createJsonReport(\`${check}\``);
      }
    }
  });

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
