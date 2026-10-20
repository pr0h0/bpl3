import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { formatDiagnosticType } from "../compiler/middleend/DiagnosticTypeFormatter";
import { TypeUtils } from "../compiler/middleend/TypeUtils";
import { RTTI } from "../compiler/middleend/RTTI";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(new Parser(source, "diagnostic-types.bpl").parse());
  return checker.getErrors();
}

test("assignment diagnostics name bool and string using language spellings", () => {
  const found = errors('frame main(){local flag:bool=false;flag="hello";}');
  const mismatch = found.find(
    (error) => error.code === "BPL_ASSIGNMENT_TYPE_MISMATCH",
  );
  expect(mismatch?.message).toContain("cannot assign string to bool");
});

test("call diagnostics and available signatures name bool and string", () => {
  const found = errors('frame take(flag:bool){} frame main(){take("hello");}');
  const text = found
    .map((error) => error.message + "\n" + error.hint)
    .join("\n");
  expect(text).toContain("Func<void>(bool)");
  expect(text).not.toContain("i1");
});

test("return diagnostics name strings and boolean values", () => {
  const found = errors('frame get()ret bool{return "hello";}');
  const mismatch = found.find(
    (error) => error.code === "BPL_RETURN_TYPE_MISMATCH",
  );
  expect(mismatch?.message).toContain("expected bool, got string");
});

function typeNode(source: string) {
  const declaration = new Parser(
    `type Value=${source};`,
    "type-display.bpl",
  ).parse().statements[0];
  if (declaration?.kind !== "TypeAlias") throw new Error("Expected type alias");
  return declaration.type;
}
for (const [source, expected] of [
  ["i1", "bool"],
  ["*i8", "string"],
  ["**i8", "*string"],
  ["*i16", "*i16"],
  ["Box<i1,*i8>[2]", "Box<bool, string>[2]"],
  ["const Func<i1>(*i8)[2]", "const Func<bool>(string)[2]"],
  ["Lambda<*i8>(i1)[]", "Lambda<string>(bool)[]"],
  ["const (i1,*i8)[3]", "const (bool, string)[3]"],
] as const) {
  test(`diagnostic spelling retains compound structure: ${source}`, () => {
    const node = typeNode(source);
    const before = JSON.stringify(node);
    expect(formatDiagnosticType(node)).toBe(expected);
    expect(JSON.stringify(node)).toBe(before);
  });
}

test("canonical identity strings and bool/string runtime IDs stay unchanged", () => {
  const boolean = typeNode("i1");
  const string = typeNode("*i8");
  expect(TypeUtils.typeToString(boolean)).toBe("i1");
  expect(TypeUtils.typeToString(string)).toBe("*i8");
  expect(RTTI.getTypeId(typeNode("bool"))).toBe(RTTI.getTypeIdFromName("i1"));
  expect(RTTI.getTypeId(typeNode("string"))).toBe(
    RTTI.getTypeIdFromName("*i8"),
  );
  expect(new TypeChecker().typeToString(boolean)).toBe("i1");
});
