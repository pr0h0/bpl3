import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const COMPILER_PATH = path.resolve(__dirname, "../index.ts");

function runBPL(source: string): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const tempFile = path.resolve(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, source);

    const result = spawnSync("bun", [COMPILER_PATH, "run", tempFile], {
      encoding: "utf-8",
      env: { ...process.env, NO_COLOR: "1" },
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    // Cleanup potential artifacts
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const execFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(execFile)) fs.unlinkSync(execFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Runtime Values & Logic", () => {
  it("should calculate integer arithmetic correctly", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local a: i32 = 10;
        local b: i32 = 3;
        printf("%d\\n", a + b);
        printf("%d\\n", a - b);
        printf("%d\\n", a * b);
        printf("%d\\n", a / b);
        printf("%d\\n", a % b);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) {
      console.error("Stderr:", stderr);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toBe("13\n7\n30\n3\n1\n");
  });

  it("should respect operator precedence", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        printf("%d\\n", 2 + 3 * 4);
        printf("%d\\n", (2 + 3) * 4);
      }
    `;
    const { stdout, exitCode } = runBPL(source);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("14\n20\n");
  });

  it("should handle float arithmetic", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local a: double = 5.5;
        local b: double = 2.0;
        printf("%.1f\\n", a + b);
        printf("%.1f\\n", a * b);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) {
      console.error("Float Arithmetic Stderr:", stderr);
    }
    expect(exitCode).toBe(0);
    expect(stdout).toBe("7.5\n11.0\n");
  });

  it("should handle short-circuit logic", () => {
    const source = `
      extern printf(fmt: string, ...);

      frame side_effect() ret bool {
        printf("SIDE_EFFECT\\n");
        return true;
      }

      frame main() {
        printf("AND:\\n");
        if (false && side_effect()) {
          printf("Should not be here\\n");
        }
        printf("OR:\\n");
        if (true || side_effect()) {
          printf("Done\\n");
        }
      }
    `;
    const { stdout, exitCode } = runBPL(source);
    expect(exitCode).toBe(0);
    // If short-circuit works, "SIDE_EFFECT" should NOT appear.
    expect(stdout).not.toContain("SIDE_EFFECT");
    expect(stdout).toContain("AND:");
    expect(stdout).toContain("OR:");
    expect(stdout).toContain("Done");
  });

  it("should handle loops correctly", () => {
    const source = `
      extern printf(fmt: string, ...);
      frame main() {
        local i: i32 = 0;
        loop {
          if (i >= 3) { break; }
          printf("%d\\n", i);
          i = i + 1;
        }
      }
    `;
    const { stdout, exitCode } = runBPL(source);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("0\n1\n2\n");
  });

  it("should handle struct passing by value", () => {
    const source = `
      extern printf(fmt: string, ...);
      struct Point { x: i32, y: i32, }

      frame modify(p: Point) {
        p.x = 100;
      }

      frame main() {
        local p: Point = Point { x: 1, y: 2, };
        modify(p);
        printf("%d\\n", p.x);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) {
      console.error("Struct Passing Stderr:", stderr);
    }
    expect(exitCode).toBe(0);
    // If passed by value, p.x should remain 1.
    // If passed by reference (bug?), it would be 100.
    expect(stdout).toBe("1\n");
  });
});
