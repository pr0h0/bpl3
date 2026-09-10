import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

test("uses floating-point instructions for f32 and f64 compound assignments", () => {
  expectCorrectnessSuite([
    {
      name: "floating compound assignments",
      validateLlvm: true,
      expectedStdout: "0.5 0.5 1\n",
      source: `
      extern printf(fmt: string, ...);
      global calls: int = 0;
      frame index() ret int { calls += 1; return 0; }
      frame main() ret int {
        local narrow: f32 = cast<f32>(5.5);
        narrow += cast<f32>(0.5);
        narrow -= cast<f32>(1.5);
        narrow *= cast<f32>(2.0);
        narrow /= cast<f32>(2.0);
        narrow %= cast<f32>(2.0);
        local wide: f64 = 5.5;
        wide += 0.5; wide -= 1.5; wide *= 2.0; wide /= 2.0; wide %= 2.0;
        local values: f32[1] = [cast<f32>(0.0)];
        values[index()] += narrow;
        printf("%.1f %.1f %d\\n", values[0], wide, calls);
        return 0;
      }
    `,
    },
  ]);
}, 60000);

test("bitwise compound assignments support integer lvalues and evaluate indexes once", () => {
  expectCorrectnessSuite([
    {
      name: "bitwise compound assignments",
      validateLlvm: true,
      expectedStdout: "30 240 -2 3\n",
      source: `
      extern printf(fmt: string, ...);
      global calls: int = 0;
      frame index() ret int { calls += 1; return 0; }
      frame main() ret int {
        local flags: int[1] = [31];
        flags[index()] &= 15;
        flags[index()] |= 16;
        flags[index()] ^= 1;
        local narrow: u8 = 255;
        narrow &= 240; narrow |= 3; narrow ^= 3;
        local signed: int = -1; signed &= -2;
        printf("%d %d %d %d\\n", flags[0], narrow, signed, calls);
        return 0;
      }
    `,
    },
  ]);
}, 60000);

test("compound division and remainder respect integer signedness", () => {
  expectCorrectnessSuite([
    {
      name: "signed and unsigned compound division",
      validateLlvm: true,
      expectedStdout: "1333333333 1 6148914691236517205 0 -3 -1\n",
      source: `
      extern printf(fmt: string, ...);
      frame main() ret int {
        local q: u32 = 4000000000; local r: u32 = q;
        q /= 3; r %= 3;
        local wideQ: u64 = 18446744073709551615; local wideR: u64 = wideQ;
        wideQ /= 3; wideR %= 3;
        local signedQ: int = -10; local signedR: int = signedQ;
        signedQ /= 3; signedR %= 3;
        printf("%u %u %llu %llu %d %d\\n", q, r, wideQ, wideR, signedQ, signedR);
        return 0;
      }
    `,
    },
  ]);
}, 60000);

test("compound integer division uses the normal checked failure paths", () => {
  expectRuntimeFailureSuite([
    ...["/=", "%="].flatMap((operator) => [
      {
        name: `${operator} zero divisor`,
        expectedMessage: "DIVISION BY ZERO",
        source: `frame main() ret int { local x: int = 10; local zero: int = 0; x ${operator} zero; return x; }`,
      },
      {
        name: `${operator} signed overflow`,
        expectedMessage: "INTEGER OVERFLOW",
        source: `frame main() ret int { local x: int = -2147483648; local negativeOne: int = -1; x ${operator} negativeOne; return x; }`,
      },
      {
        name: `${operator} divisor narrowed to zero`,
        expectedMessage: "DIVISION BY ZERO",
        source: `frame main() ret int { local x: u8 = 10; x ${operator} 256; return cast<int>(x); }`,
      },
    ]),
  ]);
}, 60000);
