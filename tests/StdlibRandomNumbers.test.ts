import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
function generator(seed: number) {
  let state = BigInt(seed);
  return () => {
    state = (state * 1664525n + 1013904223n) & 0xffffffffn;
    return Number(state);
  };
}
const seeds = [0, 1, 2782269413, 634785765, 4294967295];
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
  const next = generator(634785765);
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
   local r:Rand = Rand.seed(634785765);
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
