import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function runBPL(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_bugfix_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Bug Fixes", () => {
  it("BUG-023: should allow struct definition without trailing comma", () => {
    const source = `
      struct Point { x: i32, y: i32 }
      frame main() {
        local _p: Point = Point { x: 1, y: 2, };
      }
    `;
    const { exitCode, stderr } = runBPL(source);
    if (exitCode !== 0) console.error("BUG-023 Stderr:", stderr);
    expect(exitCode).toBe(0);
  });

  it("BUG-025: should allow trailing commas in function calls", () => {
    const source = `
      frame foo(_a: i32, _b: i32) {}
      frame main() {
        foo(1, 2,);
      }
    `;
    const { exitCode, stderr } = runBPL(source);
    if (exitCode !== 0) console.error("BUG-025 Stderr:", stderr);
    expect(exitCode).toBe(0);
  });

  it("BUG-024: should allow generic struct literals", () => {
    const source = `
      struct Box<T> { val: T }
      frame main() {
        local _b: Box<i32> = Box<i32> { val: 1 };
      }
    `;
    const { exitCode, stderr } = runBPL(source);
    if (exitCode !== 0) console.error("BUG-024 Stderr:", stderr);
    expect(exitCode).toBe(0);
  });

  it("BUG-029: should allow calling function pointer field directly", () => {
    const source = `
      struct S { cb: Func<void>(), }
      frame my_cb() { }
      frame main() {
        local s: S = S { cb: my_cb };
        s.cb();
      }
    `;
    const { exitCode, stderr } = runBPL(source);
    if (exitCode !== 0) console.error("BUG-029 Stderr:", stderr);
    expect(exitCode).toBe(0);
  });
});
