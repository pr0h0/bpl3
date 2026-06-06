# Frontend Build Cold-Start Design

## Goal

Reduce cold latency for the common `bpl build <file> --emit tokens|ast|formatted`
workflow without changing frontend output, diagnostics, import behavior, or any
LLVM/native build path.

## Evidence

On the current tree, importing `cli/CompilationRunner.ts` takes about 150 ms and
59 MB RSS, while focused parser, lexer, and formatter imports take 10-30 ms
each. A 31-round cold CLI baseline measured medians of 94.789 ms for tokens,
104.831 ms for AST, and 106.973 ms for formatted output.

## Approaches

1. Route common frontend-only build requests to a focused action. This is the
   selected approach because it removes backend, module, runtime, and linker
   loading while keeping the existing runner as the compatibility fallback.
2. Split `CompilationRunner.ts` into frontend and backend modules. This could
   improve more entry points, but it has a much larger behavioral surface.
3. Dynamically import backend dependencies inside `CompilationRunner.ts`. Its
   synchronous public APIs make this invasive and easy to regress.

## Design

Add a focused frontend build action containing the exact lexer, parser, and
formatter behavior currently used by single-file compilation. The build command
selects it only when the emit mode is `tokens`, `ast`, or `formatted` and no
advanced build option requires the full validation/runtime path. All other
requests keep importing `CompilationRunner.ts`.

The focused path preserves input path safety, compiler diagnostic formatting,
color and quiet handling, token-lexer fallback behavior, AST JSON shape, and
atomic formatted writes. Existing CLI behavior tests remain authoritative.

## Verification

Add a failing-first startup source-shape test that requires build registration
to defer to the focused frontend action before the full runner. Run focused CLI
tests, compare opposite-order cold medians against a detached baseline, and
compare stdout/stderr/status hashes for all three frontend emit modes. Retain
the change only if the cold-start improvement is stable in both orders.
