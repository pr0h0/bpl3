import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Integer wrappers implement bit methods for their declared widths", () => {
  const types = [
    ["Long", "long", 64, true], ["ULong", "ulong", 64, false],
    ["UInt", "uint", 32, false], ["Short", "short", 16, true],
    ["UShort", "ushort", 16, false],
  ] as const;
  const checks: string[] = [];
  for (const [wrapper, primitive, width, signed] of types) {
    const mask = (1n << BigInt(width)) - 1n;
    for (const raw of [0n, 1n, 11n, 16n, 0x1234n, mask, 1n << BigInt(width - 1)]) {
      const bits = raw.toString(2).padStart(width, "0");
      const value = signed ? BigInt.asIntN(width, raw) : raw;
      const reverse = BigInt(`0b${[...bits].reverse().join("")}`);
      const swapped = BigInt(`0x${raw.toString(16).padStart(width / 4, "0").match(/../g)!.reverse().join("")}`);
      const results = {
        popCount: BigInt([...bits].filter((bit) => bit === "1").length),
        leadingZeros: BigInt(raw === 0n ? width : bits.indexOf("1")),
        trailingZeros: BigInt(raw === 0n ? width : width - 1 - bits.lastIndexOf("1")),
        byteSwap: swapped,
        reverseBits: reverse,
      };
      const variable = `value${checks.length}`;
      checks.push(`local ${variable}: ${wrapper} = ${wrapper} { value: cast<${primitive}>(${value}) };`);
      for (const [method, rawExpected] of Object.entries(results)) {
        const expected = wrapper === "Long" ? BigInt.asIntN(width, rawExpected) : rawExpected;
        const returnType = wrapper === "Long" ? "long" : wrapper === "ULong" ? "ulong" : "uint";
        checks.push(`if (${variable}.${method}() != cast<${returnType}>(${expected})) { return 1; }`);
      }
    }
  }
  expectCorrectnessSuite([{
    name: "integer-wrapper-bit-methods",
    validateLlvm: true,
    source: `
      import [Long], [ULong], [UInt], [Short], [UShort] from "std/primitives.bpl";
      frame main() ret int {
        ${checks.join("\n")}
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
