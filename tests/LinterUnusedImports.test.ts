import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function unusedImports(source: string): string[] {
  const program = new Parser(source, "lint.bpl").parse();
  return new Linter()
    .lint(program, source)
    .filter((diagnostic) => diagnostic.code === "L002")
    .map((diagnostic) => diagnostic.message);
}

test("reports imported names the module never uses", () => {
  expect(
    unusedImports(`
import printf, malloc from "std/c.bpl";
import [Map] from "std/map.bpl";
import * as io from "std/io.bpl";
frame main() ret int {
    printf("hi\\n");
    return 0;
}
`),
  ).toEqual([
    `Import 'malloc' from "std/c.bpl" is never used`,
    `Import 'Map' from "std/map.bpl" is never used`,
    `Import 'io' from "std/io.bpl" is never used`,
  ]);
});

test("counts every kind of use outside the import statements", () => {
  expect(
    unusedImports(`
import [Point] from "./point.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import helper as aliased from "./helpers.bpl";
import * as math from "std/math.bpl";
import shared from "./shared.bpl";
export shared;
frame main() ret int {
    local origin: Point = Point { x: 0, y: 0 };
    local values: Array<int> = Array<int>.new(4);
    local none: Option<int> = Option<int>.None;
    aliased();
    return cast<int>(math.sqrt(4.0)) + origin.x + values.len() + 0 * cast<int>(none.isSome());
}
`),
  ).toEqual([]);
});

test("interpolated strings use String and the names inside ${...}", () => {
  expect(
    unusedImports(`
import [String] from "std/string.bpl";
import format from "./format.bpl";
frame main() ret int {
    local text: String = \`value \${format(1)}\`;
    return 0;
}
`),
  ).toEqual([]);
});

test("reports unused imports only when the source text is given", () => {
  const source =
    'import malloc from "std/c.bpl";\nframe main() ret int { return 0; }\n';
  const program = new Parser(source, "lint.bpl").parse();
  expect(new Linter().lint(program).filter((d) => d.code === "L002")).toEqual(
    [],
  );
});
