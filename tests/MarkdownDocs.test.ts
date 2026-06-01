import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, normalize } from "path";
import { spawnSync } from "child_process";
import { TIMEOUT_ENV_DEFAULTS } from "../compiler/common/Env";
import {
  getPackageResolutionFailureCode,
  type PackageResolutionFailureReason,
  type PackageResolutionTrace,
} from "../compiler/middleend/PackageResolver";
import {
  IMPORT_STD_PATH_UNSAFE_CODE,
  MODULE_FILE_NOT_FOUND_CODE,
  MODULE_NOT_FOUND_CODE,
  MODULE_PATH_NOT_FILE_CODE,
  MODULE_PATH_SYMLINK_CODE,
} from "../compiler/middleend/ModuleResolver";
import {
  BUILD_INPUT_NOT_FILE_CODE,
  BUILD_INPUT_NOT_FOUND_CODE,
  BUILD_INPUT_SYMLINK_CODE,
  BUILD_INVALID_EMIT_CODE,
  BUILD_INVALID_JOBS_CODE,
  BUILD_INVALID_OPTIMIZATION_CODE,
  BUILD_INVALID_WASM_RUNTIME_CODE,
  BUILD_OUTPUT_DIRECTORY_CODE,
  BUILD_OUTPUT_NOT_FILE_CODE,
  BUILD_OUTPUT_PARENT_NOT_DIRECTORY_CODE,
  BUILD_OUTPUT_PARENT_NOT_FOUND_CODE,
  BUILD_OUTPUT_PARENT_SYMLINK_CODE,
  BUILD_OUTPUT_SYMLINK_CODE,
} from "../cli/CompilationRunner";
import {
  CLEAN_GIT_TRACKED_UNAVAILABLE_CODE,
  CLEAN_WORKDIR_SYMLINK_CODE,
} from "../cli/commands/clean";
import {
  CHECK_INPUT_NOT_FILE_CODE,
  CHECK_INPUT_NOT_FOUND_CODE,
  CHECK_INPUT_SYMLINK_CODE,
  CHECK_NO_INPUTS_CODE,
} from "../cli/commands/check";
import {
  LINT_INPUT_NOT_FILE_CODE,
  LINT_INPUT_NOT_FOUND_CODE,
  LINT_INPUT_SYMLINK_CODE,
  LINT_NO_INPUTS_CODE,
} from "../cli/commands/lint";
import {
  RUN_SCRIPT_COMMAND_EMPTY_CODE,
  RUN_SCRIPT_COMMAND_NOT_STRING_CODE,
  RUN_SCRIPT_MANIFEST_INVALID_JSON_CODE,
  RUN_SCRIPT_MANIFEST_NOT_FILE_CODE,
  RUN_SCRIPT_MANIFEST_NOT_FOUND_CODE,
  RUN_SCRIPT_MANIFEST_NOT_OBJECT_CODE,
  RUN_SCRIPT_MANIFEST_PARENT_SYMLINK_CODE,
  RUN_SCRIPT_MANIFEST_SYMLINK_CODE,
  RUN_SCRIPT_NAME_EMPTY_CODE,
  RUN_SCRIPT_NOT_FOUND_CODE,
  RUN_SCRIPT_SCRIPTS_NOT_OBJECT_CODE,
} from "../cli/commands/runScript";

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
      "Build validation failures such as invalid `-O`, `--emit`, `--wasm-runtime`, `--jobs`, unsupported `--target`, input path, and output path errors",
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
      "the report also includes `errorCode` such as `BPL_LOCKFILE_UNSUPPORTED_VERSION`, `BPL_PACKAGE_NOT_FOUND`, `BPL_PACKAGE_INSTALL_*_CONFLICT`, `BPL_PACKAGE_ARCHIVE_*`, or PackageManager manifest-loading failures",
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

    for (const snippet of requiredSnippets) {
      expect(codeGeneratorSection).toContain(snippet.replace(/\s+/g, " "));
    }
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

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
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
      "Packed package/import diagnostic smoke validates that the installed npm CLI keeps package import JSON diagnostics machine-readable",
      'bun test tests/ReleaseMetadata.test.ts -t "packed package import diagnostic codes"',
      "BPL_PACKAGE_MANIFEST_MISSING",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
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

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
    }
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
      "empty or whitespace-padded target triples",
      "Target family matching is component-aware",
      "Target matching uses full triple components",
      "substring-only matches such as `notlinux` and `notwasm32` are rejected",
      "CodeGenerator rejects unsupported target triples instead of silently using an x86_64 Linux data layout",
      'bun test tests/CodeGenerator.test.ts -t "target" && bun test tests/CLIJsonParseability.test.ts -t "build validation failures"',
    ];

    for (const snippet of requiredSnippets) {
      expect(text).toContain(snippet.replace(/\s+/g, " "));
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

  test("package docs document package manager manifest JSON error codes", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "PackageManager manifest-loading failures",
      "BPL_PACKAGE_MANIFEST_SYMLINK",
      "BPL_PACKAGE_MANIFEST_NOT_FILE",
      "BPL_PACKAGE_MANIFEST_PARSE_ERROR",
      "BPL_PACKAGE_MANIFEST_NOT_OBJECT",
      "BPL_PACKAGE_MANIFEST_NAME_MISSING",
      "BPL_PACKAGE_MANIFEST_NAME_INVALID",
      "BPL_PACKAGE_MANIFEST_VERSION_MISSING",
      "BPL_PACKAGE_MANIFEST_VERSION_INVALID",
      "BPL_PACKAGE_MANIFEST_MAIN_INVALID",
      "BPL_PACKAGE_MANIFEST_DEPENDENCIES_INVALID",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package manifest error codes\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document package-cache validation JSON error codes", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Package-cache validation failures",
      "BPL_PACKAGE_CACHE_VERSION_INVALID",
      "clean and repair validation failures",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package-cache version filter\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document package-cache package filter JSON error codes", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "BPL_PACKAGE_CACHE_NAME_INVALID",
      "package-cache package filters",
      "bun test tests/PackageJsonFailureContracts.test.ts -t \"package-cache package filter\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document uninstall JSON error codes", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Package uninstall JSON reports",
      "BPL_PACKAGE_UNINSTALL_NAME_INVALID",
      "BPL_PACKAGE_UNINSTALL_NOT_INSTALLED",
      "bun test tests/PackageManagerCLI.test.ts -t \"uninstall success and failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document pack JSON contract", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Package pack JSON reports",
      'check: "package-pack"',
      "BPL_PACKAGE_MANIFEST_MISSING",
      "bun test tests/PackageManagerCLI.test.ts -t \"pack success and failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("package docs document init JSON contract", () => {
    const packageDocs = readFileSync("docs/25-package-management.md", "utf8");
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${packageDocs}\n${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Package init JSON reports",
      'check: "package-init"',
      "BPL_PACKAGE_INIT_NAME_INVALID",
      "BPL_PACKAGE_INIT_MANIFEST_EXISTS",
      "bun test tests/PackageManagerCLI.test.ts -t \"init success and failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document project creation JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${readme}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Project creation JSON reports",
      'check: "project-new"',
      "BPL_NEW_NAME_INVALID",
      "BPL_NEW_TEMPLATE_INVALID",
      "BPL_NEW_PATH_EXISTS_DIRECTORY",
      "bun test tests/CLI.test.ts -t \"new project success and failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document format JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Format JSON reports",
      'check: "format"',
      "BPL_FORMAT_JSON_REQUIRES_CHECK",
      "BPL_FORMAT_NO_INPUTS",
      "BPL_FORMAT_WRITE_CHECK_CONFLICT",
      "BPL_FORMAT_INPUT_NOT_FOUND",
      "BPL_FORMAT_INPUT_NOT_FILE",
      "BPL_FORMAT_NOT_FORMATTED",
      "BPL_FORMAT_PROCESSING_ERROR",
      "bun test tests/CLI.test.ts -t \"format check results and validation failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document bindgen JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Bindgen JSON reports",
      'check: "bindgen"',
      "BPL_BINDGEN_HEADER_NOT_FOUND",
      "BPL_BINDGEN_HEADER_SYMLINK",
      "BPL_BINDGEN_HEADER_NOT_FILE",
      "BPL_BINDGEN_HEADER_PARENT_SYMLINK",
      "BPL_BINDGEN_OUTPUT_SYMLINK",
      "BPL_BINDGEN_OUTPUT_DIRECTORY",
      "BPL_BINDGEN_OUTPUT_NOT_FILE",
      "BPL_BINDGEN_OUTPUT_PARENT_NOT_FOUND",
      "BPL_BINDGEN_OUTPUT_PARENT_SYMLINK",
      "BPL_BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY",
      "BPL_BINDGEN_FAILED",
      "bun test tests/CLI.test.ts -t \"bindgen success and validation failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document docs JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Documentation JSON reports",
      'check: "docs"',
      "BPL_DOCS_INPUT_NOT_FOUND",
      "BPL_DOCS_INPUT_SYMLINK",
      "BPL_DOCS_INPUT_NOT_FILE",
      "BPL_DOCS_INPUT_PARENT_SYMLINK",
      "BPL_DOCS_OUTPUT_SYMLINK",
      "BPL_DOCS_OUTPUT_DIRECTORY",
      "BPL_DOCS_OUTPUT_NOT_FILE",
      "BPL_DOCS_OUTPUT_PARENT_NOT_FOUND",
      "BPL_DOCS_OUTPUT_PARENT_SYMLINK",
      "BPL_DOCS_OUTPUT_PARENT_NOT_DIRECTORY",
      "BPL_DOCS_FAILED",
      "bun test tests/CLI.test.ts -t \"documentation generation success and validation failures as JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document completion JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Completion JSON reports",
      'check: "completion"',
      "BPL_COMPLETION_SHELL_UNSUPPORTED",
      "bun test tests/CLIJsonParseability.test.ts -t \"completion JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
    }
  });

  test("docs document version JSON contract", () => {
    const compilerOptions = readFileSync("docs/39-compiler-options.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const combinedDocs = `${compilerOptions}\n${changelog}`.replace(
      /\s+/g,
      " ",
    );
    const requiredSnippets = [
      "Version JSON reports",
      "bpl --version --json",
      "bpl --json --version",
      'check: "version"',
      "bun test tests/CLIJsonParseability.test.ts -t \"version JSON\"",
    ];

    for (const snippet of requiredSnippets) {
      expect(combinedDocs).toContain(snippet.replace(/\s+/g, " "));
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

  test("docs document package import diagnostic codes from resolver contract", () => {
    const combinedDocs = [
      readFileSync("docs/25-package-management.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
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
        packageTrace("manifest-invalid", "missing bpl.json"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "invalid bpl.json"),
      ),
      getPackageResolutionFailureCode(
        packageTrace("manifest-invalid", "unsafe entrypoint '../outside.bpl'"),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "entrypoint-not-found",
          "entrypoint resolves to a symbolic link candidate",
        ),
      ),
      getPackageResolutionFailureCode(
        packageTrace(
          "subpath-not-found",
          "subpath 'features/add' resolves to a symbolic link candidate",
        ),
      ),
    ].filter((code): code is string => typeof code === "string");

    expect(expectedCodes).toEqual([
      "BPL_PACKAGE_SEARCH_DIR_SYMLINK",
      "BPL_PACKAGE_ROOT_NOT_DIRECTORY",
      "BPL_PACKAGE_MANIFEST_MISSING",
      "BPL_PACKAGE_MANIFEST_INVALID",
      "BPL_PACKAGE_ENTRYPOINT_UNSAFE",
      "BPL_PACKAGE_ENTRYPOINT_SYMLINK",
      "BPL_PACKAGE_SUBPATH_SYMLINK",
    ]);

    for (const code of expectedCodes) {
      expect(combinedDocs).toContain(code);
    }
    expect(combinedDocs).toContain("include a stable `code`");
    expect(combinedDocs).toContain("the normal diagnostic object shape");
  });

  test("docs document module import diagnostic codes from resolver constants", () => {
    const combinedDocs = [
      readFileSync("docs/23-imports-exports.md", "utf8"),
      readFileSync("docs/25-package-management.md", "utf8"),
      readFileSync("docs/39-compiler-options.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
      MODULE_NOT_FOUND_CODE,
      MODULE_FILE_NOT_FOUND_CODE,
      MODULE_PATH_NOT_FILE_CODE,
      MODULE_PATH_SYMLINK_CODE,
      IMPORT_STD_PATH_UNSAFE_CODE,
    ];

    for (const code of expectedCodes) {
      expect(combinedDocs).toContain(code);
    }
    expect(combinedDocs).toContain(
      "JSON diagnostics include stable `code` values for import-resolution failures",
    );
    expect(combinedDocs).toContain(
      "unsafe explicit standard-library paths use `BPL_IMPORT_STD_PATH_UNSAFE`",
    );
  });

  test("docs document build validation error codes from runner constants", () => {
    const docs = [
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
      BUILD_INVALID_OPTIMIZATION_CODE,
      BUILD_INVALID_EMIT_CODE,
      BUILD_INVALID_WASM_RUNTIME_CODE,
      BUILD_INVALID_JOBS_CODE,
      BUILD_INPUT_NOT_FOUND_CODE,
      BUILD_INPUT_SYMLINK_CODE,
      BUILD_INPUT_NOT_FILE_CODE,
      BUILD_OUTPUT_SYMLINK_CODE,
      BUILD_OUTPUT_DIRECTORY_CODE,
      BUILD_OUTPUT_NOT_FILE_CODE,
      BUILD_OUTPUT_PARENT_NOT_FOUND_CODE,
      BUILD_OUTPUT_PARENT_SYMLINK_CODE,
      BUILD_OUTPUT_PARENT_NOT_DIRECTORY_CODE,
    ];

    for (const code of expectedCodes) {
      expect(docs).toContain(code);
    }
    expect(docs).toContain("Build validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document clean validation error codes from command constants", () => {
    const docs = [
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
      CLEAN_WORKDIR_SYMLINK_CODE,
      CLEAN_GIT_TRACKED_UNAVAILABLE_CODE,
    ];

    for (const code of expectedCodes) {
      expect(docs).toContain(code);
    }
    expect(docs).toContain("Clean validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document run-script validation error codes from command constants", () => {
    const docs = [
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
      RUN_SCRIPT_MANIFEST_NOT_FOUND_CODE,
      RUN_SCRIPT_MANIFEST_SYMLINK_CODE,
      RUN_SCRIPT_MANIFEST_NOT_FILE_CODE,
      RUN_SCRIPT_MANIFEST_PARENT_SYMLINK_CODE,
      RUN_SCRIPT_MANIFEST_INVALID_JSON_CODE,
      RUN_SCRIPT_MANIFEST_NOT_OBJECT_CODE,
      RUN_SCRIPT_SCRIPTS_NOT_OBJECT_CODE,
      RUN_SCRIPT_NAME_EMPTY_CODE,
      RUN_SCRIPT_COMMAND_NOT_STRING_CODE,
      RUN_SCRIPT_COMMAND_EMPTY_CODE,
      RUN_SCRIPT_NOT_FOUND_CODE,
    ];

    for (const code of expectedCodes) {
      expect(docs).toContain(code);
    }
    expect(docs).toContain("Run-script validation `errorCode` values");
    expect(docs).toContain("preserving the human-readable `error` text");
  });

  test("docs document check and lint input validation error codes from command constants", () => {
    const docs = [
      readFileSync("docs/39-compiler-options.md", "utf8"),
      readFileSync("CHANGELOG.md", "utf8"),
    ]
      .join("\n")
      .replace(/\s+/g, " ");
    const expectedCodes = [
      CHECK_INPUT_NOT_FOUND_CODE,
      CHECK_INPUT_SYMLINK_CODE,
      CHECK_INPUT_NOT_FILE_CODE,
      CHECK_NO_INPUTS_CODE,
      LINT_INPUT_NOT_FOUND_CODE,
      LINT_INPUT_SYMLINK_CODE,
      LINT_INPUT_NOT_FILE_CODE,
      LINT_NO_INPUTS_CODE,
    ];

    for (const code of expectedCodes) {
      expect(docs).toContain(code);
    }
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
      "`SANITIZER_RUNTIME_TEST_TIMEOUT_MS` invalid values fall back to 30000 milliseconds",
      "`bpl doctor --json` reports timeout environment configuration in `timeouts`",
      "`raw`, `isValid`, `defaultMs`, `effectiveMs`, and `fallbackAction`",
      "Text `bpl doctor` prints a `Timeouts:` section",
    ];

    for (const snippet of requiredSnippets) {
      expect(normalizedText).toContain(snippet.replace(/\s+/g, " "));
    }
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
