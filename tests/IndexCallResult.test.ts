import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

// Indexing loads its base from a slot holding the value. A call produces a
// value rather than a location, and the returned pointer was being treated as
// that slot, so the first element was loaded and then used as an address.
test("a value returned by a call can be indexed", () => {
  expectCorrectnessSuite([
    {
      name: "index-call-result",
      validateLlvm: true,
      source: `
      import printf, malloc from "std/c.bpl";

      frame makeInts() ret *int {
        local p: *int = cast<*int>(malloc(cast<long>(16)));
        p[0] = 41;
        p[1] = 42;
        return p;
      }

      frame makeArray() ret int[3] {
        local a: int[3] = [7, 8, 9];
        return a;
      }

      frame makeSlice(backing: int[]) ret int[] {
        return backing;
      }

      frame makeText() ret string {
        local buf: string = cast<string>(malloc(cast<long>(8)));
        buf[0] = 'A';
        buf[1] = 'B';
        buf[2] = cast<char>(0);
        return buf;
      }

      struct Box { value: int }

      frame makeBox() ret Box {
        local b: Box;
        b.value = 7;
        return b;
      }

      frame makeBoxPtr() ret *Box {
        local p: *Box = cast<*Box>(malloc(cast<long>(8)));
        p.value = 9;
        return p;
      }

      frame main() ret int {
        local backing: int[3] = [4, 5, 6];

        # A write through a call result reaches the caller's storage.
        makeSlice(backing)[1] = 55;

        printf("%d %d | %d %d | %d %d | %c%c | %d | %d | %d %d\\n",
          makeInts()[0], makeInts()[1],
          makeArray()[0], makeArray()[2],
          makeSlice(backing)[0], makeSlice(backing)[2],
          makeText()[0], makeText()[1],
          (makeInts())[1],
          backing[1],
          # Member access on a call result was always correct and stays so.
          makeBox().value, makeBoxPtr().value);
        return 0;
      }`,
      expectedStdout: "41 42 | 7 9 | 4 6 | AB | 42 | 55 | 7 9\n",
    },
  ]);
}, 60000);

test("indexing a call result is still bounds checked", () => {
  expectRuntimeFailureSuite([
    {
      name: "index call result out of range",
      expectedMessage: "INDEX OUT OF BOUNDS",
      source: `frame makeArray() ret int[3] {
        local a: int[3] = [7, 8, 9];
        return a;
      }
      frame pick(n: int) ret int { return n; }
      frame main() ret int {
        return makeArray()[pick(5)];
      }`,
    },
  ]);
}, 60000);
