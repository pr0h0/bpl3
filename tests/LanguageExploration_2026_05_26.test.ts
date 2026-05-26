import { describe, expect, it } from "bun:test";

import { compileAndRun, compileAndRunFull } from "./helpers";

function expectCompilationFailure(source: string, fragment?: string) {
  const result = compileAndRunFull(source);
  expect(result.exitCode).not.toBe(0);
  if (fragment) {
    expect((result.stderr + result.stdout).toLowerCase()).toContain(
      fragment.toLowerCase(),
    );
  }
}

describe("Language Exploration 2026-05-26", () => {
  describe("strings and control flow", () => {
    it("dispatches switch cases over primitive strings", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
          local value: string = "beta";
          switch (value) {
            case "alpha": {
              printf("bad-alpha\\n");
              break;
            }
            case "beta": {
              printf("ok-beta\\n");
              break;
            }
            default: {
              printf("bad-default\\n");
              break;
            }
          }
          return 0;
        }
      `);

      expect(output).toBe("ok-beta\n");
    });

    it("rejects duplicate string switch cases", () => {
      expectCompilationFailure(`
        frame main() ret int {
          local value: string = "x";
          switch (value) {
            case "same": { break; }
            case "same": { break; }
            default: { break; }
          }
          return 0;
        }
      `, "duplicate");
    });

    it("BUG-142: evaluates string interpolation expressions left-to-right exactly once", () => {
      const output = compileAndRun(`
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;

        frame bump(counter: *int, base: int) ret int {
          *counter = *counter + 1;
          return base + *counter;
        }

        frame main() ret int {
          local counter: int = 0;
          local message: String = \`\${bump(&counter, 10)}:\${bump(&counter, 20)}\`;
          printf("%s %d\\n", message.toString(), counter);
          message.destroy();
          return 0;
        }
      `);

      expect(output).toBe("11:22 2\n");
    });
  });

  describe("pointer safety and compatibility", () => {
    it("BUG-143: rejects returning a stack address hidden inside a struct literal", () => {
      expectCompilationFailure(`
        struct Holder {
          ptr: *int,
        }

        frame leak() ret Holder {
          local value: int = 7;
          return Holder { ptr: &value };
        }

        frame main() ret int {
          local holder: Holder = leak();
          return *holder.ptr;
        }
      `, "local");
    });

    it("BUG-143: rejects returning a stack address hidden inside a tuple literal", () => {
      expectCompilationFailure(`
        frame leak() ret (*int, int) {
          local value: int = 7;
          return (&value, 1);
        }

        frame main() ret int {
          local (ptr: *int, _tag: int) = leak();
          return *ptr;
        }
      `, "local");
    });

    it("BUG-144: rejects pointer subtraction across incompatible pointee types", () => {
      expectCompilationFailure(`
        frame main() ret int {
          local int_ptr: *int = nullptr;
          local float_ptr: *float = nullptr;
          local _diff: long = int_ptr - float_ptr;
          return 0;
        }
      `, "compare");
    });

    it("rejects pointer equality across incompatible pointee types", () => {
      expectCompilationFailure(`
        frame main() ret int {
          local int_ptr: *int = nullptr;
          local float_ptr: *float = nullptr;
          if (int_ptr == float_ptr) {
            return 1;
          }
          return 0;
        }
      `, "compare");
    });
  });

  describe("const mutation", () => {
    it("rejects writes through const struct variables", () => {
      expectCompilationFailure(`
        struct Point {
          x: int,
          y: int,
        }

        frame main() ret int {
          local const p: Point = Point { x: 1, y: 2 };
          p.x = 3;
          return p.x;
        }
      `, "const");
    });

    it("rejects writes through const array variables", () => {
      expectCompilationFailure(`
        frame main() ret int {
          local const values: int[3] = [1, 2, 3];
          values[1] = 9;
          return values[1];
        }
      `, "const");
    });
  });

  describe("functions and callable values", () => {
    it("rejects too many arguments when calling a function pointer", () => {
      expectCompilationFailure(`
        type Unary = Func<int>(int);

        frame inc(value: int) ret int {
          return value + 1;
        }

        frame main() ret int {
          local fn: Unary = inc;
          return fn(1, 2);
        }
      `, "argument");
    });

    it("rejects assigning incompatible function signatures", () => {
      expectCompilationFailure(`
        type Unary = Func<int>(int);

        frame takes_float(value: float) ret int {
          return cast<int>(value);
        }

        frame main() ret int {
          local fn: Unary = takes_float;
          return fn(1);
        }
      `, "type");
    });
  });

  describe("inheritance and dispatch", () => {
    it("calls inherited grandparent methods on derived values", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        struct Vehicle {
          speed: int,

          frame boost(this: *Vehicle, amount: int) {
            this.speed = this.speed + amount;
          }
        }

        struct Car : Vehicle {
          doors: int,
        }

        struct SportsCar : Car {
          turbo: bool,
        }

        frame main() ret int {
          local car: SportsCar;
          car.speed = 100;
          car.doors = 2;
          car.turbo = true;
          car.boost(25);
          printf("%d %d %d\\n", car.speed, car.doors, car.turbo);
          return 0;
        }
      `);

      expect(output).toBe("125 2 1\n");
    });

    it("uses dynamic dispatch after upcasting to a parent pointer", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        struct Animal {
          frame speak(this: *Animal) {
            printf("animal\\n");
          }
        }

        struct Dog : Animal {
          frame speak(this: *Dog) {
            printf("dog\\n");
          }
        }

        frame speak_all(animal: *Animal) {
          animal.speak();
        }

        frame main() ret int {
          local dog: Dog;
          speak_all(&dog);
          return 0;
        }
      `);

      expect(output).toBe("dog\n");
    });

    it("BUG-145: rejects method overrides with incompatible return types", () => {
      expectCompilationFailure(`
        struct Base {
          frame value(this: *Base) ret int {
            return 1;
          }
        }

        struct Child : Base {
          frame value(this: *Child) ret float {
            return 2.5;
          }
        }

        frame read(base: *Base) ret int {
          return base.value();
        }

        frame main() ret int {
          local child: Child;
          return read(&child);
        }
      `, "override");
    });
  });
});
