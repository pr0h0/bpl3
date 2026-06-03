const iterations = 8000000;
const numerator = 123456789;
let sum = 0;

for (let i = 0; i < iterations; i++) {
  const denom = (i % 997) + 1;
  sum += Math.trunc(numerator / denom) + (numerator % denom);
}

console.log(`Constant numerator: ${sum}`);
