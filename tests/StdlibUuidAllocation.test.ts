import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("UUID formatting returns null and preserves its value when allocation fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-uuid-allocation-"));
  try {
    const source = readFileSync(resolve("lib/uuid.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "uuidTestAllocate")
      .replace("extern uuidTestAllocate(size: long) ret *void;", `
        frame uuidTestAllocate(size: long) ret *void {
          if (size != 37) { throw "unexpected UUID allocation size"; }
          return nullptr;
        }`);
    const module = join(dir, "uuid.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "uuid-format-allocation-failure",
      validateLlvm: true,
      source: `
        import [UUID] from "${module}";
        frame main() ret int {
          local value: UUID = UUID.fromString("12345678-1234-4abc-9def-123456789abc");
          local original: UUID = value;
          if (value.toString() != nullptr) { return 1; }
          if (!value.equals(&original)) { return 2; }
          local empty: UUID = UUID.nil();
          if (empty.toString() != nullptr) { return 3; }
          if (!empty.isNil()) { return 4; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
