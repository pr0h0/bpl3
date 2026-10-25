import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("comment-bearing source and formatted source agree at O0 and O3", () => {
  const file = path.resolve(
    import.meta.dir,
    "../examples/formatter_comments/main.bpl",
  );
  const source = fs.readFileSync(file, "utf8").replace(/^ +/gm, "");
  const formatted = new Formatter().format(new Parser(source, file).parse());
  expect(formatted).not.toBe(source);
  expect(formatted).toContain("value: int, # Value owned by this point.");
  expectCorrectnessSuite([
    { name: "original-comments", source, expectedStdout: "answer 42 3\n" },
    {
      name: "formatted-comments",
      source: formatted,
      expectedStdout: "answer 42 3\n",
    },
  ]);
}, 30000);
