import { expect, test } from "bun:test";
import {
  expectCorrectnessSuite,
  runBplAtOptimization,
} from "./helpers/compilerCorrectness";

const declarations = `
  import [JSON], [JsonParseResult] from "std/json.bpl";
  extern printf(fmt: string, ...);
  global rootCalls: int = 0;
  global childCalls: int = 0;
  struct Child {
    value: int,
    frame fromJson(_json: string, _dest: *Child) ret JsonParseResult {
      childCalls = childCalls + 1;
      # Keep a regression bounded if fallback ever re-enters this hook.
      if (childCalls > 2) { return JsonParseResult.Success; }
      return JsonParseResult.Default;
    }
  }
  struct Item {
    value: int, child: Child, sibling: Child,
    frame fromJson(_json: string, _dest: *Item) ret JsonParseResult {
      rootCalls = rootCalls + 1;
      if (rootCalls > 1) { return JsonParseResult.Success; }
      return JsonParseResult.Default;
    }
  }
`;

test("JSON Default parsing invokes each root and nested hook once", () => {
  expectCorrectnessSuite([
    {
      name: "JSON custom parser default fallback",
      validateLlvm: true,
      expectedStdout: "1 2 42 11 12\n",
      source:
        declarations +
        `
      frame main() ret int {
        local item: *Item = JSON.parse<Item>(${JSON.stringify('{"value":42,"child":{"value":11},"sibling":{"value":12}}')});
        if (item == nullptr) { return 1; }
        printf("%d %d %d %d %d\\n", rootCalls, childCalls, item.value, item.child.value, item.sibling.value);
        JSON.free<Item>(item);
        return 0;
      }
    `,
    },
  ]);
}, 60000);

test("JSON Default parsing propagates nested errors", () => {
  const source =
    declarations +
    `
    frame main() ret int {
      local item: *Item = JSON.parse<Item>(${JSON.stringify('{"value":42,"child":{"value":"bad"}}')});
      if (item != nullptr) { JSON.free<Item>(item); return 1; }
      printf("%d %d\\n", rootCalls, childCalls);
      return 0;
    }
  `;
  for (const opt of [0, 3] as const) {
    const result = runBplAtOptimization(source, opt);
    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("JSON Parse Error:");
    expect(result.stdout.endsWith("1 1\n")).toBe(true);
  }
}, 60000);

test("JSON custom Success and Ignore results keep their semantics", () => {
  expectCorrectnessSuite([
    {
      name: "JSON custom parser handled results",
      validateLlvm: true,
      expectedStdout: "99 0\n",
      source: `
      import [JSON], [JsonParseResult] from "std/json.bpl";
      extern printf(fmt: string, ...);
      struct Custom {
        value: int,
        frame fromJson(_json: string, dest: *Custom) ret JsonParseResult {
          dest.value = 99;
          return JsonParseResult.Success;
        }
      }
      struct Ignored {
        value: int,
        frame fromJson(_json: string, _dest: *Ignored) ret JsonParseResult {
          return JsonParseResult.Ignore;
        }
      }
      struct Wrapper { custom: Custom, ignored: Ignored }
      frame main() ret int {
        local item: *Wrapper = JSON.parse<Wrapper>(${JSON.stringify('{"custom":1,"ignored":2}')});
        if (item == nullptr) { return 1; }
        printf("%d %d\\n", item.custom.value, item.ignored.value);
        JSON.free<Wrapper>(item);
        return 0;
      }
    `,
    },
  ]);
}, 60000);
