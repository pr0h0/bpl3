import { expect, test } from "bun:test";
import { Formatter } from "../compiler/formatter/Formatter";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";
import { formatterSemantics as semantic } from "./helpers/formatterSemantics";

function parse(source: string, tokenized = false) {
  const file = "formatter-comments.bpl";
  return new Parser(
    source,
    file,
    tokenized ? lexWithGrammar(source, file) : [],
  ).parse();
}

function anchors(source: string) {
  const starts = [0];
  for (let i = 0; i < source.length; i++)
    if (source[i] === "\n") starts.push(i + 1);
  const code = lexWithGrammar(source, "formatter-comments.bpl")
    .filter(
      (token) =>
        ![TokenType.Comment, TokenType.EOF, TokenType.Comma].includes(
          token.type,
        ),
    )
    .map((token) => ({
      token,
      start: starts[token.line - 1]! + token.column - 1,
      end: starts[token.line - 1]! + token.column - 1 + token.lexeme.length,
    }));
  return (parse(source).comments ?? []).map((comment) => {
    const start = starts[comment.line - 1]! + comment.column - 1;
    const end = start + comment.lexeme.length;
    if (code.some((token) => token.start <= start && token.end >= end))
      return "inside literal";
    const previous = code.filter((token) => token.end <= start).at(-1);
    const next = code.find((token) => token.start >= end);
    return {
      before: previous?.token.lexeme,
      after: next?.token.lexeme,
      inline: previous
        ? previous.token.line + previous.token.lexeme.split("\n").length - 1 ===
          comment.line
        : false,
    };
  });
}

const cases = [
  {
    name: "parameter list",
    source: "frame f(\n# parameter\nx:int\n){}",
  },
  {
    name: "trailing parameter",
    source: "frame f(x:int, # first\ny:int){}",
  },
  {
    name: "array literal",
    source: "frame main(){local a:int[2]=[1, # first\n2];}",
  },
  {
    name: "call arguments",
    source: "frame main(){f(1, # first\n2);}",
  },
  {
    name: "tuple literal",
    source: "frame main(){local pair:(int,int)=(1, # first\n2);}",
  },
  {
    name: "struct fields",
    source: "struct Point{\nx:int, # x\ny:int, # y\n}",
  },
  {
    name: "spec methods",
    source: "spec Value{frame get() ret int; # get\nframe set(value:int);}",
  },
  {
    name: "enum variants",
    source: "enum Value{First, # first\nSecond, # second\n}",
  },
  {
    name: "struct initializer",
    source: "frame main(){local p:Point=Point{x:1, # x\ny:2};}",
  },
  {
    name: "binary operator",
    source: "frame main(){local n:int=1 /# addition #/ + 2;}",
  },
  {
    name: "between control branches",
    source: "frame main(){if(true){} # branch\nelse{}}",
  },
  {
    name: "opening brace",
    source: "frame main(){ # body\nlocal n:int=1;}",
  },
  {
    name: "empty block",
    source: "frame main(){\n# body\n}",
  },
  {
    name: "same-line block comments",
    source: "frame main(){f(1, /# a #/ /# b #/ 2);}",
  },
  {
    name: "nested block comment",
    source: "frame main(){f(1, /# outer /# inner #/ end #/ 2);}",
  },
  {
    name: "void return normalization",
    source: "frame f() ret /# no value #/ void{}",
  },
  {
    name: "dangling last argument",
    source: "frame main(){f(1, # last\n);}",
  },
  {
    name: "file comments",
    source: "# header\nframe main(){}\n# footer",
  },
  {
    name: "interpolation expression",
    source: "frame main(){local text:string=`value ${1 /# inside #/ + 2}`;}",
  },
  {
    name: "CRLF source",
    source: "frame f(\r\n# parameter\r\nx:int\r\n){}\r\n",
  },
];

for (const { name, source } of cases) {
  for (const tokenized of [false, true]) {
    test(`preserves ${name} comments (${tokenized ? "lexer" : "direct"})`, () => {
      const original = parse(source, tokenized);
      const formatter = new Formatter();
      const formatted = formatter.format(original);
      const result = parse(formatted, tokenized);
      expect(semantic(result)).toEqual(semantic(original));
      expect(
        result.comments?.map((comment) =>
          comment.lexeme
            .split(/\r\n?|\n/)
            .map((line) => line.trim())
            .join("\n"),
        ),
      ).toEqual(
        original.comments?.map((comment) =>
          comment.lexeme
            .split(/\r\n?|\n/)
            .map((line) => line.trim())
            .join("\n"),
        ),
      );
      if (name !== "void return normalization")
        expect(anchors(formatted)).toEqual(anchors(source));
      if (name === "interpolation expression")
        expect(formatted).toContain("`value ${1 /# inside #/ + 2}`");
      expect(formatter.format(result)).toBe(formatted);
      expect(formatter.format(original)).toBe(formatted);
    });
  }
}

test("retains a parameter comment inside the parentheses", () => {
  const formatted = new Formatter().format(
    parse("frame f(\n# parameter\nx:int\n){}"),
  );
  expect(formatted.indexOf("# parameter")).toBeGreaterThan(
    formatted.indexOf("("),
  );
  expect(formatted.indexOf("# parameter")).toBeLessThan(formatted.indexOf(")"));
});

test("retains an array comment inside the array brackets", () => {
  const formatted = new Formatter().format(
    parse("frame main(){local a:int[]=[1, # first\n2];}"),
  );
  expect(formatted.indexOf("# first")).toBeGreaterThan(
    formatted.lastIndexOf("["),
  );
  expect(formatted.indexOf("# first")).toBeLessThan(formatted.lastIndexOf("]"));
});

test("uses BPL indentation for comment-bearing signatures and arrays", () => {
  expect(
    new Formatter().format(parse("frame f(\n# parameter\nx:int\n){}")),
  ).toBe("frame f(\n    # parameter\n    x: int\n) {\n}\n");
  expect(
    new Formatter().format(
      parse("frame main(){local a:int[2]=[1, # first\n2];}"),
    ),
  ).toBe(
    "frame main() {\n    local a: int[2] = [\n        1, # first\n        2\n    ];\n}\n",
  );
});

test("retains section spacing around comments", () => {
  const source =
    "# header\n\nframe main(){\nlocal a:int=1;\n\n# section\n\nlocal b:int=2;\n}";
  const formatted = new Formatter().format(parse(source));
  expect(formatted).toBe(
    "# header\n\nframe main() {\n    local a: int = 1;\n\n    # section\n\n    local b: int = 2;\n}\n",
  );
  expect(new Formatter().format(parse(formatted))).toBe(formatted);
});

test("keeps multiline block comment artwork aligned relative to its opening", () => {
  const source =
    "frame main(){\n  /# diagram\n   +---+\n   | x |\n   +---+\n  #/\n}";
  const formatted = new Formatter().format(parse(source));
  expect(formatted).toBe(
    "frame main() {\n    /# diagram\n     +---+\n     | x |\n     +---+\n    #/\n}\n",
  );
  expect(new Formatter().format(parse(formatted))).toBe(formatted);
});

test("formats large files with many normalized plain-void signatures", () => {
  const source =
    "# generated bindings\n" +
    Array.from(
      { length: 700 },
      (_, index) => `frame binding${index}() ret void {}`,
    ).join("\n");
  const formatted = new Formatter().format(parse(source));
  expect(formatted).toContain("frame binding699() {\n}");
  expect(formatted).not.toContain("ret void");
  expect(new Formatter().format(parse(formatted))).toBe(formatted);
});

test("requires original source for comments in a detached AST", () => {
  const source = "frame f(\n# parameter\nx:int\n){}";
  const original = parse(source);
  const detached = structuredClone(original);
  expect(() => new Formatter().format(detached)).toThrow(
    "Original source text is required",
  );
  expect(new Formatter().format(detached, source)).toBe(
    new Formatter().format(original),
  );
});

test("does not mutate the parser comment array", () => {
  const program = parse("# header\nframe main(){local n:int=1; # value\n}");
  const before = [...(program.comments ?? [])];
  Object.freeze(program.comments);
  new Formatter().format(program);
  expect(program.comments).toEqual(before);
});

for (const source of ["# only", "/# only #/", "# first\n\n# second\n"]) {
  test(`formats comment-only files idempotently: ${JSON.stringify(source)}`, () => {
    const formatted = new Formatter().format(parse(source));
    expect(new Formatter().format(parse(formatted))).toBe(formatted);
    expect(formatted.endsWith("\n")).toBe(true);
    expect(formatted.endsWith("\n\n")).toBe(false);
  });
}

test("rejects mismatched source for a detached commented AST", () => {
  const detached = structuredClone(parse("# header\nframe main(){}"));
  expect(() => new Formatter().format(detached, "frame main(){}")).toThrow(
    "Original source does not match",
  );
});

test("formats comments in CR-only input without consuming following code", () => {
  const source = "# header\rframe f(\r# parameter\rx:int\r){}\r";
  const formatted = new Formatter().format(parse(source));
  expect(formatted).toBe(
    "# header\nframe f(\n    # parameter\n    x: int\n) {\n}\n",
  );
  expect(new Formatter().format(parse(formatted))).toBe(formatted);
});

for (const literal of ['"😀"', '"😃#literal"', '"🌍😀"', "`first\n😀`"]) {
  test(`retains Unicode literal spelling with adjacent comments: ${literal}`, () => {
    const source = `frame main(){local text:string=${literal}; # text\nlocal n:int=1;}`;
    const formatted = new Formatter().format(parse(source));
    expect(formatted).toContain(literal.replace(/\n/g, "\\n") + "; # text");
    expect(semantic(parse(formatted))).toEqual(semantic(parse(source)));
    expect(new Formatter().format(parse(formatted))).toBe(formatted);
  });
}
