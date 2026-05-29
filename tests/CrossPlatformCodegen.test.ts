import { describe, expect, test } from "bun:test";

import { compileToLLVM } from "./helpers";

const targets = [
  {
    name: "Linux x64",
    triple: "x86_64-pc-linux-gnu",
    layoutPrefix: "e-m:e",
  },
  {
    name: "Linux ARM64",
    triple: "aarch64-unknown-linux-gnu",
    layoutPrefix: "e-m:e-i8",
  },
  {
    name: "macOS ARM64",
    triple: "arm64-apple-darwin",
    layoutPrefix: "e-m:o-i64",
  },
  {
    name: "Windows x64 GNU",
    triple: "x86_64-pc-windows-gnu",
    layoutPrefix: "e-m:w",
  },
  {
    name: "WebAssembly 32-bit",
    triple: "wasm32-unknown-unknown",
    layoutPrefix: "e-m:e-p:32:32",
  },
] as const;

describe("Cross-platform codegen target smoke tests", () => {
  for (const target of targets) {
    test(`emits target metadata for ${target.name}`, () => {
      const ir = compileToLLVM(
        `
          frame add(left: int, right: int) ret int {
            return left + right;
          }

          frame main() ret int {
            return add(20, 22);
          }
        `,
        `${target.triple}.bpl`,
        { target: target.triple },
      );

      expect(ir).toContain(`target triple = "${target.triple}"`);
      expect(ir).toContain(`target datalayout = "${target.layoutPrefix}`);
      expect(ir).toMatch(/define i32 @main\(i32 %argc, i8\*\* %argv\)/);
    });
  }
});
