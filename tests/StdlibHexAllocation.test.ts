import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Hex checks output limits and handles allocation failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-hex-allocation-"));
  try {
    // Exercise the real implementation with deterministic allocation failure and
    // a synthetic strlen result; no huge buffer or allocation is needed.
    const source = readFileSync(resolve("lib/hex.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "hexTestAllocate")
      .replace("extern hexTestAllocate(size: long) ret *void;", `
        frame hexTestAllocate(size: long) ret *void {
          if (size <= 0) { throw "invalid allocation size"; }
          return nullptr;
        }`)
      .replace("extern strlen(str: string) ret long;", `
        frame strlen(str: string) ret long {
          if (str == nullptr) { return 0; }
          return cast<long>(2147483648);
        }`);
    const module = join(dir, "hex.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "hex-allocation-boundaries",
      validateLlvm: true,
      source: `
        import [Hex] from "${module}";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local byte: u8 = cast<u8>(42);
          local limits: int[2] = [1073741824, 2147483647];
          loop (local i: int = 0; i < 2; i = i + 1) {
            local caught: bool = false;
            try { Hex.encode(&byte, limits[i]); }
            catch (error: string) { caught = strcmp(error, "Hex encoded length exceeds int") == 0; }
            if (!caught) { return 10; }
            caught = false;
            try { Hex.encodeUpper(&byte, limits[i]); }
            catch (error: string) { caught = strcmp(error, "Hex encoded length exceeds int") == 0; }
            if (!caught) { return 11; }
          }
          local caught: bool = false;
          try { Hex.encodeString("synthetic length"); }
          catch (error: string) { caught = strcmp(error, "Hex encoded length exceeds int") == 0; }
          if (!caught) { return 12; }
          if (Hex.encode(&byte, 1) != nullptr) { return 1; }
          if (Hex.encodeUpper(&byte, 1) != nullptr) { return 2; }
          if (Hex.encode(&byte, 1073741823) != nullptr) { return 3; }
          if (Hex.encodeUpper(&byte, 1073741823) != nullptr) { return 4; }
          if (Hex.byteToHex(byte) != nullptr) { return 5; }
          if (Hex.u32ToHex(cast<u32>(42)) != nullptr) { return 6; }
          if (Hex.u64ToHex(cast<u64>(42)) != nullptr) { return 7; }
          if (Hex.encode(nullptr, 0) != nullptr) { return 8; }
          if (Hex.encodeUpper(nullptr, 0) != nullptr) { return 9; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("Hex fixed-width encoders preserve every byte and unsigned limits", () => {
  const wideValues = [0n, 1n, 0x123456789abcdefn, 0xffffffffffffffffn];
  expectCorrectnessSuite([{
    name: "hex-fixed-width-values",
    validateLlvm: true,
    source: `
      import [Hex] from "std/hex.bpl";
      extern printf(fmt: string, ...);
      extern free(ptr: *void);
      frame main() ret int {
        loop (local i: int = 0; i < 256; i = i + 1) {
          local encoded: string = Hex.byteToHex(cast<u8>(i));
          printf("%s\\n", encoded);
          free(cast<*void>(encoded));
        }
        local values: u64[${wideValues.length}] = [${wideValues.map(n => `cast<u64>(0x${n.toString(16)})`).join(", ")}];
        loop (local i: int = 0; i < ${wideValues.length}; i = i + 1) {
          local encoded32: string = Hex.u32ToHex(cast<u32>(values[i]));
          local encoded64: string = Hex.u64ToHex(values[i]);
          printf("%s %s\\n", encoded32, encoded64);
          free(cast<*void>(encoded32));
          free(cast<*void>(encoded64));
        }
        return 0;
      }`,
    expectedStdout: [
      ...Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, "0")),
      ...wideValues.map(n => `${(n & 0xffffffffn).toString(16).padStart(8, "0")} ${n.toString(16).padStart(16, "0")}`),
    ].join("\n") + "\n",
  }]);
}, 60000);
