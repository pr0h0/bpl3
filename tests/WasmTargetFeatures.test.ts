import { describe, expect, it } from "bun:test";

import { wasmTargetFeatures } from "../compiler/backend/codegen/attributes/WasmTargetFeatures";
import { compileToLLVM } from "./helpers";

// BUG-823: the per-function target-features attribute replaced the clang
// command-line features, so `--clang-flag -msimd128` had no effect on wasm.
describe("wasm target features", () => {
  it("always lists exception handling", () => {
    expect(wasmTargetFeatures()).toEqual(["+exception-handling"]);
    expect(
      wasmTargetFeatures(["-O3", "-march=native", "-mcpu=generic"]),
    ).toEqual(["+exception-handling"]);
  });

  it("copies wasm feature flags, the last flag for a feature winning", () => {
    expect(
      wasmTargetFeatures([
        "-msimd128",
        "-mno-bulk-memory",
        "-mrelaxed-simd",
        "-mno-relaxed-simd",
        "-mavx2",
      ]),
    ).toEqual([
      "+exception-handling",
      "+simd128",
      "-bulk-memory",
      "-relaxed-simd",
    ]);
  });

  it("puts clang feature flags in the wasm function attribute", () => {
    const source = "frame main() ret int { return 1; }";
    const plain = compileToLLVM(source, "wasm_features.bpl", {
      target: "wasm32-unknown-unknown",
    });
    expect(plain).toContain('"target-features"="+exception-handling"');
    expect(plain).not.toContain("simd128");

    const simd = compileToLLVM(source, "wasm_features.bpl", {
      target: "wasm32-unknown-unknown",
      clangFlags: ["-msimd128"],
    });
    expect(simd).toContain('"target-features"="+exception-handling,+simd128"');
  });

  it("adds no target-features attribute on native targets", () => {
    const ir = compileToLLVM(
      "frame main() ret int { return 1; }",
      "native_features.bpl",
      { target: "x86_64-unknown-linux-gnu", clangFlags: ["-msimd128"] },
    );
    expect(ir).not.toContain("target-features");
  });
});
