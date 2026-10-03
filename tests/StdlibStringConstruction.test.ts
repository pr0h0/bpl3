import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const failure of ["length", "allocation"] as const) {
  test(`String construction rejects ${failure} failures and assignment preserves its value`, () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-string-construction-"));
    try {
      let source = readFileSync(resolve("lib/string.bpl"), "utf8");
      if (failure === "length") {
        source = source.replace(/\bstrlen\b/g, "stringTestLength")
          .replace("extern stringTestLength(s: string) ret long;", `
            extern strlen(s: string) ret long;
            frame stringTestLength(s: string) ret long {
              if (s[0] == cast<char>(120)) { return cast<long>(4294967303); }
              if (s[0] == cast<char>(121)) { return cast<long>(2147483647); }
              return strlen(s);
            }`);
      } else {
        source = source.replace(/\bmalloc\b/g, "stringTestAllocate")
          .replace("extern stringTestAllocate(size: long) ret string;", `
            extern malloc(size: long) ret string;
            frame stringTestAllocate(size: long) ret string {
              if (size == 8) { return nullptr; }
              return malloc(size);
            }`);
      }
      const module = join(dir, "string.bpl");
      writeFileSync(module, source);
      const message = failure === "length" ? "String.new input too large" : "String.new allocation failed";
      const inputs = failure === "length" ? ["xxxxxxx", "yyyyyyy"] : ["xxxxxxx"];
      expectCorrectnessSuite([{
        name: `string-construction-${failure}`,
        validateLlvm: true,
        source: `
          import [String] from "${module}";
          extern strcmp(a: string, b: string) ret int;
          frame main() ret int {
            local original: String = String.new("kept");
            local originalPtr: *String = &original;
            defer { originalPtr.destroy(); }
            ${inputs.map((input, i) => `
              local caught${i}: bool = false;
              try { original.assign("${input}"); }
              catch (error: string) { caught${i} = strcmp(error, "${message}") == 0; }
              if (!caught${i}) { return 1; }
              if (original.length != 4 || strcmp(original.data, "kept") != 0) { return 2; }
            `).join("\n")}
            local empty: String = String.new(nullptr);
            if (empty.length != 0 || empty.data != nullptr) { return 3; }
            empty.destroy();
            return 0;
          }`,
        expectedStdout: "",
      }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
}
