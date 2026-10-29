import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateBplBindings } from "../compiler/tools/CBindgen";

test("generated C float bindings preserve scalar, pointer, aggregate and constant widths", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-bindgen-float-"));
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
    const header = join(dir, "api.h");
    writeFileSync(
      header,
      `
   #define SUFFIX_FLOAT 1.23456789f
   #define CAST_FLOAT ((float)1.23456789)
   #define INTEGER_FLOAT ((float)1)
   #define LEADING_FLOAT .5f
   #define TRAILING_FLOAT 2.f
   #define HEX_FLOAT ((float)0xFF)
   #define NEGATIVE_ZERO -0.0f
   #define ABOVE_MIDPOINT 1.0000000596046448f
   #define MIN_SUBNORMAL 1.401298464324817070923729583289916131280e-45f
   #define HALF_SUBNORMAL 7.006492321624085354618647916449580656401e-46f
   #define WIDE_FLOAT ((double)1.0000000596046448f)
   typedef float Sample;
   struct FloatBox {float x;float y;};
   float native_scale(float value);
   Sample native_sample(Sample value);
   struct FloatBox native_box(struct FloatBox value);
   void native_buffer(float values[2]);
   int negative_zero(float value);
   float native_midpoint(void);
   float native_subnormal(void);
   float native_half_subnormal(void);
   double native_wide(void);
  `,
    );
    const bindings = generateBplBindings({ headerPath: header });
    expect(bindings).toContain("type Sample = f32;");
    expect(bindings).toContain("extern native_scale(value: f32) ret f32;");
    expect(bindings).toContain("extern native_buffer(values: *f32) ret void;");
    expect(bindings).toContain("x: f32,");
    expect(bindings).toContain(
      "global const SUFFIX_FLOAT: f32 = cast<f32>(1.2345678806304932);",
    );
    expect(bindings).toContain(
      "global const CAST_FLOAT: f32 = cast<f32>(1.23456789);",
    );
    writeFileSync(
      join(dir, "provider.c"),
      `
   #include "api.h"
   float native_scale(float value){return value*1.5f;}
   Sample native_sample(Sample value){return value+0.5f;}
   struct FloatBox native_box(struct FloatBox value){value.x*=2.0f;value.y*=3.0f;return value;}
   void native_buffer(float values[2]){values[0]=3.5f;values[1]=-4.25f;}
   int negative_zero(float value){union{float f;unsigned int u;} bits;bits.f=value;return bits.u==0x80000000u;}
   float native_midpoint(void){return ABOVE_MIDPOINT;}
   float native_subnormal(void){return MIN_SUBNORMAL;}
   float native_half_subnormal(void){return HALF_SUBNORMAL;}
   double native_wide(void){return WIDE_FLOAT;}
  `,
    );
    run("clang", [
      "-O3",
      "-c",
      join(dir, "provider.c"),
      "-o",
      join(dir, "provider.o"),
    ]);
    writeFileSync(
      join(dir, "main.bpl"),
      bindings +
        `
   extern puts(text:string) ret int;
   frame main() ret int {
    if(native_scale(cast<f32>(2.5))!=cast<f32>(3.75)){return 1;}
    if(native_sample(cast<f32>(1.25))!=cast<f32>(1.75)){return 2;}
    local box:FloatBox=native_box(FloatBox{x:cast<f32>(1.25),y:cast<f32>(-2.5)});
    if(sizeof(box)!=8 || box.x!=cast<f32>(2.5) || box.y!=cast<f32>(-7.5)){return 3;}
    local values:f32[2]=[cast<f32>(0),cast<f32>(0)];native_buffer(values);
    if(values[0]!=cast<f32>(3.5) || values[1]!=cast<f32>(-4.25)){return 4;}
    if(SUFFIX_FLOAT!=cast<f32>(1.23456789) || CAST_FLOAT!=cast<f32>(1.23456789)){return 5;}
    if(INTEGER_FLOAT!=cast<f32>(1.0) || LEADING_FLOAT!=cast<f32>(0.5) || TRAILING_FLOAT!=cast<f32>(2.0) || HEX_FLOAT!=cast<f32>(255.0)){return 6;}
    if(negative_zero(NEGATIVE_ZERO)!=1){return 7;}
    if(ABOVE_MIDPOINT!=native_midpoint() || MIN_SUBNORMAL!=native_subnormal() || HALF_SUBNORMAL!=native_half_subnormal()){return 8;}
    if(WIDE_FLOAT!=native_wide()){return 9;}
    puts("bindgen-float-ok");return 0;
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
      expect(run(binary, []).stdout.trim()).toBe("bindgen-float-ok");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

test("generated float constants match Clang on both sides of binary32 rounding boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-bindgen-float-boundary-"));
  const literals: string[] = [];
  const payloads = [
    0, 1, 2, 3, 0x007ffffe, 0x007fffff, 0x00800000, 0x3f7fffff, 0x3f800000,
    0x3f800001, 0x3ffffffe, 0x40000000, 0x4b7fffff, 0x7f7ffffe, 0x7f7fffff,
  ];
  for (const bits of payloads) {
    const exponent = bits >>> 23;
    const significand = (bits & 0x7fffff) + (exponent ? 0x800000 : 0);
    const power = exponent ? exponent - 127 - 24 : -150;
    let numerator = BigInt(significand * 2 + 1);
    let places = 0;
    if (power >= 0) numerator <<= BigInt(power);
    else {
      places = -power;
      numerator *= 5n ** BigInt(places);
    }
    places += 10;
    numerator *= 10n ** 10n;
    for (const delta of [-1n, 0n, 1n]) {
      const digits = (numerator + delta).toString().padStart(places + 1, "0");
      const decimal = `${digits.slice(0, -places)}.${digits.slice(-places)}`;
      literals.push(decimal, `-${decimal}`);
    }
  }
  const midpoint = BigInt("1000000059604644775390625") * 10n ** 326n;
  for (const delta of [-1n, 0n, 1n]) {
    const digits = (midpoint + delta).toString().padStart(351, "0");
    literals.push(`${digits.slice(0, -350)}.${digits.slice(-350)}`);
  }
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
    const header = join(dir, "api.h");
    writeFileSync(
      header,
      literals.map((value, i) => `#define VALUE_${i} ${value}f`).join("\n") +
        "\nfloat expected(int index);\nint same_bits(float left,float right);\n",
    );
    const bindings = generateBplBindings({ headerPath: header });
    writeFileSync(
      join(dir, "provider.c"),
      `
      #include "api.h"
      float expected(int index){static const float values[]={${literals.map((_, i) => `VALUE_${i}`).join(",")}};return values[index];}
      int same_bits(float left,float right){union{float f;unsigned int u;} a,b;a.f=left;b.f=right;return a.u==b.u;}
    `,
    );
    run("clang", [
      "-O3",
      "-c",
      join(dir, "provider.c"),
      "-o",
      join(dir, "provider.o"),
    ]);
    writeFileSync(
      join(dir, "main.bpl"),
      bindings +
        "\nextern printf(text:string,...);\nframe main() ret int {\n" +
        literals
          .map(
            (_, i) =>
              `if(same_bits(VALUE_${i},expected(${i}))!=1){printf("mismatch ${i}\\n");return 1;}`,
          )
          .join("\n") +
        "\nreturn 0;}\n",
    );
    const binary = join(dir, "program");
    run("bun", [
      resolve("index.ts"),
      "build",
      join(dir, "main.bpl"),
      "--object",
      join(dir, "provider.o"),
      "-O",
      "3",
      "-o",
      binary,
    ]);
    expect(run(binary, []).status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

// BUG-441: double constants kept their C exponent form, which BPL rejects.
test("double constants with exponents become plain decimal BPL literals", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-bindgen-exponent-"));
  try {
    const header = join(dir, "api.h");
    writeFileSync(
      header,
      "#define SCI 1e-3\n#define BIG 2.5E+4\n#define NEG -3e2\n",
    );
    const bindings = generateBplBindings({ headerPath: header });
    expect(bindings).toContain("global const SCI: double = 0.001;");
    expect(bindings).toContain("global const BIG: double = 25000.0;");
    expect(bindings).toContain("global const NEG: double = -300.0;");
    const file = join(dir, "api.bpl");
    writeFileSync(file, bindings);
    const check = spawnSync(
      process.execPath,
      [resolve("index.ts"), "check", "--no-prelude", file],
      { encoding: "utf8" },
    );
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
