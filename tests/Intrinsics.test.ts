import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function compileAndRun(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_intrinsics_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });

    if (result.status !== 0) {
      console.error("Compilation/Run failed:");
      console.error(result.stderr);
      console.error(result.stdout);
      throw new Error(`BPL execution failed with code ${result.status}`);
    }

    return result.stdout;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Intrinsics", () => {
  test("Math Intrinsics", () => {
    const output = compileAndRun(`
      import [Math] from "std/math.bpl";
      extern printf(fmt: string, ...) ret int;

      frame main() {
        printf("sqrt(16.0) = %f\\n", Math.sqrt(16.0));
        printf("abs(-5.5) = %f\\n", Math.abs(-5.5));
        printf("min(10.0, 20.0) = %f\\n", Math.min(10.0, 20.0));
        printf("max(10.0, 20.0) = %f\\n", Math.max(10.0, 20.0));
        printf("ceil(3.14) = %f\\n", Math.ceil(3.14));
        printf("floor(3.14) = %f\\n", Math.floor(3.14));
        printf("round(3.6) = %f\\n", Math.round(3.6));
        printf("pow(2.0, 3.0) = %f\\n", Math.pow(2.0, 3.0));
      }
    `);

    expect(output).toContain("sqrt(16.0) = 4.000000");
    expect(output).toContain("abs(-5.5) = 5.500000");
    expect(output).toContain("min(10.0, 20.0) = 10.000000");
    expect(output).toContain("max(10.0, 20.0) = 20.000000");
    expect(output).toContain("ceil(3.14) = 4.000000");
    expect(output).toContain("floor(3.14) = 3.000000");
    expect(output).toContain("round(3.6) = 4.000000");
    expect(output).toContain("pow(2.0, 3.0) = 8.000000");
  });

  test("Bit Manipulation Intrinsics", () => {
    const output = compileAndRun(`
      import [Int] from "std/primitives.bpl";
      extern printf(fmt: string, ...) ret int;

      frame main() {
        local x: Int = Int { value: 0b1011 };
        local p: int = x.popCount();
        printf("popCount(11) = %d\\n", p);
        
        local y: Int = Int { value: 16 };
        local tz: int = y.trailingZeros();
        printf("cttz(16) = %d\\n", tz);
        
        local z: Int = Int { value: 0 };
        local lz: int = z.leadingZeros();
        printf("ctlz(0) = %d\\n", lz);
        
        local w: Int = Int { value: 0x12345678 };
        local bs: int = w.byteSwap();
        printf("bswap(0x12345678) = %x\\n", bs);
        
        local v: Int = Int { value: 0b1100 };
        local r5: int = v.reverseBits();
        printf("bitreverse(0b1100) = %x\\n", r5);
      }
    `);

    expect(output).toContain("popCount(11) = 3");
    expect(output).toContain("cttz(16) = 4");
    expect(output).toContain("ctlz(0) = 32");
    expect(output).toContain("bswap(0x12345678) = 78563412");
  });

  test("Memory Intrinsics", () => {
    const output = compileAndRun(`
      import memcpy, memset from "std/intrinsics.bpl";
      extern printf(fmt: string, ...) ret int;
      extern malloc(size: long) ret *void;
      extern free(ptr: *void) ret void;

      frame main() {
        local ptr: *i32 = cast<*i32>(malloc(20)); # 5 ints
        
        # Memset to 0
        memset(ptr, 0, 20, false);
        printf("ptr[0] = %d\\n", ptr[0]);
        
        # Set some values
        ptr[0] = 10;
        ptr[1] = 20;
        
        local ptr2: *i32 = cast<*i32>(malloc(20));
        
        # Memcpy
        memcpy(ptr2, ptr, 20, false);
        
        printf("ptr2[0] = %d\\n", ptr2[0]);
        printf("ptr2[1] = %d\\n", ptr2[1]);
        
        free(ptr);
        free(ptr2);
      }
    `);

    expect(output).toContain("ptr[0] = 0");
    expect(output).toContain("ptr2[0] = 10");
    expect(output).toContain("ptr2[1] = 20");
  });

  test("New Intrinsics (fma, stack, frame)", () => {
    const output = compileAndRun(`
      import fma, frameaddress, returnaddress, stacksave, stackrestore from "std/intrinsics.bpl";
      extern printf(fmt: string, ...) ret int;

      frame main() {
        # FMA
        local res: float = fma(2.0, 3.0, 4.0);
        printf("fma(2.0, 3.0, 4.0) = %f\\n", res);

        # Frame Address (just check if it runs)
        local fa: *void = frameaddress(0);
        if (cast<long>(fa) != 0) {
            printf("frameaddress is not null\\n");
        }

        # Return Address (just check if it runs)
        local ra: *void = returnaddress(0);
        if (cast<long>(ra) != 0) {
            printf("returnaddress is not null\\n");
        }
        printf("returnaddress call worked\\n");

        # Stack Save/Restore
        local sp: *void = stacksave();
        if (cast<long>(sp) != 0) {
            printf("stacksave returned non-null\\n");
        }
        
        # Restore it (should be safe if we haven't messed with it)
        stackrestore(sp);
        printf("stackrestore call worked\\n");
      }
    `);

    expect(output).toContain("fma(2.0, 3.0, 4.0) = 10.000000");
    expect(output).toContain("frameaddress is not null");
    expect(output).toContain("returnaddress call worked");
    expect(output).toContain("stacksave returned non-null");
    expect(output).toContain("stackrestore call worked");
  });
});
