import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function compileAndRun(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });

    if (result.status !== 0) {
      console.error("Compilation/Run failed:");
      console.error(result.stderr);
      console.error(result.stdout);
      throw new Error(`BPL execution failed with code ${result.status}`);
    }

    return result.stdout;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

function compileAndExpectError(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });
    return result;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Generics Constraints", () => {
  test("Basic constraint enforcement", () => {
    // Should fail because String does not implement Number
    const result = compileAndExpectError(`
      spec Number {
        frame toInt(this: *Number) ret i32;
      }

      struct Container<T: Number> {
        value: T,
      }

      struct MyString {
        data: *i8,
      }

      frame main() {
        local c: Container<MyString>;
      }
    `);

    // We expect an error about constraint not satisfied
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("constraint");
  });

  test("Valid constraint usage", () => {
    const output = compileAndRun(`
      extern printf(fmt: *i8, ...) ret i32;

      spec Printable {
        frame print(this: *Printable);
      }

      struct Wrapper<T: Printable> {
        item: T,
        frame display(this: *Wrapper<T>) {
            this.item.print();
        }
      }

      struct MyInt : Printable {
        val: i32,
        frame print(this: *MyInt) {
            printf("MyInt: %d\\n", this.val);
        }
      }

      frame main() {
        local i: MyInt;
        i.val = 42;

        local w: Wrapper<MyInt>;
        w.item = i;
        w.display();
      }
    `);

    expect(output).toContain("MyInt: 42");
  });
});
