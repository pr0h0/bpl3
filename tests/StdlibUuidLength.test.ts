import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("UUID validation does not truncate large string lengths", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-uuid-length-"));
  try {
    // Retain real contents and parsing while simulating a length with high bits
    // set. The old int conversion incorrectly accepted the valid UUID prefix.
    const source = readFileSync(resolve("lib/uuid.bpl"), "utf8")
      .replace(/\bstrlen\b/g, "uuidTestLength")
      .replace("extern uuidTestLength(str: string) ret long;", `
        extern strlen(str: string) ret long;
        frame uuidTestLength(str: string) ret long {
          return strlen(str) + cast<long>(4294967296);
        }`);
    const module = join(dir, "uuid.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "uuid-large-input-length",
      validateLlvm: true,
      source: `
        import [UUID] from "${module}";
        frame main() ret int {
          local inputs: string[2] = ["12345678-1234-4abc-9def-123456789abc", "1234567812344abc9def123456789abc"];
          loop (local i: int = 0; i < 2; i = i + 1) {
            if (UUID.isValid(inputs[i])) { return 1; }
            local output: UUID = UUID.nil();
            output.bytes[0] = cast<u8>(42);
            local original: UUID = output;
            if (UUID.tryFromString(inputs[i], &output)) { return 2; }
            if (!output.equals(&original)) { return 3; }
            local parsed: UUID = UUID.fromString(inputs[i]);
            if (!parsed.isNil()) { return 4; }
          }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
