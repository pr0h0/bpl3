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
  for (const bare of [true, false]) {
    test(`import source escaping preserves value and leading comment: ${bare ? "bare" : "named"} ${raw}`, () => {
      const prefix = bare ? "import" : "import value from";
      const source = `${prefix} # source\n"${raw}";frame main(){}`;
      const ast = new Parser(source, "import-escapes.bpl").parse();
      const output = new Formatter().format(ast);
      const after = new Parser(output, "import-escapes.bpl").parse();
      expect(formatterSemantics(after)).toEqual(formatterSemantics(ast));
      expect(Buffer.from(output, "utf8").toString("utf8")).toBe(output);
      expect(output).toContain(prefix + " # source\n");
      expect(new Formatter().format(after)).toBe(output);
    });
  }
