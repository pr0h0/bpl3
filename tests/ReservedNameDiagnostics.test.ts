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
  const words = [...rule.matchAll(/"([A-Za-z_]+)"/g)].map((m) => m[1]);
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
