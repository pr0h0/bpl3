import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

const paths = [
  String.raw`./quoted\"module.bpl`,
  String.raw`./back\\slash.bpl`,
  String.raw`./line\nname.bpl`,
  String.raw`./tab\tname.bpl`,
  String.raw`./null\0name.bpl`,
  String.raw`./backspace\x08name.bpl`,
  String.raw`./formfeed\u000cname.bpl`,
  String.raw`./literal\\b-and-\\f.bpl`,
  String.raw`./surrogate\ud800name.bpl`,
  String.raw`./unicode\uD83D\uDE00.bpl`,
];
for (const raw of paths)
  for (const prefix of [
    "import",
    "import value from",
    "import * as module from",
  ])
    for (const comment of ["", " # source\n"])
      for (const lineEnding of ["lf", "crlf"] as const) {
        test(`import path round trip: ${prefix} ${JSON.stringify(raw)} ${comment ? "comment" : "plain"} ${lineEnding}`, () => {
          const source = `${prefix}${comment || " "}"${raw}";frame main(){}`;
          const ast = new Parser(source, "import-escapes.bpl").parse();
          const output = new Formatter({ lineEnding }).format(ast);
          const after = new Parser(output, "import-escapes.bpl").parse();
          expect(formatterSemantics(after)).toEqual(formatterSemantics(ast));
          expect(Buffer.from(output, "utf8").toString("utf8")).toBe(output);
          if (comment)
            expect(output).toContain(
              prefix + " # source" + (lineEnding === "crlf" ? "\r\n" : "\n"),
            );
          expect(new Formatter({ lineEnding }).format(after)).toBe(output);
        });
      }
