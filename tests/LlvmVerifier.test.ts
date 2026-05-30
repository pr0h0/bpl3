import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";

import {
  getLlvmVerifierCandidates,
  verifyLlvmFile,
} from "../compiler/common/LlvmVerifier";

function withLlvmFile(ir: string, callback: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "bpl-llvm-verifier-test-"));
  const irPath = join(dir, "module.ll");
  writeFileSync(irPath, ir);

  try {
    callback(irPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("LLVM verifier tooling", () => {
  const savedEnv = new Map(
    [
      "BPL_OPT",
      "OPT",
      "BPL_LLVM_AS",
      "LLVM_AS",
      "BPL_LLC",
      "LLC",
      "BPL_CC",
      "CC",
    ].map((name) => [name, process.env[name]]),
  );

  afterEach(() => {
    for (const [name, value] of savedEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  test("accepts structurally valid LLVM IR", () => {
    withLlvmFile(
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
      (irPath) => {
        const result = verifyLlvmFile(irPath);

        expect(result.exitCode).toBe(0);
        expect(result.tool).not.toBe("none");
      },
    );
  });

  test("uses configured LLVM verifier tools before defaults", () => {
    process.env.BPL_OPT = "/opt/llvm/bin/opt-18";
    process.env.BPL_LLVM_AS = "/opt/llvm/bin/llvm-as-18";
    process.env.BPL_LLC = "/opt/llvm/bin/llc-18";
    process.env.BPL_CC = "/opt/llvm/bin/clang-18";

    expect(getLlvmVerifierCandidates().map((candidate) => candidate.tool)).toEqual(
      [
        "/opt/llvm/bin/opt-18",
        "/opt/llvm/bin/llvm-as-18",
        "/opt/llvm/bin/llc-18",
        "/opt/llvm/bin/clang-18",
      ],
    );
  });

  test("reports a clear diagnostic when configured verifier tools are unavailable", () => {
    const missingRoot = join(tmpdir(), `missing-llvm-tools-${process.pid}`);
    process.env.BPL_OPT = join(missingRoot, "opt");
    process.env.BPL_LLVM_AS = join(missingRoot, "llvm-as");
    process.env.BPL_LLC = join(missingRoot, "llc");
    process.env.BPL_CC = join(missingRoot, "clang");
    delete process.env.OPT;
    delete process.env.LLVM_AS;
    delete process.env.LLC;
    delete process.env.CC;

    withLlvmFile(
      `
        define i32 @main() {
        entry:
          ret i32 0
        }
      `,
      (irPath) => {
        const result = verifyLlvmFile(irPath);

        expect(result.exitCode).toBe(-1);
        expect(result.tool).toBe("none");
        expect(result.stderr).toContain("BPL_OPT");
        expect(result.stderr).toContain("BPL_CC");
      },
    );
  });

  test("rejects structurally invalid LLVM IR before native linking", () => {
    withLlvmFile(
      `
        define i32 @bad() {
        entry:
          ret i64 0
        }
      `,
      (irPath) => {
        const result = verifyLlvmFile(irPath);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr + result.stdout).toMatch(/i32|result type|LLVM/i);
      },
    );
  });

  test("uses a private verifier output path instead of predictable IR-directory names", () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-llvm-verifier-output-"));
    const toolDir = join(dir, "tools");
    const fakeLlvmAs = join(toolDir, "fake-llvm-as.js");
    const irPath = join(dir, "module.ll");
    const symlinkTarget = join(dir, "outside-output");
    const oldPredictableOutput = join(
      dir,
      `module.ll.${basename(fakeLlvmAs)}.verify.out`,
    );

    writeFileSync(irPath, "define i32 @main() { ret i32 0 }\n");
    mkdirSync(toolDir);
    writeFileSync(symlinkTarget, "original");
    symlinkSync(symlinkTarget, oldPredictableOutput, "file");
    writeFileSync(
      fakeLlvmAs,
      [
        "#!/usr/bin/env node",
        'const fs = require("fs");',
        'if (process.argv.includes("--version")) process.exit(0);',
        'const outIndex = process.argv.indexOf("-o");',
        'if (outIndex >= 0) fs.writeFileSync(process.argv[outIndex + 1], "verified");',
        "process.exit(0);",
      ].join("\n"),
    );
    chmodSync(fakeLlvmAs, 0o755);

    process.env.BPL_OPT = join(dir, "missing-opt");
    process.env.BPL_LLVM_AS = fakeLlvmAs;
    process.env.BPL_LLC = join(dir, "missing-llc");
    process.env.BPL_CC = join(dir, "missing-clang");
    delete process.env.OPT;
    delete process.env.LLVM_AS;
    delete process.env.LLC;
    delete process.env.CC;

    try {
      const result = verifyLlvmFile(irPath);

      expect(result.exitCode).toBe(0);
      expect(result.tool).toBe(fakeLlvmAs);
      expect(readFileSync(symlinkTarget, "utf-8")).toBe("original");
      expect(existsSync(oldPredictableOutput)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
