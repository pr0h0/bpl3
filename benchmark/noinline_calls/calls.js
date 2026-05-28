function mix(value, i) {
  return ((value * 17) + (i % 1009) + 23) % 1000003;
}

function main() {
  const iterations = 20000000;
  let value = 7;

  for (let i = 0; i < iterations; i++) {
    value = mix(value, i);
  }

  console.log(`Call sum: ${value}`);
}

main();
