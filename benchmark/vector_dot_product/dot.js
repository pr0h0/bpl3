function main() {
  const count = 6000000;
  const a = new BigInt64Array(count);
  const b = new BigInt64Array(count);

  for (let i = 0; i < count; i++) {
    a[i] = BigInt((i % 97) - 48);
    b[i] = BigInt((i % 89) - 44);
  }

  let sum = 0n;
  for (let i = 0; i < count; i++) {
    sum += a[i] * b[i];
  }

  console.log(`Vector dot: ${sum}`);
}

main();
