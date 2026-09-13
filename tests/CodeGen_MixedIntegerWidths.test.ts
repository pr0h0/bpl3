import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

const types = [
  ["char", 8, true],
  ["uchar", 8, false],
  ["short", 16, true],
  ["ushort", 16, false],
  ["int", 32, true],
  ["uint", 32, false],
  ["long", 64, true],
  ["ulong", 64, false],
] as const;
const operators = [
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
] as const;
const source: string[] = [];
const output: string[] = [];
for (const [leftName, bits, signed] of types) {
  for (const [rightName, rightBits, rightSigned] of types) {
    const id = `${leftName}_${rightName}`;
    const left = signed
      ? -((1n << BigInt(bits - 2)) + 9n)
      : (1n << BigInt(bits - 1)) + 73n;
    const rawRight = rightSigned ? -3n : (1n << BigInt(rightBits - 1)) + 5n;
    const convert = (value: bigint) =>
      signed ? BigInt.asIntN(bits, value) : BigInt.asUintN(bits, value);
    const right = convert(rawRight);
    const values = [
      left + right,
      left - right,
      left * right,
      left / right,
      left % right,
      left & right,
      left | right,
      left ^ right,
      left === right,
      left !== right,
      left < right,
      left > right,
      left <= right,
      left >= right,
    ];
    source.push(
      `local l_${id}:${leftName}=cast<${leftName}>(0x${BigInt.asUintN(64, left).toString(16)});local r_${id}:${rightName}=cast<${rightName}>(0x${BigInt.asUintN(64, rawRight).toString(16)});`,
    );
    operators.forEach((op, index) => {
      const value = values[index]!;
      const result =
        typeof value === "boolean" ? (value ? 1n : 0n) : convert(value);
      const comparison = index >= 8;
      source.push(
        `printf("${signed || comparison ? "%ld" : "%lu"}\\n",cast<${signed || comparison ? "long" : "ulong"}>(l_${id} ${op} r_${id}));`,
      );
      output.push(result.toString());
    });
  }
}

test("integer binary operations convert RHS to the checked left type across widths and signedness", () => {
  expectCorrectnessSuite([
    {
      name: "mixed-integer-widths",
      validateLlvm: true,
      source: `extern printf(fmt:string,...) ret int;frame main() ret int {${source.join("\n")}return 0;}`,
      expectedStdout: output.join("\n") + "\n",
    },
    {
      name: "mixed-integer-literals-and-evaluation",
      validateLlvm: true,
      source: `extern printf(fmt:string,...) ret int;
      global calls:int=0;
      frame left() ret short {calls=calls*10+1;return cast<short>(12);}
      frame right() ret long {calls=calls*10+2;return 5;}
      frame main() ret int {
        local days:long=7;
        printf("%d %ld %d %d\\n",5*days,days*5,5*(days+1),5<days);
        printf("%d\\n",cast<int>(left()+right()));printf("%d\\n",calls);
        local wide:long=4294967297;printf("%d %ld\\n",1+wide,cast<long>(1)+wide);
        local shift:long=33;local value:int=3;
        printf("%d %d\\n",value<<shift,value>>shift);
        local a:i16=cast<i16>(12);local b:u64=cast<u64>(3);
        printf("%d\\n",cast<int>(a+b));return 0;
      }`,
      expectedStdout: "35 35 40 1\n17\n12\n2 4294967298\n6 1\n15\n",
    },
  ]);
}, 60000);

test("mixed-width division checks the converted divisor before executing", () => {
  expectRuntimeFailureSuite([
    {
      name: "narrowed literal zero divisor",
      expectedMessage: "DIVISION BY ZERO",
      source:
        "frame main() ret int {local value:char=7;return cast<int>(value/256);}",
    },
    {
      name: "narrowed literal signed overflow",
      expectedMessage: "INTEGER OVERFLOW",
      source:
        "frame main() ret int {local value:char=cast<char>(128);return cast<int>(value/255);}",
    },
    {
      name: "wide nonzero proof must not cover narrowed divisor",
      expectedMessage: "DIVISION BY ZERO",
      source:
        "frame main() ret int {local divisor:long=4294967296;local wide:ulong=cast<ulong>(9)/divisor;local narrow:uint=cast<uint>(7)/divisor;return cast<int>(wide)+cast<int>(narrow);}",
    },
    {
      name: "narrowed zero divisor",
      expectedMessage: "DIVISION BY ZERO",
      source:
        "frame main() ret int {local divisor:long=4294967296;return 7/divisor;}",
    },
    {
      name: "narrowed signed division overflow",
      expectedMessage: "INTEGER OVERFLOW",
      source:
        "frame main() ret int {local divisor:long=4294967295;local value:int=cast<int>(0x80000000);return value/divisor;}",
    },
  ]);
}, 60000);
