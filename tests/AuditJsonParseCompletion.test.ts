import { expect, test } from "bun:test";
import { runBplAtOptimization } from "./helpers/compilerCorrectness";

test("JSON.parse requires one complete value and permits trailing whitespace", () => {
  const cases = [
    { type: "int", json: "1" },
    { type: "bool", json: "true" },
    { type: "string", json: '"hello"' },
    { type: "Numbers", json: '{"values":[1,2]}' },
    { type: "Record", json: '{"name":"hello"}' },
  ];
  const source = `
    import [JSON] from "std/json.bpl";
    extern printf(fmt: string, ...);
    struct Record { name: string }
    struct Numbers { values: int[2] }
    ${cases
      .map(
        ({ type }, index) => `
      frame accepts${index}(input: string) ret bool {
        local value: *${type} = JSON.parse<${type}>(input);
        if (value == nullptr) { return false; }
        JSON.free<${type}>(value);
        return true;
      }
    `,
      )
      .join("\n")}
    frame main() ret int {
      ${cases
        .map(
          ({ json }, index) => `
        if (accepts${index}(${JSON.stringify(json + " false")})) { return 1; }
        if (accepts${index}(${JSON.stringify(json + "x")})) { return 2; }
        if (!accepts${index}(${JSON.stringify(" \n\t" + json + " \r\n\t")})) { return 3; }
      `,
        )
        .join("\n")}
      printf("complete values only\\n");
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout.match(/JSON Parse Error:/g)?.length).toBe(
      cases.length * 2,
    );
    expect(result.stdout.endsWith("complete values only\n")).toBe(true);
  }
}, 60000);
