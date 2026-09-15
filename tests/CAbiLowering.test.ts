import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { getDataLayoutForTarget } from "../compiler/backend/codegen/BaseCodeGenerator";
import { LLVMTypeLayout } from "../compiler/backend/codegen/LLVMTypeLayout";
import {
  CAbiLowering,
  getCAbiKind,
} from "../compiler/backend/codegen/abi/CAbi";

// C struct shapes with the LLVM types BPL emits for the equivalent structs.
const SHAPES: Record<string, { c: string; llvm: string }> = {
  I2: { c: "int x, y;", llvm: "{ i32, i32 }" },
  C3: { c: "char a, b, c;", llvm: "{ i8, i8, i8 }" },
  D2: { c: "double a, b;", llvm: "{ double, double }" },
  F4: { c: "float a, b, c, d;", llvm: "{ float, float, float, float }" },
  LD: { c: "long long a; double b;", llvm: "{ i64, double }" },
  DI: { c: "double a; int b;", llvm: "{ double, i32 }" },
  IF: { c: "int a; float b;", llvm: "{ i32, float }" },
  L4: { c: "long long a, b, c, d;", llvm: "{ i64, i64, i64, i64 }" },
  N: { c: "struct I2 p; double d;", llvm: "{ %struct.I2, double }" },
  A: { c: "char s[3]; int n;", llvm: "{ [3 x i8], i32 }" },
  F1: { c: "float f;", llvm: "{ float }" },
  D3: { c: "double a, b, c;", llvm: "{ double, double, double }" },
  L3: { c: "long long a, b, c;", llvm: "{ i64, i64, i64 }" },
  I3: { c: "int a, b, c;", llvm: "{ i32, i32, i32 }" },
  PB: { c: "void *p; _Bool b;", llvm: "{ i8*, i1 }" },
  FA: { c: "float v[3];", llvm: "{ [3 x float] }" },
  C1: { c: "char c;", llvm: "{ i8 }" },
};

// Signatures beyond `struct S f_s(struct S)`, covering register exhaustion
// and mixed scalar/aggregate parameter lists.
const EXTRA = [
  {
    c: "long long many(long long, long long, long long, long long, long long, struct I2, struct I2);",
    name: "many",
    ret: "i64",
    params: ["i64", "i64", "i64", "i64", "i64", "%struct.I2", "%struct.I2"],
  },
  {
    c: "double fp(double, double, double, double, double, double, double, struct D2, struct IF);",
    name: "fp",
    ret: "double",
    params: [
      "double",
      "double",
      "double",
      "double",
      "double",
      "double",
      "double",
      "%struct.D2",
      "%struct.IF",
    ],
  },
  {
    c: "void sink(int, struct L4, float, struct F1);",
    name: "sink",
    ret: "void",
    params: ["i32", "%struct.L4", "float", "%struct.F1"],
  },
  {
    c: "struct PB mixed(void*, struct C3, double);",
    name: "mixed",
    ret: "%struct.PB",
    params: ["i8*", "%struct.C3", "double"],
  },
];

const TARGETS = [
  "x86_64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "arm64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "i686-unknown-linux-gnu",
  "wasm32-unknown-unknown",
];

const hasClang = spawnSync("clang", ["--version"]).status === 0;

function cSource(): string {
  const lines = Object.entries(SHAPES).map(
    ([name, shape]) => `struct ${name} { ${shape.c} };`,
  );
  for (const name of Object.keys(SHAPES)) {
    lines.push(`struct ${name} f_${name}(struct ${name});`);
  }
  for (const extra of EXTRA) lines.push(extra.c);
  // Take each function's address so clang emits every declaration.
  lines.push(
    `void *table[] = { ${[
      ...Object.keys(SHAPES).map((name) => `f_${name}`),
      ...EXTRA.map((extra) => extra.name),
    ].join(", ")} };`,
  );
  return lines.join("\n");
}

/** Canonical form: opaque pointers and ABI-relevant attributes only. */
function normalize(declaration: string): string {
  return declaration
    .replace(/%struct\.\w+\*/g, "ptr")
    .replace(/i8\*/g, "ptr")
    .replace(
      /\b(noundef|dead_on_unwind|writable|dso_local|zeroext|signext)\s*/g,
      "",
    )
    .replace(/\s+#\d+/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ,/g, ",")
    .replace(/ \)/g, ")")
    .trim();
}

function clangDeclarations(target: string): Map<string, string> {
  const result = spawnSync(
    "clang",
    [
      `--target=${target}`,
      "-x",
      "c",
      "-S",
      "-emit-llvm",
      "-O0",
      "-",
      "-o",
      "-",
    ],
    { input: cSource(), encoding: "utf8" },
  );
  expect(result.stderr).toBe("");
  const declarations = new Map<string, string>();
  for (const line of result.stdout.split("\n")) {
    const match = /^declare .*?@(\w+)\(/.exec(line);
    if (match) declarations.set(match[1]!, normalize(line));
  }
  return declarations;
}

describe.skipIf(!hasClang)("C ABI lowering matches clang", () => {
  for (const target of TARGETS) {
    test(target, () => {
      const layout = new LLVMTypeLayout(
        getDataLayoutForTarget(target),
        (name) => {
          const shape = SHAPES[name.replace("%struct.", "")];
          if (!shape) throw new Error(`unknown ${name}`);
          return shape.llvm;
        },
      );
      const lowering = new CAbiLowering(getCAbiKind(target), layout, (name) => {
        const shape = SHAPES[name.replace("%struct.", "")];
        if (!shape) throw new Error(`unknown ${name}`);
        return shape.llvm;
      });
      const expected = clangDeclarations(target);
      const signatures = [
        ...Object.keys(SHAPES).map((name) => ({
          name: `f_${name}`,
          returnType: `%struct.${name}`,
          paramTypes: [`%struct.${name}`],
        })),
        ...EXTRA.map((extra) => ({
          name: extra.name,
          returnType: extra.ret,
          paramTypes: extra.params,
        })),
      ];
      const mismatches: string[] = [];
      for (const signature of signatures) {
        const actual = normalize(lowering.lower(signature).declaration)
          // clang spells i1 struct members as i8 and scalar pointers as ptr.
          .replace(/\bi1\b/g, "i8");
        const want = expected.get(signature.name);
        if (actual !== want) {
          mismatches.push(
            `${signature.name}\n  bpl:   ${actual}\n  clang: ${want}`,
          );
        }
      }
      expect(mismatches.join("\n")).toBe("");
    });
  }
});
