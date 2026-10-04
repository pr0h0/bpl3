import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("shared builds reject incompatible modes with parseable diagnostics", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-shared-options-"));
  try {
    const source = join(dir, "library.bpl");
    writeFileSync(source, "frame value() ret int { return 42; }");
    for (const flags of [
      [],
      ["-o", join(dir, "lib.so"), "--cache"],
      ["-o", join(dir, "lib.so"), "--emit", "ast"],
      ["-o", join(dir, "lib.so"), "--target", "wasm32-unknown-unknown"],
    ]) {
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), "build", source, "--shared", "--json", ...flags],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(JSON.stringify(report)).toContain(
        "BPL_BUILD_INVALID_SHARED_OPTIONS",
      );
      expect(result.stderr).toBe("");
    }
    const executable = spawnSync(
      "bun",
      [resolve("index.ts"), "build", source, "--json"],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(executable.status).toBe(1);
    expect(executable.stdout).toContain("Missing entry point");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

test.skipIf(process.platform !== "linux")(
  "shared C exports and generated headers work without an adapter",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-c-export-"));
    const run = (command: string, args: string[]) => {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status !== 0)
        throw new Error(`${command}: ${result.stdout}\n${result.stderr}`);
      return result;
    };
    try {
      const source = join(dir, "api.bpl");
      writeFileSync(
        source,
        `
      type Counter = long;
      @[c_export] frame add64(a: Counter, b: long) ret long { return a + b; }
      @[c_export] frame signed_byte(x: i8) ret i8 { return x; }
      @[c_export] frame unsigned_byte(x: u8) ret u8 { return x; }
      @[c_export] frame signed_short(x: short) ret short { return x; }
      @[c_export] frame toggle(x: bool) ret bool { return !x; }
      @[c_export] frame read_int(x: *int) ret int { return *x; }
      frame increment(x: int) ret int { return x + 1; }
      @[c_export] frame factory() ret Func<int>(int) { return increment; }
      @[c_export] frame invoke(f: Func<int>(int), x: int) ret int { return f(x); }
    `,
      );
      const host = join(dir, "host.c");
      writeFileSync(
        host,
        `
      #include "api.h"
      static int32_t twice(int32_t value) { return value * 2; }
      int main(void) {
        int32_t value = 42;
        if (add64(INT64_C(4294967296), -7) != INT64_C(4294967289)) return 1;
        if (signed_byte(-128) != -128 || unsigned_byte(255) != 255 || signed_short(-32768) != -32768) return 2;
        if (toggle(true) || !toggle(false)) return 3;
        if (read_int(&value) != 42 || invoke(twice, 21) != 42 || factory()(41) != 42) return 4;
        return 0;
      }
    `,
      );
      for (const opt of [0, 3]) {
        run("bun", [
          resolve("index.ts"),
          "build",
          source,
          "--shared",
          "--header",
          join(dir, "api.h"),
          "-O",
          String(opt),
          "-o",
          join(dir, "libapi.so"),
        ]);
        for (const [compiler, language] of [
          ["clang", "c"],
          ["clang++", "c++"],
        ]) {
          const binary = join(dir, "host");
          run(compiler!, [
            "-x",
            language!,
            "-Werror",
            host,
            "-L",
            dir,
            "-lapi",
            `-Wl,-rpath,${dir}`,
            "-o",
            binary,
          ]);
          run(binary, []);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  180000,
);

test("C exports remain valid when imported into cached executables", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-c-export-cache-"));
  try {
    writeFileSync(
      join(dir, "api.bpl"),
      "export increment; @[c_export] frame increment(x:int) ret int { return x + 1; }",
    );
    const source = join(dir, "main.bpl");
    writeFileSync(
      source,
      'import increment from "./api.bpl"; frame main() ret int { return increment(41) - 42; }',
    );
    const binary = join(dir, "host");
    for (let build = 0; build < 2; build++) {
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), "build", source, "--cache", "-o", binary],
        { encoding: "utf8", timeout: 30000 },
      );
      if (result.status !== 0) throw new Error(result.stdout + result.stderr);
      expect(spawnSync(binary, [], { timeout: 5000 }).status).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

test("shared exports reject cross-module public symbol conflicts", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-c-export-conflict-"));
  try {
    for (const name of ["first", "second"]) {
      writeFileSync(
        join(dir, `${name}.bpl`),
        "export value; @[c_export] frame value() ret int { return 42; }",
      );
    }
    const source = join(dir, "api.bpl");
    writeFileSync(
      source,
      'import * as first from "./first.bpl"; import * as second from "./second.bpl";',
    );
    const result = spawnSync(
      "bun",
      [
        resolve("index.ts"),
        "build",
        source,
        "--shared",
        "--json",
        "-o",
        join(dir, "libapi.so"),
      ],
      { encoding: "utf8", timeout: 15000 },
    );
    expect(result.status).toBe(1);
    expect(JSON.stringify(JSON.parse(result.stdout))).toContain(
      "BPL_C_EXPORT_CONFLICT",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);

test("header validation preserves JSON diagnostics and source contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-header-options-"));
  try {
    const source = join(dir, "api.bpl");
    const contents = "@[c_export] frame value() ret int { return 42; }";
    writeFileSync(source, contents);
    for (const flags of [
      ["--header", join(dir, "api.h"), "--emit", "ast"],
      ["--shared", "-o", join(dir, "libapi.so"), "--header", source],
    ]) {
      const result = spawnSync(
        "bun",
        [resolve("index.ts"), "build", source, "--json", ...flags],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(result.status).toBe(1);
      expect(JSON.stringify(JSON.parse(result.stdout))).toContain(
        "BPL_BUILD_INVALID_SHARED_OPTIONS",
      );
      expect(result.stderr).toBe("");
      expect(readFileSync(source, "utf8")).toBe(contents);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
