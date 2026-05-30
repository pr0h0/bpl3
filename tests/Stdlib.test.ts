import { describe, test, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function compileAndRun(sourceCode: string) {
  const tempFile = path.join(
    __dirname,
    `temp_${Math.random().toString(36).substring(7)}.bpl`,
  );

  try {
    fs.writeFileSync(tempFile, sourceCode);

    const result = spawnSync("bun", [BPL_CLI, "run", tempFile], {
      encoding: "utf-8",
      cwd: __dirname,
    });

    if (result.status !== 0) {
      console.error("Compilation/Run failed:");
      console.error(result.stderr);
      console.error(result.stdout);
      throw new Error(`BPL execution failed with code ${result.status}`);
    }

    return result.stdout;
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Standard Library", () => {
  test("Array<i32> basic operations", async () => {
    const output = compileAndRun(`
      import [Array] from "std/array.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local arr: Array<i32> = Array<i32>.new(4);

        arr.push(10);
        arr.push(20);
        arr.push(30);

        printf("Len: %d\\n", arr.len());
        printf("0: %d\\n", arr.get(0));
        printf("1: %d\\n", arr.get(1));
        printf("2: %d\\n", arr.get(2));

        arr.set(1, 99);
        printf("1 updated: %d\\n", arr.get(1));

        arr.destroy();
      }
    `);

    expect(output).toContain("Len: 3");
    expect(output).toContain("0: 10");
    expect(output).toContain("1: 20");
    expect(output).toContain("2: 30");
    expect(output).toContain("1 updated: 99");
  });

  test("Map<i32, i32> basic operations", async () => {
    const output = await compileAndRun(`
      import [Map] from "std/map.bpl";
      import [Option] from "std/option.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local m: Map<i32, i32> = Map<i32, i32>.new(10);

        m.set(1, 100);
        m.set(2, 200);

        if (m.has(1)) {
            printf("Has 1: yes\\n");
        } else {
            printf("Has 1: no\\n");
        }

        if (m.has(3)) {
            printf("Has 3: yes\\n");
        } else {
            printf("Has 3: no\\n");
        }

        local opt1: Option<i32> = m.get(1);
        if (opt1.isSome()) {
            printf("Get 1: %d\\n", opt1.unwrap());
        }

        local opt3: Option<i32> = m.get(3);
        if (opt3.isNone()) {
            printf("Get 3: none\\n");
        }

        m.destroy();
      }
    `);

    expect(output).toContain("Has 1: yes");
    expect(output).toContain("Has 3: no");
    expect(output).toContain("Get 1: 100");
    expect(output).toContain("Get 3: none");
  });

  test("Array<i32> resizing", async () => {
    const output = compileAndRun(`
      import [Array] from "std/array.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local arr: Array<i32> = Array<i32>.new(2);

        arr.push(1);
        arr.push(2);
        printf("Cap before: %d\\n", arr.capacity);

        arr.push(3);
        printf("Cap after: %d\\n", arr.capacity);
        printf("Len: %d\\n", arr.len());
        printf("2: %d\\n", arr.get(2));

        arr.destroy();
      }
    `);

    expect(output).toContain("Cap before: 2");
    expect(output).toContain("Cap after: 5");
    expect(output).toContain("Len: 3");
    expect(output).toContain("2: 3");
  });

  test("Set<i32> basic operations", async () => {
    const output = compileAndRun(`
      import [Set] from "std/set.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local s: Set<i32> = Set<i32>.new(10);

        s.add(10);
        s.add(20);

        if (s.has(10)) {
            printf("Has 10: yes\\n");
        }

        if (s.has(30)) {
            printf("Has 30: yes\\n");
        } else {
            printf("Has 30: no\\n");
        }

        s.remove(10);
        if (s.has(10)) {
            printf("Has 10 after remove: yes\\n");
        } else {
            printf("Has 10 after remove: no\\n");
        }

        s.destroy();
      }
    `);

    expect(output).toContain("Has 10: yes");
    expect(output).toContain("Has 30: no");
    expect(output).toContain("Has 10 after remove: no");
  });

  test("Result<i32, i32> basic operations", async () => {
    const output = compileAndRun(`
      import [Result] from "std/result.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local r1: Result<i32, i32> = Result<i32, i32>.Ok(100);
        if (r1.isOk()) {
            printf("Ok: %d\\n", r1.unwrap());
        }

        local r2: Result<i32, i32> = Result<i32, i32>.Err(500);
        if (r2.isErr()) {
            printf("Err: yes\\n");
        }

        printf("UnwrapOr: %d\\n", r2.unwrapOr(999));
      }
    `);

    expect(output).toContain("Ok: 100");
    expect(output).toContain("Err: yes");
    expect(output).toContain("UnwrapOr: 999");
  });

  test("String basic operations", async () => {
    const output = compileAndRun(`
      import [String] from "std/string.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local s: String = String.new("Hello");
        printf("String: %s\\n", s.data);
        printf("Len: %d\\n", s.length);

        local s2: String = String.new(" World");
        local s3: String = s + s2;
        printf("Concat: %s\\n", s3.data);

        s.destroy();
        s2.destroy();
        s3.destroy();
      }
    `);

    expect(output).toContain("String: Hello");
    expect(output).toContain("Len: 5");
    expect(output).toContain("Concat: Hello World");
  });

  test("Stack<i32> and Queue<i32> basic operations", async () => {
    const output = compileAndRun(`
      import [Stack] from "std/stack.bpl";
      import [Queue] from "std/queue.bpl";
      import [Option] from "std/option.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        # Stack
        local s: Stack<i32> = Stack<i32>.new(10);
        s.push(1);
        s.push(2);

        local pop1: Option<i32> = s.pop();
        if (pop1.isSome()) {
            printf("Stack pop: %d\\n", pop1.unwrap());
        }

        # Queue
        local q: Queue<i32> = Queue<i32>.new(10);
        q.enqueue(10);
        q.enqueue(20);

        local deq1: Option<i32> = q.dequeue();
        if (deq1.isSome()) {
            printf("Queue deq: %d\\n", deq1.unwrap());
        }

        s.destroy();
        q.destroy();
      }
    `);

    expect(output).toContain("Stack pop: 2");
    expect(output).toContain("Queue deq: 10");
  });

  test("Algorithm basic operations", async () => {
    const output = compileAndRun(`
      import [Algorithm] from "std/algorithm.bpl";
      import [Array] from "std/array.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local arr: Array<int> = Array<int>.new(5);
        arr.push(30);
        arr.push(10);
        arr.push(20);

        Algorithm.sortAsc(&arr);

        printf("0: %d\\n", arr.get(0));
        printf("1: %d\\n", arr.get(1));
        printf("2: %d\\n", arr.get(2));

        local idx: int = Algorithm.binarySearch(&arr, 20);
        printf("Idx 20: %d\\n", idx);

        arr.destroy();
      }
    `);

    expect(output).toContain("0: 10");
    expect(output).toContain("1: 20");
    expect(output).toContain("2: 30");
    expect(output).toContain("Idx 20: 1");
  });

  test("FS basic operations", async () => {
    const output = compileAndRun(`
      import [FS] from "std/fs.bpl";
      import [String] from "std/string.bpl";

      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local path: string = "test_file.txt";
        local content: string = "Hello File!";

        if (FS.writeFile(path, content)) {
            printf("Write success\\n");
        }

        if (FS.exists(path)) {
            printf("File exists\\n");
        }

        local readContent: String = FS.readFile(path);
        printf("Read: %s\\n", readContent.data);
        readContent.destroy();

        # Cleanup is hard from BPL without remove(), so we rely on test harness cleanup or ignore it
      }
    `);

    expect(output).toContain("Write success");
    expect(output).toContain("File exists");
    expect(output).toContain("Read: Hello File!");

    // Cleanup the file created by the test
    if (fs.existsSync("test_file.txt")) {
      fs.unlinkSync("test_file.txt");
    }
  });

  test("LinkedList<i32> basic operations", async () => {
    const output = compileAndRun(`
      import [LinkedList] from "std/linked_list.bpl";
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local list: LinkedList<i32> = LinkedList<i32>.new();
        list.pushBack(10);
        list.pushBack(20);
        list.pushFront(5);
        
        printf("Len: %d\\n", list.len());
        printf("PopFront: %d\\n", list.popFront().unwrap());
        printf("PopBack: %d\\n", list.popBack().unwrap());
        printf("PopBack: %d\\n", list.popBack().unwrap());
        printf("Len: %d\\n", list.len());
        
        list.destroy();
      }
    `);

    expect(output).toContain("Len: 3");
    expect(output).toContain("PopFront: 5");
    expect(output).toContain("PopBack: 20");
    expect(output).toContain("PopBack: 10");
    expect(output).toContain("Len: 0");
  });

  test("PriorityQueue<i32> basic operations", async () => {
    const output = compileAndRun(`
      import [PriorityQueue] from "std/priority_queue.bpl";
      extern printf(fmt: *i8, ...) ret i32;

      frame main() {
        local pq: PriorityQueue<i32> = PriorityQueue<i32>.new(10);
        pq.push(30);
        pq.push(10);
        pq.push(20);
        
        printf("Pop: %d\\n", pq.pop().unwrap());
        printf("Pop: %d\\n", pq.pop().unwrap());
        printf("Pop: %d\\n", pq.pop().unwrap());
        
        pq.destroy();
      }
    `);

    expect(output).toContain("Pop: 10");
    expect(output).toContain("Pop: 20");
    expect(output).toContain("Pop: 30");
  });

  test("std umbrella exports CLI args, JSON, and logging utilities", async () => {
    const output = compileAndRun(`
      import [Args], [JSON], [Log], [String] from "std";

      extern printf(fmt: *i8, ...) ret i32;

      frame main(argc: int, argv: **char) ret int {
        local args: Args = Args.new(argc, argv);
        local value: int = 42;
        local encoded: String = JSON.stringify<int>(&value);

        printf("argc: %d\\n", args.count());
        printf("json: %s\\n", encoded.data);
        Log.info("log: ready");

        encoded.destroy();
        return 0;
      }
    `);

    expect(output).toContain("argc:");
    expect(output).toContain("json: 42");
    expect(output).toContain("log: ready");
  });

  test("std umbrella exports stable hashing utilities", async () => {
    const output = compileAndRun(`
      import [Hash] from "std";

      extern printf(fmt: string, ...) ret int;

      frame main() ret int {
        printf("hash: %u\\n", Hash.fnv1a32("hello"));
        printf("checksum: %u\\n", Hash.checksum32("abc"));
        return 0;
      }
    `);

    expect(output).toContain("hash: 1335831723");
    expect(output).toContain("checksum: 294");
  });
});
