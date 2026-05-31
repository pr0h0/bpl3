import { describe, expect, test } from "bun:test";

import {
  explainBplSanitizerSupportFailure,
  type CorrectnessCommandResult,
} from "./helpers/compilerCorrectness";

function failedProbe(stderr: string): CorrectnessCommandResult {
  return {
    exitCode: 1,
    stdout: "",
    stderr,
  };
}

describe("Compiler sanitizer support diagnostics", () => {
  test("explains missing compiler-rt sanitizer runtimes without probing the host", () => {
    const reason = explainBplSanitizerSupportFailure(
      failedProbe([
        "/usr/bin/ld: cannot find /usr/lib/clang/18/lib/linux/libclang_rt.asan-x86_64.a: No such file or directory",
        "clang: error: linker command failed with exit code 1",
      ].join("\n")),
    );

    expect(reason).toContain("compiler-rt");
    expect(reason).toContain("libclang_rt");
    expect(reason).toContain("install the Clang compiler-rt runtime package");
    expect(reason).toContain("bun index.ts doctor --json");
    expect(reason).toContain("bun run test:sanitizers");
  });

  test("keeps generic sanitizer probe failures actionable and preserves stderr", () => {
    const stderr =
      "clang: error: unsupported option '-fsanitize=address' for target";
    const reason = explainBplSanitizerSupportFailure(failedProbe(stderr));

    expect(reason).toContain("-fsanitize=address,undefined");
    expect(reason).toContain("compiler-rt");
    expect(reason).toContain("libclang_rt");
    expect(reason).toContain(stderr);
  });
});
