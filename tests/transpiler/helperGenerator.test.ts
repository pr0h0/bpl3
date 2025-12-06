import { describe, expect, it } from "bun:test";

import HelperGenerator from "../../transpiler/HelperGenerator";
import Scope from "../../transpiler/Scope";

describe("HelperGenerator", () => {
  it("should generate base types", () => {
    const scope = new Scope();
    HelperGenerator.generateBaseTypes(scope);

    // Unsigned integers
    expect(scope.resolveType("u8")).not.toBeNull();
    expect(scope.resolveType("u8")?.size).toBe(1);
    expect(scope.resolveType("u16")).not.toBeNull();
    expect(scope.resolveType("u16")?.size).toBe(2);
    expect(scope.resolveType("u32")).not.toBeNull();
    expect(scope.resolveType("u32")?.size).toBe(4);
    expect(scope.resolveType("u64")).not.toBeNull();
    expect(scope.resolveType("u64")?.size).toBe(8);

    // Signed integers
    expect(scope.resolveType("i8")).not.toBeNull();
    expect(scope.resolveType("i8")?.size).toBe(1);
    expect(scope.resolveType("i16")).not.toBeNull();
    expect(scope.resolveType("i16")?.size).toBe(2);
    expect(scope.resolveType("i32")).not.toBeNull();
    expect(scope.resolveType("i32")?.size).toBe(4);
    expect(scope.resolveType("i64")).not.toBeNull();
    expect(scope.resolveType("i64")?.size).toBe(8);

    // Floating point
    expect(scope.resolveType("f32")).not.toBeNull();
    expect(scope.resolveType("f32")?.size).toBe(4);
    expect(scope.resolveType("f64")).not.toBeNull();
    expect(scope.resolveType("f64")?.size).toBe(8);
  });
});
