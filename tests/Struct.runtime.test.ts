import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("Struct Runtime", () => {
  it("should create struct and access fields", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      struct Point {
        x: int,
        y: int
      }
      
      frame main() ret int {
        local p: Point;
        p.x = 10;
        p.y = 20;
        printf("Point: (%d, %d)\\n", p.x, p.y);
        return 0;
      }
    `;
    const result = runBpl(source, "struct_fields");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Point: (10, 20)");
  });

  it("should call struct methods", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      struct Counter {
        val: int,
        
        frame inc(this: *Counter) {
            this.val = this.val + 1;
        }
        
        frame get(this: *Counter) ret int {
            return this.val;
        }
      }
      
      frame main() ret int {
        local c: Counter;
        c.val = 0;
        c.inc();
        c.inc();
        printf("Count: %d\\n", c.get());
        return 0;
      }
    `;
    const result = runBpl(source, "struct_methods");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Count: 2");
  });

  it("should handle inheritance and dynamic dispatch", () => {
    const source = `
      extern printf(fmt: string, ...);
      
      struct Animal {
        name: string,
        frame speak(this: Animal) {
            printf("Animal speaks\\n");
        }
      }
      
      struct Dog : Animal {
        breed: string,
        frame speak(this: Dog) {
            printf("Dog barks\\n");
        }
      }
      
      frame makeSpeak(a: *Animal) {
        a.speak();
      }
      
      frame main() ret int {
        local d: Dog;
        d.name = "Rex";
        d.breed = "German Shepherd";
        
        # Call directly
        d.speak();
        
        # Call via parent pointer (polymorphism)
        makeSpeak(&d);
        
        return 0;
      }
    `;
    const result = runBpl(source, "struct_inheritance");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dog barks");
    // Both calls should print "Dog barks" if vtables work
    const matches = result.stdout.match(/Dog barks/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});
