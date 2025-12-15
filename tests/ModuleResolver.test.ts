import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { ModuleResolver } from "../compiler/middleend/ModuleResolver";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ModuleResolver", () => {
  // Create temp directory for test files
  const tempDir = path.join(os.tmpdir(), `bpl-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should resolve a single module without imports", () => {
    const mainPath = path.join(tempDir, "main.bpl");
    fs.writeFileSync(
      mainPath,
      `
      frame main() ret int {
        return 0;
      }
    `,
    );

    const resolver = new ModuleResolver();
    const modules = resolver.resolveModules(mainPath);

    expect(modules.length).toBe(1);
    expect(modules[0]!.path).toBe(mainPath);
    expect(modules[0]!.dependencies.size).toBe(0);
  });

  it("should resolve modules with linear dependencies", () => {
    // Create module A (no dependencies)
    const moduleAPath = path.join(tempDir, "moduleA.bpl");
    fs.writeFileSync(
      moduleAPath,
      `
      struct Point {
        x: int,
        y: int,
      }
    `,
    );

    // Create module B (depends on A)
    const moduleBPath = path.join(tempDir, "moduleB.bpl");
    fs.writeFileSync(
      moduleBPath,
      `
      import [Point] from "./moduleA.bpl";
      
      frame usePoint() ret int {
        local p: Point;
        return 0;
      }
    `,
    );

    // Create main (depends on B)
    const mainPath = path.join(tempDir, "main2.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [usePoint] from "./moduleB.bpl";
      
      frame main() ret int {
        return usePoint();
      }
    `,
    );

    const resolver = new ModuleResolver();
    const modules = resolver.resolveModules(mainPath);

    // Should be in order: A, B, main
    expect(modules.length).toBe(3);
    expect(path.basename(modules[0]!.path)).toBe("moduleA.bpl");
    expect(path.basename(modules[1]!.path)).toBe("moduleB.bpl");
    expect(path.basename(modules[2]!.path)).toBe("main2.bpl");
  });

  it("should detect circular dependencies", () => {
    // Create module C that imports D
    const moduleCPath = path.join(tempDir, "moduleC.bpl");
    fs.writeFileSync(
      moduleCPath,
      `
      import [funcD] from "./moduleD.bpl";
      
      frame funcC() ret int {
        return funcD();
      }
    `,
    );

    // Create module D that imports C (circular!)
    const moduleDPath = path.join(tempDir, "moduleD.bpl");
    fs.writeFileSync(
      moduleDPath,
      `
      import [funcC] from "./moduleC.bpl";
      
      frame funcD() ret int {
        return funcC();
      }
    `,
    );

    const resolver = new ModuleResolver();

    expect(() => {
      resolver.resolveModules(moduleCPath);
    }).toThrow(/[Cc]ircular/);
  });

  it("should handle diamond dependencies", () => {
    // Common module
    const commonPath = path.join(tempDir, "common.bpl");
    fs.writeFileSync(
      commonPath,
      `
      struct Data {
        value: int,
      }
    `,
    );

    // Left branch
    const leftPath = path.join(tempDir, "left.bpl");
    fs.writeFileSync(
      leftPath,
      `
      import [Data] from "./common.bpl";
      
      frame useLeft(d: Data) ret int {
        return d.value;
      }
    `,
    );

    // Right branch
    const rightPath = path.join(tempDir, "right.bpl");
    fs.writeFileSync(
      rightPath,
      `
      import [Data] from "./common.bpl";
      
      frame useRight(d: Data) ret int {
        return d.value * 2;
      }
    `,
    );

    // Main imports both
    const mainPath = path.join(tempDir, "diamond_main.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [useLeft] from "./left.bpl";
      import [useRight] from "./right.bpl";
      import [Data] from "./common.bpl";
      
      frame main() ret int {
        local d: Data;
        return useLeft(d) + useRight(d);
      }
    `,
    );

    const resolver = new ModuleResolver();
    const modules = resolver.resolveModules(mainPath);

    // Common should appear first, then left and right, then main
    expect(modules.length).toBe(4);
    expect(path.basename(modules[0]!.path)).toBe("common.bpl");
    // Left and right can be in either order
    const lastModule = path.basename(modules[modules.length - 1]!.path);
    expect(lastModule).toBe("diamond_main.bpl");
  });

  it("should fail on missing module", () => {
    const mainPath = path.join(tempDir, "missing_import.bpl");
    fs.writeFileSync(
      mainPath,
      `
      import [Something] from "./does_not_exist.bpl";
      
      frame main() ret int {
        return 0;
      }
    `,
    );

    const resolver = new ModuleResolver();

    expect(() => {
      resolver.resolveModules(mainPath);
    }).toThrow();
  });
});
