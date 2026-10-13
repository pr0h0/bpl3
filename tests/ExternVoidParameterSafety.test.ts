import { expect, test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";
import { Compiler } from "../compiler";

for (const source of [
  "extern bad(x:void);",
  "type Nothing=void; extern bad(x:Nothing);",
  "extern bad(f:Func<int>(void));",
  "extern bad(f:Func<void>(void));",
  "extern bad() ret Func<int>(void);",
  "type Callback<T>=Func<int>(T); extern bad(f:Callback<void>);",
  "extern bad(f:Func<int>(Func<int>(void)));",
]) {
  test(`rejects void values at C parameter boundaries: ${source}`, () => {
    expectCheckDiagnostics([
      { name: "void-parameter", source, code: "BPL_EXTERN_ABI_UNSUPPORTED" },
    ]);
  });
}

test("C export callbacks reject void parameters", () => {
  expectCheckDiagnostics([
    {
      name: "void-export-callback",
      source: "@[c_export] frame bad(f:Func<int>(void)) ret int {return 0;}",
      code: "BPL_C_EXPORT_UNSUPPORTED",
    },
  ]);
});

test("C boundaries preserve void results, empty parameter lists, and void pointers", () => {
  const result = new Compiler({ filePath: "void.bpl" }).compile(`
    extern noargs();
    extern callback(f:Func<void>());
    extern callback_arg(f:Func<void>(*void));
    extern factory() ret Func<void>();
    @[c_export] frame exported() {}
    @[c_export] frame invoke(f:Func<void>()) {f();}
  `);
  expect(result.success).toBe(true);
});
