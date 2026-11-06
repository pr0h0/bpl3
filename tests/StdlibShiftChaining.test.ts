import { expect, test } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

// BUG-455: `<<`/`>>` returned the receiver by value, so a chained append grew
// a copy and freed the original buffer (glibc aborted with a double free).
// BUG-464: the result type of an operator on a generic receiver kept unbound
// parameters, so `st << 1 << 2` failed to typecheck.
test("chained shift operators modify the same collection", () => {
  const output = compileAndRun(`import printf from "std/c.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [String] from "std/string.bpl";
import [Stack] from "std/stack.bpl";
import [Array] from "std/array.bpl";
frame main() ret int {
    local sb: StringBuilder = StringBuilder.new(4);
    sb << "ab" << "cdefghijklmnopqrstuvwxyz0123456789";
    printf("%s\\n", sb.toString());
    local s: String = String.new("ab");
    s << "cd" << "ef";
    printf("%s\\n", s.data);
    local st: Stack<int> = Stack<int>.new(1);
    st << 1 << 2 << 3;
    local a: Array<int> = Array<int>.new(1);
    a << 1 << 2 << 3;
    local x: int = 0;
    local y: int = 0;
    a >> &x >> &y;
    printf("%d %d %d %d\\n", st.size(), a.len(), x, y);
    sb.destroy();
    s.destroy();
    st.destroy();
    a.destroy();
    return 0;
}
`);
  expect(output).toBe(
    "abcdefghijklmnopqrstuvwxyz0123456789\nabcdef\n3 1 3 2\n",
  );
});
