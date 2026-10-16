import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { calculateCompilerFingerprint } from "../compiler/common/CompilerFingerprint";

test("compiler fingerprints track source, grammar and standalone changes independently of install paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-fingerprint-"));
  try {
    const roots = [join(dir, "one"), join(dir, "two")];
    for (const root of roots) {
      mkdirSync(join(root, "compiler"), { recursive: true });
      mkdirSync(join(root, "grammar"));
      writeFileSync(join(root, "compiler", "index.ts"), "compiler");
      writeFileSync(join(root, "grammar", "bpl.peggy"), "grammar");
    }
    const original = calculateCompilerFingerprint(roots[0], "unused");
    expect(calculateCompilerFingerprint(roots[1], "unused")).toBe(original);
    writeFileSync(join(roots[0]!, "compiler", "index.ts"), "changed compiler");
    expect(calculateCompilerFingerprint(roots[0], "unused")).not.toBe(original);
    writeFileSync(join(roots[1]!, "grammar", "bpl.peggy"), "changed grammar");
    expect(calculateCompilerFingerprint(roots[1], "unused")).not.toBe(original);
    const binary = join(dir, "bpl");
    writeFileSync(binary, "binary one");
    const before = calculateCompilerFingerprint(undefined, binary);
    writeFileSync(binary, "binary two");
    expect(calculateCompilerFingerprint(undefined, binary)).not.toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
