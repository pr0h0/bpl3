import { expect, test } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, getterIndex, setter, statement, code] of [
  [
    "index mismatch",
    "string",
    "frame __set__(this:*Box,index:int,value:int){index;this.value=value;}",
    `box["key"]=1;`,
    "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
  ],
  [
    "value mismatch",
    "int",
    "frame __set__(this:*Box,index:int,value:string){index;value;this.value=0;}",
    "box[0]=1;",
    "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
  ],
  ["missing setter", "int", "", "box[0]=1;", "BPL_CALL_ARGUMENT_TYPE_MISMATCH"],
  [
    "wrong arity",
    "int",
    "frame __set__(this:*Box,index:int){this.value=index;}",
    "box[0]=1;",
    "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
  ],
  [
    "static setter",
    "int",
    "frame __set__(index:int,value:int){index;value;}",
    "box[0]=1;",
    "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
  ],
  [
    "compound setter",
    "int",
    "frame __set__(this:*Box,index:int,value:int){this.value=index+value;}",
    "box[0]+=1;",
    "BPL_ASSIGNMENT_TARGET_INVALID",
  ],
  [
    "incompatible result",
    "int",
    `frame __set__(this:*Box,index:int,value:int)ret string{this.value=index+value;return "bad";}`,
    "local result:int=0;result=(box[0]=1);result;",
    "BPL_ASSIGNMENT_TYPE_MISMATCH",
  ],
] as const) {
  test(`index setter rejects ${name} during checking`, () => {
    const source = `struct Box{value:int,frame __get__(this:*Box,index:${getterIndex})ret int{index;return this.value;}${setter}}frame main(){local box:Box=Box{value:0};${statement}}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "setter-check.bpl").parse());
    expect(checker.getErrors().some((error) => error.code === code)).toBe(true);
  });
}

for (const [name, source, pattern] of [
  [
    "wide integer parameters",
    `struct Box{value:int,
 frame __get__(this:*Box,index:int)ret int{return this.value+index;}
 frame __set__(this:*Box,index:long,value:long){this.value=cast<int>(index+value);}}
 frame main()ret int{local box:Box=Box{value:0};local value:int=(box[-1]=7);if(box.value!=6 || value!=7)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\([^\n]*i64[^\n]*i64/,
  ],
  [
    "explicit floating value control",
    `struct Box{value:float,
 frame __get__(this:*Box,index:int)ret float{index;return this.value;}
 frame __set__(this:*Box,index:int,value:float){this.value=value+cast<float>(index);}}
 frame main()ret int{local box:Box=Box{value:0.0};local value:float=(box[1]=7.0);if(box.value!=8.0 || value!=7.0)return 1;return 0;}`,
    /call void @Box___set__[^\n]*double/,
  ],
  [
    "value receiver",
    `global observed:int=0;struct Box{value:int,
 frame __get__(this:Box,index:int)ret int{return this.value+index;}
 frame __set__(this:Box,index:int,value:int){observed=this.value+index+value;this.value=99;}}
 frame main()ret int{local box:Box=Box{value:1};box[0]=7;if(observed!=8 || box.value!=1)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\(%struct\.Box /,
  ],
] as const) {
  test(`checked index setter converts ${name}`, () => {
    const program = new Parser(source, "setter-abi.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    expect(pattern.test(ir)).toBe(true);
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}

test("nonvoid setter retains its checked assignment result", () => {
  expectCorrectnessSuite([
    {
      name: "nonvoid-setter-result",
      validateLlvm: true,
      source: `struct Box{value:int,frame __get__(this:*Box,index:int)ret int{return this.value+index;}
   frame __set__(this:*Box,index:int,value:int)ret int{this.value=value+index;return 99;}}
   frame main()ret int{local box:Box=Box{value:0};local result:int=(box[0]=7);if(box.value!=7 || result!=99)return 1;return 0;}`,
    },
  ]);
}, 60000);

for (const [name, source, pattern] of [
  [
    "selected overload",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int{return this.value+index;}
  frame __set__(this:*Box,index:string,value:int){index;value;this.value=99;}
  frame __set__(this:*Box,index:int,value:int){this.value=index+value;}}
  frame main()ret int{local box:Box=Box{value:0};box[0]=7;return box.value-7;}`,
    /call void @Box___set___Box_ptr_i32_i32/,
  ],
  [
    "generic setter",
    `struct Box<T>{value:T,
  frame __get__(this:*Box<T>,index:int)ret T{index;return this.value;}
  frame __set__(this:*Box<T>,index:int,value:T){index;this.value=value;}}
  frame main()ret int{local box:Box<int>=Box<int>{value:0};box[0]=7;return box.value-7;}`,
    /call void @Box_[^\s(]+___set__/,
  ],
  [
    "borrowed scalar arguments",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int{return this.value+index;}
  frame __set__(this:*Box,index:*int,value:*int){*index=4;*value=8;this.value=*index+*value;}}
  frame main()ret int{local box:Box=Box{value:0};local key:int=3;local input:int=7;
  local result:int=(box[key]=input);if(box.value!=12 || key!=4 || input!=8 || result!=7)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\([^\n]*i32\*[^\n]*i32\*/,
  ],
  [
    "borrowed array argument",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int[2]{index;this;return [0,0];}
  frame __set__(this:*Box,index:int,value:int[]){value[0]=9;this.value=value[1]+index;}}
  frame main()ret int{local box:Box=Box{value:0};local input:int[2]=[1,2];
  local result:int[2]=(box[0]=input);if(input[0]!=9 || result[0]!=1 || box.value!=2)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\([^\n]*\{ i32\*, i64 \}/,
  ],
] as const) {
  test(`checked setter preserves ${name}`, () => {
    const program = new Parser(source, "setter-conversions.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    expect(pattern.test(ir)).toBe(true);
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}

for (const [name, source] of [
  [
    "constant scalar",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int{return this.value+index;}
  frame __set__(this:*Box,index:int,value:*int){this.value=index+*value;}}
  frame main(){local box:Box=Box{value:0};local const input:int=7;box[0]=input;}`,
  ],
  [
    "constant array",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int[2]{index;this;return [0,0];}
  frame __set__(this:*Box,index:int,value:int[]){this.value=value[0]+index;}}
  frame main(){local box:Box=Box{value:0};local const input:int[2]=[1,2];box[0]=input;}`,
  ],
] as const) {
  test(`checked setter cannot borrow ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "setter-const.bpl").parse());
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT"),
    ).toBe(true);
  });
}

test("nonvoid setter exposes its declared result type to callers", () => {
  expectCorrectnessSuite([
    {
      name: "declared-setter-result-type",
      validateLlvm: true,
      source: `struct Box{value:int,
    frame __get__(this:*Box,index:int)ret int{return this.value+index;}
    frame __set__(this:*Box,index:int,value:int)ret string{this.value=value+index;return "ok";}}
    frame main()ret int{local box:Box=Box{value:0};local result:string=(box[0]=7);
    if(result[0]!='o' || box.value!=7)return 1;return 0;}`,
    },
  ]);
}, 60000);

test("operator implicit addresses cannot reinterpret a different numeric pointee", () => {
  const source = `struct Box{value:int,
  frame __add__(this:*Box,other:*long)ret long{return cast<long>(this.value)+*other;}}
  frame main(){local box:Box=Box{value:3};local input:int=2;box+input;}`;
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(new Parser(source, "operator-address-type.bpl").parse());
  expect(checker.getErrors().length).toBeGreaterThan(0);
});

test("operator implicit addresses preserve matching mutable pointees", () => {
  expectCorrectnessSuite([
    {
      name: "operator-matching-address-argument",
      validateLlvm: true,
      source: `struct Box{value:int,
    frame __add__(this:*Box,other:*int)ret int{*other+=this.value;return *other;}}
    frame main()ret int{local box:Box=Box{value:3};local input:int=2;
    local result:int=box+input;if(result!=5 || input!=5)return 1;return 0;}`,
    },
  ]);
}, 60000);

for (const [name, indexType, valueType, statement] of [
  ["index", "u8", "int", "box[300]=1;"],
  ["value", "int", "u8", "box[0]=300;"],
] as const) {
  test(`checked setter rejects out-of-range ${name} literals`, () => {
    const source = `struct Box{value:int,
    frame __get__(this:*Box,index:int)ret int{return this.value+index;}
    frame __set__(this:*Box,index:${indexType},value:${valueType}){index;value;this.value=0;}}
    frame main(){local box:Box=Box{value:0};${statement}}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "setter-range.bpl").parse());
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_INTEGER_LITERAL_OVERFLOW"),
    ).toBe(true);
  });
}

for (const [name, source, pattern] of [
  [
    "temporary scalar pointer",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int{return this.value+index;}
  frame __set__(this:*Box,index:int,value:*int){this.value=index+*value;*value=8;}}
  frame main()ret int{local box:Box=Box{value:0};local result:int=(box[0]=7);if(box.value!=7 || result!=7)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\([^\n]*i32\*/,
  ],
  [
    "array pointer view",
    `struct Box{value:int,
  frame __get__(this:*Box,index:int)ret int[2]{index;this;return [0,0];}
  frame __set__(this:*Box,index:int,value:*int){value[0]=9;this.value=value[1]+index;}}
  frame main()ret int{local box:Box=Box{value:0};local input:int[2]=[1,2];local result:int[2]=(box[0]=input);
  if(input[0]!=9 || result[0]!=1 || box.value!=2)return 1;return 0;}`,
    /call void @Box___set__[^\n]*\([^\n]*i32\*/,
  ],
] as const) {
  test(`checked setter preserves ${name}`, () => {
    const program = new Parser(source, "setter-pointer-args.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    expect(pattern.test(ir)).toBe(true);
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}
