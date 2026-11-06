import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";

// BUG-437: a brace-less `if`/`else`/`loop` body left a space before the newline.
test("brace-less bodies leave no trailing whitespace", () => {
  const source = `frame main() ret int {
    local x: int = 1;
    if (x > 0) return 1;
    else return 2;
    loop (x < 3) x = x + 1;
    if (x > 0) return 3; else if (x < 0) return 4; else { return 5; }
    return 0;
}
`;
  const output = new Formatter().format(new Parser(source, "b.bpl").parse());
  expect(output.split("\n").filter((line) => / $/.test(line))).toEqual([]);
  expect(output).toContain(
    "    if (x > 0)\n        return 1;\n    else\n        return 2;\n",
  );
  expect(output).toContain("    loop (x < 3)\n        x = x + 1;\n");
  expect(output).toContain(
    "    else if (x < 0)\n        return 4;\n    else {\n",
  );
  expect(new Formatter().format(new Parser(output, "b.bpl").parse())).toBe(
    output,
  );
});
