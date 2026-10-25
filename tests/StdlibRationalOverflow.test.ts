import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const minimum = -(1n << 63n);
const maximum = (1n << 63n) - 1n;
type Fraction = [bigint, bigint];

function reduce(n: bigint, d: bigint): Fraction {
  if (d === 0n) return [0n, 0n];
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let a = n < 0n ? -n : n;
  let b = d;
  while (b) [a, b] = [b, a % b];
  n /= a;
  d /= a;
  return n < minimum || n > maximum || d > maximum ? [0n, 0n] : [n, d];
}

test("rational arithmetic rejects overflow after exact reduction", () => {
  const values: Fraction[] = [
    [minimum, 1n],
    [maximum, 1n],
    [minimum, 3n],
    [maximum, 2n],
    [4294967296n, 1n],
    [1n, maximum],
    [maximum - 1n, maximum],
    [-1n, maximum - 1n],
    [1n, 2n],
    [-1n, 3n],
    [0n, 1n],
  ].map(([n, d]) => reduce(n!, d!));
  // Deterministic mixed signs and large, unrelated denominators exercise wide
  // intermediates independently of the BPL implementation's cancellation steps.
  let seed = 0x5eed1234n;
  for (let i = 0; i < 12; i++) {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1n);
    const n = BigInt.asIntN(64, seed);
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1n);
    values.push(reduce(n, (seed >> 1n) + 1n));
  }
  const statements: string[] = [];
  const expected: string[] = [];
  for (const [an, ad] of values) {
    for (const [bn, bd] of values) {
      statements.push(`check(${an},${ad},${bn},${bd});`);
      for (const [n, d] of [
        [an * bd + bn * ad, ad * bd],
        [an * bd - bn * ad, ad * bd],
        [an * bn, ad * bd],
        [an * bd, ad * bn],
      ] as Fraction[]) {
        const [num, den] = reduce(n, d);
        expected.push(`${num}/${den}`);
      }
    }
  }
  expectCorrectnessSuite([
    {
      name: "rational-checked-overflow",
      validateLlvm: true,
      source: `import [Rational] from "std/rational.bpl";
extern printf(fmt:string,...);
frame show(value:Rational){printf("%ld/%ld\\n",value.num,value.den);}
frame check(an:long,ad:long,bn:long,bd:long){
 local a:Rational=Rational.new(an,ad);local b:Rational=Rational.new(bn,bd);
 show(a.add(b));show(a.sub(b));show(a.mul(b));show(a.div(b));
}
frame main()ret int{
 ${statements.join("\n")}
 local smallest:Rational=Rational.fromLong(-9223372036854775808);
 if(smallest.negate().isValid()||smallest.abs().isValid()){return 1;}
 local three:Rational=Rational.fromLong(3);
 if(three.pow(41).isValid()){return 2;}
 return 0;
}`,
      expectedStdout: expected.join("\n") + "\n",
    },
  ]);
}, 120000);
