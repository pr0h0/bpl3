import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.skipIf(process.platform !== "linux")(
  "small integer callbacks agree with optimized C and C++ callers",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-small-callback-"));
    function run(command: string, args: string[]) {
      const result = spawnSync(command, args, {
        encoding: "utf8",
        timeout: 30000,
      });
      if (result.status !== 0)
        throw new Error(
          `${command}: status=${result.status}, signal=${result.signal}\n${result.stdout}\n${result.stderr}`,
        );
    }
    try {
      writeFileSync(
        join(dir, "api.bpl"),
        `
      type Signed=i8;
      extern native_signed(x:Signed) ret int;
      extern get_signed() ret Func<int>(Signed);
      frame apply_signed(f:Lambda<int>(Signed)) ret int {return f(-128 as Signed);}
      frame apply_unsigned(f:Lambda<int>(u8)) ret int {return f(255 as u8);}
      frame generic_signed<T>(f:Func<int>(T),value:T) ret int {return f(value);}
      @[c_export] frame invoke_generic_signed(f:Func<int>(Signed)) ret int {return generic_signed<Signed>(f,-128 as Signed);}
      @[c_export] frame invoke_extern() ret int {return native_signed(-128 as Signed);}
      @[c_export] frame invoke_returned() ret int {return get_signed()(-128 as Signed);}
      @[c_export] frame invoke_signed_lambda(f:Func<int>(Signed)) ret int {return apply_signed(f);}
      @[c_export] frame invoke_unsigned_lambda(f:Func<int>(u8)) ret int {return apply_unsigned(f);}
      frame bpl_signed(x:Signed) ret int {return x as int;}
      @[c_export] frame signed_factory() ret Func<int>(Signed) {return bpl_signed;}
      @[c_export] frame invoke_bool(f:Func<int>(bool)) ret int {return f(true);}
      @[c_export] frame invoke_signed(f:Func<int>(i8)) ret int {return f(-128 as i8);}
      @[c_export] frame invoke_unsigned(f:Func<int>(u8)) ret int {return f(255 as u8);}
      @[c_export] frame invoke_short(f:Func<int>(short)) ret int {return f(-32768 as short);}
      @[c_export] frame invoke_ushort(f:Func<int>(ushort)) ret int {return f(65535 as ushort);}
    `,
      );
      writeFileSync(
        join(dir, "provider.c"),
        `
      #include <stdint.h>
      int32_t native_signed(int8_t x) {return x;}
      int32_t (*get_signed(void))(int8_t) {return native_signed;}
    `,
      );
      run("clang", [
        "-O3",
        "-fPIC",
        "-c",
        join(dir, "provider.c"),
        "-o",
        join(dir, "provider.o"),
      ]);
      writeFileSync(
        join(dir, "host.c"),
        `
      #include "api.h"
      #include <stdio.h>
      static int32_t signed_probe(int8_t x) {return x;}
      static int32_t unsigned_probe(uint8_t x) {return x;}
      static int32_t short_probe(int16_t x) {return x;}
      static int32_t ushort_probe(uint16_t x) {return x;}
      static int32_t bool_probe(bool x) {return x ? 42 : -1;}
      int main(void) {
        int32_t a=invoke_signed(signed_probe),b=invoke_unsigned(unsigned_probe);
        int32_t c=invoke_short(short_probe),d=invoke_ushort(ushort_probe);
        if(a!=-128 || b!=255 || c!=-32768 || d!=65535) {
          fprintf(stderr,"values: %d %d %d %d\\n",a,b,c,d);return 1;
        }
        if(invoke_extern()!=-128 || invoke_returned()!=-128) return 2;
        if(invoke_signed_lambda(signed_probe)!=-128 || invoke_unsigned_lambda(unsigned_probe)!=255) return 3;
        if(signed_factory()(-128)!=-128 || invoke_bool(bool_probe)!=42) return 4;
        if(invoke_generic_signed(signed_probe)!=-128) return 5;
        return 0;
      }
    `,
      );
      for (const opt of [0, 3]) {
        run("bun", [
          resolve("index.ts"),
          "build",
          join(dir, "api.bpl"),
          "--shared",
          "--object",
          join(dir, "provider.o"),
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
        ] as const) {
          run(compiler, [
            "-x",
            language,
            "-O3",
            "-Werror",
            join(dir, "host.c"),
            "-L",
            dir,
            "-lapi",
            `-Wl,-rpath,${dir}`,
            "-o",
            join(dir, "host"),
          ]);
          run(join(dir, "host"), []);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

test("narrow callback argument extensions match Clang across targets", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-small-callback-targets-"));
  try {
    for (const [target, expected] of [
      ["x86_64-unknown-linux-gnu", "signext "],
      ["x86_64-apple-darwin", "signext "],
      ["aarch64-unknown-linux-gnu", ""],
      ["arm64-apple-darwin", "signext "],
      ["x86_64-pc-windows-msvc", ""],
      ["i686-unknown-linux-gnu", "signext "],
      ["wasm32-unknown-unknown", "signext "],
    ] as const) {
      const c = spawnSync(
        "clang",
        [`--target=${target}`, "-x", "c", "-S", "-emit-llvm", "-o", "-", "-"],
        {
          input: "int probe(signed char x) {return x;}",
          encoding: "utf8",
          timeout: 15000,
        },
      );
      expect(c.status).toBe(0);
      const hasExtension = /define[^\n]*@probe\(i8[^\n]*signext/.test(c.stdout);
      expect(hasExtension).toBe(expected !== "");
      const result = new Compiler({ filePath: "small.bpl", target }).compile(`
        struct Pair {x:int,y:int,}
        extern mixed_signed(value:i8,p:Pair) ret int;
        frame aggregate(p:Pair) ret int {return mixed_signed(-128 as i8,p);}
        frame probe(f:Func<int>(i8)) ret int {return f(-128 as i8);}
      `);
      expect(result.success).toBe(true);
      expect(result.output).toMatch(
        new RegExp(`call i32 %[^\\s(]+\\(i8 ${expected}`),
      );
      expect(result.output).toContain(`call i32 @mixed_signed(i8 ${expected}`);
      expect(result.output).toContain(
        `declare i32 @mixed_signed(i8${expected ? " " + expected.trim() : ","}`,
      );
      const llvm = join(dir, "small.ll");
      writeFileSync(llvm, result.output!);
      const compiled = spawnSync(
        "clang",
        [`--target=${target}`, "-c", llvm, "-o", join(dir, "small.o")],
        {
          encoding: "utf8",
          timeout: 15000,
        },
      );
      if (compiled.status !== 0)
        throw new Error(`${target}: ${compiled.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("boolean callback arguments use the same extension guarantee as Clang", () => {
  for (const target of [
    "x86_64-unknown-linux-gnu",
    "arm64-apple-darwin",
    "aarch64-unknown-linux-gnu",
    "x86_64-pc-windows-msvc",
    "i686-unknown-linux-gnu",
    "wasm32-unknown-unknown",
  ]) {
    const c = spawnSync(
      "clang",
      [`--target=${target}`, "-x", "c", "-S", "-emit-llvm", "-o", "-", "-"],
      {
        input: "int probe(_Bool x) {return x;}",
        encoding: "utf8",
        timeout: 15000,
      },
    );
    expect(c.status).toBe(0);
    const attributes =
      /define[^\n]*@probe\(i1(?: noundef)?(?: (zeroext))?/.exec(c.stdout);
    expect(attributes).not.toBeNull();
    const extension = attributes![1] ? attributes![1] + " " : "";
    const result = new Compiler({ filePath: "boolean.bpl", target }).compile(`
      extern native_boolean(x:bool) ret int;
      frame as_lambda(f:Lambda<int>(bool)) ret int {return f(true);}
      @[c_export] frame probe(f:Func<int>(bool)) ret int {return f(true)+native_boolean(false)+as_lambda(f);}
    `);
    expect(result.success).toBe(true);
    expect(result.output).toMatch(
      new RegExp(`call i32 %[^\\s(]+\\(i1 ${extension}`),
    );
    expect(result.output).toContain(`call i32 @native_boolean(i1 ${extension}`);
    expect(result.output).toContain(`call i32 %fn(i1 ${extension}`);
    const dir = mkdtempSync(join(tmpdir(), "bpl-bool-callback-target-"));
    try {
      const llvm = join(dir, "boolean.ll");
      writeFileSync(llvm, result.output!);
      const compiled = spawnSync(
        "clang",
        [`--target=${target}`, "-c", llvm, "-o", join(dir, "boolean.o")],
        { encoding: "utf8", timeout: 15000 },
      );
      expect(compiled.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
