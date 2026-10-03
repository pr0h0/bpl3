import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("String searches reject oversized needles before narrowing their lengths", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-string-search-length-"));
  try {
    const source = readFileSync(resolve("lib/string.bpl"), "utf8")
      .replace(/\bstrlen\b/g, "searchTestLength")
      .replace("extern searchTestLength(s: string) ret long;", `
        extern strlen(s: string) ret long;
        frame searchTestLength(s: string) ret long {
          local length: long = strlen(s);
          if (length == 0) { return cast<long>(4294967296); }
          if (length == 1) { return cast<long>(4294967297); }
          if (length == 2) { return cast<long>(2147483648); }
          return length;
        }`);
    const module = join(dir, "string.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "string-search-length-bounds",
      validateLlvm: true,
      source: `
        import [String] from "${module}";
        frame main() ret int {
          local text: String = String.new("aaaa");
          defer { text.destroy(); }
          local needles: string[3] = ["", "a", "aa"];
          loop (local i: int = 0; i < 3; i = i + 1) {
            if (text.includes(needles[i])) { return 1; }
            if (text.startsWith(needles[i])) { return 2; }
            if (text.endsWith(needles[i])) { return 3; }
            if (text.indexOf(needles[i]) != -1) { return 4; }
            if (text.lastIndexOf(needles[i]) != -1) { return 5; }
            if (text.count(needles[i]) != 0) { return 6; }
          }
          if (!text.includes("aaa") || !text.startsWith("aaa") || !text.endsWith("aaa")) { return 7; }
          if (text.indexOf("aaa") != 0 || text.lastIndexOf("aaa") != 1 || text.count("aaa") != 1) { return 8; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
