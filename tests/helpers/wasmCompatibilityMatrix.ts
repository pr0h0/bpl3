export type WasmCompatibilityMode =
  | "wasm-freestanding"
  | "wasm-hosted"
  | "blocked-by-host-api"
  | "native-only";

export interface WasmCompatibilityEntry {
  file: string;
  mode: WasmCompatibilityMode;
  expectedReturn?: number;
  argv?: string[];
  expectedStdout?: string;
  expectedStderr?: string;
  reason: string;
}

export const WASM_COMPATIBILITY_MATRIX: WasmCompatibilityEntry[] = [
  {
    file: "examples/bug_043_lambda_inference/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "lambda inference without host APIs",
  },
  {
    file: "examples/bug_044_generic_recursion/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "generic recursion without host APIs",
  },
  {
    file: "examples/enum_complex_match/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 99,
    reason: "enum matching without host APIs",
  },
  {
    file: "examples/enum_exhaustiveness/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 27,
    reason: "exhaustive enum matching without host APIs",
  },
  {
    file: "examples/enum_imports/wildcard/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 100,
    reason: "wildcard enum imports without host APIs",
  },
  {
    file: "examples/enum_imports_wildcard/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 100,
    reason: "top-level wildcard enum imports without host APIs",
  },
  {
    file: "examples/enum_methods_simple/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "enum methods without host APIs",
  },
  {
    file: "examples/enum_mixed_variants/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 33,
    reason: "mixed enum variants without host APIs",
  },
  {
    file: "examples/enum_struct_variants/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 58,
    reason: "struct enum variants without host APIs",
  },
  {
    file: "examples/enum_test/all_variants/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 6,
    reason: "all enum variant forms without host APIs",
  },
  {
    file: "examples/enum_test/data_variants/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "data enum variants without host APIs",
  },
  {
    file: "examples/enum_test/enum_return/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 2,
    reason: "enum return values without host APIs",
  },
  {
    file: "examples/enum_test/simple_tuple/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "tuple enum payloads without host APIs",
  },
  {
    file: "examples/enum_test/unit_only/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "unit enum variants without host APIs",
  },
  {
    file: "examples/lint_test/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "syntax and lint fixture without host APIs",
  },
  {
    file: "examples/wasm_control_flow/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "dedicated wasm control-flow fixture",
  },
  {
    file: "examples/wasm_lambdas_generics/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "dedicated wasm lambda and generic fixture",
  },
  {
    file: "examples/wasm_memory_strings/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "dedicated wasm string/memory runtime fixture",
  },
  {
    file: "examples/wasm_memory_intrinsics/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "dedicated wasm memory intrinsic fixture",
  },
  {
    file: "examples/wasm_stdlib_array/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "stdlib Array subset works in freestanding wasm",
  },
  {
    file: "examples/wasm_stdlib_bitset/main.bpl",
    mode: "wasm-freestanding",
    expectedReturn: 0,
    reason: "stdlib BitSet subset works in freestanding wasm",
  },
  {
    file: "examples/wasm_hosted_io/main.bpl",
    mode: "wasm-hosted",
    expectedReturn: 0,
    argv: ["program", "alpha", "beta"],
    expectedStdout: "host:alpha\n!\n",
    expectedStderr: "host stderr\n",
    reason: "host imports provide argv, stdout, stderr, and stdlib String support",
  },
  {
    file: "examples/stdlib_fs/main.bpl",
    mode: "blocked-by-host-api",
    reason: "requires filesystem imports that the wasm host adapter does not provide",
  },
  {
    file: "examples/http_client_test/main.bpl",
    mode: "blocked-by-host-api",
    reason: "requires networking imports that the wasm host adapter does not provide",
  },
  {
    file: "examples/stdlib_env/main.bpl",
    mode: "blocked-by-host-api",
    reason: "requires environment variable imports that the wasm host adapter does not provide",
  },
  {
    file: "examples/asm_test/main.bpl",
    mode: "native-only",
    reason: "uses target-specific inline assembly",
  },
  {
    file: "examples/asm_flavors_test/main.bpl",
    mode: "native-only",
    reason: "uses target-specific inline assembly dialect coverage",
  },
  {
    file: "examples/asm_clobbers/main.bpl",
    mode: "native-only",
    reason: "uses target-specific inline assembly clobber coverage",
  },
];

export const WASM_FREESTANDING_EXAMPLES = WASM_COMPATIBILITY_MATRIX.filter(
  (entry) => entry.mode === "wasm-freestanding",
);

export const WASM_HOSTED_EXAMPLES = WASM_COMPATIBILITY_MATRIX.filter(
  (entry) => entry.mode === "wasm-hosted",
);
