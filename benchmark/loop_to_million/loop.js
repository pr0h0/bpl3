function main() {
  let sum = 0;
  const iterations = 20000000;

  for (let i = 0; i < iterations; i++) {
    sum = ((sum * 3) + i) % 1000003;
  }

  console.log(`Loop sum: ${sum}`);
}

main();
