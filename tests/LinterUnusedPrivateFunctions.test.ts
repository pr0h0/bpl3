import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Linter } from "../compiler/linter/Linter";

function unusedPrivate(source: string): string[] {
  const program = new Parser(source, "lint.bpl").parse();
  return new Linter()
    .lint(program, source)
    .filter((diagnostic) => diagnostic.code === "L003")
    .map((diagnostic) => diagnostic.message);
}

test("reports private functions that nothing in the module uses", () => {
  expect(
    unusedPrivate(`
frame _used() ret int {
    return 1;
}

frame _unused() ret int {
    return 2;
}

frame _usedInString() ret int {
    return 3;
}

frame _exportedHelper() {}
export _exportedHelper;

frame publicButUnused() {}

frame main() ret int {
    local text: string = \`\${_usedInString()}\`;
    return _used();
}
`),
  ).toEqual(["Private function '_unused' is never used"]);
});

test("a function used only as a value still counts as used", () => {
  expect(
    unusedPrivate(`
frame _callback(x: int) ret int {
    return x;
}

frame main() ret int {
    local f: Func<int>(int) = _callback;
    return f(0);
}
`),
  ).toEqual([]);
});

test("reports nothing without the source text", () => {
  const source = "frame _unused() {}\nframe main() ret int { return 0; }\n";
  const program = new Parser(source, "lint.bpl").parse();
  expect(new Linter().lint(program).filter((d) => d.code === "L003")).toEqual(
    [],
  );
});
