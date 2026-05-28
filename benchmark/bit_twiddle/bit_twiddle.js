function main() {
  const iterations = 20000000;
  let x = 2463534242 >>> 0;
  let sum = 0;

  for (let i = 0; i < iterations; i++) {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    sum = (sum + (x & 1023)) >>> 0;
  }

  console.log(`Bit twiddle: ${x} ${sum}`);
}

main();
