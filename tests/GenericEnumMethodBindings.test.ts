import { expect, test } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const receiver of ["*Box<T>", "Box<T>"] as const) {
  for (const prefix of ["", "type T=string;"] as const) {
    test(`generic enum bindings keep their actual owner: ${receiver} ${prefix}`, () => {
      const source = `${prefix}enum Box<T>{Value(T),frame read(this:${receiver},value:T)ret T{return value;}}
    frame main()ret int{local box:Box<int>=Box<int>.Value(0);
     local read:Lambda<int>(int)=box.read;return read(7)-7;}`;
      const program = new Parser(source, "enum-binding.bpl").parse();
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(program);
      expect(checker.getErrors()).toEqual([]);
      const ir = new CodeGenerator().generate(program);
      // Reject another specialization before attempting native execution.
      expect(ir).not.toContain("Box_i8_ptr");
      expect(ir).not.toContain("Box_T");
      expectCorrectnessSuite([
        { name: "enum-method-binding", source, validateLlvm: true },
      ]);
    }, 60000);
  }
}

test("nongeneric enum bindings retain their signature", () => {
  expectCorrectnessSuite([
    {
      name: "simple-enum-binding",
      validateLlvm: true,
      source: `enum Simple{Value,frame read(this:*Simple,value:int)ret int{return value;}}
   frame main()ret int{local value:Simple=Simple.Value;
    local read:Lambda<int>(int)=value.read;return read(7)-7;}`,
    },
  ]);
}, 60000);

for (const [name, source] of [
  [
    "floating owner",
    `type T=string;enum Box<T>{Value(T),frame read(this:*Box<T>,value:T)ret T{return value;}}
   frame main()ret int{local box:Box<float>=Box<float>.Value(0.0);
    local read:Lambda<float>(float)=box.read;if(read(7.25)!=7.25)return 1;return 0;}`,
  ],
  [
    "generic value binding factory",
    `type T=string;enum Box<T>{Value(T),frame read(this:Box<T>,value:T)ret T{return value;}}
   frame bind<A>(box:*Box<A>)ret Lambda<A>(A){return box.read;}
   frame main()ret int{local box:Box<int>=Box<int>.Value(0);
    local read:Lambda<int>(int)=bind<int>(&box);return read(7)-7;}`,
  ],
] as const) {
  test(`enum binding substitutes ${name} arguments`, () => {
    const program = new Parser(source, "enum-owner-arguments.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    expect(ir).not.toContain("Box_i8_ptr");
    expect(ir).not.toContain("Box_T");
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}
