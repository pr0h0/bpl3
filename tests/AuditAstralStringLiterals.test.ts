import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
test("LLVM string literals preserve astral Unicode and mixed UTF-8", () => {
  expectCorrectnessSuite([
    {
      name: "astral-string-literals",
      validateLlvm: true,
      source: `import printf from "std/c.bpl"; frame main() ret int { printf("%s\\n", "A😀é界𝄞\\\"\\\\Z"); return 0; }`,
      expectedStdout: 'A😀é界𝄞"\\Z\n',
    },
  ]);
}, 60000);
