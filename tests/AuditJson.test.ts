import { it } from "bun:test";
import { expectCorrectnessSuite, runBplAtOptimization } from "./helpers/compilerCorrectness";
import { expect } from "bun:test";

const bplString = (value: string) => JSON.stringify(value);

it("decodes JSON Unicode escapes into UTF-8 including surrogate pairs", () => {
  const cases = [String.raw`"\u0041"`, String.raw`"\u00e9"`, String.raw`"\u20AC"`, String.raw`"\uD83D\uDE00"`, String.raw`"a\u0041z"`];
  expectCorrectnessSuite([{
    name: "JSON Unicode decoding",
    validateLlvm: true,
    expectedStdout: "A\né\n€\n😀\naAz\n",
    source: `import [JSON] from "std/json.bpl"; extern printf(fmt: string, ...);
      frame main() ret int {
        ${cases.map((json, i) => `
          local s${i}: *string = JSON.parse<string>(${bplString(json)});
          if (s${i} == nullptr) { return 1; }
          printf("%s\\n", *s${i}); JSON.free<string>(s${i});
        `).join("\n")}
        return 0;
      }`,
  }]);
}, 60000);

it("rejects invalid escapes and strings that cannot be represented", () => {
  const cases = [String.raw`"\x"`, String.raw`"\uZZZZ"`, String.raw`"\u12"`, String.raw`"\uD800"`, String.raw`"\uDC00"`, String.raw`"\uD800\u0041"`, String.raw`"\u0000tail"`, '"raw\nnewline"'];
  const source = `import [JSON] from "std/json.bpl"; extern printf(fmt: string, ...);
    frame main() ret int {
      ${cases.map((json, i) => `
        local s${i}: *string = JSON.parse<string>(${bplString(json)});
        if (s${i} != nullptr) { JSON.free<string>(s${i}); return 1; }
      `).join("\n")}
      printf("rejected all\\n"); return 0;
    }`;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.match(/JSON Parse Error:/g)?.length).toBe(cases.length);
    expect(result.stdout.endsWith("rejected all\n")).toBe(true);
  }
}, 60000);
