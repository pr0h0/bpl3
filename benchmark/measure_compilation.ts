import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const COMPILER_PATH = path.join(__dirname, "../index.ts");
const TEMP_DIR = path.join(os.tmpdir(), "bpl_bench");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

function generateHugeFile(lines: number): string {
  let content = `
    extern printf(fmt: string, ...);
    
    struct Point { x: int, y: int }
    
    frame process(p: Point) ret int {
        return p.x + p.y;
    }
  `;

  for (let i = 0; i < lines; i++) {
    content += `
    frame func_${i}(a: int) ret int {
        local p: Point;
        p.x = a;
        p.y = ${i};
        return process(p) + ${i};
    }
    `;
  }

  content += `
    frame main() ret int {
        return func_0(1);
    }
  `;

  return content;
}

function measure(name: string, filePath: string) {
  console.log(`Benchmarking: ${name}`);

  const start = process.hrtime.bigint();
  const result = spawnSync("bun", [COMPILER_PATH, filePath], {
    encoding: "utf-8",
  });
  const end = process.hrtime.bigint();

  if (result.status !== 0) {
    console.error(`Compilation failed for ${name}`);
    console.error(result.stderr);
    return;
  }

  const duration = Number(end - start) / 1e6; // ms
  console.log(`  Time: ${duration.toFixed(2)} ms`);

  // Memory usage is harder to measure from outside for a short-lived process without tools like /usr/bin/time
  // But we can at least track time.
}

function main() {
  console.log("Starting Compiler Performance Benchmark...");

  // 1. Small file (Hello World)
  const helloPath = path.join(__dirname, "../examples/hello-world/main.bpl");
  measure("Hello World", helloPath);

  // 2. Medium file (Comprehensive Features)
  const compPath = path.join(
    __dirname,
    "../examples/comprehensive_features/main.bpl",
  );
  measure("Comprehensive Features", compPath);

  // 3. Synthetic Large File (1000 functions)
  console.log("Generating synthetic large file (1000 functions)...");
  const hugePath = path.join(TEMP_DIR, "huge.bpl");
  fs.writeFileSync(hugePath, generateHugeFile(1000));
  measure("Synthetic Large (1000 funcs)", hugePath);

  // 4. Synthetic Huge File (5000 functions)
  console.log("Generating synthetic huge file (5000 functions)...");
  const massivePath = path.join(TEMP_DIR, "massive.bpl");
  fs.writeFileSync(massivePath, generateHugeFile(5000));
  measure("Synthetic Massive (5000 funcs)", massivePath);

  // Cleanup
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}

main();
