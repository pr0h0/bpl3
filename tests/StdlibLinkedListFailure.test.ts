import { test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("LinkedList rejects growth failures before changing nodes or length", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-list-failure-"));
  try {
    const source = readFileSync(resolve("lib/linked_list.bpl"), "utf8")
      .replace(/\bmalloc\b/g, "listTestAllocate")
      .replace(/\bfree\b/g, "listTestFree")
      .replace("extern listTestAllocate(size: long) ret *void;", `
        extern malloc(size: long) ret *void;
        global listTestShouldFail: bool = false;
        global listTestLive: int = 0;
        export listTestFail;
        export listTestBalance;
        frame listTestFail(fail: bool) { listTestShouldFail = fail; }
        frame listTestBalance() ret int { return listTestLive; }
        frame listTestAllocate(size: long) ret *void {
          if (listTestShouldFail) { return nullptr; }
          local buffer: *void = malloc(size);
          if (buffer != nullptr) { listTestLive = listTestLive + 1; }
          return buffer;
        }`)
      .replace("extern listTestFree(ptr: *void) ret void;", `
        extern free(ptr: *void) ret void;
        frame listTestFree(ptr: *void) {
          if (ptr != nullptr) { listTestLive = listTestLive - 1; }
          free(ptr);
        }`);
    const module = join(dir, "linked_list.bpl");
    writeFileSync(module, source);
    expectCorrectnessSuite([{
      name: "linked-list-growth-failures",
      validateLlvm: true,
      source: `
        import [LinkedList], [ListNode], listTestFail, listTestBalance from "${module}";
        import [Option] from "std/option.bpl";
        extern strcmp(a: string, b: string) ret int;
        frame main() ret int {
          local list: LinkedList<int> = LinkedList<int>.new();
          list.pushBack(1);
          list.pushBack(2);
          local head: *ListNode<int> = list.head;
          local tail: *ListNode<int> = list.tail;
          listTestFail(true);
          ${["pushFront", "pushBack"].map((method, i) => `
            local caught${i}: bool = false;
            try { list.${method}(3); }
            catch (error: string) { caught${i} = strcmp(error, "LinkedList allocation failed") == 0; }
            if (!caught${i} || list.length != 2 || list.head != head || list.tail != tail) { return 1; }
          `).join("\n")}
          listTestFail(false);
          # Synthetic count verifies rejection without allocating huge lists.
          list.length = 2147483647;
          ${["pushFront", "pushBack"].map((method, i) => `
            local full${i}: bool = false;
            try { list.${method}(3); }
            catch (error: string) { full${i} = strcmp(error, "LinkedList capacity exceeded") == 0; }
            if (!full${i} || list.length != 2147483647 || listTestBalance() != 2) { return 2; }
          `).join("\n")}
          list.length = 2;
          list.pushFront(0);
          list.pushBack(3);
          loop (local expected: int = 0; expected < 4; expected = expected + 1) {
            if (list.popFront().unwrap() != expected) { return 3; }
          }
          if (!list.isEmpty() || list.head != nullptr || list.tail != nullptr) { return 4; }
          list.destroy();
          if (listTestBalance() != 0) { return 5; }
          return 0;
        }`,
      expectedStdout: "",
    }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
