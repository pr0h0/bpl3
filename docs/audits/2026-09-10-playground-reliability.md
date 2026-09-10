# Playground reliability — 2026-09-10

This follow-up adds failure recovery, cancellation, and per-client admission to
the Docker playground. Each implementation item is committed separately. The
findings are recorded as BUG-255 through BUG-262 in [BUGS.md](../../BUGS.md).

## Changes

- Expiring container labels allow startup and periodic recovery to remove
  abandoned jobs. Failed cleanup is retried, and health reports unavailable
  until recovery succeeds. Recovery also verifies the pinned worker image.
- HTTP disconnects and Stop cancel execution. Docker creation settles before
  cancellation cleanup, and the execution slot remains reserved through cleanup.
  Host subprocess cancellation kills the process group.
- Each client IP may run one job at a time, with a burst of ten requests and
  replenishment of twenty requests per minute. Address tracking is bounded.
  Forwarding headers are accepted only from explicitly configured proxies.
- Editor and tutorial Stop controls cancel pending requests. Auto-format finishes
  before compilation starts, and cancelled requests discard their artifacts.
- Browser Wasm executes in a disposable Web Worker with a five-second timeout
  and a combined 1 MiB output budget, keeping Stop responsive to infinite loops.
- Subprocess output preserves UTF-8 characters split across chunks. The tutorial
  editor defines its missing Monarch operator expression. A timeout regression
  allows realistic subprocess startup time while retaining its output assertions.

See the [playground guide](../../playground/README.md) for configuration and limits.

## Validation scope

Validation runs locally on Linux with Bun 1.4.2 and host Clang 21.1.8. The Docker
worker uses Ubuntu 24.04 and Clang/lld 18. These results do not substitute for the
GitHub platform matrix after pushing.

- TypeScript typecheck and ESLint: passed.
- Runtime build and generated CLI registry check: passed.
- CI-safe integration/playground suite: 570 passed.
- VS Code extension suite: 236 passed.
- CI-safe unit suite: 3,271 passed, zero failures across 257 files. Its 16 skipped
  entries belong to the separately enabled Docker suite.
- Real Docker suite: 13 passed.
- Documentation checks: 95 passed.

Real-container tests exercise memory, process, temporary-storage, output, and
time limits; abandoned-container cleanup; client disconnects; admission; and
recovery. Docker transport failure is injected around real containers without
restarting the shared host daemon. A separate Docker event check confirmed an
actual OOM kill during the memory-pressure scenario.

Headless Chromium checks cover native Stop, auto-format followed by Run, Stop
during infinite Wasm execution, automatic Wasm timeout, and tutorial Stop. The
tutorial check was repeated after fixing its tokenizer exception and completed
without page errors.

Host mode still cannot interrupt synchronous parsing or compilation mid-call.
Docker images remain pinned: rebuild the worker image and restart the controller
after compiler, library, or worker changes.
