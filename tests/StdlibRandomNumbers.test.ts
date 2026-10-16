import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
function generator(seed: number | bigint, rawState?: bigint) {
  let state = 0n;
  const next = () => {
    const previous = state;
    state = BigInt.asUintN(64, previous * 6364136223846793005n + 109n);
    const mixed = BigInt.asUintN(32, ((previous >> 18n) ^ previous) >> 27n);
    const rotation = previous >> 59n;
    return Number(
      BigInt.asUintN(32, (mixed >> rotation) | (mixed << (-rotation & 31n))),
    );
  };
  if (rawState !== undefined) state = rawState;
  else {
    next();
    state = BigInt.asUintN(64, state + BigInt(seed));
    next();
  }
  return next;
}
const seeds = [
  0,
  1,
  42,
  2782269413,
  634785765,
  4294967295,
  4294967296n,
  18446744073709551615n,
];

test("Rand fractions and ranges match an independent unsigned/rejection model", () => {
  const spans = [
    [-2147483648, 2147483647],
    [-2, 3],
    [-2147483648, 1],
    [0, 17],
    [4, 4],
    [9, 2],
  ];
  const expected: string[] = [];
  const statements: string[] = [];
  seeds.forEach((seed, i) => {
    const next = generator(seed);
    statements.push(`local r${i}:Rand = Rand.seed(${seed});`);
    for (let j = 0; j < 8; j++) {
      expected.push(String(next() / 4294967296));
      statements.push(`printf("%.17g\\n",r${i}.nextFloat());`);
    }
    for (const [min, max] of spans)
      for (let j = 0; j < 8; j++) {
        let value = min!;
        if (max! > min!) {
          const span = max! - min!;
          const limit = 4294967296 - (4294967296 % span);
          let raw = next();
          while (raw >= limit) raw = next();
          value = min! + (raw % span);
        }
        expected.push(String(value));
        statements.push(`printf("%d\\n",r${i}.range(${min},${max}));`);
      }
  });
  const source = `import [Rand] from "std/rand.bpl"; import printf from "std/c.bpl"; frame main() ret int { ${statements.join("\n")} return 0; }`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.trim().split("\n").map(Number)).toEqual(
      expected.map(Number),
    );
  }
}, 60000);
test("Rand Gaussian uses Box-Muller, rejects zero, and has plausible deterministic moments", () => {
  const next = generator(0, 0n);
  const expected: number[] = [];
  for (let i = 0; i < 12; i++) {
    let u = next() / 4294967296;
    while (u === 0) u = next() / 4294967296;
    const v = next() / 4294967296;
    expected.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  }
  const source = `
 import [Rand] from "std/rand.bpl"; import printf from "std/c.bpl";
 frame main() ret int {
   local r:Rand = Rand.seed(0);
   r.state = cast<ulong>(0);
   loop(local i:int=0;i<12;i=i+1) {printf("%.17g\\n",r.nextGaussian());}
   local sum:float=0.0; local squares:float=0.0;
   loop(local i:int=0;i<20000;i=i+1) {local x:float=r.nextGaussian();sum=sum+x;squares=squares+x*x;}
   printf("%.17g\\n%.17g\\n",sum/20000.0,squares/20000.0);return 0;
 }`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    const values = result.stdout.trim().split("\n").map(Number);
    expect(values).toHaveLength(14);
    expected.forEach((v, i) => expect(values[i]!).toBeCloseTo(v, 12));
    expect(Math.abs(values[12]!)).toBeLessThan(0.05);
    expect(Math.abs(values[13]! - 1)).toBeLessThan(0.05);
  }
}, 60000);

test("Rand matches the PCG32 reference vector and removes short low-bit cycles", () => {
  // PCG's public seed=42, stream=54 known-answer vector is independent of
  // the JavaScript model above: https://www.pcg-random.org/using-pcg-c-basic.html
  const vector = [
    0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
  ];
  const cases = seeds
    .map(
      (seed, i) => `
    local r${i}: Rand = Rand.seed(${seed});
    local previous${i}: bool = r${i}.nextBool();
    local repeated${i}: bool = false;
    loop (local j: int = 0; j < 64; j = j + 1) {
      local current: bool = r${i}.nextBool();
      if (current == previous${i}) { repeated${i} = true; }
      previous${i} = current;
    }
    if (!repeated${i}) { return 1; }
    local bytes${i}: u8[512];
    r${i}.fillBytes(&bytes${i}[0], 512);
    local different${i}: bool = false;
    loop (local j: int = 0; j < 256; j = j + 1) {
      if (bytes${i}[j] != bytes${i}[j + 256]) { different${i} = true; }
    }
    if (!different${i}) { return 2; }
  `,
    )
    .join("\n");
  const source = `import [Rand] from "std/rand.bpl";
    import printf from "std/c.bpl";
    frame main() ret int {
      local r: Rand = Rand.seed(42);
      loop (local i: int = 0; i < 6; i = i + 1) { printf("%u\\n", r.nextUInt()); }
      ${cases}
      return 0;
    }`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.trim().split("\n").map(Number)).toEqual(vector);
  }
}, 60000);
