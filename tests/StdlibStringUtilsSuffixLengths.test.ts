import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("StringUtils endsWith preserves wide suffix lengths", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-suffix-lengths-"));
  try {
    const source = readFileSync(resolve("lib/string_utils.bpl"), "utf8")
      .replace(/\bstrlen\b/g, "suffixTestLength")
      .replace("extern suffixTestLength(s: string) ret long;", `
        extern strlen(s: string) ret long;
        frame suffixTestLength(s: string) ret long {
          if (s[0] == cast<char>(88)) { return cast<long>(2147483648); }
          if (s[0] == cast<char>(89)) { return cast<long>(4294967296); }
          if (s[0] == cast<char>(90)) { return cast<long>(4294967297); }
          return strlen(s);
        }`);
    const module = join(dir, "string_utils.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "string-utils-wide-suffix-lengths",
      validateLlvm: true,
      source: `
        import [StringUtils] from "${module}";
        frame main() ret int {
          if (StringUtils.endsWith("abcZ", "X")) { return 1; }
          if (StringUtils.endsWith("abcZ", "Y")) { return 2; }
          if (StringUtils.endsWith("abcZ", "Z")) { return 3; }
          if (!StringUtils.endsWith("abc", "bc")) { return 4; }
          if (!StringUtils.endsWith("abc", "abc")) { return 5; }
          if (!StringUtils.endsWith("abc", "")) { return 6; }
          if (!StringUtils.endsWith("", "")) { return 7; }
          if (StringUtils.endsWith("", "abc")) { return 8; }
          if (StringUtils.endsWith("abc", "ac")) { return 9; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
