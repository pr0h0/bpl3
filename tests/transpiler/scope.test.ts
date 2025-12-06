import { describe, expect, it } from "bun:test";

import Scope from "../../transpiler/Scope";

describe("Scope", () => {
  it("should define and retrieve variables", () => {
    const scope = new Scope();
    scope.define("x", {
      type: "local",
      offset: "8",
      varType: { name: "u64", isPointer: 0, isArray: [] },
    });

    const variable = scope.resolve("x");
    expect(variable).not.toBeNull();
    expect(variable?.offset).toBe("8");
  });

  it("should handle nested scopes", () => {
    const parent = new Scope();
    parent.define("x", {
      type: "local",
      offset: "8",
      varType: { name: "u64", isPointer: 0, isArray: [] },
    });

    const child = new Scope(parent);
    const variable = child.resolve("x");
    expect(variable).not.toBeNull();
    expect(variable?.offset).toBe("8");
  });

  it("should shadow variables in nested scope", () => {
    const parent = new Scope();
    parent.define("x", {
      type: "local",
      offset: "8",
      varType: { name: "u64", isPointer: 0, isArray: [] },
    });

    const child = new Scope(parent);
    child.define("x", {
      type: "local",
      offset: "16",
      varType: { name: "u8", isPointer: 0, isArray: [] },
    });

    const variable = child.resolve("x");
    expect(variable?.offset).toBe("16");
    expect(variable?.varType.name).toBe("u8");
  });
});
