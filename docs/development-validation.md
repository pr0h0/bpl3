# Choose the right validation command

Run commands from the repository root after `bun install --frozen-lockfile`.
The editor also needs `npm ci --prefix vscode-ext` on a fresh checkout.

| Change                        | Focused validation                                                                                                 | What it establishes                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| TypeScript                    | `bun run check`; also `bun run lint` for `cli/`, `compiler/`, `vscode-ext/src/` and `index.ts`                     | Root type checking; lint covers only the listed paths, excluding `tests/`, `tools/` and `scripts/` |
| One compiler/CLI regression   | `bun test tests/YourRegression.test.ts`                                                                            | The selected test file only                                                                        |
| Formatter                     | `bun test tests/Formatter*.test.ts tests/CLIFormat*.test.ts tests/EditorFormatting.test.ts`                        | Layout, semantic preservation, corpus idempotence, CLI and editor formatting                       |
| Editor                        | `bun run test:vscode-ext`                                                                                          | Production build, test build and editor service tests                                              |
| User guides                   | `bun run docs:examples` and `bun test tests/MarkdownDocs.test.ts`                                                  | Compilable guide examples and documentation checks                                                 |
| Standard-library declarations | `bun run docs:stdlib` then `bun test tests/StdlibReference.test.ts`                                                | Regenerated declaration reference matches source                                                   |
| Shell completions             | `bun scripts/generate_completions.ts` then `bun test tests/QolCompletions.test.ts tests/CompletionTargets.test.ts` | Shipped/embedded scripts agree and advertised options/targets remain covered                       |
| WebAssembly                   | `bun run test:wasm`                                                                                                | Wasm toolchain, imports, hosted execution and playground contracts                                 |
| Native examples               | `bun test tests/Integration.test.ts`                                                                               | Native example compilation and execution; requires the native toolchain/runtime                    |
| Full CI-safe baseline         | `bun run test:ci`                                                                                                  | Runtime build, integration, editor build/tests and batched safe unit suite                         |

`bun test`/`bun run test` target `tests/`; they do not replace the separate editor
production build/test workflow. Use focused tests while editing, then the CI-safe
baseline for a combined change. Read skip counts: an optional skip is not a pass
for that environment.

Some correctness, fuzz, container, release and sanitizer checks are separate
opt-in workflows. They have different prerequisites and costs; do not enable
sanitizers, run low-level checks, publish artifacts or dispatch release jobs as
an incidental part of a QoL change. See [correctness and fuzz triage](60-compiler-correctness.md)
and [release verification](../README.md#release-verification) when that work is
explicitly requested. Passing a local subset does not establish cross-platform
CI success.
