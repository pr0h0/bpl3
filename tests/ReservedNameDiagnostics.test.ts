import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { CompilerError } from "../compiler/common/CompilerError";
import { Parser } from "../compiler/frontend/Parser";
import { RESERVED_WORDS } from "../compiler/frontend/ReservedWords";

// BUG-476: a reserved word used as a name was reported as "Unexpected
// syntax" over the whole enclosing declaration.
function firstError(source: string): {
  message: string;
  line?: number;
  column?: number;
} {
  try {
    new Parser(source, "names.bpl").parse(true);
  } catch (error) {
    const compilerError = error as CompilerError;
    return {
      message: compilerError.message,
      line: compilerError.location?.startLine,
      column: compilerError.location?.startColumn,
    };
  }
  throw new Error("expected a syntax error");
}

test("the reserved-word list matches the grammar's KeywordReserved rule", () => {
  const grammar = readFileSync(
    join(import.meta.dir, "../grammar/bpl.peggy"),
    "utf8",
  );
  const rule = grammar.slice(
    grammar.indexOf("KeywordReserved\n"),
    grammar.indexOf("\n\n", grammar.indexOf("KeywordReserved\n")),
  );
  const words = [...rule.matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]!);
  expect([...RESERVED_WORDS].sort()).toEqual(words.sort());
});

test("a reserved parameter name is reported at the name", () => {
  expect(
    firstError(
      "frame take(count: int, from: int) ret int {\n    return 0;\n}\n",
    ),
  ).toEqual({
    message: "'from' is a reserved word and cannot be used as a name",
    line: 1,
    column: 24,
  });
});

test("a reserved parameter name in a method is reported at the name, not the struct", () => {
  expect(
    firstError(
      "struct Box {\n    v: int,\n    frame take(this: *Box, match: int) ret int {\n        return 0;\n    }\n}\n",
    ),
  ).toEqual({
    message: "'match' is a reserved word and cannot be used as a name",
    line: 3,
    column: 28,
  });
});

test("a reserved local or global name is reported at the name, with CRLF lines", () => {
  expect(
    firstError(
      "frame main() ret int {\r\n    local const type: int = 1;\r\n    return 0;\r\n}\r\n",
    ),
  ).toEqual({
    message: "'type' is a reserved word and cannot be used as a name",
    line: 2,
    column: 17,
  });
  expect(firstError("global as: int = 1;\n").message).toBe(
    "'as' is a reserved word and cannot be used as a name",
  );
});

test("other syntax errors keep the unexpected-syntax report", () => {
  expect(
    firstError("frame main() ret int {\n    local x: = 1;\n    return 0;\n}\n")
      .message,
  ).toStartWith("Unexpected syntax");
});

// The recovery span of a struct can end inside its first method, so a
// reserved name in a later member was reported as unexpected syntax at the
// struct.
test("a reserved parameter name in a later method is reported at the name", () => {
  expect(
    firstError(
      'struct Files {\n    frame first() ret string {\n        return "} not a brace";\n    }\n\n    # a } in a comment\n    frame copy(from: string, to: string) ret int {\n        return 0;\n    }\n}\n',
    ),
  ).toEqual({
    message: "'from' is a reserved word and cannot be used as a name",
    line: 7,
    column: 16,
  });
});

test("a reserved name in a later declaration does not replace an earlier error", () => {
  expect(
    firstError(
      "frame broken() ret int {\n    local x: = 1;\n    return 0;\n}\n\nframe later(from: int) ret int {\n    return 0;\n}\n",
    ),
  ).toMatchObject({ line: 2, column: 5 });
  expect(
    firstError(
      "frame broken() ret int {\n    local x: = 1;\n    return 0;\n}\n\nframe later(from: int) ret int {\n    return 0;\n}\n",
    ).message,
  ).toStartWith("Unexpected syntax");
});

test("a reserved struct field or lambda parameter name is reported at the name", () => {
  expect(
    firstError(
      "struct Point {\n    type: int,\n}\n\nframe main() ret int {\n    return 0;\n}\n",
    ),
  ).toEqual({
    message: "'type' is a reserved word and cannot be used as a name",
    line: 2,
    column: 5,
  });
  expect(
    firstError(
      "frame main() ret int {\n    local f: Lambda<int>(int) = |match: int| ret int {\n        return match;\n    };\n    return f(1);\n}\n",
    ),
  ).toEqual({
    message: "'match' is a reserved word and cannot be used as a name",
    line: 2,
    column: 34,
  });
});

test("comparisons, switch labels, strings and comments are not taken for names", () => {
  for (const source of [
    // `true == flag` is a comparison; the error is the missing type.
    "frame check(flag: bool) ret bool {\n    if (true == flag) {\n        return true;\n    }\n    local x: = 1;\n    return false;\n}\n",
    // A switch's `default:` after `{` is a label.
    "frame pick(n: int) ret int {\n    switch (n) {\n        default:\n            return 0;\n    }\n    local x: = 1;\n}\n",
    // Words in strings and comments are text.
    'frame say() ret int {\n    # (from: here)\n    printf("(type: %d)", 1);\n    local x: = 1;\n    return 0;\n}\n',
  ]) {
    expect(firstError(source).message).toStartWith("Unexpected syntax");
  }
});
