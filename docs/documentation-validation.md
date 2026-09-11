# Documentation validation

These maintenance commands require a source checkout; their helpers and tests
are intentionally excluded from the published npm payload. Documentation has
three complementary checks:

```bash
# Regenerate every standard-library module's declaration reference.
bun run docs:stdlib
# Fail if the generated reference differs from source.
bun run docs:stdlib --check
# Compile complete guide programs and check selected runtime output.
bun run docs:examples
# Check links, CLI/diagnostic contracts, and reference synchronization.
bun test tests/MarkdownDocs.test.ts tests/StdlibReference.test.ts tests/AuditDocumentation.test.ts
# Typecheck the compiler and documentation tooling.
bun run check
```

## What is checked

`tests/helpers/stdlibReference.ts` parses every `lib/**/*.bpl` module and generates
[stdlib-reference.md](stdlib-reference.md). It lists exported declarations and
members, preserving overloads and receiver types. It does not infer ownership,
error behavior, algorithm complexity, or implementation completeness. Those
contracts belong in the prose guides and require source review and behavioral
tests. Some declarations are stubs; a declaration is not a functionality promise.

`tests/DocumentationExamples.test.ts` discovers BPL code fences containing
`frame main(...)` in README, all numbered guides, and the primitive-extension
and companion type-matching guides. Positive programs compile with the real CLI
and Clang in temporary directories. Seven representative programs also run at
O0/O3 with exact stdout and LLVM verification, including JSON hooks and assembly
floating-point examples. Compilation alone does not verify all printed comments,
resource lifetimes, algorithmic claims, or behavior on every input.

The native example checks run on Linux/macOS. Examples marked `arch=x64` need an
x86-64 host; other hosts skip them. Windows does not run these native checks.
CPU-specific examples are compiled without running unsupported instructions.

The existing Markdown tests check tracked local links and many CLI, diagnostic,
configuration, and package-management statements against source definitions.
They do not validate every natural-language sentence or every external URL.

## Example conventions

A complete program needs no annotation: newly added main programs are included
automatically. A code fence without a main function is normally a declaration or
context-dependent fragment and is outside the standalone compilation check.
Keep that context visible in prose.

Use an HTML comment immediately before a code fence for special cases:

| Comment                                                               | Meaning                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `<!-- bpl-doc: fixture=math.bpl -->`                                  | Write this block as a sibling module for programs on the same page.                                      |
| `<!-- bpl-doc: expect-error=BPL_VARIABLE_TYPE_ANNOTATION_MISSING -->` | Require compilation to fail with this diagnostic code.                                                   |
| `<!-- bpl-doc: fragment=unfinished-editor-completion -->`             | Explicitly identify a program-shaped fragment that cannot compile. Explain why in the surrounding prose. |
| `<!-- bpl-doc: arch=x64 -->`                                          | Compile only on the relevant host architecture.                                                          |
| `<!-- bpl-doc: run=introduction -->`                                  | Also verify output using the named expectation in the test.                                              |

Fixture filenames must be simple sibling `.bpl` names and unique per page. Do
not label a broken positive example as a fragment to silence a failure: repair
it, or document the actual feature limitation with a usable alternative.

When adding a runtime example, add its ID and expected output to the test's
`expectedOutputs` map. The discovery test rejects missing or duplicate run IDs.
Only choose programs whose effects are appropriate for automated local tests.

## Historical documents and reports

Design plans, brainstorms, and dated audit reports preserve historical proposals
and observations. They do not define current syntax or guarantee the present
state of a feature. The numbered guides, source declarations, and current tests
are the starting points for current behavior. Audit reports should record their
scope, commands, platform, observed results, and remaining uncertainty.

No automated check proves that every word is true. A useful maintenance claim is
specific: which statements were reviewed, which examples ran, which contracts
are generated or tested, and which limitations remain open.
