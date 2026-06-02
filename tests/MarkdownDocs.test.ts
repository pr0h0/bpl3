import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, normalize } from "path";
import { spawnSync } from "child_process";
import { TIMEOUT_ENV_DEFAULTS } from "../compiler/common/Env";
import { CLI_JSON_ERROR_CODE_LISTS } from "../cli/JsonErrorCodes";
import {
  PACKAGE_RESOLUTION_FAILURE_CODES,
  getPackageResolutionFailureCode,
  type PackageResolutionFailureReason,
  type PackageResolutionTrace,
} from "../compiler/middleend/PackageResolver";
import {
  PACKAGE_ARCHIVE_JSON_ERROR_CODES,
  PACKAGE_CACHE_JSON_ERROR_CODES,
  PACKAGE_INIT_JSON_ERROR_CODES,
  PACKAGE_INSTALL_JSON_ERROR_CODES,
  PACKAGE_LIST_JSON_ERROR_CODES,
  PACKAGE_MANIFEST_JSON_ERROR_CODES,
  PACKAGE_UNINSTALL_JSON_ERROR_CODES,
} from "../compiler/middleend/PackageManager";
import {
  IMPORT_STD_PATH_UNSAFE_CODE,
  MODULE_FILE_NOT_FOUND_CODE,
  MODULE_NOT_FOUND_CODE,
  MODULE_PATH_CASE_MISMATCH_CODE,
  MODULE_PATH_NOT_FILE_CODE,
  MODULE_PATH_SYMLINK_CODE,
  MODULE_RESOLUTION_FAILURE_CODES,
} from "../compiler/middleend/ModuleResolver";
import {
  BUILD_JSON_ERROR_CODES,
  BUILD_NO_INPUTS_CODE,
} from "../cli/CompilationRunner";
import { BINDGEN_JSON_ERROR_CODES } from "../cli/commands/bindgen";
import { COMPLETION_SHELL_UNSUPPORTED_CODE } from "../cli/commands/completion";
import {
  DOCTOR_SCOPE_UNKNOWN_CODE,
  WASM_LINKER_UNAVAILABLE_CODE,
} from "../cli/commands/doctor";
import { DOCS_JSON_ERROR_CODES } from "../cli/commands/docs";
import { FORMAT_JSON_ERROR_CODES } from "../cli/commands/format";
import { NEW_PROJECT_JSON_ERROR_CODES } from "../cli/commands/new";
import { CLEAN_JSON_ERROR_CODES } from "../cli/commands/clean";
import { SANITIZER_RUNTIME_UNAVAILABLE_CODE } from "../compiler/common/SanitizerSupport";
import { CHECK_JSON_ERROR_CODES } from "../cli/commands/check";
import { LINT_JSON_ERROR_CODES } from "../cli/commands/lint";
import {
  RUN_SCRIPT_JSON_ERROR_CODES,
} from "../cli/commands/runScript";
import { PACKAGE_DOCS_SMOKE_DOCUMENTATION_SNIPPETS } from "./helpers/packageDocsSmokeExamples";

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

function packageTrace(
  failureReason: PackageResolutionFailureReason,
  failureMessage: string,
): PackageResolutionTrace {
  return {
    importPath: "pkg-math",
    startDir: "/workspace/app/src",
    searchRoots: ["/workspace/app/src", "/workspace/app"],
    searchedPaths: [],
    entryCandidates: [],
    packageName: "pkg-math",
    failureReason,
    failureMessage,
  };
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

interface MarkdownCodeList {
  name: string;
  codes: readonly string[];
}

function normalizedMarkdownText(files: readonly string[]): string {
  return files
    .map((file) => readFileSync(file, "utf8"))
    .join("\n")
    .replace(/\s+/g, " ");
}

function expectDocsContainSnippets(
  docs: string,
  snippets: readonly string[],
): void {
  const missingSnippets = snippets.filter(
    (snippet) => !docs.includes(snippet.replace(/\s+/g, " ")),
  );

  if (missingSnippets.length > 0) {
    throw new Error(
      [
        "Missing Markdown documentation snippets:",
        ...missingSnippets.map((snippet) => `- ${snippet}`),
      ].join("\n"),
    );
  }
}

function expectDocsContainCodes(
  docs: string,
  codes: readonly string[],
): void {
  const missingCodes = codes.filter((code) => !docs.includes(code));

  if (missingCodes.length > 0) {
    throw new Error(
      [
        "Missing Markdown documentation codes:",
        ...missingCodes.map((code) => `- ${code}`),
      ].join("\n"),
    );
  }
}

function expectDocsCoverCodeLists(
  docs: string,
  codeLists: readonly MarkdownCodeList[],
): void {
  const missingEntries: string[] = [];

  for (const { name, codes } of codeLists) {
    for (const code of codes) {
      if (!docs.includes(code)) {
        missingEntries.push(`${name}:${code}`);
      }
    }
  }

  if (missingEntries.length > 0) {
    throw new Error(
      [
        "Missing Markdown documentation code-list entries:",
        ...missingEntries.map((entry) => `- ${entry}`),
      ].join("\n"),
    );
  }
}

describe("Markdown documentation", () => {
  test("snippet helper reports concise missing-snippet diagnostics", () => {
    let thrown: unknown;

    try {
      expectDocsContainSnippets("short docs SECRET_FULL_CORPUS_SENTINEL", [
        "missing snippet",
      ]);
    } catch (error) {
      thrown = error;
    }

    const message = String(thrown);
    expect(message).toContain("Missing Markdown documentation snippets");
    expect(message).toContain("missing snippet");
    expect(message).not.toContain("SECRET_FULL_CORPUS_SENTINEL");
  });

  test("docs-wide snippet assertions use concise helper diagnostics", () => {
    const testSource = readFileSync("tests/MarkdownDocs.test.ts", "utf8");
    const rawSnippetLoopPattern =
      /expect\([^\n]+\)\.toContain\(snippet\.replace\(/g;

    expect(testSource.match(rawSnippetLoopPattern) ?? []).toEqual([]);
  });

  test("code-list helper reports concise missing-code diagnostics", () => {
    let thrown: unknown;

    try {
      expectDocsCoverCodeLists("short docs SECRET_FULL_CORPUS_SENTINEL", [
        {
          name: "ExampleList",
          codes: ["BPL_EXAMPLE_MISSING"],
        },
      ]);
    } catch (error) {
      thrown = error;
    }

    const message = String(thrown);
    expect(message).toContain("Missing Markdown documentation code-list entries");
    expect(message).toContain("ExampleList:BPL_EXAMPLE_MISSING");
    expect(message).not.toContain("SECRET_FULL_CORPUS_SENTINEL");
  });

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
      "Build validation failures such as no input files, invalid `-O`, `--emit`, `--wasm-runtime`, `--jobs`, unsupported `--target`, input path, and output path errors",
      'No-input builds report `errorCode: "BPL_BUILD_NO_INPUTS"`',
      'Unsupported targets report `errorCode: "BPL_BUILD_UNSUPPORTED_TARGET"`',
      "do not leave failed LLVM or executable artifacts behind",
      "bpl check --json",
      'check: "check"',
      "Import-resolution failures use the same diagnostic objects as type errors",
      "missing modules, unsafe `std/` paths, and package metadata failures",
      "Non-package module and standard-library import failures also expose stable codes",
      "`totalFiles` and `errorCount`",
      "the formatted `error` string for backward compatibility",
      "a `diagnostics` array with source file locations",
      "bpl lint --json",
      'check: "lint"',
      "bpl doctor --json",
      "bpl doctor sanitizer --json",
      "The `wasm linker` check reports `BPL_WASM_LINKER_UNAVAILABLE`, checked candidates, environment values, and recommended commands",
      "The focused sanitizer scope reports only `sanitizer runtime support`, including `BPL_SANITIZER_RUNTIME_UNAVAILABLE`, environment values, and recommended commands",
      "missing wasm linker support is an optional prerequisite skip, not a successful wasm execution",
      "bpl doctor packages --json",
      "Duplicate installed package issues preserve the compact joined `path` string and include a `paths` array with every conflicting installed directory",
      "Package-cache warning issues preserve `packageName`, `version`, the cache archive `path`, and `provenancePath`",
      "the report also includes `errorCode` such as `BPL_LOCKFILE_UNSUPPORTED_VERSION`, `BPL_PACKAGE_NOT_FOUND`, `BPL_PACKAGE_INSTALL_*_CONFLICT`, `BPL_PACKAGE_ARCHIVE_*`, or the PackageManager manifest-loading failures documented in package management",
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
      "duplicate installed package names return `errorCode: \"BPL_PACKAGE_DUPLICATE_INSTALLED\"`",
      "List and tree duplicate failures also include `issuesFound`, `issueKinds`, and compact `issues` entries with `kind: \"duplicate-installed-package\"`",
      "`paths` array with every conflicting installed directory",
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

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("public API docs document CompilerOptions optimization and jobs", () => {
    const text = readFileSync("docs/PUBLIC_API.md", "utf8");
    const match = /interface CompilerOptions \{[\s\S]*?\n\}/.exec(text);
    const optionsBlock = match?.[0] ?? "";
    const details = text.replace(/\s+/g, " ");

    expect(optionsBlock).toContain("optimizationLevel?: number");
    expect(optionsBlock).toContain("jobs?: number");
    expect(details).toContain(
      "`optimizationLevel` accepts 0 through 3".replace(/\s+/g, " "),
    );
    expect(details).toContain(
      "`jobs` controls parallel module compilation".replace(/\s+/g, " "),
    );
  });

  test("public API docs document CodeGenerator debug IR options", () => {
    const publicApi = readFileSync("docs/PUBLIC_API.md", "utf8");
    const codeGeneratorSection =
      publicApi
        .split("### `CodeGenerator` Class")[1]
        ?.split("---")[0]
        ?.replace(/\s+/g, " ") ?? "";
    const requiredSnippets = [
      "interface CodeGeneratorOptions",
      "optimizationLevel?: number",
      "debugIrPath?: string | false",
      "`optimizationLevel` accepts 0 through 3",
      "values outside that range are rejected",
      "Debug IR write failures are surfaced to callers",
      "symbolic link",
      "missing parent directory",
    ];

    expectDocsContainSnippets(codeGeneratorSection, requiredSnippets);
  });

  test("docs document doctor scope JSON error code", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Unknown doctor scopes",
      "BPL_DOCTOR_SCOPE_UNKNOWN",
      "bun test tests/CLIJsonParseability.test.ts -t \"doctor scope failures\"",
    ];

    expectDocsContainSnippets(combinedDocs, requiredSnippets);
  });

  test("package docs document import safety rules", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const importDocs = readFileSync("docs/23-imports-exports.md", "utf8");
    const combinedDocs = `${packageDocs}\n${importDocs}`.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Package import paths cannot contain empty, `.` or `..` segments",
      "The resolver does not follow symlinked package search directories, package roots, manifests, source parent directories, entry files, or subpath entries",
      "Symlinked or non-directory package search directories such as `bpl_modules/`, workspace `packages/`, and the global package directory are rejected before child package candidates are probed",
      "Nested package source paths such as `src/index.bpl` and `features/add.bpl` reject symlinked parent directories before the child file is read",
      "Symlinked or non-directory package search directories block same-name fallback to lower-priority workspace or global packages",
      "Existing malformed package roots, including symlinked roots, non-directory package paths, and roots missing `bpl.json`, block same-name workspace/global fallback",
      "Symlinked package entrypoint and subpath candidates also block lower-priority `.x` fallbacks",
      "including package directory `index.bpl` candidates before `index.x`",
      "Extensionless package directory imports such as `math-extra/features/increment` may resolve to `features/increment/index.bpl`",
      "Explicit package source-file imports such as `math-extra/features/increment.bpl` require a file at that exact path",
      "explicit package source-file imports ending in `.bpl` or `.x` do not fall back to directory indexes",
      "broken symlink candidates are reported as symlinks before extension fallback can import a lower-priority `.x` file",
      "`bpl_modules/my-package/bpl.json` must declare `\"name\": \"my-package\"`",
      "Global versioned package directories must match their manifest `version`",
      "package metadata instead of silently importing a different package",
      "Manifest string metadata such as `$schema`, `description`, `author`, and `license` must be strings when present",
      "`keywords` must be an array of strings",
      "`repository` must contain string `type` and `url` fields",
      "The package import resolver also rejects malformed string metadata",
      "It also validates `keywords` as an array of strings and `repository` as an object with string `type` and `url` fields",
      "Dependency, script, and `bin` maps are checked for the same object shape, key, and non-empty string rules during import resolution",
      "Dependency, script, and `bin` maps are also checked for object shape, key, and non-empty string rules during import resolution",
      "`exports` entries are also validated as safe package-relative paths",
      "`exports` entries must be safe package-relative paths",
    ];

    expectDocsContainSnippets(combinedDocs, requiredSnippets);
  });

  test("package docs document package/import docs smoke fixtures", () => {
    const combinedDocs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(
      combinedDocs,
      PACKAGE_DOCS_SMOKE_DOCUMENTATION_SNIPPETS,
    );
  });

  test("changelog documents package DX parity smoke coverage", () => {
    const changelog = normalizedMarkdownText(["CHANGELOG.md"]);

    expectDocsContainSnippets(changelog, [
      "Package Import DX Parity Smoke",
      "math-extra/features/direct.bpl",
      "math-extra/features/increment",
      'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
      'bun test tests/Integration.test.ts -t "package dependency example"',
      'bun test tests/Integration.test.ts -t "package_transitive_dependency/app"',
      'bun test tests/CiTriage.test.ts -t "package docs smoke failures"',
      'bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"',
      "bun test vscode-ext/src/test/diagnostics.test.ts vscode-ext/src/test/imports.test.ts",
    ]);
  });

  test("docs document VS Code extension validation commands", () => {
    const normalizedText = normalizedMarkdownText([
      "docs/49-vscode-extension.md",
      "vscode-ext/README.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(normalizedText, [
      "VS Code Extension Validation",
      "npm run compile:test --prefix vscode-ext",
      "npm test --prefix vscode-ext",
      "npm run compile --prefix vscode-ext",
      "VS Code type-check failures map to",
      "bun run ci:triage",
    ]);
  });

  test("release docs document packed helper support and exclusions", () => {
    const readme = readFileSync("README.md", "utf8");
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${readme}\n${packageDocs}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Packed npm helper scripts supported from installed packages",
      "npm run fuzz:repro -- --help",
      "npm run fuzz -- --help",
      "npm run fuzz:replay -- --help",
      "npm run fuzz:promote -- --help",
      "npm run ci:triage -- --help",
      "playground/examples/70-browser-wasm-showcase.json",
      "playground/frontend/wasmHostAdapter.js",
      "playground/frontend/browserWasmRuntime.js",
      "playground browser wasm helper assets are local playground files, not npm package payload",
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
      "Packed package/import diagnostic smoke validates that the installed npm CLI keeps package import JSON diagnostics machine-readable",
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      "BPL_PACKAGE_MANIFEST_MISSING",
      "Release manifest usage errors",
      "Unknown release manifest option: --unknown",
      "Missing value for --out",
      "Missing value for --repo-root",
      "bun tools/release_manifest.ts --help",
      "prints the release manifest helper usage without writing artifacts",
      'bun test tests/ReleaseMetadata.test.ts -t "release manifest CLI reports usage errors"',
    ];

    expectDocsContainSnippets(combinedDocs, requiredSnippets);
  });

  test("changelog documents compiler option validation hardening", () => {
    const text = readFileSync("CHANGELOG.md", "utf8").replace(/\s+/g, " ");
    const requiredSnippets = [
      "Compiler API Option Validation Hardening",
      "`Compiler`, `CodeGenerator`, `Linker`, and `ModuleCache` now reject",
      "`optimizationLevel` values outside 0-3",
      "invalid `emitType` values",
      "invalid `jobs` counts",
      "Cached module linking now forwards `-O`",
      "bun test tests/CompilerOptions.test.ts tests/CodeGenerator.test.ts tests/Linker.test.ts tests/ModuleCache.test.ts",
    ];

    expectDocsContainSnippets(text, requiredSnippets);
  });

  test("markdown docs document helper CLI inline value diagnostics", () => {
    const readme = readFileSync("README.md", "utf8");
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const correctnessDocs = readFileSync(
      "docs/60-compiler-correctness.md",
      "utf8",
    );
    const combinedDocs = `${readme}\n${packageDocs}\n${correctnessDocs}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Helper CLI inline value forms",
      "bun run ci:triage -- --json --jobs-json=jobs.json --run=<run-id> --repo=owner/repo",
      "`--json=true`",
      "`--jobs-json=`",
      "bun tools/release_manifest.ts --out=dist/release-manifest.json --repo-root=.",
      "`--pack-npm=true`",
      "`--out=`",
      'bun test tests/CiTriage.test.ts -t "inline option values|malformed inline option values"',
      'bun test tests/ReleaseMetadata.test.ts -t "release manifest CLI reports usage errors|release manifest CLI accepts inline option values"',
      "`test:ci` rejects `--json=true`, `--list=true`, `--dry-run=true`, and `--help=true`",
      "Packed `test:ci --list` and `test:ci --json` planning does not require a source-checkout `tests/` directory",
      "bun test tests/TestCiRunner.test.ts",
      "bun tools/cli_json_registry_shim.ts --help",
      "bun tools/cli_json_registry_shim.ts --write",
      "`release:cli-registry` rejects `--check=true` and `--write=true`",
      "bun test tests/JsonErrorCodeLists.test.ts",
    ];

    expectDocsContainSnippets(combinedDocs, requiredSnippets);
  });

  test("docs document supported target validation", () => {
    const text = [
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("docs/PUBLIC_API.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const requiredSnippets = [
      "Unsupported target triples are rejected before LLVM IR is emitted",
      "BPL_BUILD_UNSUPPORTED_TARGET",
      "Supported target families: x86_64 Linux, x86_64 macOS, AArch64 Linux, AArch64 macOS, i686 Linux, x86_64 Windows, wasm32, wasm64",
      "`Compiler`, `CodeGenerator`, and `bpl build` now reject unsupported target triples",
      "empty, whitespace-padded, or empty-component target triples",
      "Target family matching is component-aware",
      "Target matching uses full triple components",
      "substring-only matches such as `notlinux` and `notwasm32` are rejected",
      "Malformed triples with empty components",
      "CodeGenerator rejects unsupported target triples instead of silently using an x86_64 Linux data layout",
      'bun test tests/CodeGenerator.test.ts -t "target" && bun test tests/CLIJsonParseability.test.ts -t "build validation failures"',
    ];

    expectDocsContainSnippets(text, requiredSnippets);
  });

  test("package docs document strict manifest path rules", () => {
    const text = readFileSync("docs/25-package-management.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "`main`, `entry`, `exports`, and `bin` path values are strict package-relative paths",
      "cannot contain empty, `.`, or `..` path segments",
      "`src//index.bpl`, `src/./index.bpl`, and `../secret.bpl` are rejected",
      "`bin/tool.bpl`",
      "The checked-in `bpl-package.schema.json` mirrors these runtime rules",
    ];

    expectDocsContainSnippets(text, requiredSnippets);
  });

  test("package docs document generated manifest schema URI", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "PACKAGE_MANAGER.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "https://raw.githubusercontent.com/pr0h0/bpl3/master/bpl-package.schema.json",
      "`bpl init` and `bpl new` include the canonical `$schema` URI",
      "`bpl init` and `bpl new` generated manifests include the canonical `$schema` URI",
      "Schema tests now validate tracked package manifests and generated init/new manifests",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("package docs document package manager manifest JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "PackageManager manifest-loading failures",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package manifest error codes\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_MANIFEST_JSON_ERROR_CODES);
  });

  test("package docs document package-cache validation JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package-cache validation failures",
      "clean and repair validation failures",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package-cache version filter\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_CACHE_JSON_ERROR_CODES);
  });

  test("package docs document package-cache package filter JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "package-cache package filters",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package-cache package filter\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_CACHE_JSON_ERROR_CODES);
  });

  test("package docs document package list JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package list JSON failure codes",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"error-code lists\"",
      "`paths` array with every conflicting installed directory",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_LIST_JSON_ERROR_CODES);
  });

  test("package docs document passive bin health checks", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package list entries revalidate declared `exports` and `bin` entries",
      "invalid bin",
      "`bpl list --tree`",
      "Package doctor validates the current project package's declared `exports` and `bin` entries",
      "Fix package bin files",
      "bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t \"invalid .* bin files\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("package docs document package-cache bin validation", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "package-cache verify also validates manifest `bin` entries",
      "invalid cached `bin` target",
      "package-cache repair refuses to regenerate provenance",
      "bun test tests/PackageManager.test.ts tests/PackageManagerCLI.test.ts -t \"cached package.*bin files|package cache repair.*bin files|cached package bin files in verify\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("package docs document uninstall JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package uninstall JSON reports",
      "bun test tests/PackageManagerCLI.test.ts -t \"uninstall success and failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_UNINSTALL_JSON_ERROR_CODES);
  });

  test("package docs document pack JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package pack JSON reports",
      'check: "package-pack"',
      "BPL_PACKAGE_MANIFEST_MISSING",
      "bun test tests/PackageManagerCLI.test.ts -t \"pack success and failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("package docs document init JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Package init JSON reports",
      'check: "package-init"',
      "bun test tests/PackageManagerCLI.test.ts -t \"init success and failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, PACKAGE_INIT_JSON_ERROR_CODES);
  });

  test("package docs document install and archive JSON error codes", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      'action: "verified"',
      'action: "verification-failed"',
      "`packagesChecked`",
      "`issuesFound`",
      "`issueKinds`",
      "`--repair-lock` refuses duplicate installed package names",
      "`duplicate-installed-package`",
      "duplicate repair-lock issues include a `paths` array",
      "doctor lock verification drift",
      "`stale-lock-entry`",
      "`lockVerificationKind`",
      "`packageName`",
      "`expectedHash`",
      "`actualHash`",
      "`dependencyOf`",
      "project-mode option conflicts",
      "direct archive paths",
      "bpl install --locked --json",
      "bun test tests/PackageManagerCLI.test.ts -t \"should enforce --locked package verification\"",
      "bun test tests/PackageManagerCLI.test.ts -t \"lock verification drift\"",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package install option conflict|direct archive path\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, [
      ...PACKAGE_INSTALL_JSON_ERROR_CODES,
      ...PACKAGE_ARCHIVE_JSON_ERROR_CODES,
    ]);
  });

  test("package docs document file source path normalization", () => {
    const docs = normalizedMarkdownText(["docs/25-package-management.md"]);
    const requiredSnippets = [
      "bpl install file:deps/my-package-0.1.0.tgz",
      "Direct `bpl install` archive paths and manifest `file:` sources both accept `/` and `\\` as path separators",
      "lockfile sources are recorded with stable `/` separators",
      "When a locked local archive source is no longer present, `bpl install` can restore from the matching archive basename in the global package cache without rewriting the lockfile source",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document project creation JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "README.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Project creation JSON reports",
      'check: "project-new"',
      "bun test tests/CLI.test.ts -t \"new project success and failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, NEW_PROJECT_JSON_ERROR_CODES);
  });

  test("docs document format JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Format JSON reports",
      'check: "format"',
      "bun test tests/CLI.test.ts -t \"format check results and validation failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, FORMAT_JSON_ERROR_CODES);
  });

  test("docs document bindgen JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Bindgen JSON reports",
      'check: "bindgen"',
      "bun test tests/CLI.test.ts -t \"bindgen success and validation failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, BINDGEN_JSON_ERROR_CODES);
  });

  test("docs document docs JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Documentation JSON reports",
      'check: "docs"',
      "bun test tests/CLI.test.ts -t \"documentation generation success and validation failures as JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, DOCS_JSON_ERROR_CODES);
  });

  test("docs document completion JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Completion JSON reports",
      'check: "completion"',
      "BPL_COMPLETION_SHELL_UNSUPPORTED",
      "bun test tests/CLIJsonParseability.test.ts -t \"completion JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document command-level JSON validation constants", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "docs/60-compiler-correctness.md",
      "CHANGELOG.md",
    ]);
    const expectedCodes = [
      COMPLETION_SHELL_UNSUPPORTED_CODE,
      DOCTOR_SCOPE_UNKNOWN_CODE,
      WASM_LINKER_UNAVAILABLE_CODE,
      SANITIZER_RUNTIME_UNAVAILABLE_CODE,
    ];

    expectDocsContainCodes(docs, expectedCodes);
    expect(docs).toContain("unsupported shells return `success: false`");
    expect(docs).toContain("Unknown doctor scopes");
    expect(docs).toContain("The `wasm linker` check reports");
    expect(docs).toContain("The focused sanitizer scope reports");
  });

  test("docs cover the CLI JSON error-code registry", () => {
    const docs = trackedMarkdownFiles()
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expectDocsCoverCodeLists(docs, CLI_JSON_ERROR_CODE_LISTS);
    expect(docs).toContain("CLI_JSON_ERROR_CODE_LISTS");
    expect(docs).toContain("CLI_JSON_ERROR_CODES");
    expect(docs).toContain(
      'import { CLI_JSON_ERROR_CODE_LISTS } from "bpl-v3/cli";',
    );
    expect(docs).toContain(
      "for (const { name, codes } of CLI_JSON_ERROR_CODE_LISTS)",
    );
    expectDocsContainSnippets(docs, [
      "narrow data registry subpath",
      "does not expose compiler internals",
      "ESM consumers can import the registry",
      "CommonJS consumers can require the same subpath",
      'const { CLI_JSON_ERROR_CODE_LISTS, CLI_JSON_ERROR_CODES } = require("bpl-v3/cli");',
      "type CliJsonErrorCodeList",
    ]);
  });

  test("docs document version JSON contract", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Version JSON reports",
      "bpl --version --json",
      "bpl --json --version",
      'check: "version"',
      "bun test tests/CLIJsonParseability.test.ts -t \"version JSON\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
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

    expectDocsContainSnippets(text, requiredSnippets);
  });

  test("docs document global versioned package casing diagnostics", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/60-compiler-correctness.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "Case-mismatched global versioned package directories such as `Math-9.0.0` are rejected before fallback to lower versions such as `math-1.0.0`",
      "`BPL_PACKAGE_ROOT_CASE_MISMATCH`",
      'bun test tests/PackageResolver.test.ts -t "casing|case-mismatched global versioned"',
      'bun test tests/ModuleResolver.test.ts -t "case-mismatched global versioned|filesystem casing"',
      'bun test tests/CiTriage.test.ts -t "package import casing"',
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document bare stdlib import precedence over packages", () => {
    const docs = normalizedMarkdownText([
      "docs/23-imports-exports.md",
      "docs/25-package-management.md",
    ]);
    const requiredSnippets = [
      "Bare imports that match standard-library module basenames resolve to the standard library before package lookup",
      "A package named `math` is shadowed by the built-in `math` module when imported as `\"math\"`",
      "Use a non-stdlib package name such as `math-extra`",
      "package names that collide with standard-library module basenames are not reachable through bare imports",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document package search directory JSON diagnostics", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
    ]);
    const requiredSnippets = [
      "Symlinked and non-directory package search directories stop package resolution instead of falling through to lower-priority package roots",
      "a symlinked local `bpl_modules/` stops resolution before workspace `packages/`",
      "a non-directory local `bpl_modules/` stops resolution before workspace and global packages",
      "a symlinked or non-directory workspace `packages/` stops resolution before global packages",
      "`bpl check --json` keeps package search-directory safety failures in the per-file `diagnostics` array",
      "Local `bpl_modules/` and workspace `packages/` symlink failures report `package search directory is a symbolic link`",
      "global package cache symlinks report `Global package directory path is a symbolic link`",
      "Local `bpl_modules/` and workspace `packages/` file or other non-directory failures report `package search directory is not a directory`",
      "global package cache non-directory failures report `Global package directory path is not a directory`",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document package source safety JSON diagnostics", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
    ]);
    const requiredSnippets = [
      "After a package root has been accepted, package source failures are terminal too",
      "unsafe manifest entrypoint values such as `../outside.bpl`",
      "symlinked entrypoint files",
      "subpath source parents such as `features/`",
      "Package source-safety diagnostics stay in the same `bpl check --json` shape after package root resolution",
      "unsafe `main` values report `unsafe entrypoint`",
      "symlinked entrypoint files report `entrypoint resolves to a symbolic link candidate`",
      "symlinked subpath parents report `subpath 'features/add' resolves to a symbolic link candidate`",
      "case-insensitive development machines cannot silently accept an import that fails on Linux",
      "Package search directories, package roots, manifests, entrypoints, and subpaths also reject case-only filesystem mismatches",
      "use exact filesystem casing",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
  });

  test("docs document package import diagnostic codes from resolver contract", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
    ]);
    const expectedCodes = [
      getPackageResolutionFailureCode(
        packageTrace("invalid-import", "invalid package import"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("package-not-found", "package not found"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "package search directory is a symbolic link",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "package search directory is not a directory",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "package root is not a directory"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "package root is a symbolic link"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "package search directory casing does not match filesystem",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "package root casing does not match filesystem",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "missing bpl.json"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "manifest path is a symbolic link"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "manifest path casing does not match filesystem",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "invalid bpl.json"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "manifest path is not a file"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "manifest is not valid JSON"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "manifest-invalid",
          "manifest must contain a JSON object",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "unsafe entrypoint '../outside.bpl'"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("entrypoint-not-found", "entrypoint is missing"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "entrypoint-not-found",
          "entrypoint resolves to a symbolic link candidate",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "entrypoint-not-found",
          "entrypoint casing does not match filesystem",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace("subpath-not-found", "subpath is missing"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "subpath-not-found",
          "subpath 'features/add' resolves to a symbolic link candidate",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "subpath-not-found",
          "subpath 'features/add' casing does not match filesystem",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "subpath-not-found",
          "subpath 'features/private' is not exported by bpl.json",
        ),
      ),
    ].filter((code): code is string => typeof code === "string");

    expect(expectedCodes.sort()).toEqual(
      [...PACKAGE_RESOLUTION_FAILURE_CODES].sort(),
    );

    expectDocsContainCodes(docs, expectedCodes);
    expect(docs).toContain("include a stable `code`");
    expect(docs).toContain("the normal diagnostic object shape");
  });

  test("docs document module import diagnostic codes from resolver constants", () => {
    const docs = normalizedMarkdownText([
      "docs/23-imports-exports.md",
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
    ]);
    const compilerOptionsDocs = readFileSync(
      "docs/39-compiler-options.md",
      "utf8",
    ).replace(/\s+/g, " ");
    const expectedCodes = [
      MODULE_NOT_FOUND_CODE,
      MODULE_FILE_NOT_FOUND_CODE,
      MODULE_PATH_NOT_FILE_CODE,
      MODULE_PATH_SYMLINK_CODE,
      MODULE_PATH_CASE_MISMATCH_CODE,
      IMPORT_STD_PATH_UNSAFE_CODE,
    ];

    expect(expectedCodes.sort()).toEqual(
      [...MODULE_RESOLUTION_FAILURE_CODES].sort(),
    );

    expectDocsContainCodes(docs, expectedCodes);
    expect(docs).toContain(
      "JSON diagnostics include stable `code` values for import-resolution failures",
    );
    expect(docs).toContain(
      "unsafe explicit standard-library paths use `BPL_IMPORT_STD_PATH_UNSAFE`",
    );
    expect(docs).toContain(
      "Use the exact filesystem casing in imports",
    );
    expectDocsContainSnippets(compilerOptionsDocs, [
      "Missing normalized explicit `std/...` modules use `BPL_MODULE_NOT_FOUND`",
      "`Standard library module not found`",
      "do not fall back to package resolution",
      'bun test tests/CLIJsonParseability.test.ts -t "missing explicit std imports"',
    ]);
  });

  test("docs document missing imported-export diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/23-imports-exports.md",
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Missing named imports use `BPL_IMPORT_EXPORT_NOT_FOUND`",
      "`Module 'math' does not export 'packageMath'`",
      "When the imported module has exported names, the hint includes `Available exports:`",
      "`Available exports: alpha, zeta.`",
      'bun test tests/ImportHandler.test.ts -t "stable code"',
      'bun test tests/CLIJsonParseability.test.ts -t "available exports"',
      'bun test tests/CLIJsonParseability.test.ts -t "stdlib package-name collisions"',
    ]);
  });

  test("docs document duplicate-symbol diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Duplicate top-level symbols use `BPL_SYMBOL_ALREADY_DEFINED`",
      "`Symbol 'Thing' is already defined in this scope`",
      "`Rename this struct or remove the earlier type alias declaration.`",
      "same-scope non-function declarations from silently overwriting earlier symbols",
      "Same-signature function overloads also use `BPL_SYMBOL_ALREADY_DEFINED`",
      "`Function 'pick' with this signature is already defined.`",
      "`Overloads must have different parameter types.`",
      "Duplicate function parameters and duplicate generic parameters also use `BPL_SYMBOL_ALREADY_DEFINED`",
      "`Duplicate parameter name 'value'`",
      "`Duplicate generic type parameter 'T'`",
      "`The parameter 'value' is declared multiple times in function 'pick'.`",
      "Duplicate struct fields and duplicate enum variants also use `BPL_SYMBOL_ALREADY_DEFINED`",
      "`Duplicate field 'x' in struct 'Point'`",
      "`Duplicate enum variant 'Red' in enum 'Color'`",
      'bun test tests/TypeCheckerDuplicateSymbols.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "duplicate top-level symbols"',
      'bun test tests/CLIJsonParseability.test.ts -t "duplicate function signatures"',
      'bun test tests/CLIJsonParseability.test.ts -t "duplicate function parameters|duplicate generic parameters"',
      'bun test tests/CLIJsonParseability.test.ts -t "duplicate struct fields|duplicate enum variants"',
    ]);
  });

  test("docs document recursive type-cycle diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Recursive type cycles use `BPL_TYPE_RECURSION_CYCLE`",
      "`Struct 'Node' has infinite size due to recursive field types`",
      "`Enum 'Tree' has infinite size due to recursive variant types`",
      "`Struct 'Loop' cannot inherit from itself`",
      "`Circular inheritance detected`",
      "`Recursive cycle detected: Node -> Node`",
      "`Inheritance cycle: A -> B -> A`",
      'bun test tests/TypeCheckerRecursiveTypes.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "recursive struct field cycles|recursive enum variant cycles"',
    ]);
  });

  test("docs document generic arity diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Generic arity mismatches use `BPL_GENERIC_ARITY_MISMATCH`",
      "`Generic type 'Box' expects 1 type arguments, but got 2.`",
      "`Generic type 'Alias' expects 1 type arguments, but got 2.`",
      "`Check generic argument count.`",
      'bun test tests/TypeCheckerGenericArity.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "generic type arity|generic alias arity"',
    ]);
  });

  test("docs document undefined type diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Undefined type-name failures use `BPL_TYPE_NOT_FOUND`",
      "`Undefined type 'MissingThing'`",
      "`The type is not defined.`",
      "variable declarations and struct fields",
      'bun test tests/TypeCheckerUndefinedTypes.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "undefined-type"',
    ]);
  });

  test("docs document undefined symbol diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Undefined symbol failures use `BPL_SYMBOL_NOT_FOUND`",
      "`Undefined symbol 'missingValue'`",
      "`Undefined symbol 'missingCall'`",
      "`Ensure the variable or function is declared before use.`",
      "`Did you mean 'totalCount'?`",
      "value identifiers and missing callee identifiers",
      'bun test tests/TypeCheckerUndefinedSymbolDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "undefined symbol"',
    ]);
  });

  test("docs document invalid void type diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Invalid bare void type failures use `BPL_VOID_TYPE_INVALID`",
      "`Variable '_value' cannot be void.`",
      "`Generic type argument cannot be 'void'.`",
      "`Use '*void' for void pointers.`",
      "bare `void` in variable declarations, parameters, struct fields, and generic type arguments",
      "`ret void` and `*void` remain valid",
      'bun test tests/TypeCheckerVoidTypes.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "invalid void type"',
    ]);
  });

  test("docs document builtin type redefinition diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Built-in type redefinition failures use `BPL_BUILTIN_TYPE_REDEFINITION`",
      "`Cannot redefine builtin type 'bool'`",
      "`Builtin type names are reserved.`",
      "type aliases, structs, enums, and specs named after reserved primitive types",
      "standard-library wrapper structs such as `Long` remain valid",
      'bun test tests/TypeCheckerBuiltinRedefinition.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "builtin type redefinition"',
    ]);
  });

  test("docs document invalid fixed array size diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Invalid fixed array size failures use `BPL_ARRAY_SIZE_INVALID`",
      "`Array size must be greater than zero.`",
      "`Arrays cannot have zero or negative size.`",
      "fixed array dimensions such as `int[0]`",
      "dynamic slices such as `int[]` remain valid",
      'bun test tests/TypeCheckerInvalidArraySizes.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "invalid array size"',
    ]);
  });

  test("docs document return type mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Return type mismatch failures use `BPL_RETURN_TYPE_MISMATCH`",
      "`Return type mismatch: expected i32, got *i8`",
      "`Ensure the returned value matches the function's return type.`",
      "mismatched return expressions and `return;` in non-void functions",
      "integer literal returns that fit the declared type remain valid",
      'bun test tests/TypeCheckerReturnTypeMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "return type mismatch"',
    ]);
  });

  test("docs document assignment type mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Assignment type mismatch failures use `BPL_ASSIGNMENT_TYPE_MISMATCH`",
      "`Type mismatch in assignment: cannot assign string to i32`",
      "`The assigned value is not compatible with the target variable's type.`",
      "direct assignment statements such as `value = \"wrong\";`",
      "variable initializer mismatches keep the legacy `E001` code",
      'bun test tests/TypeCheckerAssignmentMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "assignment type mismatch"',
    ]);
  });

  test("docs document condition type mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Condition type mismatch failures use `BPL_CONDITION_TYPE_MISMATCH`",
      "`If condition must be boolean, got int`",
      "`Loop condition must be boolean, got int`",
      "`Ternary condition must be boolean, got int`",
      "`Ensure the condition evaluates to a boolean.`",
      "non-boolean `if`, `loop`, and ternary conditions",
      'bun test tests/TypeCheckerConditionMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "condition type mismatch"',
    ]);
  });

  test("docs document ternary branch mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Ternary branch type mismatch failures use `BPL_TERNARY_BRANCH_TYPE_MISMATCH`",
      "`Ternary branches must have compatible types: int vs string`",
      "`Both branches must return the same type.`",
      "incompatible ternary branch types",
      'bun test tests/TypeCheckerTernaryBranchMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "ternary branch type mismatch"',
    ]);
  });

  test("docs document switch mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Switch mismatch failures use `BPL_SWITCH_VALUE_TYPE_MISMATCH` and `BPL_SWITCH_CASE_TYPE_MISMATCH`",
      "`Switch value must be an integer, string or enum type, got double`",
      "`Case pattern type string not compatible with switch value type i32`",
      "`Ensure the switch expression evaluates to an integer, string or enum.`",
      "`Ensure case patterns match the switch value type.`",
      "invalid switch value types and incompatible case pattern types",
      'bun test tests/TypeCheckerSwitchMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "switch type mismatch"',
    ]);
  });

  test("docs document call-site mismatch diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Call-site mismatch failures use `BPL_CALL_TARGET_NOT_CALLABLE`, `BPL_CALL_ARGUMENT_COUNT_MISMATCH`, `BPL_CALL_ARGUMENT_TYPE_MISMATCH`, `BPL_ENUM_VARIANT_ARGUMENT_COUNT_MISMATCH`, and `BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH`",
      "`Type 'Box' is not callable`",
      "`No matching function for call to 'take' with 0 arguments.`",
      "`No matching function for call to 'take' with provided argument types.`",
      "`Enum variant 'Move' expects 2 arguments, but got 1`",
      "`Type mismatch for argument 2 of 'Move': expected i32, got string`",
      "`Only functions or types with __call__ operator can be called.`",
      "`Available overloads:`",
      "`Usage: Message.Move(`",
      "`Check the variant definition and argument types.`",
      "non-callable targets, function argument count and type mismatches, and enum variant argument count and type mismatches",
      'bun test tests/TypeCheckerCallSiteMismatch.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "call-site mismatch"',
    ]);
  });

  test("docs document control-flow misuse diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Control-flow misuse failures use `BPL_BREAK_OUTSIDE_CONTEXT`, `BPL_CONTINUE_OUTSIDE_LOOP`, `BPL_FALLTHROUGH_OUTSIDE_SWITCH`, and `BPL_DEFER_RETURN_VALUE_INVALID`",
      "`'break' statement outside of loop or switch`",
      "`'continue' statement outside of loop`",
      "`'fallthrough' statement outside of switch`",
      "`Return with value not allowed in defer block`",
      "`Break statements can only be used inside loops or switch statements.`",
      "`Continue statements can only be used inside loops.`",
      "`Fallthrough statements can only be used inside switch statements.`",
      "`Defer blocks must return void.`",
      "break outside loop/switch, continue outside loop, fallthrough outside switch, and return-with-value inside defer",
      'bun test tests/TypeCheckerControlFlowMisuse.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "control-flow misuse"',
    ]);
  });

  test("docs document binary operator misuse diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Binary operator misuse failures use `BPL_POINTER_ARITHMETIC_VOID`, `BPL_POINTER_DIFFERENCE_TYPE_MISMATCH`, `BPL_STRING_CONCAT_UNSUPPORTED`, `BPL_LOGICAL_OPERAND_TYPE_MISMATCH`, `BPL_COMPARISON_TYPE_MISMATCH`, `BPL_BITWISE_OPERAND_TYPE_MISMATCH`, `BPL_MODULO_OPERAND_TYPE_MISMATCH`, `BPL_BINARY_OPERAND_TYPE_MISMATCH`, and `BPL_ARITHMETIC_OPERAND_TYPE_MISMATCH`",
      "`Cannot perform pointer arithmetic on void pointer`",
      "`Cannot compare pointer difference between`",
      "`String concatenation with '+' is not supported.`",
      "`Logical operators require boolean operands`",
      "`Cannot compare int and string`",
      "`Bitwise operators require integer operands`",
      "`Modulo operator requires integer operands`",
      "`Type mismatch: int and string`",
      "`Operator '+' cannot be applied to types`",
      "`Cast to a sized pointer type first`",
      "`Pointer subtraction requires compatible pointee types.`",
      "`Use 'string_concat(a, b)' or similar helper functions.`",
      "`Ensure both operands are boolean expressions.`",
      "`Operands must be of compatible types.`",
      "`Ensure both operands are integers.`",
      "`Ensure operands have compatible types.`",
      "`Arithmetic operators require numeric types.`",
      "unsupported string concatenation, invalid logical/comparison/bitwise/modulo operands, incompatible binary/arithmetic operands, void pointer arithmetic, and incompatible pointer subtraction",
      'bun test tests/TypeCheckerBinaryOperatorMisuse.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "binary operator misuse"',
    ]);
  });

  test("docs document unary operator misuse diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Unary operator misuse failures use `BPL_DEREFERENCE_TARGET_INVALID`, `BPL_LOGICAL_NOT_OPERAND_TYPE_MISMATCH`, `BPL_BITWISE_NOT_OPERAND_TYPE_MISMATCH`, `BPL_UNARY_NEGATION_OPERAND_TYPE_MISMATCH`, and `BPL_UNARY_PLUS_UNSUPPORTED`",
      "`Cannot dereference non-pointer type int`",
      "`Logical not requires boolean operand`",
      "`Bitwise not requires integer operand`",
      "`Unary operator '-' cannot be applied to type 'string'`",
      "`Unary plus operator '+' is not supported`",
      "`Dereference requires a pointer type.`",
      "`Ensure the operand is a boolean expression.`",
      "`Ensure the operand is an integer.`",
      "`Negation requires a numeric type.`",
      "`Simply remove the '+' prefix.`",
      "invalid dereference targets, non-boolean logical-not operands, non-integer bitwise-not operands, non-numeric negation operands, and unsupported primitive unary plus",
      'bun test tests/TypeCheckerUnaryOperatorMisuse.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "unary operator misuse"',
    ]);
  });

  test("docs document index expression misuse diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Index expression misuse failures use `BPL_ARRAY_INDEX_TYPE_MISMATCH`, `BPL_POINTER_INDEX_TYPE_MISMATCH`, and `BPL_INDEX_TARGET_NOT_INDEXABLE`",
      "`Array index must be an integer, got float`",
      "`Pointer index must be an integer, got bool`",
      "`Type 'i32' is not indexable`",
      "`Ensure the index expression evaluates to an integer.`",
      "`Only arrays, pointers, or types with __get__ operator can be indexed.`",
      "array index type mismatches, pointer index type mismatches, and indexing non-indexable targets",
      'bun test tests/TypeCheckerIndexExpressionMisuse.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "index expression misuse"',
    ]);
  });

  test("docs document member access misuse diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Member access misuse failures use `BPL_STATIC_MEMBER_NOT_FOUND`, `BPL_INSTANCE_METHOD_NOT_COMPATIBLE`, `BPL_TUPLE_INDEX_INVALID`, and `BPL_MEMBER_NOT_FOUND`",
      "`No static member 'x' found on type 'S'`",
      "`No compatible instance method 'staticFunc' found on type 'S'`",
      "`Invalid tuple index '2'`",
      "`Cannot access member 'y' on type 'S'`",
      "`Ensure the member is static (does not take 'this').`",
      "`Static methods must be called on the type, not an instance.`",
      "`Valid indices are 0-1`",
      "`Check the type definition for available members.`",
      "missing static members, incompatible instance method access, invalid tuple indices, and missing concrete-type members",
      'bun test tests/TypeCheckerMemberAccessMisuse.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "member access misuse"',
    ]);
  });

  test("docs document expression semantic guard diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Expression semantic guard failures use `BPL_DIVISION_BY_ZERO`, `BPL_SHIFT_COUNT_INVALID`, `BPL_ADDRESS_OF_CONSTANT`, `BPL_ADDRESS_OF_TARGET_INVALID`, `BPL_ARRAY_LITERAL_TYPE_MISMATCH`, `BPL_CAST_INTEGER_TO_STRING`, `BPL_CAST_INVALID`, and `BPL_SIZEOF_VOID_INVALID`",
      "`Division by zero`",
      "`Negative shift count`",
      "`Shift count 8 is out of range`",
      "`Cannot take address of constant expression.`",
      "`Cannot take address of (int, int)`",
      "`Array literal has inconsistent element types`",
      "`Cannot cast integer type 'i32' to 'string'`",
      "`Cannot cast i32 to Box`",
      "`Cannot take size of void`",
      "`Shift counts must be zero or greater.`",
      "`Address-of requires an lvalue.`",
      "`All elements in an array literal must have the same type.`",
      "`This cast is not allowed.`",
      "`Void type has no size.`",
      "compile-time division/modulo by zero, invalid constant shifts, address-of misuse, array literal element mismatches, invalid casts, and `sizeof(void)`",
      'bun test tests/TypeCheckerExpressionSemanticGuards.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "expression semantic guard"',
    ]);
  });

  test("docs document statement semantic guard diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Statement semantic guard failures use `BPL_VARIABLE_TYPE_ANNOTATION_MISSING`, `BPL_VARIABLE_REDECLARATION`, `BPL_INTEGER_LITERAL_OVERFLOW`, `BPL_ASSIGNMENT_TARGET_CONSTANT`, `BPL_ASSIGNMENT_TARGET_INVALID`, and `BPL_TUPLE_DESTRUCTURE_TARGET_INVALID`",
      "`Missing type annotation for variable 'value'`",
      "`Variable 'value' is already declared in this scope`",
      "`Integer overflow: value 128 does not fit in type i8`",
      "`Cannot assign to constant 'value'`",
      "`Invalid assignment target`",
      "`Invalid assignment target in tuple destructuring`",
      "`Variables must have explicit type annotations.`",
      "`Cannot redeclare 'value' in the same scope.`",
      "`Ensure the value is within the range of i8.`",
      "`Constants cannot be modified.`",
      "`Left-hand side of assignment must be a variable",
      "`Tuple elements in assignment must be valid l-values",
      "missing local type annotations, duplicate local declarations, integer literal overflow, const assignment, invalid assignment targets, and invalid tuple destructuring targets",
      'bun test tests/TypeCheckerStatementSemanticGuards.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "statement semantic guard"',
    ]);
  });

  test("docs document struct literal diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Struct literal semantic failures use `BPL_STRUCT_LITERAL_UNKNOWN_STRUCT`, `BPL_GENERIC_ARITY_MISMATCH`, `BPL_STRUCT_LITERAL_FIELD_MISSING`, `BPL_STRUCT_LITERAL_FIELD_UNKNOWN`, and `BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH`",
      "`Unknown struct 'Missing'`",
      "`Generic type 'Box' expects 1 arguments, but got 2`",
      "`Missing field 'y' in struct literal for 'Point'`",
      "`Unknown field 'z' in struct 'Point'`",
      "`Type mismatch for field 'x': expected i32, got",
      "`Ensure the struct is defined.`",
      "`Provide the correct number of generic arguments.`",
      "`Field 'y' is required.`",
      "`Check the struct definition for valid fields.`",
      "`Field value must match the declared type.`",
      "unknown struct names, generic arity mismatches, missing fields, unknown fields, and field type mismatches",
      'bun test tests/TypeCheckerStructLiteralDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "struct literal diagnostics"',
    ]);
  });

  test("docs document enum variant field diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Enum variant field semantic failures use `BPL_ENUM_VARIANT_FIELD_UNKNOWN` and `BPL_ENUM_VARIANT_FIELD_TYPE_MISMATCH`",
      "`Unknown field 'z' in variant 'MouseMove'`",
      "`Type mismatch for field 'x': expected int, got",
      "`Check the variant definition.`",
      "`Field value must match the declared type.`",
      "unknown enum struct variant construction fields, unknown enum struct pattern fields, and enum struct variant field type mismatches",
      'bun test tests/TypeCheckerEnumVariantFieldDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "enum variant field diagnostics"',
    ]);
  });

  test("docs document intrinsic call diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Intrinsic call semantic failures use `BPL_INTRINSIC_GENERIC_ARITY_MISMATCH` and `BPL_INTRINSIC_ARGUMENT_COUNT_MISMATCH`",
      "`Intrinsic __type_id requires exactly 1 generic argument`",
      "`Intrinsic __type_info accepts no arguments`",
      "`Use __type_id<T>() with exactly one type argument.`",
      "`Call __type_info<T>() without value arguments.`",
      "missing or extra `__type_id`/`__type_info` generic type arguments and forbidden value arguments",
      'bun test tests/TypeCheckerIntrinsicCallDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "intrinsic call diagnostics"',
    ]);
  });

  test("docs document match exhaustiveness diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Match exhaustiveness failures use `BPL_MATCH_EXHAUSTIVENESS_MISMATCH`",
      "`Non-exhaustive match: missing variants: Blue`",
      "`Non-exhaustive match: missing default case (_)`",
      "`Match expressions must handle all enum variants or include a wildcard (_) pattern.`",
      "`Type matching requires a default case.`",
      "missing enum variants and missing default cases for non-enum matches",
      'bun test tests/TypeCheckerMatchExhaustivenessDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "match exhaustiveness diagnostics"',
    ]);
  });

  test("docs document tuple match pattern diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Tuple match pattern failures use `BPL_MATCH_TUPLE_PATTERN_TYPE_MISMATCH` and `BPL_MATCH_TUPLE_PATTERN_ARITY_MISMATCH`",
      "`Tuple pattern used on non-tuple type`",
      "`Tuple pattern has 3 elements, but type has 2`",
      "`Expected tuple type, got BasicType`",
      "`Pattern and type must have the same number of elements`",
      "tuple patterns used on non-tuple values and tuple pattern element-count mismatches",
      'bun test tests/TypeCheckerTuplePatternDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "tuple pattern diagnostics"',
    ]);
  });

  test("docs document type-query diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Type-query failures use `BPL_TYPE_QUERY_ENUM_NOT_FOUND` and `BPL_TYPE_QUERY_TYPE_NOT_FOUND`",
      "`Cannot find enum 'Missing'`",
      "`Unknown type 'MissingType'`",
      "`Unknown type: MissingType`",
      "`The type 'Missing' in match<Missing.Some> is not a defined enum.`",
      "`The type 'MissingType' in match<MissingType> is not defined.`",
      "`Ensure the type is defined.`",
      "unresolved `match<T>(value)` enum paths, unresolved `match<T>(value)` plain types, and unresolved `expr is T` targets",
      'bun test tests/TypeCheckerTypeQueryDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "type-query diagnostics"',
    ]);
  });

  test("docs document function-attribute diagnostic codes", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);

    expectDocsContainSnippets(docs, [
      "Function-attribute failures use `BPL_FUNCTION_ATTRIBUTE_UNKNOWN`, `BPL_FUNCTION_ATTRIBUTE_DUPLICATE`, `BPL_FUNCTION_ATTRIBUTE_CONFLICT`, `BPL_FUNCTION_ATTRIBUTE_NORETURN_RETURN_TYPE_MISMATCH`, and the `BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_*` codes",
      "`BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_CONTEXT_INVALID`",
      "`BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RECEIVER_TYPE_MISMATCH`",
      "`BPL_FUNCTION_ATTRIBUTE_AUTO_DESTROY_RETURN_TYPE_MISMATCH`",
      "`Unknown function attribute 'trace'`",
      "`Duplicate function attribute 'inline'`",
      "`Conflicting function attributes: always_inline, noinline`",
      "`Function attribute 'noreturn' requires a void return type`",
      "`Function attribute 'auto_destroy' requires receiver type '*Resource'`",
      "`Only compiler-known function attributes are supported.`",
      "`Remove one of the conflicting attributes.`",
      "`Change the first parameter to 'this: *Resource'.`",
      "unknown attributes, duplicate attributes, conflicting attributes, invalid `noreturn` return types, and invalid `auto_destroy` method shapes",
      'bun test tests/TypeCheckerFunctionAttributeDiagnostics.test.ts',
      'bun test tests/CLIJsonParseability.test.ts -t "function-attribute diagnostics"',
    ]);
  });

  test("docs document build validation error codes from runner constants", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    expectDocsContainCodes(docs, BUILD_JSON_ERROR_CODES);
    expect(BUILD_JSON_ERROR_CODES).toContain(BUILD_NO_INPUTS_CODE);
    expect(docs).toContain("Build validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document clean validation error codes from command constants", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    expectDocsContainCodes(docs, CLEAN_JSON_ERROR_CODES);
    expect(docs).toContain("Clean validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document run-script validation error codes from command constants", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    expectDocsContainCodes(docs, RUN_SCRIPT_JSON_ERROR_CODES);
    expect(docs).toContain("Run-script validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document check and lint input validation error codes from command constants", () => {
    const docs = normalizedMarkdownText([
      "docs/39-compiler-options.md",
      "CHANGELOG.md",
    ]);
    expectDocsContainCodes(docs, [
      ...CHECK_JSON_ERROR_CODES,
      ...LINT_JSON_ERROR_CODES,
    ]);
    expect(docs).toContain("Check and lint input validation `errorCode` values");
    expect(docs).toContain("per-file JSON failure entries");
  });

  test("imports docs document std path safety rules", () => {
    const text = readFileSync("docs/23-imports-exports.md", "utf8").replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Explicit `std/` and `std\\` paths must be normalized subpaths inside the standard library",
      "cannot contain empty, `.`, or `..` path segments",
      "`std//array.bpl`, `std/./array.bpl`, `std/../array.bpl`, and `std\\..\\array.bpl` are rejected",
      "standard library root",
    ];

    expectDocsContainSnippets(text, requiredSnippets);
  });

  test("imports docs document std namespace isolation from packages", () => {
    const importDocs = readFileSync(
      "docs/23-imports-exports.md",
      "utf8",
    ).replace(/\s+/g, " ");
    const readme = readFileSync("README.md", "utf8").replace(/\s+/g, " ");

    expectDocsContainSnippets(importDocs, [
      "Explicit `std/` and `std\\` imports are reserved for the configured standard library",
      "A missing normalized `std/...` module fails with `BPL_MODULE_NOT_FOUND` and a `Standard library module not found` diagnostic",
      "the resolver does not fall back to local packages, workspace packages, global packages, or extra search paths, even if a package is named `std`",
    ]);
    expectDocsContainSnippets(readme, [
      "`std/` and `std\\` imports are reserved for the configured standard library",
      "do not fall back to packages or extra search paths",
    ]);
  });

  test("imports docs document implicit Error import idempotency", () => {
    const importDocs = readFileSync(
      "docs/23-imports-exports.md",
      "utf8",
    ).replace(/\s+/g, " ");
    const changelog = readFileSync("CHANGELOG.md", "utf8").replace(
      /\s+/g,
      " ",
    );

    expectDocsContainSnippets(importDocs, [
      "Repeated imports of the same exported declaration are idempotent",
      "including repeated `import * as namespace` imports of the same module",
      "The compiler implicitly makes `Error` from `std/errors.bpl` available to normal modules",
      'an explicit `import [Error] from "std/errors.bpl";` is accepted',
      "Duplicate names from different declarations still report `BPL_SYMBOL_ALREADY_DEFINED`",
    ]);
    expectDocsContainSnippets(changelog, [
      "Import Idempotency",
      "including repeated `import * as namespace` imports of the same module",
      'Explicit `import [Error] from "std/errors.bpl";` no longer collides with the compiler\'s implicit `Error` import',
      "duplicate names from different declarations still report `BPL_SYMBOL_ALREADY_DEFINED`",
    ]);
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

    expectDocsContainSnippets(text, requiredSnippets);
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
      "Reproduce the hard failure with `BPL_REQUIRE_WASM_LD=1 bun run test:wasm`",
      "Inspect the same linker probe with `bun index.ts doctor --json`",
      "`bpl doctor --json` validates backend wasm compiler/linker prerequisites; it does not inspect browser APIs",
      "The playground Wasm tab reports `Browser wasm runtime` and `Browser BPL compiler` separately",
      "`Browser BPL compiler: unavailable` means browser execution may still work, but BPL-to-wasm compilation is delegated to the backend `/wasm` endpoint",
      "tests/helpers/wasmCompatibilityMatrix.ts",
      "`wasm-freestanding`, `wasm-hosted`, `blocked-by-host-api`, or `native-only`",
      "`wasm32-wasi`, `wasm32-wasip1`, and target triples with an `emscripten` component select hosted mode by default",
      "substring-only components such as `notwasi` or `notemscripten` stay freestanding",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("compiler correctness docs document CI triage commands", () => {
    const combinedDocs = [
      readFileSync("README.md", "utf8"),
      readFileSync("docs/60-compiler-correctness.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>",
      "Accepted run locators are a numeric run ID, a GitHub Actions run URL, or a GitHub Actions job URL",
      "bun run ci:triage -- https://github.com/pr0h0/bpl3/actions/runs/<run-id>/job/<job-id>",
      "Malformed run IDs, malformed URLs, non-GitHub URLs, non-actions URLs, and invalid job URL IDs report usage errors before any GitHub API request",
      "Invalid GitHub Actions run id: <value>",
      "Expected a numeric GitHub Actions run id or github.com Actions run URL, got <value>",
      "Invalid GitHub Actions job id in <url>",
      'bun test tests/CiTriage.test.ts -t "invalid run locators"',
      "bun run ci:triage -- --json --jobs-json jobs.json <run-id>",
      "`--repo` must be `owner/name`",
      "Invalid repository values report `Expected --repo as owner/name, got <value>`",
      "Repository validation is a usage error before any GitHub API request",
      "`--jobs-json` diagnostics are usage errors reported before any GitHub API request",
      "Missing offline jobs files report `Unable to read --jobs-json file <path>: file does not exist.`",
      "Malformed offline jobs files report `Unable to parse --jobs-json file <path>:`",
      "Wrong-shape offline jobs fixtures report `Expected --jobs-json file <path> to contain a GitHub jobs API response with a jobs array.`",
      'check: "ci-triage"',
      "`run`, `checkout`, and `summary`",
      "`run.headSha`",
      "`checkout.status`",
      "If `checkout.status` is `stale`, reproduce on the run SHA or confirm current HEAD already fixes it before patching",
      "When a wasm/toolchain step fails, the triage helper prints",
      "Playground browser wasm failures are separate from wasm linker failures",
      "bun test tests/PlaygroundBrowserWasmRuntime.test.ts tests/PlaygroundWasmHostAdapter.test.ts tests/PlaygroundStaticAssets.test.ts tests/WasmHostImportContract.test.ts",
      "`BplBrowserCompiler.compileToHostedWasm` is a browser compiler-bundle hook, not a `wasm-ld` prerequisite",
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
      "SANITIZER_RUNTIME_TEST_TIMEOUT_MS=30000 bun test tests/CompilerSanitizerRuntime.test.ts",
      "Sanitizer-backed runtime failures are separate from BPL runtime execution timeouts",
      "Use this order for sanitizer CI failures: run `bun run ci:triage`, inspect `bpl doctor sanitizer --json`, then reproduce with `bun run test:sanitizers`",
      "`BPL_SANITIZER_RUNTIME_UNAVAILABLE` in the doctor report means the local compiler could not link ASan/UBSan with compiler-rt/libclang_rt",
      "When compiler-rt is unavailable, `CompilerSanitizerRuntime.test` reports Bun skipped tests instead of counting the sanitizer runtime assertions as successful execution",
      "That skip is an optional prerequisite skip, not a successful sanitizer-backed runtime run",
      "A BPL runtime error under sanitizers is different from missing compiler-rt support",
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
      "A Bun test timeout in `CompilerSanitizerRuntime.test` means the sanitizer harness exceeded its test budget; it is not fixed by `BPL_RUN_TIMEOUT_MS`",
      "`SANITIZER_RUNTIME_TEST_TIMEOUT_MS` must be a positive integer; invalid values are ignored with a warning and the 30000ms default is used",
      'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
      "Stale package lock doctor failures map to focused package doctor checks",
      "`stale-lock-entry`",
      '`lockVerificationKind: "missing-package"`',
      'bun test tests/PackageManagerCLI.test.ts -t "stale lock entries"',
      'bun test tests/PackageManager.test.ts -t "stale lock entries"',
      "Package docs smoke failures map to the focused package/import docs examples and package documentation checks",
      'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
      'bun test tests/MarkdownDocs.test.ts -t "package docs document package/import docs smoke fixtures"',
      "Release registry sync failures map to `bun run release:cli-registry`",
      "Use `bun run release:cli-registry` before broader release smoke when `ci:triage` reports a stale CLI registry shim",
      "GitHub Actions triage:",
      "Failed jobs:",
      "failed steps:",
      "local repro:",
      "No focused local repro command matched this job",
      "Inspect the failed step logs",
      "add a ci:triage mapping when the failure pattern is recurring",
      "When the scheduled `Compiler Fuzz` workflow fails",
      "bun run fuzz:repro -- fuzz/crashes",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("changelog documents stale package lock CI triage mapping", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const normalizedText = changelog.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Stale Package Lock CI Triage",
      "`stale-lock-entry`",
      '`lockVerificationKind: "missing-package"`',
      'bun test tests/PackageManagerCLI.test.ts -t "stale lock entries"',
      'bun test tests/PackageManager.test.ts -t "stale lock entries"',
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("compiler correctness docs document fuzz helper usage diagnostics", () => {
    const combinedDocs = [
      readFileSync("README.md", "utf8"),
      readFileSync("docs/60-compiler-correctness.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Fuzz helper usage diagnostics",
      "`bun run fuzz:repro` rejects flag values such as `--json=true`",
      "`--input=`",
      "mixed positional and `--input` artifact paths",
      "`bun run fuzz` rejects malformed boolean values such as `--minimize maybe`",
      "`--iterations=`",
      "status 2",
      'bun test tests/FuzzArtifactRepro.test.ts -t "malformed CLI option values"',
      'bun test tests/CompilerFuzzRunner.test.ts -t "fuzz package wrappers reject malformed option values"',
      'bun test tests/ReleaseHelperSmoke.test.ts -t "exercises packed helper usage paths"',
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("playground docs document browser wasm compiler hook contract", () => {
    const combinedDocs = [
      readFileSync("playground/README.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("docs/60-compiler-correctness.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "`BplBrowserCompiler.compileToHostedWasm({ code, args })`",
      "`code` is the editor source string",
      "`args` is the argv array passed to `main`",
      "Successful responses return `success: true` and a required `wasmBase64` string",
      "`wasmBytes` and `imports` are optional display metadata",
      "Failure responses return `success: false` with an `error` string",
      "The playground then calls `BplWasmHostAdapter.runHostedWasmInBrowser(wasmBase64, args)`",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("playground docs document native execution payload contract", () => {
    const combinedDocs = [
      readFileSync("playground/README.md", "utf8"),
      readFileSync("playground/ARCHITECTURE.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "Native execution responses",
      "`success: true`",
      "`output` combines stdout and stderr",
      "`Runtime error: <stderr-or-message>`",
      "`Execution timeout (5 seconds)`",
      "`tests/PlaygroundNativeExecution.test.ts`",
      "`tests/PlaygroundProcessRunner.test.ts`",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("playground docs document backend execution CI triage path", () => {
    const combinedDocs = [
      readFileSync("playground/README.md", "utf8"),
      readFileSync("playground/ARCHITECTURE.md", "utf8"),
    ].join("\n");
    const normalizedText = combinedDocs.replace(/\s+/g, " ");
    const requiredSnippets = [
      "When `/compile` native execution fails in CI, start with `bun run ci:triage`",
      "`playground/backend/nativeExecution.ts`",
      "`playground/backend/processRunner.ts`",
      "`PlaygroundNativeExecution.test`",
      "`PlaygroundProcessRunner.test`",
      "argv-vector playground example failures",
      "bun test tests/PlaygroundNativeExecution.test.ts",
      "bun test tests/PlaygroundProcessRunner.test.ts",
      'bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"',
      'bun test tests/TutorialExamples.test.ts -t "argv-vector execution"',
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("docs document CI-safe typed test runner", () => {
    const normalizedText = normalizedMarkdownText([
      "README.md",
      "docs/57-extending-compiler.md",
      "docs/60-compiler-correctness.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "bun run test:ci",
      "tools/test_ci.ts",
      "bun tools/test_ci.ts --list",
      "bun tools/test_ci.ts --dry-run",
      "bun tools/test_ci.ts --json",
      "bun tools/test_ci.ts --help",
      "Unknown test_ci options exit with status 2 on stderr while stdout stays empty",
      "The runner builds runtime support first",
      "runs `tests/PlaygroundExampleContracts.test.ts`, `tests/Integration.test.ts`, and `tests/PlaygroundExamples.test.ts`",
      "runs the VS Code extension suite",
      "checks the generated `bpl-v3/cli` registry shim with `bun run release:cli-registry`",
      "then runs discovered top-level CI-safe unit tests",
      "Playground example JSON contracts are validated before the full playground compile/run pass",
      "bun test tests/PlaygroundExampleContracts.test.ts",
      "CI-safe unit discovery includes `tests/CiTriage.test.ts`, so offline jobs-json diagnostics run in the broad suite",
      'bun test tests/CiTriage.test.ts -t "unreadable and malformed jobs-json"',
      "bun run release:cli-registry",
      "correctness corpora, long fuzz, sanitizer runtime, golden LLVM shape, and full release smoke suites remain in their dedicated scripts",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("docs document integration job environment validation", () => {
    const normalizedText = normalizedMarkdownText([
      "README.md",
      "docs/60-compiler-correctness.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "BPL_INTEGRATION_JOBS",
      "must be a positive integer",
      "malformed values are ignored with a warning",
      "auto-detected integration job count",
      "bun test tests/IntegrationRunner.test.ts",
      "ci:triage maps `BPL_INTEGRATION_JOBS`",
      "BPL_INTEGRATION_JOBS=4 bun run test:ci",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("docs document integration example config schema", () => {
    const normalizedText = normalizedMarkdownText([
      "docs/60-compiler-correctness.md",
      "CHANGELOG.md",
    ]);
    const requiredSnippets = [
      "test_config.json",
      "`expectedOutput`",
      "`exitCode`",
      "`args`",
      "`env`",
      "`input`",
      "`timeout`",
      "`skip_compilation`",
      "Unsupported keys",
      "legacy `expected_output`",
      "bun test tests/IntegrationConfig.test.ts",
      'bun test tests/Integration.test.ts -t "valid for the integration harness"',
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
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
      "`SANITIZER_RUNTIME_TEST_TIMEOUT_MS` invalid values fall back to 30000 milliseconds",
      "`bpl doctor --json` reports timeout environment configuration in `timeouts`",
      "`raw`, `isValid`, `defaultMs`, `effectiveMs`, and `fallbackAction`",
      "Text `bpl doctor` prints a `Timeouts:` section",
    ];

    expectDocsContainSnippets(normalizedText, requiredSnippets);
  });

  test("sanitizer timeout docs match the shared default", () => {
    const defaultMs = TIMEOUT_ENV_DEFAULTS.SANITIZER_RUNTIME_TEST_TIMEOUT_MS;
    const readme = readFileSync("README.md", "utf8");
    const correctnessDocs = readFileSync(
      "docs/60-compiler-correctness.md",
      "utf8",
    );
    const compilerOptionsDocs = readFileSync(
      "docs/39-compiler-options.md",
      "utf8",
    );

    for (const text of [readme, correctnessDocs]) {
      expect(text).toContain(
        `SANITIZER_RUNTIME_TEST_TIMEOUT_MS=${defaultMs} bun test tests/CompilerSanitizerRuntime.test.ts`,
      );
      expect(text).toContain("bpl doctor sanitizer --json");
      expect(text).toContain("bun run test:sanitizers");
    }

    expect(correctnessDocs).toContain(
      `the ${defaultMs}ms default is used`,
    );
    expect(compilerOptionsDocs).toContain(
      `SANITIZER_RUNTIME_TEST_TIMEOUT_MS\` invalid values fall back to ${defaultMs} milliseconds`,
    );
    expect(compilerOptionsDocs).toContain(
      "`bpl doctor --json` reports timeout environment configuration in `timeouts`",
    );
  });
});
