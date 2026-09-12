import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";
const source = `
import [IO], [LineReadResult] from "std/io.bpl";
import printf from "std/c.bpl";
frame main() ret int {
  local bytes: char[6] = ['L','x','x','x','x','R'];
  local invalid: int = match (IO.readLine(nullptr, 4)) { LineReadResult.InvalidBuffer => 0, _ => 1 };
  if (invalid != 0) { return 1; }
  invalid = match (IO.readLine(cast<string>(&bytes[1]), 0)) { LineReadResult.InvalidBuffer => 0, _ => 1 };
  if (invalid != 0) { return 2; }
  loop (local i: int = 0; i < 6; i = i + 1) {
    match (IO.readLine(cast<string>(&bytes[1]), 4)) {
      LineReadResult.Line(n) => printf("line:%d:%s\\n", n, &bytes[1]),
      LineReadResult.Truncated(n) => printf("truncated:%d:%s\\n", n, &bytes[1]),
      LineReadResult.EndOfFile => printf("eof:%s\\n", &bytes[1]),
      _ => { return 3; },
    };
    if (bytes[0] != 'L' || bytes[5] != 'R') { return 4; }
  }
  return 0;
}`;
test("bounded input distinguishes empty lines, exact fits, truncation, final lines, and EOF without touching guards", () => {
  for (const opt of [0, 3] as const) {
    expect(
      runBplAtOptimization(source, opt, "\nabc\nabcdef\nxy\nz"),
    ).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout:
        "line:0:\nline:3:abc\ntruncated:3:abc\nline:2:xy\nline:1:z\neof:\n",
    });
  }
}, 60000);
test("capacity one stores only NUL and drains an oversized line", () => {
  const one = source
    .replaceAll("nullptr, 4", "nullptr, 1")
    .replaceAll("&bytes[1]), 4", "&bytes[1]), 1");
  for (const opt of [0, 3] as const) {
    expect(runBplAtOptimization(one, opt, "a\n\n")).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: "truncated:0:\nline:0:\neof:\neof:\neof:\neof:\n",
    });
  }
}, 60000);
test("bounded input reports native read errors", () => {
  const error = `import [IO], [LineReadResult] from "std/io.bpl"; extern close(fd:int) ret int; frame main() ret int { close(0); local buf:char[4]; match (IO.readLine(cast<string>(&buf[0]),4)) { LineReadResult.Error => { return 0; }, _ => { return 1; } }; }`;
  for (const opt of [0, 3] as const)
    expect(runBplAtOptimization(error, opt)).toMatchObject({
      exitCode: 0,
      stderr: "",
      stdout: "",
    });
}, 60000);
