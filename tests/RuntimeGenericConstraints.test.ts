import { describe, expect, it } from "bun:test";

import { compileAndRunFull } from "./helpers";

describe("Runtime generic constraint checks", () => {
  it("rejects unsafe casts that violate a constrained generic pointer parameter", () => {
    const result = compileAndRunFull(`
      extern printf(fmt: string, ...) ret int;

      struct Animal {
        id: int,
      }

      struct Dog: Animal {
        barkLevel: int,
      }

      struct Cat: Animal {
        lives: int,
      }

      frame readAnimalId<T: Animal>(value: *T) ret int {
        return value.id;
      }

      frame main() ret int {
        local cat: Cat = Cat { id: 7, lives: 9 };
        local animal: *Animal = cast<*Animal>(&cat);
        local notDog: *Dog = cast<*Dog>(animal);

        printf("before check\\n");
        return readAnimalId<Dog>(notDog);
      }
    `);

    expect(result.exitCode).not.toBe(0);
    expect((result.stderr + result.stdout).toLowerCase()).toContain(
      "generic constraint",
    );
  });

  it("allows constrained generic base pointers to carry derived objects", () => {
    const result = compileAndRunFull(`
      extern printf(fmt: string, ...) ret int;

      struct Animal {
        id: int,
      }

      struct Dog: Animal {
        barkLevel: int,
      }

      frame readAnimalId<T: Animal>(value: *T) ret int {
        return value.id;
      }

      frame main() ret int {
        local dog: Dog = Dog { id: 42, barkLevel: 3 };
        local animal: *Animal = cast<*Animal>(&dog);
        printf("%d\\n", readAnimalId<Animal>(animal));
        return 0;
      }
    `);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("42\n");
  });
});
