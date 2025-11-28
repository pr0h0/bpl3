import { describe, it, expect } from "bun:test";
import AsmGenerator from "../../transpiler/AsmGenerator";
import HelperGenerator from "../../transpiler/HelperGenerator";
import Scope from "../../transpiler/Scope";

describe("HelperGenerator", () => {
  it("should generate print function", () => {
    const gen = new AsmGenerator(0);
    const scope = new Scope();
    HelperGenerator.generatePrintFunction(gen, scope);
    const asm = gen.build();

    expect(asm).toContain("print:");
    expect(asm).toContain("call str_len");
    expect(asm).toContain("syscall");
    expect(scope.resolveFunction("print")).not.toBeNull();
  });

  it("should generate exit function", () => {
    const gen = new AsmGenerator(0);
    const scope = new Scope();
    HelperGenerator.generateExitFunction(gen, scope);
    const asm = gen.build();

    expect(asm).toContain("exit:");
    expect(asm).toContain("mov rax, 60");
    expect(asm).toContain("syscall");
    expect(scope.resolveFunction("exit")).not.toBeNull();
  });

  it("should generate string length function", () => {
    const gen = new AsmGenerator(0);
    const scope = new Scope();
    HelperGenerator.generateGetStringLengthFunction(gen, scope);
    const asm = gen.build();

    expect(asm).toContain("str_len:");
    expect(asm).toContain("cmp byte [rdi + rcx], 0");
    expect(scope.resolveFunction("str_len")).not.toBeNull();
  });
});
