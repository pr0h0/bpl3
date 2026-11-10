import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expected values were computed with Python integers.

it("supports modular, root, factorial and radix operations on BigInt", () => {
  expectCorrectnessSuite([
    {
      name: "bigint extras",
      validateLlvm: true,
      expectedStdout:
        "mod 197434842\nnegmod 3\nmodpow 855473248\nsqrt 351364182882014\nsqrt2 1000000000000000000\nfact30 265252859812191058636308480000000\nlcm 36\nhex -1051570404360395033547316\nradix ffffffffffffffffffffffff 101 0 -h\nmisc 1 1 30 1 -1 1\nmin -17\nmax 123456789012345678901234567890\naddLong 123456789012345678901234567900\nmulLong -370370367037037036703703703670\n",
      source: `import [BigInt] from "std/bigint.bpl";
extern printf(fmt: string, ...);
extern free(ptr: *void);
frame p(label: string, v: BigInt) { local s: string = v.toString(); printf("%s %s\\n", label, s); free(cast<*void>(s)); local c: BigInt = v; c.destroy(); }
frame main() ret int {
    local a: BigInt = BigInt.parse("123456789012345678901234567890");
    local m: BigInt = BigInt.parse("1000000007");
    local neg: BigInt = BigInt.parse("-17");
    local five: BigInt = BigInt.fromLong(5);
    p("mod", a.mod(&m));
    p("negmod", neg.mod(&five));
    local e: BigInt = BigInt.parse("100000000000000000000");
    local two: BigInt = BigInt.fromLong(2);
    p("modpow", two.modPow(&e, &m));
    p("sqrt", a.sqrt());
    local sq: BigInt = BigInt.parse("1000000000000000000000000000000000000");
    p("sqrt2", sq.sqrt());
    p("fact30", BigInt.factorial(30));
    local x: BigInt = BigInt.fromLong(12); local y: BigInt = BigInt.fromLong(-18);
    p("lcm", x.lcm(&y));
    p("hex", BigInt.parseRadix("-DeadBeefCafeBabe1234", 16));
    local h: BigInt = BigInt.parseRadix("ffffffffffffffffffffffff", 16);
    local hs: string = h.toStringRadix(16); local bs: string = five.toStringRadix(2); local zs: string = BigInt.fromLong(0).toStringRadix(36);
    local ns: string = neg.toStringRadix(36);
    printf("radix %s %s %s %s\\n", hs, bs, zs, ns);
    printf("misc %d %d %d %d %d %d\\n", a.isEven(), neg.isOdd(), a.digitCount(), a.compareLong(cast<long>(5)), neg.signum(), BigInt.fromLong(0).digitCount());
    p("min", a.min(&neg));
    p("max", a.max(&neg));
    p("addLong", a.addLong(cast<long>(10)));
    p("mulLong", a.multiplyLong(cast<long>(-3)));
    return 0;
}
`,
    },
  ]);
}, 120000);
