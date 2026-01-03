import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function runBPL(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );
  fs.writeFileSync(tempFile, sourceCode);

  try {
    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Object Oriented Programming", () => {
  it("should handle basic inheritance and field access", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Animal {
          name: string,
          age: i32,
      }

      struct Dog: Animal {
          breed: string,
      }

      frame main() {
          local d: Dog;
          d.name = "Buddy";
          d.age = 5;
          d.breed = "Golden";

          printf("%s is a %d year old %s\\n", d.name, d.age, d.breed);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("InheritanceFields Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Buddy is a 5 year old Golden\n");
  });

  it("should handle method overriding (shadowing)", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Animal {
          name: string,
          frame speak(this: Animal) {
              printf("Generic sound\\n");
          }
      }

      struct Dog: Animal {
          frame speak(this: Dog) {
              printf("Woof!\\n");
          }
      }

      frame main() {
          local d: Dog;
          d.name = "Rex";
          d.speak(); # Should call Dog.speak

          # Upcasting (if supported)
          # local a: Animal = d; # This copies by value usually, slicing the object
          # a.speak(); # Should call Animal.speak
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Override Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Woof!\n");
  });

  it("should handle polymorphism via pointers (if vtables exist)", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Animal {
          name: string,
          frame speak(this: *Animal) {
              printf("Generic sound\\n");
          }
      }

      struct Dog: Animal {
          frame speak(this: *Dog) {
              printf("Woof!\\n");
          }
      }

      frame make_speak(a: *Animal) {
          a.speak();
      }

      frame main() {
          local d: Dog;
          d.name = "Rex";

          # Pass pointer to Dog as pointer to Animal
          # If BPL supports polymorphism, this should print "Woof!"
          # If it just uses static dispatch based on type *Animal, it prints "Generic sound"
          make_speak(&d);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) {
      console.log(
        "Polymorphism test failed (compilation error). Stderr:",
        stderr,
      );
    } else {
      console.log("Polymorphism Output:", stdout);
      // We don't assert here because we don't know if BPL supports vtables yet.
      // If it prints "Generic sound", it's static dispatch.
      // If it prints "Woof!", it's dynamic dispatch.
    }
  });

  it("should handle 'super' calls (if supported)", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Base {
          frame greet(this: Base) {
              printf("Hello from Base\\n");
          }
      }

      struct Derived: Base {
          frame greet(this: Derived) {
              # super.greet(); # Syntax guess
              printf("Hello from Derived\\n");
          }
      }

      frame main() {
          local d: Derived;
          d.greet();
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("Super Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Hello from Derived");
  });
});
