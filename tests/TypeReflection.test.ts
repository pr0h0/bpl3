import { describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as path from "path";

const EXAMPLES_DIR = path.join(process.cwd(), "examples", "type_reflection");
const CLI_ENTRY = path.join(process.cwd(), "index.ts");

describe("Type Reflection Tests", () => {
  it("should compile and run polymorphism", () => {
    const file = path.relative(
      process.cwd(),
      path.join(EXAMPLES_DIR, "polymorphism/main.bpl"),
    );
    const result = spawnSync(process.execPath, [CLI_ENTRY, "run", file], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("Compilation failed:");
      console.error(result.stderr);
      console.error(result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Object is a: Dog");
    expect(result.stdout).toContain("Object is a: Cat");
  });

  it("should compile and run generics_check", () => {
    const file = path.relative(
      process.cwd(),
      path.join(EXAMPLES_DIR, "generics_check/main.bpl"),
    );
    const result = spawnSync(process.execPath, [CLI_ENTRY, "run", file], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("Compilation failed:");
      console.error(result.stderr);
      console.error(result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("It is an integer wrapper");
    expect(result.stdout).toContain("It is a float wrapper");
  });

  it("should compile and run match_type", () => {
    const file = path.relative(
      process.cwd(),
      path.join(EXAMPLES_DIR, "match_type/main.bpl"),
    );
    const result = spawnSync(process.execPath, [CLI_ENTRY, "run", file], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("Compilation failed:");
      console.error(result.stderr);
      console.error(result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Value is an int");
    expect(result.stdout).toContain("Value is a float");
    expect(result.stdout).toContain("Value is something else");
    expect(result.stdout).toContain("Value is a Point");
  });

  it("should compile and run inheritance_match", () => {
    const file = path.relative(
      process.cwd(),
      path.join(EXAMPLES_DIR, "inheritance_match/main.bpl"),
    );
    const result = spawnSync(process.execPath, [CLI_ENTRY, "run", file], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("Compilation failed:");
      console.error(result.stderr);
      console.error(result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dog is an Animal");
    expect(result.stdout).toContain("Dog is a Dog");
  });

  it("should compile and run generic_inheritance", () => {
    const file = path.relative(
      process.cwd(),
      path.join(EXAMPLES_DIR, "generic_inheritance/main.bpl"),
    );
    const result = spawnSync(process.execPath, [CLI_ENTRY, "run", file], {
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      console.error("Compilation failed:");
      console.error(result.stderr);
      console.error(result.stdout);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Value: 42");
  });
});
