import { expect, test } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, source, call] of [
  [
    "wide index",
    `struct Box{value:int,frame __get__(this:*Box,index:long)ret int{return this.value+cast<int>(index);}}
    frame main()ret int{local box:Box=Box{value:8};return box[-1]-7;}`,
    /call i32 @Box___get___Box_ptr_i64\(%struct\.Box\* [^,]+, i64 /,
  ],
  [
    "value receiver",
    `struct Box{value:int,frame __get__(this:Box,index:int)ret int{this.value=this.value+index;return this.value;}}
    frame main()ret int{local box:Box=Box{value:6};local result:int=box[1];if(box.value!=6)return 1;return result-7;}`,
    /call i32 @Box___get___Box_i32\(%struct\.Box [^,]+, i32 /,
  ],
  [
    "borrowed index",
    `struct Box{value:int,frame __get__(this:*Box,index:*int)ret int{*index=*index+1;return this.value+*index;}}
    frame main()ret int{local box:Box=Box{value:3};local key:int=3;local result:int=box[key];if(key!=4)return 1;return result-7;}`,
    /call i32 @Box___get___Box_ptr_i32_ptr\(%struct\.Box\* [^,]+, i32\* /,
  ],
  [
    "generic caller",
    `struct Box<T>{value:T,frame __get__(this:*Box<T>,index:int)ret T{index;return this.value;}}
    frame read<T>(box:*Box<T>)ret T{return (*box)[0];}
    frame main()ret int{local box:Box<int>=Box<int>{value:7};return read<int>(&box)-7;}`,
    /call i32 @Box_i32___get___Box_i32_ptr_i32\(/,
  ],
] as const) {
  test(`index getters lower their checked ${name} ABI`, () => {
    const program = new Parser(source, "getter-arguments.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    // Check call types before attempting native execution of this regression.
    const calls = ir
      .split("\n")
      .filter((line) => /call .*@Box[^\s(]*___get__/.test(line));
    expect(calls.length).toBeGreaterThan(0);
    for (const line of calls) expect(call.test(line)).toBe(true);
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}
