import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Compiler } from "../compiler";

test("global f32 literal casts round constants and retain signed zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-global-f32-"));
  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 60000,
    });
    if (result.status !== 0)
      throw new Error(
        `${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`,
      );
    return result;
  }
  try {
    writeFileSync(
      join(dir, "provider.c"),
      "int negative_zero(float value){union{float f;unsigned int u;} bits;bits.f=value;return bits.u==0x80000000u;}",
    );
    run("clang", [
      "-c",
      join(dir, "provider.c"),
      "-o",
      join(dir, "provider.o"),
    ]);
    writeFileSync(
      join(dir, "main.bpl"),
      `
      type Sample=f32;
      global const POSITIVE:Sample=cast<Sample>(1.23456789);
      global const NEGATIVE:f32=cast<f32>(-1.25);
      global const NEGATIVE_ZERO:f32=cast<f32>(-0.0);
      extern negative_zero(value:f32) ret int;
      frame main() ret int {
        if(POSITIVE!=cast<f32>(1.23456789) || NEGATIVE!=cast<f32>(-1.25)){return 1;}
        if(negative_zero(NEGATIVE_ZERO)!=1){return 2;}
        return 0;
      }
    `,
    );
    for (const opt of [0, 3]) {
      const binary = join(dir, "program");
      run("bun", [
        resolve("index.ts"),
        "build",
        join(dir, "main.bpl"),
        "--object",
        join(dir, "provider.o"),
        "-O",
        String(opt),
        "-o",
        binary,
      ]);
      expect(run(binary, []).status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

test("global f32 casts keep runtime calls out of static initialization", () => {
  const result = new Compiler({ filePath: "global.bpl" }).compile(`
    frame runtime_value() ret double {return 1.25;}
    global const VALUE:f32=cast<f32>(runtime_value());
    frame main() ret int {return 0;}
  `);
  expect(result.success).toBe(false);
  expect(
    result.errors?.some((error) =>
      error.message.includes(
        "Global initializer must be a compile-time constant",
      ),
    ),
  ).toBe(true);
});
