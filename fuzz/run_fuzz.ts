import * as fs from "fs";
import * as path from "path";
import { fuzzCompiler } from "./fuzz_target";

const SEED_DIR = path.join(__dirname, "../examples");
const MAX_ITERATIONS = 100000;
const MAX_MUTATIONS = 20;

function getAllBplFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllBplFiles(file));
    } else {
      if (file.endsWith(".bpl")) {
        results.push(file);
      }
    }
  });
  return results;
}

function mutate(source: string): string {
  const buffer = Buffer.from(source);
  const mutations = Math.floor(Math.random() * MAX_MUTATIONS) + 1;

  for (let i = 0; i < mutations; i++) {
    const type = Math.floor(Math.random() * 4);
    const pos = Math.floor(Math.random() * buffer.length);

    switch (type) {
      case 0: // Bit flip
        if (buffer.length > 0) {
          buffer[pos]! ^= 1 << Math.floor(Math.random() * 8);
        }
        break;
      case 1: // Delete byte
        if (buffer.length > 0) {
          const newBuf = Buffer.concat([
            buffer.subarray(0, pos),
            buffer.subarray(pos + 1),
          ]);
          // We can't easily resize the buffer in place, so we just return the string here for simplicity
          // But for multiple mutations we need to keep working on buffer.
          // Let's just modify the byte to something random instead of delete to keep length same for now
          buffer[pos] = Math.floor(Math.random() * 256);
        }
        break;
      case 2: // Insert random byte (simulated by overwrite)
        if (buffer.length > 0) {
          buffer[pos] = Math.floor(Math.random() * 256);
        }
        break;
      case 3: // Swap
        if (buffer.length > 1) {
          const pos2 = Math.floor(Math.random() * buffer.length);
          const temp = buffer[pos]!;
          buffer[pos] = buffer[pos2]!;
          buffer[pos2] = temp;
        }
        break;
    }
  }
  return buffer.toString();
}

function generateRandom(): string {
  const length = Math.floor(Math.random() * 1000);
  const buffer = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer.toString();
}

async function main() {
  console.log("Starting Fuzz Testing...");

  // 1. Collect seeds
  console.log("Collecting seeds from examples...");
  const seedFiles = getAllBplFiles(SEED_DIR);
  const seeds: string[] = [];
  for (const file of seedFiles) {
    try {
      seeds.push(fs.readFileSync(file, "utf-8"));
    } catch (e) {
      // Ignore read errors
    }
  }
  console.log(`Loaded ${seeds.length} seeds.`);

  let crashes = 0;
  const startTime = Date.now();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (i % 100 === 0) {
      process.stdout.write(
        `\rIteration ${i}/${MAX_ITERATIONS} (Crashes: ${crashes})`,
      );
    }

    let input: string;
    if (Math.random() < 0.1 || seeds.length === 0) {
      // 10% pure random
      input = generateRandom();
    } else {
      // 90% mutation
      const seed = seeds[Math.floor(Math.random() * seeds.length)]!;
      input = mutate(seed);
    }

    const success = fuzzCompiler(input);
    if (!success) {
      crashes++;
      const crashFile = path.join(__dirname, `crash_${Date.now()}_${i}.bpl`);
      fs.writeFileSync(crashFile, input);
      console.log(`\nCRASH DETECTED! Saved to ${crashFile}`);
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n\nFuzzing complete.`);
  console.log(`Time: ${duration.toFixed(2)}s`);
  console.log(`Iterations: ${MAX_ITERATIONS}`);
  console.log(`Crashes found: ${crashes}`);

  if (crashes > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
