import { describe, it, expect } from "bun:test";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const BPL_CLI = path.resolve(__dirname, "../index.ts");

function runBPL(sourceCode: string) {
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
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.status ?? 1,
    };
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    const binFile = tempFile.replace(".bpl", "");
    if (fs.existsSync(binFile)) fs.unlinkSync(binFile);
    const llFile = tempFile.replace(".bpl", ".ll");
    if (fs.existsSync(llFile)) fs.unlinkSync(llFile);
  }
}

describe("Enums and Pattern Matching", () => {
  it("keeps tuple enum construction on the single aligned code path", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "../compiler/backend/codegen/CallExpressionGenerator.ts",
      ),
      "utf8",
    );

    expect(source).toContain("getEnumDataFieldByteOffset");
    expect(source).not.toContain("handleEnumVariantConstructor");
  });

  it("should handle simple enums and matching", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum Color {
          Red,
          Green,
          Blue,
      }

      frame main() {
          local c: Color = Color.Green;

          local val: i32 = match (c) {
              Color.Red => 1,
              Color.Green => 2,
              Color.Blue => 3,
          };

          printf("Val: %d\\n", val);
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("SimpleEnum Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("Val: 2\n");
  });

  it("should handle enums with data (tuple variants)", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum Message {
          Quit,
          Move(i32, i32),
          Write(string),
      }

      frame process(msg: Message) {
          match (msg) {
              Message.Quit => { printf("Quit\\n"); },
              Message.Move(x, y) => { printf("Move to %d, %d\\n", x, y); },
              Message.Write(s) => { printf("Write: %s\\n", s); },
          };
      }

      frame main() {
          process(Message.Quit);
          process(Message.Move(10, 20));
          process(Message.Write("Hello"));
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("DataEnum Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Quit");
    expect(stdout).toContain("Move to 10, 20");
    expect(stdout).toContain("Write: Hello");
  });

  it("should preserve mixed-size struct variant fields when pattern binding", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum Packet {
          Data { tag: i8, value: long, count: int },
          Empty,
      }

      frame main() {
          local packet: Packet = Packet.Data {
              tag: 3,
              value: 4294967296,
              count: 7,
          };

          match (packet) {
              Packet.Data { tag: t, value: v, count: c } => {
                  printf("tag=%d value=%ld count=%d\\n", t, v, c);
              },
              Packet.Empty => {
                  printf("empty\\n");
              },
          };
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("StructVariantOffsets Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("tag=3 value=4294967296 count=7\n");
  });

  it("should preserve aggregate tuple variant payload fields", () => {
    const source = `
      extern printf(fmt: string, ...);

      struct Pair {
          first: long,
          second: long,
      }

      enum Packet {
          Data(Pair, int),
          Empty,
      }

      frame main() {
          local packet: Packet = Packet.Data(
              Pair { first: 1, second: 4294967296 },
              7,
          );

          match (packet) {
              Packet.Data(pair, count) => {
                  printf(
                      "first=%ld second=%ld count=%d\\n",
                      pair.first,
                      pair.second,
                      count,
                  );
              },
              Packet.Empty => {
                  printf("empty\\n");
              },
          };
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("TupleVariantAggregate Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("first=1 second=4294967296 count=7\n");
  });

  it("should preserve nested tuple variant payload alignment", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum Packet {
          Data((i8, long), int),
          Empty,
      }

      frame makePair() ret (i8, long) {
          local tag: i8 = 3;
          local value: long = 4294967296;
          return (tag, value);
      }

      frame main() {
          local pair: (i8, long) = makePair();
          local packet: Packet = Packet.Data(pair, 7);

          match (packet) {
              Packet.Data(pair, count) => {
                  printf(
                      "tag=%d value=%ld count=%d\\n",
                      pair.0,
                      pair.1,
                      count,
                  );
              },
              Packet.Empty => {
                  printf("empty\\n");
              },
          };
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("TupleVariantNestedTuple Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("tag=3 value=4294967296 count=7\n");
  });

  it("should ignore enum tuple payload padding in equality", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum E {
          P(i8, long),
          Q(long, long, long),
      }

      frame main() ret int {
          local a: E = E.P(3, 4294967296);
          local b: E = E.P(3, 4294967296);

          if (a == b) {
              printf("equal\\n");
          } else {
              printf("not equal\\n");
          }

          return 0;
      }
    `;

    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("EnumEqualityPadding Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("equal\n");
  });

  it("should ignore inactive enum payload bytes for unit variant equality", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum E {
          A,
          B(i8, long),
          C(long, long, long),
      }

      frame dirty(x: long) ret E {
          local v: E = E.C(x, x + 1, x + 2);
          if (x < 0) {
              return v;
          }
          return E.A;
      }

      frame main() ret int {
          local a: E = dirty(10);
          local b: E = dirty(99);

          if (a == b) {
              printf("equal\\n");
          } else {
              printf("not equal\\n");
          }

          return 0;
      }
    `;

    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("EnumUnitEqualityPadding Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("equal\n");
  });

  it("should compare enum float payloads with float equality semantics", () => {
    const source = `
      extern printf(fmt: string, ...) ret int;

      enum E {
          V(float),
      }

      frame main() ret int {
          local neg: float = -1.0 * 0.0;
          local a: E = E.V(0.0);
          local b: E = E.V(neg);

          if (a == b) {
              printf("equal\\n");
          } else {
              printf("not equal\\n");
          }

          return 0;
      }
    `;

    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("EnumFloatEquality Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("equal\n");
  });

  it("should compare generic enum float payloads with float equality semantics", () => {
    const source = `
      extern printf(fmt: string, ...) ret int;

      enum Box<T> {
          Value(T),
      }

      frame main() ret int {
          local neg: float = -1.0 * 0.0;
          local a: Box<float> = Box<float>.Value(0.0);
          local b: Box<float> = Box<float>.Value(neg);

          if (a == b) {
              printf("equal\\n");
          } else {
              printf("not equal\\n");
          }

          return 0;
      }
    `;

    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("GenericEnumFloatEquality Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("equal\n");
  });

  it("should preserve generic enum struct variant field payloads", () => {
    const source = `
      extern printf(fmt: string, ...) ret int;

      enum Box<T> {
          Item { value: T },
      }

      frame main() ret int {
          local box: Box<float> = Box.Item { value: 2.5 };

          match (box) {
              Box.Item { value: value } => {
                  printf("%.1f\\n", value);
              },
          };

          return 0;
      }
    `;

    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("GenericEnumStructVariant Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("2.5\n");
  });

  it("should handle generic enums (Option<T>)", () => {
    const source = `
      extern printf(fmt: string, ...);
      import [Option] from "std/option.bpl";

      frame main() {
          local opt: Option<i32> = Option.Some(42);

          match (opt) {
              Option.Some(val) => { printf("Got: %d\\n", val); },
              Option.None => { printf("Got None\\n"); },
          };

          local none: Option<i32> = Option.None;
           match (none) {
              Option.Some(val) => { printf("Got: %d\\n", val); },
              Option.None => { printf("Got None\\n"); },
          };
      }
    `;
    const { stdout, stderr, exitCode } = runBPL(source);
    if (exitCode !== 0) console.error("GenericEnum Stderr:", stderr);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("Got: 42");
    expect(stdout).toContain("Got None");
  });

  it("should check exhaustiveness (if implemented)", () => {
    const source = `
      enum Color { Red, Green, Blue }
      frame main() {
          local c: Color = Color.Red;
          match (c) {
              Color.Red => {}
              # Missing Green and Blue
          }
      }
    `;
    const { exitCode } = runBPL(source);
    // If exhaustiveness check exists, this should fail
    if (exitCode !== 0) {
      console.log(
        "Exhaustiveness check PASSED (compilation failed as expected).",
      );
    } else {
      console.log(
        "Exhaustiveness check FAILED (compilation succeeded with missing cases).",
      );
    }
  });
});
