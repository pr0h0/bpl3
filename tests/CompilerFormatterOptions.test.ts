import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { formatSource } from "../cli/commands/formatEngine";

const source = "frame main(){local n:int=1; # value\n}";
test("compiler API formats with explicit preferences", async () => {
  const filePath = "/virtual/main.bpl";
  const formatterOptions = { indentWidth: 2, lineEnding: "crlf" as const };
  const compiler = new Compiler({
    filePath,
    emitType: "formatted",
    formatterOptions,
  });
  const sync = compiler.compile(source);
  expect(sync.success).toBe(true);
  expect(sync.output).toBe(formatSource(source, filePath, formatterOptions));
  const asyncResult = await compiler.compileAsync(source);
  expect(asyncResult.success).toBe(true);
  expect(asyncResult.output).toBe(sync.output);
});
