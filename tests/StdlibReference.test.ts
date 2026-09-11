import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  generateStdlibReference,
  renderModuleReference,
  STDLIB_REFERENCE_PATH,
} from "../tools/stdlib_reference";

test("standard library declaration reference stays synchronized with every module", () => {
  expect(
    readFileSync(resolve(import.meta.dir, "..", STDLIB_REFERENCE_PATH), "utf8"),
  ).toBe(generateStdlibReference());
});

test("reference preserves overloads, receivers, exports, and fields without exposing unexported declarations", () => {
  const result = renderModuleReference(
    `
    export [Container]; export run;
    struct Hidden { value: int }
    struct Container<T> {
      value: T,
      frame get(this: *Container<T>) ret T { return this.value; }
      frame get(this: *Container<T>, fallback: T) ret T { return fallback; }
    }
    frame run() { }
  `,
    "lib/example.bpl",
  );
  expect(result).toContain("export [Container]");
  expect(result).toContain("frame get(this: *Container<T>) ret T");
  expect(result).toContain("frame get(this: *Container<T>, fallback: T) ret T");
  expect(result).toContain("value: T");
  expect(result).not.toContain("Hidden");
  expect(result).not.toContain("return this.value");
});
