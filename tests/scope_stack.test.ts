import { describe, expect, it } from "bun:test";
import { runBpl } from "./runtime_utils";

describe("ScopeStack", () => {
  it("should handle defining and looking up variables", () => {
    const result = runBpl(
      `
      import [ScopeStack] from "std/scope_stack.bpl";
      import [Option] from "std/option.bpl";
      extern printf(fmt: string, ...) ret int;
      
      frame main() ret int {
        local stack: ScopeStack<int> = ScopeStack<int>.new();
        
        stack.define("x", 10);
        
        match (stack.lookup("x")) {
            Option.Some(val) => { printf("x: %d\\n", val); },
            Option.None => { printf("x not found\\n"); }
        }
        
        stack.enterScope();
        stack.define("y", 20);
        
        match (stack.lookup("x")) {
            Option.Some(val) => { printf("inner x: %d\\n", val); },
            Option.None => { printf("inner x not found\\n"); }
        }
        match (stack.lookup("y")) {
            Option.Some(val) => { printf("inner y: %d\\n", val); },
            Option.None => { printf("inner y not found\\n"); }
        }
        
        stack.exitScope();
        
        match (stack.lookup("y")) {
            Option.Some(val) => { printf("outer y: %d\\n", val); },
            Option.None => { printf("outer y not found\\n"); }
        }
        
        stack.destroy();
        return 0;
      }
    `,
      "scope_stack_basic",
    );

    if (result.stderr) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(
      "Struct definition not found for equality check",
    );
    expect(result.stdout).toContain("x: 10");
    expect(result.stdout).toContain("inner x: 10");
    expect(result.stdout).toContain("inner y: 20");
    expect(result.stdout).toContain("outer y not found");
  });

  it("should handle shadowing", () => {
    const result = runBpl(
      `
      import [ScopeStack] from "std/scope_stack.bpl";
      import [Option] from "std/option.bpl";
      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
        local stack: ScopeStack<int> = ScopeStack<int>.new();
        stack.define("a", 1);
        
        stack.enterScope();
        stack.define("a", 2);
        
        match (stack.lookup("a")) {
             Option.Some(val) => { printf("inner a: %d\\n", val); },
             Option.None => {}
        }
        
        stack.exitScope();
        
        match (stack.lookup("a")) {
             Option.Some(val) => { printf("outer a: %d\\n", val); },
             Option.None => {}
        }
        
        stack.destroy();
        return 0;
      }
    `,
      "scope_stack_shadowing",
    );

    if (result.stderr) console.error(result.stderr);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain(
      "Struct definition not found for equality check",
    );
    expect(result.stdout).toContain("inner a: 2");
    expect(result.stdout).toContain("outer a: 1");
  });
});
