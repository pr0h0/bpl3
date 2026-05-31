import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, normalize } from "path";
import { spawnSync } from "child_process";

function trackedMarkdownFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "*.md"], {
    encoding: "utf8",
  });

  expect(result.status).toBe(0);

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function trackedFiles(): Set<string> {
  const result = spawnSync("git", ["ls-files"], {
    encoding: "utf8",
  });

  expect(result.status).toBe(0);

  return new Set(
    result.stdout
      .split("\n")
      .map((line) => normalize(line.trim()))
      .filter(Boolean),
  );
}

function isTrackedPath(path: string, files: Set<string>): boolean {
  const normalizedPath = normalize(path);
  if (files.has(normalizedPath)) {
    return true;
  }

  if (!existsSync(normalizedPath) || !statSync(normalizedPath).isDirectory()) {
    return false;
  }

  const prefix = normalizedPath.endsWith("/")
    ? normalizedPath
    : `${normalizedPath}/`;

  for (const file of files) {
    if (file.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

describe("Markdown documentation", () => {
  test("local markdown links resolve", () => {
    const files = trackedMarkdownFiles();
    const allTrackedFiles = trackedFiles();
    const headings = new Map<string, Set<string>>();

    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const slugs = new Set<string>();

      for (const line of text.split(/\r?\n/)) {
        const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
        if (match?.[2]) {
          slugs.add(headingSlug(match[2]));
        }
      }

      headings.set(file, slugs);
    }

    const failures: string[] = [];
    const linkPattern =
      /!?(?:\[[^\]\n]+\])\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

    for (const file of files) {
      const text = readFileSync(file, "utf8");

      for (const match of text.matchAll(linkPattern)) {
        const raw = match[1]?.replace(/^<|>$/g, "");
        if (
          !raw ||
          raw.startsWith("http://") ||
          raw.startsWith("https://") ||
          raw.startsWith("mailto:") ||
          raw.startsWith("#")
        ) {
          continue;
        }

        const [target, anchor] = raw.split("#");
        if (!target) continue;

        const resolvedPath = normalize(join(dirname(file), target));
        if (!existsSync(resolvedPath)) {
          failures.push(`${file} -> ${raw}`);
          continue;
        }

        if (!isTrackedPath(resolvedPath, allTrackedFiles)) {
          failures.push(`${file} -> ${raw} (target is not tracked)`);
          continue;
        }

        if (anchor && resolvedPath.endsWith(".md")) {
          const expectedAnchor = anchor.toLowerCase();
          if (!headings.get(resolvedPath)?.has(expectedAnchor)) {
            failures.push(`${file} -> ${raw}`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("current docs avoid removed CLI and import spellings", () => {
    const files = trackedMarkdownFiles();
    const failures: string[] = [];
    const removedPatterns = [
      /^\s*(?:\$ )?bpl\s+[^\n]*--run/m,
      /^\s*(?:\$ )?bpl\s+[^\n]*--watch/m,
      /\bbpl\s+compile\b/,
      /\bbpl\s+package\s+install\b/,
      /std\/vec\.bpl/,
      /\bimport\s+\[[a-z][A-Za-z0-9_]*(?:\s*,[^\]]*)?\]\s+from\b/,
      /\bimport\s+\[HTMLEscape_appendEscaped\]\s+from\s+"bpl-templ"/,
      /"std\/reflection"/,
    ];

    for (const file of files) {
      const text = readFileSync(file, "utf8");

      for (const pattern of removedPatterns) {
        if (pattern.test(text)) {
          failures.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test("compiler options document machine-readable JSON contracts", () => {
    const text = readFileSync("docs/39-compiler-options.md", "utf8");
    const normalizedText = text.replace(/\s+/g, " ");
    const requiredSnippets = [
      "### Machine-readable JSON contracts",
      "### CLI JSON compatibility policy",
      "bpl build --json",
      "include `diagnostics` when the failure comes from compiler diagnostics",
      "Build validation failures such as invalid `-O`, `--emit`, `--wasm-runtime`, `--jobs`, input path, and output path errors",
      "do not leave failed LLVM or executable artifacts behind",
      "bpl check --json",
      'check: "check"',
      "Import-resolution failures use the same diagnostic objects as type errors",
      "missing modules, unsafe `std/` paths, and package metadata failures",
      "`totalFiles` and `errorCount`",
      "the formatted `error` string for backward compatibility",
      "a `diagnostics` array with source file locations",
      "bpl lint --json",
      'check: "lint"',
      "bpl doctor --json",
      "The `wasm linker` check reports `BPL_WASM_LINKER_UNAVAILABLE`, checked candidates, environment values, and recommended commands",
      "missing wasm linker support is an optional prerequisite skip, not a successful wasm execution",
      "bpl doctor packages --json",
      "the report also includes `errorCode` such as `BPL_LOCKFILE_UNSUPPORTED_VERSION`, `BPL_PACKAGE_NOT_FOUND`, `BPL_PACKAGE_INSTALL_*_CONFLICT`, or `BPL_PACKAGE_ARCHIVE_*`",
      "bpl package-cache list [package] --json",
      "bpl package-cache verify [package] --json",
      "unsafe cache-root validation failures",
      "`entries: []`",
      "`entriesChecked: 0`",
      "invalid-provenance",
      "`provenancePath`",
      "bpl package-cache clean [package] --json",
      "bpl package-cache repair [package] --json",
      "`removed: []`",
      "`repaired: []`",
      "bpl run-script --list --json",
      "run-script-list",
      "bpl clean --dry-run --json",
      "bpl list --json",
      "package-list-tree",
      "unsafe package-root validation failures",
      "`packages: []`",
      "`tree: []`",
      "`schemaVersion`",
      "`success`",
      "stderr",
      "Backward-compatible additions",
      "Breaking JSON shape changes",
      "ignore unknown fields",
      "bump `schemaVersion`",
    ];

    for (const snippet of requiredSnippets) {
      expect(normalizedText).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document import safety rules", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const importDocs = readFileSync("docs/23-imports-exports.md", "utf8");
    const combinedDocs = `${packageDocs}\n${importDocs}`.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Package import paths cannot contain empty, `.` or `..` segments",
      "The resolver does not follow symlinked package search directories, package roots, manifests, source parent directories, entry files, or subpath entries",
      "Symlinked package search directories such as `bpl_modules/`, workspace `packages/`, and the global package directory are rejected before child package candidates are probed",
      "Nested package source paths such as `src/index.bpl` and `features/add.bpl` reject symlinked parent directories before the child file is read",
      "Existing malformed package roots, including symlinked roots, non-directory package paths, and roots missing `bpl.json`, block same-name workspace/global fallback",
      "Symlinked package entrypoint and subpath candidates also block lower-priority `.x` fallbacks",
      "including package directory `index.bpl` candidates before `index.x`",
      "broken symlink candidates are reported as symlinks before extension fallback can import a lower-priority `.x` file",
      "`bpl_modules/my-package/bpl.json` must declare `\"name\": \"my-package\"`",
      "Global versioned package directories must match their manifest `version`",
      "package metadata instead of silently importing a different package",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("release docs document packed helper support and exclusions", () => {
    const readme = readFileSync("README.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${readme}\n${changelog}`.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Packed npm helper scripts supported from installed packages",
      "npm run fuzz:repro -- --help",
      "npm run fuzz -- --help",
      "npm run fuzz:replay -- --help",
      "npm run fuzz:promote -- --help",
      "npm run ci:triage -- --help",
      "playground/examples/70-browser-wasm-showcase.json",
      "compiler/common/PathSafety.ts",
      "broad compiler sources",
      "bun test tests/ReleaseHelperSmoke.test.ts",
      "Packed `ci:triage` smoke also validates timeout repro contracts for package tooling, package IR verification, and object symbol parsing",
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
      'BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS=30000 bun test tests/CLI.test.ts -t "package IR verification"',
      "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
      "Packed `ci:triage` smoke also validates sanitizer runtime repro contracts",
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document strict manifest path rules", () => {
    const text = readFileSync("docs/25-package-management.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "`main`, `exports`, and `bin` path values are strict package-relative paths",
      "cannot contain empty, `.`, or `..` path segments",
      "`src//index.bpl`, `src/./index.bpl`, and `../secret.bpl` are rejected",
      "`bin/tool.bpl`",
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document global versioned root validation", () => {
    const text = readFileSync("docs/25-package-management.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Global versioned package directories use the `<package>-X.Y.Z` naming form",
      "BPL selects the highest semantic version whose directory name matches the requested package",
      "The selected global versioned package root is still validated with `lstat` before its manifest is read",
      "a symlink, regular file, or other non-directory named like a higher version blocks fallback to lower versions",
      "`~/.bpl/packages/math-9.0.0`",
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document package search directory JSON diagnostics", () => {
    const combinedDocs = [
      readFileSync("docs/25-package-management.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const requiredSnippets = [
      "Symlinked package search directories stop package resolution instead of falling through to lower-priority package roots",
      "a symlinked local `bpl_modules/` stops resolution before workspace `packages/`",
      "a symlinked workspace `packages/` stops resolution before global packages",
      "`bpl check --json` keeps package search-directory safety failures in the per-file `diagnostics` array",
      "Local `bpl_modules/` and workspace `packages/` symlink failures report `package search directory is a symbolic link`",
      "global package cache symlinks report `Global package directory path is a symbolic link`",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document package source safety JSON diagnostics", () => {
    const combinedDocs = [
      readFileSync("docs/25-package-management.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const requiredSnippets = [
      "After a package root has been accepted, package source failures are terminal too",
      "unsafe manifest entrypoint values such as `../outside.bpl`",
      "symlinked entrypoint files",
      "subpath source parents such as `features/`",
      "Package source-safety diagnostics stay in the same `bpl check --json` shape after package root resolution",
      "unsafe `main` values report `unsafe entrypoint`",
      "symlinked entrypoint files report `entrypoint resolves to a symbolic link candidate`",
      "symlinked subpath parents report `subpath 'features/add' resolves to a symbolic link candidate`",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("imports docs document std path safety rules", () => {
    const text = readFileSync("docs/23-imports-exports.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Explicit `std/` paths must be normalized subpaths inside the standard library",
      "cannot contain empty, `.`, or `..` path segments",
      "`std//array.bpl`, `std/./array.bpl`, and `std/../array.bpl` are rejected",
      "standard library root",
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("imports docs document diagnostic mode policy", () => {
    const text = readFileSync("docs/23-imports-exports.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Normal `bpl check`, `bpl build`, and cached builds preserve resolver-specific import diagnostics",
      "Unsafe `std/` paths report the rejected import path",
      "package failures keep package metadata details such as invalid `bpl.json` fields",
      "manifest-name mismatches, missing entrypoints, and searched package paths",
      "Frontend-only outputs such as `bpl build --emit tokens`, `bpl build --emit ast`, and `bpl build --emit formatted` parse the source without loading imported modules",
      "Use `bpl check` or a normal build when you need import resolution diagnostics",
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("wasm docs document optional and required compatibility matrix runs", () => {
    const combinedDocs = [
      readFileSync("README.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("docs/60-compiler-correctness.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "bun run test:wasm",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "prints the checked linker candidates",
      "`BPL_WASM_LINKER_PROBE_TIMEOUT_MS` must be a positive integer; invalid values are ignored with a warning and the 5000ms default is used",
      "optional prerequisite skip, not a successful wasm execution",
      "Start with `bpl doctor --json` to see the same `BPL_WASM_LINKER_UNAVAILABLE` code, candidates, environment, and recommended commands",
      "Use `BPL_REQUIRE_WASM_LD=1 bun run test:wasm` after doctor output to reproduce CI's required-linker behavior locally",
      "tests/helpers/wasmCompatibilityMatrix.ts",
      "`wasm-freestanding`, `wasm-hosted`, `blocked-by-host-api`, or `native-only`",
    ];

    for (const snippet of requiredSnippets) {
      expect(normalizedText).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("compiler correctness docs document CI triage commands", () => {
    const combinedDocs = [
      readFileSync("README.md", "utf8"),
      readFileSync("docs/60-compiler-correctness.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>",
      "bun run ci:triage -- --json --jobs-json jobs.json <run-id>",
      'check: "ci-triage"',
      "`run`, `checkout`, and `summary`",
      "`run.headSha`",
      "`checkout.status`",
      "If `checkout.status` is `stale`, reproduce on the run SHA or confirm current HEAD already fixes it before patching",
      "When a wasm/toolchain step fails, the triage helper prints",
      "Use this order for wasm CI failures: run `bun run ci:triage`, inspect `bpl doctor --json`, then reproduce with `BPL_REQUIRE_WASM_LD=1 bun run test:wasm`",
      "`BPL_WASM_LINKER_UNAVAILABLE` in the doctor report means the local optional linker probe failed; CI makes that condition required through `BPL_REQUIRE_WASM_LD=1`",
      "bun test tests/WasmRuntime.test.ts",
      "bun index.ts doctor --json",
      "BPL_REQUIRE_WASM_LD=1 bun run test:wasm",
      "Timeout failures in CI triage map to the same focused repro commands and timeout knobs shown by `bpl doctor --json`",
      "BPL_COMPILE_DRIVER_TIMEOUT_MS=600000 bun run test:ci",
      "BPL_PACKAGE_TOOL_TIMEOUT_MS=300000 bun test tests/PackageManager.test.ts",
      "BPL_OBJECT_SYMBOL_TIMEOUT_MS=30000 bun test tests/ObjectFileParser.test.ts",
      "BPL_WASM_LINKER_PROBE_TIMEOUT_MS=5000 bun run test:wasm",
      "BPL_RUN_TIMEOUT_MS=30000 bun test tests/BinaryRunner.test.ts",
      "Sanitizer-backed runtime failures are separate from BPL runtime execution timeouts",
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
      "A Bun test timeout in `CompilerSanitizerRuntime.test` means the sanitizer harness exceeded its test budget; it is not fixed by `BPL_RUN_TIMEOUT_MS`",
      'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "When the scheduled `Compiler Fuzz` workflow fails",
      "bun run fuzz:repro -- fuzz/crashes",
    ];

    for (const snippet of requiredSnippets) {
      expect(normalizedText).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document timeout environment fallback diagnostics", () => {
    const combinedDocs = [
      readFileSync("docs/25-package-management.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Timeout environment variables must be positive integers",
      "invalid values are ignored with a warning that says `expected a positive integer`",
      "`BPL_RUN_TIMEOUT_MS` invalid values fall back to running without a timeout",
      "`BPL_CLEAN_GIT_TIMEOUT_MS` invalid values fall back to 5000 milliseconds",
      "`BPL_COMPILE_DRIVER_TIMEOUT_MS` invalid values fall back to 600000 milliseconds",
      "`BPL_PACKAGE_TOOL_TIMEOUT_MS` invalid values fall back to 300000 milliseconds",
      "`BPL_OBJECT_SYMBOL_TIMEOUT_MS` invalid values fall back to 30000 milliseconds",
      "`BPL_PACKAGE_IR_VERIFY_TIMEOUT_MS` invalid values fall back to 30000 milliseconds",
      "`bpl doctor --json` reports timeout environment configuration in `timeouts`",
      "`raw`, `isValid`, `defaultMs`, `effectiveMs`, and `fallbackAction`",
      "Text `bpl doctor` prints a `Timeouts:` section",
    ];

    for (const snippet of requiredSnippets) {
      expect(normalizedText).toContain(snippet.replace(/\s+/g, " "));
    }
  });
});
