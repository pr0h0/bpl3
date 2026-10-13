import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Compiler } from "../compiler";

const source = `
 type Signed=i8;
 @[c_export] frame signed_byte() ret Signed {return cast<Signed>(-7);}
 @[c_export] frame unsigned_byte() ret u8 {return cast<u8>(255);}
 @[c_export] frame signed_short() ret short {return cast<short>(-300);}
 @[c_export] frame unsigned_short() ret ushort {return cast<ushort>(65535);}
 @[c_export] frame boolean() ret bool {return true;}
 frame generic<T>(value:T) ret T {return value;}
 frame private_byte() ret Signed {return generic<Signed>(cast<Signed>(-7));}
 @[c_export] frame factory() ret Func<Signed>() {return private_byte;}
`;
const targets = [
  "x86_64-unknown-linux-gnu",
  "x86_64-unknown-linux-gnux32",
  "x86_64-apple-darwin",
  "arm64-apple-darwin",
  "aarch64-unknown-linux-gnu",
  "x86_64-pc-windows-msvc",
  "i686-unknown-linux-gnu",
  "wasm32-unknown-unknown",
];
const run = (command: string, args: string[], input?: string) => {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.status !== 0)
    throw new Error(
      `${command}: ${result.status}/${result.signal}\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
};

test("narrow BPL exports, generic frames, and returned callbacks guarantee Clang's return extensions", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-return-abi-"));
  try {
    for (const target of targets) {
      const oracle = run(
        "clang",
        [`--target=${target}`, "-x", "c", "-S", "-emit-llvm", "-o", "-", "-"],
        `
    signed char signed_byte(void){return -7;}
    unsigned char unsigned_byte(void){return 255;}
    short signed_short(void){return -300;}
    unsigned short unsigned_short(void){return 65535;}
    _Bool boolean(void){return 1;}
   `,
      );
      for (const optimizationLevel of [0, 3]) {
        const result = new Compiler({
          filePath: "returns.bpl",
          target,
          optimizationLevel,
        }).compile(source);
        expect(result.success).toBe(true);
        for (const name of [
          "signed_byte",
          "unsigned_byte",
          "signed_short",
          "unsigned_short",
          "boolean",
        ]) {
          const attributes = new RegExp(
            `^define[^\\n]*?\\b(?:(signext|zeroext) )?(i1|i8|i16) @${name}\\(`,
            "m",
          ).exec(oracle);
          expect(attributes).not.toBeNull();
          const extension = attributes![1] ? attributes![1] + " " : "";
          expect(result.output).toMatch(
            new RegExp(
              `^define (?:(?:linkonce_odr|dso_local) )*${extension}${attributes![2]} @${name}_\\(`,
              "m",
            ),
          );
        }
        const signedExtension = /define[^\n]*signext i8 @signed_byte/.test(
          oracle,
        )
          ? "signext "
          : "";
        expect(result.output).toMatch(
          new RegExp(
            `^define (?:(?:linkonce_odr|dso_local) )*${signedExtension}i8 @private_byte_\\(`,
            "m",
          ),
        );
        expect(result.output).toMatch(
          new RegExp(
            `^define (?:(?:linkonce_odr|dso_local) )*${signedExtension}i8 @generic_i8_i8\\(`,
            "m",
          ),
        );
        const llvm = join(dir, "returns.ll");
        writeFileSync(llvm, result.output!);
        run("clang", [
          `--target=${target}`,
          "-c",
          llvm,
          "-o",
          join(dir, "returns.o"),
        ]);
        if (target === "arm64-apple-darwin" && optimizationLevel === 3) {
          const assembly = run("clang", [
            `--target=${target}`,
            "-O3",
            "-S",
            llvm,
            "-o",
            "-",
          ]);
          expect(assembly).toMatch(/mov\s+w0, #-7\b/);
          expect(assembly).toMatch(/mov\s+w0, #-300\b/);
        }
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 90000);

test.skipIf(process.platform !== "linux")(
  "optimized C and C++ callers widen BPL narrow results and private callbacks",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-return-native-"));
    try {
      writeFileSync(join(dir, "api.bpl"), source);
      writeFileSync(
        join(dir, "host.c"),
        `
   #include "api.h"
   int main(void) {
    int a=signed_byte(),b=signed_short(),c=unsigned_byte(),d=unsigned_short();
    if(a!=-7 || b!=-300 || c!=255 || d!=65535 || !boolean())return 1;
    if(factory()()!=-7)return 2;
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
          run(compiler!, [
            "-x",
            language!,
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
