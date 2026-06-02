import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Lambda Runtime", () => {
  it("should execute simple lambda", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame main() ret int {
        local f: Lambda<int>(int) = |x: int| ret int { return x * 2; };
        printf("Result: %d\\n", f(10));
        return 0;
      }
    `;
    const result = runBpl(source, "simple_lambda");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
      console.error("STDOUT:", result.stdout);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 20");
  });

  it("should capture variables", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame main() ret int {
        local y: int = 100;
        local f: Lambda<int>(int) = |x: int| ret int { return x + y; };
        printf("Result: %d\\n", f(5));
        return 0;
      }
    `;
    const result = runBpl(source, "capturing_lambda");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 105");
  });

  it("should handle nested lambdas", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame main() ret int {
        local x: int = 10;
        local f: Lambda<Lambda<int>(int)>(int) = |y: int| ret Lambda<int>(int) {
            return |z: int| ret int {
                return x + y + z;
            };
        };
        local g: Lambda<int>(int) = f(20);
        printf("Result: %d\\n", g(30));
        return 0;
      }
    `;
    const result = runBpl(source, "nested_lambda");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 60");
  });

  it("should capture variables inside match and switch bodies", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum Flag {
        On,
        Off,
      }

      frame main() ret int {
        local offset: int = 5;
        local fromMatch: Lambda<int>(Flag) = |flag: Flag| ret int {
          return match (flag) {
            Flag.On => offset,
            Flag.Off => 0,
          };
        };
        local fromSwitch: Lambda<int>(int) = |value: int| ret int {
          switch (value) {
            case 1: {
              return offset + 2;
            }
            default: {
              return 0;
            }
          }
        };
        printf("Result: %d %d\\n", fromMatch(Flag.On), fromSwitch(1));
        return 0;
      }
    `;
    const result = runBpl(source, "lambda_match_switch_capture");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 5 7");
  });

  it("should pass lambda as argument", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame apply(f: Lambda<int>(int), v: int) ret int {
        return f(v);
      }
      
      frame main() ret int {
        local res: int = apply(|x: int| ret int { return x * x; }, 5);
        printf("Result: %d\\n", res);
        return 0;
      }
    `;
    const result = runBpl(source, "lambda_arg");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 25");
  });

  it("should return lambda from function", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      frame getAdder(x: int) ret Lambda<int>(int) {
        return |y: int| ret int { return x + y; };
      }
      
      frame main() ret int {
        local add5: Lambda<int>(int) = getAdder(5);
        printf("Result: %d\\n", add5(10));
        return 0;
      }
    `;
    const result = runBpl(source, "return_lambda");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Result: 15");
  });
});
