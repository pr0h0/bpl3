import { test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("configured indentation and line endings preserve native behavior", () => {
  const file = path.resolve(
    import.meta.dir,
    "../examples/formatter_comments/main.bpl",
  );
  const source = fs.readFileSync(file, "utf8");
  const ast = new Parser(source, file).parse();
  expectCorrectnessSuite([
    {
      name: "two-space-comments",
      source: new Formatter({ indentWidth: 2 }).format(ast),
      expectedStdout: "answer 42 3\n",
    },
    {
      name: "tabbed-comments",
      source: new Formatter({ useTabs: true }).format(ast),
      expectedStdout: "answer 42 3\n",
    },
    {
      name: "crlf-comments",
      source: new Formatter({ lineEnding: "crlf" }).format(ast),
      expectedStdout: "answer 42 3\n",
    },
  ]);
}, 30000);
