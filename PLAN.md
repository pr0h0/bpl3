# BPL roadmap

Reviewed 2026-10-25. [TODO.md](TODO.md) is the canonical inventory of implemented
features, their limits, and remaining extensions. This document prioritizes work;
[BUGS.md](BUGS.md) tracks specific defects and follow-ups. Avoid duplicating the
feature inventory here or leaving implemented features in a pending section.

## Current priorities

1. **Compiler correctness and fuzz stability (priority 0).** Keep correctness,
   differential O0/O3, sanitizer, runtime-failure, and LLVM-verifier suites green.
   Minimize and promote new fuzz artifacts into permanent regression corpora.
   Preserve structured diagnostics instead of backend crashes or silent changes.
2. **Package/import reliability (priority 2).** Preserve strict manifests,
   lockfiles, cache verification, version constraints, binary links, and packed
   CLI behavior. The next substantial improvement is dependency graph planning
   and rollback; current installation is incremental.
3. **WebAssembly/toolchain coverage (priority 2).** Exercise the implemented
   hosted/freestanding runtimes with a real linker in CI, keep playground host
   imports aligned, and expand compatibility coverage. Broader host APIs and WASI
   remain extensions to the existing MVP.
4. **Developer experience and release contracts (priority 3).** Keep file-watch
   behavior, editor actions, JSON diagnostics, helper exit statuses, local tools,
   runtime builds, packed artifacts, and cross-platform smoke coverage reliable.
   Run focused regression checks before expanding the language surface.
5. **Documentation accuracy (priority 4).** Update TODO.md when implementation
   status changes, document platform and API limits alongside features, and
   retain executable documentation/example validation. Avoid fixed test-count
   claims and unsupported statements of completeness.

## Current quick-win changes

- Existing staging watch mode handles new sources/subdirectories, atomic saves,
  external transitive imports, missing-import recovery, and asynchronous program
  restart. Preserve that implementation rather than adding a second watcher.
- The editor no longer offers a bare `return;` for missing-return diagnostics;
  the programmer chooses the required value and placement.
- Baseline test logging preserves the test process's failure status.
- Prettier is a pinned development dependency; `format` and `format:check` use
  the same scope and ignore generated output/dependencies. Existing formatting
  drift should be handled separately from functional changes.
- Feature status is consolidated in TODO.md, including already implemented parser
  recovery, nested enum/tuple patterns, reflection, manual arenas, codecs, basic
  logging, argument parsing, dates, collections, web packages, and binding tools.

## Larger follow-ups

True frontend per-module IR generation is needed to use the bounded backend
compilation pool throughout normal builds. Complex C header/ABI support needs
more capable binding generation. Automatic ownership, default/named arguments,
visibility extensions, a remote registry, portable networking, threading, and
other new syntax remain in the TODO.md backlog.

## Validation entry points

- `bun run check` and `bun run lint` for compiler/tooling changes.
- `bun run test:ci` for the CI-safe suite, including extension and example checks.
- `bun run test:correctness`, `bun run test:wasm`, and `bun run test:sanitizers`
  for the relevant compiler/runtime changes.
- `bun run docs:examples` and `bun test tests/StdlibReference.test.ts` for docs.
- `bun run release:check` before a maintainer-authorized release.

These commands describe validation, not authorization to publish. Versions remain
in the maintainer-controlled `0.1.x` series under [AGENTS.MD](AGENTS.MD).
