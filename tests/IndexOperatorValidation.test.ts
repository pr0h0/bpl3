import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, source, code] of [
  [
    "getter index range",
    `struct Box{frame __get__(this:*Box,index:u8)ret int{return cast<int>(index);}}
    frame main(){local box:Box=Box{};box[300];}`,
    "BPL_INTEGER_LITERAL_OVERFLOW",
  ],
  [
    "getter const slice borrow",
    `struct Box{frame __get__(this:*Box,index:int[])ret int{return index[0];}}
    frame main(){local box:Box=Box{};local const key:int[2]=[1,2];box[key];}`,
    "BPL_ADDRESS_OF_CONSTANT",
  ],
  [
    "getter owning receiver",
    `struct Box{value:int,frame __get__(this:Box,index:int)ret int{return this.value+index;}
    @[auto_destroy] frame destroy(this:*Box){this.value=0;}}
    frame main(){local box:Box=Box{value:7};box[0];}`,
    "BPL_OWNING_VALUE_COPIED",
  ],
  [
    "getter owning index",
    `struct Key{value:int,@[auto_destroy] frame destroy(this:*Key){this.value=0;}}
    struct Box{frame __get__(this:*Box,index:Key)ret int{return index.value;}}
    frame main(){local box:Box=Box{};local key:Key=Key{value:7};box[key];}`,
    "BPL_OWNING_VALUE_COPIED",
  ],
  [
    "setter owning index",
    `struct Key{value:int,@[auto_destroy] frame destroy(this:*Key){this.value=0;}}
    struct Box{frame __get__(this:*Box,index:*Key)ret int{return index.value;}
      frame __set__(this:*Box,index:Key,value:int){index;value;}}
    frame main(){local box:Box=Box{};local key:Key=Key{value:7};box[key]=1;}`,
    "BPL_OWNING_VALUE_COPIED",
  ],
] as const) {
  test(`index operators reject ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "index-validation.bpl").parse());
    expect(checker.getErrors().some((error) => error.code === code)).toBe(true);
  });
}

test("getter validation retains mutable array views and in-range keys", () => {
  const source = `struct Box{value:int,
    frame __get__(this:*Box,index:int[])ret int{index[0]=index[0]+1;return this.value+index[0];}}
    struct Small{frame __get__(this:*Small,index:u8)ret int{return cast<int>(index);}}
    frame main()ret int{local box:Box=Box{value:3};local key:int[2]=[3,0];
      local result:int=box[key];local small:Small=Small{};
      if(result!=7 || key[0]!=4 || small[200]!=200)return 1;return 0;}`;
  expectCorrectnessSuite([
    { name: "getter-validation-controls", source, validateLlvm: true },
  ]);
}, 60000);

test("setter validation uses the invoked signature rather than getter call rules", () => {
  const source = `struct Key{value:int,@[auto_destroy] frame destroy(this:*Key){this.value=0;}}
    struct Box{frame __get__(this:*Box,index:Key)ret int{return index.value;}
      frame __set__(this:*Box,index:*Key,value:int){index.value=value;}}
    struct Wide{value:int,frame __get__(this:*Wide,index:u8)ret int{return cast<int>(index);}
      frame __set__(this:*Wide,index:long,value:int){this.value=cast<int>(index)+value;}}
    frame main()ret int{local box:Box=Box{};local key:Key=Key{value:0};box[key]=7;
      local wide:Wide=Wide{value:0};wide[300]=7;
      if(key.value!=7 || wide.value!=307)return 1;return 0;}`;
  expectCorrectnessSuite([
    { name: "setter-signature-controls", source, validateLlvm: true },
  ]);
}, 60000);
