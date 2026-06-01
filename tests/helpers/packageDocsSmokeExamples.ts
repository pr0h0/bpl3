export interface PackageDocsSmokeSuccessExample {
  name: string;
  sourcePath: string;
}

export interface PackageDocsSmokeInvalidImportExample {
  name: string;
  workspaceDirName: string;
  packageName: string;
  importPath: string;
  expectedDiagnosticCode: string;
  expectedMessageSnippet: string;
}

export interface PackageDocsSmokeExamples {
  success: PackageDocsSmokeSuccessExample;
  invalidImport: PackageDocsSmokeInvalidImportExample;
  focusedTestCommand: string;
}

export const PACKAGE_DOCS_SMOKE_EXAMPLES = {
  success: {
    name: "transitive package workspace app",
    sourcePath: "examples/package_transitive_dependency/app/main.bpl",
  },
  invalidImport: {
    name: "invalid package parent segment import",
    workspaceDirName: "docs-package-import",
    packageName: "pkg-math",
    importPath: "pkg-math/../secret",
    expectedDiagnosticCode: "BPL_PACKAGE_IMPORT_INVALID",
    expectedMessageSnippet:
      "Package imports cannot contain empty, '.' or '..' path segments.",
  },
  focusedTestCommand:
    'bun test tests/CLIJsonParseability.test.ts -t "package/import docs examples"',
} as const satisfies PackageDocsSmokeExamples;

export const PACKAGE_DOCS_SMOKE_DOCUMENTATION_SNIPPETS = [
  "package/import docs examples",
  PACKAGE_DOCS_SMOKE_EXAMPLES.success.sourcePath,
  PACKAGE_DOCS_SMOKE_EXAMPLES.invalidImport.importPath,
  PACKAGE_DOCS_SMOKE_EXAMPLES.invalidImport.expectedDiagnosticCode,
  PACKAGE_DOCS_SMOKE_EXAMPLES.focusedTestCommand,
] as const;
