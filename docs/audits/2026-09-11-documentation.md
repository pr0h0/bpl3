# Documentation audit — 2026-09-11

## Scope

Reviewed current user-guide claims against the compiler, grammar, library modules,
package scripts, and CI configuration. Repaired complete programs discovered in
README, the numbered guides, and two contributor/companion guides. Added missing
library declarations, ownership/failure contracts, installation boundaries, and
maintenance instructions.

This is a scoped source and behavior audit, not certification of every sentence.
Historical plans, brainstorms, old audit results, incomplete code fragments,
external URLs, and all possible platform/input combinations are not covered by
a universal truth guarantee. Historical design documents are explicitly labeled.

## Corrected documentation

- Generated a declaration reference for all **64** BPL library modules, including
  exports, overloads, receivers, fields, enum variants, and low-level modules.
- Corrected String/FS APIs and ownership, BitSet/Env/Date method names, time and
  random-number limitations, algorithm behavior, and stub-module status.
- Corrected Bun requirements, removed contradictory LLVM minimum-version claims,
  replaced the Linux-only installation helper as the portable workflow, and
  distinguished native Linux/macOS support from Windows compiler-component CI.
- Repaired explicit generic arguments, tuple annotations, constant declarations,
  imports, constructor examples, export syntax, and allocation declarations.
- Corrected JSON hook signatures, supported-type differences, output formatting,
  recursive cleanup, and parser/serializer limitations.
- Corrected the process module's quoting boundary and raw-shell exception.
- Corrected raw LLVM comments and floating-point widths, named assembly outputs,
  and the SSE example's f32 buffers. The SIMD result is verified at O0 and O3.
- Added repeatable documentation checks and documented what each check proves.

See [documentation validation](../documentation-validation.md) for commands and
annotation conventions, and the [generated reference](../stdlib-reference.md)
for the library inventory.

## Automated coverage

The discovered guide corpus contains:

| Classification                     | Count | Check                                    |
| ---------------------------------- | ----: | ---------------------------------------- |
| Positive complete programs         |   177 | Real CLI compilation and Clang           |
| Deliberately rejected program      |     1 | Nonzero status and exact diagnostic code |
| Companion modules                  |     3 | Compiled through importing examples      |
| Explicit program-shaped fragments  |     4 | Classified with reasons; not compiled    |
| Programs with exact runtime output |     7 | O0/O3 execution plus LLVM verification   |

Ten positive programs are x86-64-specific; they run through compilation checks
on this host and are skipped on other architectures. Only the selected runtime
programs execute; examples involving input, files, shell commands, or specialized
CPU instructions are otherwise compilation checks.

The example test file contains **186 tests**: 178 compilation/error checks,
seven runtime checks, and one discovery/classification regression. The existing
Markdown contract suite checks links and many CLI/package/diagnostic statements;
the generated-reference tests check source synchronization and extraction behavior.

## Validation environment and results

Local host: Linux x86-64, Clang 21.1.8. Focused checks used Bun 1.3.14; the broad
CI-safe run uses Bun 1.4.2 to match the toolchain used for recent CI validation.
Remote GitHub Actions results are not implied by local results.

- `bun run check`: passed, including the documentation tooling.
- `bun run docs:stdlib --check`: passed after relocating the maintenance helpers.
- Initial `bun run test:ci`: runtime build, 572 integration/playground tests,
  236 extension tests, and CLI registry synchronization passed. The unit stage
  reported 3,464 passes, 16 skips, and two release-inventory failures.
- Both failures identified documentation helpers incorrectly placed in the
  shipped `tools/` directory. They were moved to `tests/helpers`, with imports,
  scripts, and maintenance documentation updated. Existing release-inventory
  assertions were retained. See BUG-282.
- All 186 documentation checks passed in the broad run and after relocation.
- After the packaging fix, the combined release-metadata, release-helper smoke,
  generated-reference, and documentation-example run passed **261 tests** with
  **zero failures**. Both previously failing release-inventory tests passed.
- Final Markdown contracts and existing documentation runtime checks passed
  **97 tests** with zero failures.
- The full CI-safe command was not repeated after this isolated packaging fix;
  the affected suites were rerun. The initial broad-run totals above preserve
  that distinction.

## Implementation issues exposed

The audit logs **14 open implementation issues**, BUG-267 through BUG-279 and
BUG-281, in [BUGS.md](../../BUGS.md). Documentation errors are fixed; these runtime
and compiler issues remain open:

- Rand normalization/distributions, nonterminating String replacement, repeated
  UUID values, unbounded IO.readLine, FS.mkdirp failures, and pre-epoch dates.
- Repeated ignored lambda names, computed float interpolation, local Func-to-Lambda
  casts, a user `log` function colliding with intrinsic lowering, and implicit
  Long return-type lookup.
- JSON parser progress failures, unescaped control bytes, and fixed-buffer float
  formatting overflow.

Bounded local reproductions confirmed the JSON array parser hangs and invalid
control-byte output. The float formatting overflow was identified in source and
was not executed. Isolated String.toString interpolation succeeds; the documented
interpolation restriction is limited to the separately reproduced computed-float
failure. See individual bug entries for evidence and workarounds.
