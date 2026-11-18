/**
 * WebAssembly features that clang accepts as `-m<feature>` / `-mno-<feature>`.
 * Every generated function carries a `target-features` attribute (LLVM 23
 * checks `+exception-handling` per function), and that attribute replaces the
 * features from the clang command line, so those flags are copied into it
 * (BUG-823).
 */
const WASM_FEATURES = new Set([
  "atomics",
  "bulk-memory",
  "bulk-memory-opt",
  "call-indirect-overlong",
  "extended-const",
  "fp16",
  "gc",
  "multimemory",
  "multivalue",
  "mutable-globals",
  "nontrapping-fptoint",
  "reference-types",
  "relaxed-simd",
  "sign-ext",
  "simd128",
  "tail-call",
  "wide-arithmetic",
]);

/** Features always enabled for generated wasm code. */
const REQUIRED_WASM_FEATURES = ["+exception-handling"];

/**
 * The `target-features` list for generated wasm functions: exception handling
 * plus each wasm feature switched on or off by a clang flag, the last flag for
 * a feature winning. Unrelated flags are ignored.
 */
export function wasmTargetFeatures(
  clangFlags: readonly string[] = [],
): string[] {
  const chosen = new Map<string, boolean>();
  for (const flag of clangFlags) {
    if (!flag.startsWith("-m")) continue;
    const disabled = flag.startsWith("-mno-");
    const name = flag.slice(disabled ? 5 : 2);
    if (!WASM_FEATURES.has(name)) continue;
    chosen.delete(name);
    chosen.set(name, !disabled);
  }
  return [
    ...REQUIRED_WASM_FEATURES,
    ...[...chosen].map(([name, enabled]) => `${enabled ? "+" : "-"}${name}`),
  ];
}
