import { describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  runPackedCliRegistrySmoke,
  runPackedCliRegistryTypesSmoke,
  runPackedHelperScriptSmoke,
} from "../tools/release_smoke";

const HELPER_SMOKE_TIMEOUT_MS = 60 * 1000;

describe("Release helper smoke", () => {
  test(
    "exercises packed helper usage paths without full release smoke",
    () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-smoke-"));

      try {
        const installDir = writePackedHelperInstallFixture(tempRoot, {
          includePathSafety: true,
        });

        runPackedHelperScriptSmoke(installDir);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    HELPER_SMOKE_TIMEOUT_MS,
  );

  test("fails clearly when a packed helper dependency is missing", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-helper-smoke-missing-"));

    try {
      const installDir = writePackedHelperInstallFixture(tempRoot, {
        includePathSafety: false,
      });

      expect(() => runPackedHelperScriptSmoke(installDir)).toThrow(
        /Release smoke step failed: check packed npm CLI fuzz artifact repro helper[\s\S]*Cannot find module.*PathSafety/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("keeps full release smoke as the authoritative package check", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "../package.json"), "utf8"),
    );

    expect(packageJson.scripts["release:check"]).toContain(
      "bun run release:smoke",
    );
  });

  test("exercises packed CLI registry subpath import", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "bpl-cli-registry-smoke-"));

    try {
      const installDir = writePackedCliRegistryInstallFixture(tempRoot);

      runPackedCliRegistrySmoke(installDir);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("exercises packed CLI registry TypeScript declarations", () => {
    const tempRoot = mkdtempSync(
      join(tmpdir(), "bpl-cli-registry-types-smoke-"),
    );

    try {
      const installDir = writePackedCliRegistryInstallFixture(tempRoot);

      runPackedCliRegistryTypesSmoke(installDir);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

function writePackedHelperInstallFixture(
  tempRoot: string,
  options: { includePathSafety: boolean },
): string {
  const repoRoot = join(import.meta.dir, "..");
  const installDir = join(tempRoot, "installed");
  const packageDir = join(installDir, "node_modules", "bpl-v3");

  mkdirSync(join(packageDir, "tools"), { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "bpl-v3",
        private: true,
        scripts: {
          "ci:triage": "bun tools/ci_triage.ts",
          fuzz: "bun tools/fuzz_script_wrapper.ts run",
          "fuzz:promote": "bun tools/fuzz_script_wrapper.ts promote",
          "fuzz:replay": "bun tools/fuzz_script_wrapper.ts replay",
          "fuzz:repro": "bun tools/fuzz_artifact_repro.ts",
        },
      },
      null,
      2,
    ) + "\n",
  );

  for (const helperPath of [
    "tools/ci_triage.ts",
    "tools/fuzz_artifact_repro.ts",
    "tools/fuzz_script_wrapper.ts",
  ]) {
    cpSync(join(repoRoot, helperPath), join(packageDir, helperPath));
  }

  if (options.includePathSafety) {
    mkdirSync(join(packageDir, "compiler", "common"), { recursive: true });
    cpSync(
      join(repoRoot, "compiler", "common", "PathSafety.ts"),
      join(packageDir, "compiler", "common", "PathSafety.ts"),
    );
  }

  return installDir;
}

function writePackedCliRegistryInstallFixture(tempRoot: string): string {
  const repoRoot = join(import.meta.dir, "..");
  const installDir = join(tempRoot, "installed");
  const packageDir = join(installDir, "node_modules", "bpl-v3");

  mkdirSync(join(packageDir, "cli"), { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    JSON.stringify(
      {
        name: "bpl-v3",
        private: true,
        exports: {
          "./cli": {
            types: "./cli/index.d.ts",
            import: "./cli/index.js",
            require: "./cli/index.js",
            default: "./cli/index.js",
          },
        },
      },
      null,
      2,
    ) + "\n",
  );

  for (const registryPath of ["cli/index.d.ts", "cli/index.js"]) {
    cpSync(join(repoRoot, registryPath), join(packageDir, registryPath));
  }

  return installDir;
}
