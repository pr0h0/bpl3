export const SANITIZER_RUNTIME_SUPPORT_ID = "sanitizer-runtime-support";
export const SANITIZER_RUNTIME_UNAVAILABLE_CODE =
  "BPL_SANITIZER_RUNTIME_UNAVAILABLE";
export const SANITIZER_CLANG_FLAG = "-fsanitize=address,undefined";
export const SANITIZER_RUNTIME_REPRO_COMMANDS = [
  "bun run test:sanitizers",
  "bun test tests/CompilerSanitizerRuntime.test.ts",
] as const;
export const SANITIZER_DIAGNOSTIC_COMMANDS = [
  "bun index.ts doctor --json",
  ...SANITIZER_RUNTIME_REPRO_COMMANDS,
] as const;

export interface SanitizerSupportFailureInput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function explainBplSanitizerSupportFailure(
  result: SanitizerSupportFailureInput,
  commands: readonly string[] = SANITIZER_DIAGNOSTIC_COMMANDS,
): string {
  const combinedOutput = [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n");
  const unsupportedSanitizerFlag =
    /unsupported option.*-fsanitize|unknown argument.*-fsanitize/i.test(
      combinedOutput,
    );

  return [
    "BPL sanitizer support probe failed while compiling/running a tiny program with --clang-flag=-fsanitize=address,undefined.",
    unsupportedSanitizerFlag
      ? "The configured Clang does not appear to support -fsanitize=address,undefined for this target."
      : "The configured Clang could not complete the ASan/UBSan probe.",
    "To run sanitizer-backed compiler correctness tests, install the Clang compiler-rt runtime package that provides libclang_rt ASan/UBSan libraries for this target, or use a CI image/toolchain that includes it.",
    "Useful local diagnostics:",
    ...commands.map((command) => `- ${command}`),
    `exitCode: ${result.exitCode}`,
    combinedOutput ? `probe output:\n${combinedOutput}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
