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
      "Packed package/import diagnostic smoke validates that the installed npm CLI keeps package import JSON diagnostics machine-readable",
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      "BPL_PACKAGE_MANIFEST_MISSING",
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
      "`main`, `exports`, and `bin` path values are strict package-relative paths",
      "cannot contain empty, `.`, or `..` path segments",
      "`src//index.bpl`, `src/./index.bpl`, and `../secret.bpl` are rejected",
      "`bin/tool.bpl`",
    ];

    expectDocsContainSnippets(text, requiredSnippets);
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
      "project-mode option conflicts",
      "direct archive paths",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package install option conflict|direct archive path\"",
    ];

    expectDocsContainSnippets(docs, requiredSnippets);
    expectDocsContainCodes(docs, [
      ...PACKAGE_INSTALL_JSON_ERROR_CODES,
      ...PACKAGE_ARCHIVE_JSON_ERROR_CODES,
    ]);
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

  test("docs document package search directory JSON diagnostics", () => {
    const docs = normalizedMarkdownText([
      "docs/25-package-management.md",
      "docs/39-compiler-options.md",
    ]);
    const requiredSnippets = [
      "Symlinked package search directories stop package resolution instead of falling through to lower-priority package roots",
      "a symlinked local `bpl_modules/` stops resolution before workspace `packages/`",
      "a symlinked workspace `packages/` stops resolution before global packages",
      "`bpl check --json` keeps package search-directory safety failures in the per-file `diagnostics` array",
      "Local `bpl_modules/` and workspace `packages/` symlink failures report `package search directory is a symbolic link`",
      "global package cache symlinks report `Global package directory path is a symbolic link`",
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
      "Explicit `std/` paths must be normalized subpaths inside the standard library",
      "cannot contain empty, `.`, or `..` path segments",
      "`std//array.bpl`, `std/./array.bpl`, and `std/../array.bpl` are rejected",
      "standard library root",
    ];

    expectDocsContainSnippets(text, requiredSnippets);
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
      "SANITIZER_RUNTIME_TEST_TIMEOUT_MS=30000 bun test tests/CompilerSanitizerRuntime.test.ts",
      "Sanitizer-backed runtime failures are separate from BPL runtime execution timeouts",
      "Use this order for sanitizer CI failures: run `bun run ci:triage`, inspect `bpl doctor sanitizer --json`, then reproduce with `bun run test:sanitizers`",
      "`BPL_SANITIZER_RUNTIME_UNAVAILABLE` in the doctor report means the local compiler could not link ASan/UBSan with compiler-rt/libclang_rt",
      "A BPL runtime error under sanitizers is different from missing compiler-rt support",
      "bun run test:sanitizers",
      "bun test tests/CompilerSanitizerRuntime.test.ts",
      "A Bun test timeout in `CompilerSanitizerRuntime.test` means the sanitizer harness exceeded its test budget; it is not fixed by `BPL_RUN_TIMEOUT_MS`",
      "`SANITIZER_RUNTIME_TEST_TIMEOUT_MS` must be a positive integer; invalid values are ignored with a warning and the 30000ms default is used",
      'bun test tests/CLIJsonParseability.test.ts -t "package install JSON"',
      "bun test tests/PackageJsonFailureContracts.test.ts",
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
