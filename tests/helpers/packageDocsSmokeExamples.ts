export interface PackageDocsSmokeSuccessExample {
  name: string;
  sourcePath: string;
  importPath: string;
  expectedResolvedPath: string;
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
  successExamples: ReadonlyArray<PackageDocsSmokeSuccessExample>;
  invalidImport: PackageDocsSmokeInvalidImportExample;
  focusedTestCommand: string;
}

export const PACKAGE_DOCS_SMOKE_EXAMPLES = {
  successExamples: [
    {
      name: "explicit package source-file import",
      sourcePath: "examples/package_transitive_dependency/app/main.bpl",
      importPath: "math-extra/features/direct.bpl",
      expectedResolvedPath:
        "examples/package_transitive_dependency/packages/math-extra/features/direct.bpl",
    },
    {
      name: "extensionless package directory-index import",
      sourcePath: "examples/package_transitive_dependency/app/main.bpl",
      importPath: "math-extra/features/increment",
      expectedResolvedPath:
        "examples/package_transitive_dependency/packages/math-extra/features/increment/index.bpl",
    },
  ],
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
  ...PACKAGE_DOCS_SMOKE_EXAMPLES.successExamples.flatMap((example) => [
    example.sourcePath,
    example.importPath,
    example.expectedResolvedPath,
  ]),
  PACKAGE_DOCS_SMOKE_EXAMPLES.invalidImport.importPath,
  PACKAGE_DOCS_SMOKE_EXAMPLES.invalidImport.expectedDiagnosticCode,
  PACKAGE_DOCS_SMOKE_EXAMPLES.focusedTestCommand,
] as const;
