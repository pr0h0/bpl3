export type WasmCompatibilityMode =
  | "wasm-freestanding"
  | "wasm-hosted"
  | "blocked-by-host-api"
  | "native-only";

interface WasmCompatibilityBaseEntry {
  file: string;
  reason: string;
}

export interface WasmFreestandingCompatibilityEntry
  extends WasmCompatibilityBaseEntry {
  mode: "wasm-freestanding";
  expectedReturn: number;
}

export interface WasmHostedCompatibilityEntry
  extends WasmCompatibilityBaseEntry {
  mode: "wasm-hosted";
  expectedReturn: number;
  argv: string[];
  expectedStdout: string;
  expectedStderr: string;
}

export interface WasmUnsupportedCompatibilityEntry
  extends WasmCompatibilityBaseEntry {
  mode: "blocked-by-host-api" | "native-only";
}

export type WasmCompatibilityEntry =
  | WasmFreestandingCompatibilityEntry
  | WasmHostedCompatibilityEntry
  | WasmUnsupportedCompatibilityEntry;

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
    file: "examples/wasm_hosted_printf/main.bpl",
    mode: "wasm-hosted",
    expectedReturn: 0,
    argv: ["program"],
    expectedStdout: "wasm=42!\nliteral % A\nhex=beef upper=BEEF zero=0007 wide=   42\n",
    expectedStderr: "err:-7:ok?\n",
    reason:
      "hosted wasm formats dynamic %s, %d, %x/%X, width, %c, and %% output",
  },
  {
    file: "examples/wasm_hosted_transform/main.bpl",
    mode: "wasm-hosted",
    expectedReturn: 0,
    argv: ["program", "delta", "epsilon"],
    expectedStdout: "delta:7\nscore:24\n",
    expectedStderr: "checked hosted transform\n",
    reason:
      "hosted wasm exercises argv, stdout, stderr, String, enums, generics, and lambda capture",
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
  (entry): entry is WasmFreestandingCompatibilityEntry =>
    entry.mode === "wasm-freestanding",
);

export const WASM_HOSTED_EXAMPLES = WASM_COMPATIBILITY_MATRIX.filter(
  (entry): entry is WasmHostedCompatibilityEntry =>
    entry.mode === "wasm-hosted",
);

export function findMissingDedicatedWasmExamples(
  examples: string[],
  matrixFiles: ReadonlySet<string>,
): string[] {
  return examples
    .filter((file) =>
      file.split("/").some((part) => part.startsWith("wasm_")),
    )
    .filter((file) => !matrixFiles.has(file))
    .sort();
}

export function formatMissingWasmMatrixEntriesError(
  missingFiles: string[],
): string {
  return [
    "Missing wasm compatibility matrix entries:",
    ...missingFiles.map((file) => `- ${file}`),
    "Add each file to tests/helpers/wasmCompatibilityMatrix.ts with mode, reason, and expected execution metadata when the mode is wasm-freestanding or wasm-hosted.",
  ].join("\n");
}

export function validateExecutableWasmEntryMetadata(
  entries: WasmCompatibilityEntry[],
): string[] {
  const failures: string[] = [];

  for (const entry of entries) {
    if (
      (entry.mode === "wasm-freestanding" || entry.mode === "wasm-hosted") &&
      (typeof entry.expectedReturn !== "number" ||
        !Number.isFinite(entry.expectedReturn))
    ) {
      failures.push(
        `${entry.file}: ${entry.mode} entries must declare numeric expectedReturn`,
      );
    }

    if (entry.mode !== "wasm-hosted") {
      continue;
    }

    if (!Array.isArray(entry.argv)) {
      failures.push(`${entry.file}: wasm-hosted entries must declare argv`);
    }
    if (typeof entry.expectedStdout !== "string") {
      failures.push(
        `${entry.file}: wasm-hosted entries must declare expectedStdout`,
      );
    }
    if (typeof entry.expectedStderr !== "string") {
      failures.push(
        `${entry.file}: wasm-hosted entries must declare expectedStderr`,
      );
    }
  }

  return failures;
}
