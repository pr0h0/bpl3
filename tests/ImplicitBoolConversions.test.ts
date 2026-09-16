import { test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-CONV-1, R-CONV-2
test("integer values cannot implicitly become booleans", () => {
  const cases: [string, string][] = [
    ...["0", "1", "2", "-1"].map((value): [string, string] => [
      `literal-${value.replace("-", "minus")}`,
      `frame main() {local b:bool=${value};if(b)return;}`,
    ]),
    ["variable", "frame main() {local n:int=2;local b:bool=n;if(b)return;}"],
    [
      "alias",
      "type Flag=bool;type Byte=u8;frame main() {local n:Byte=2;local b:Flag=n;if(b)return;}",
    ],
    ["global", "global flag:bool=0;frame main() {if(flag)return;}"],
    ["assignment", "frame main() {local b:bool=false;b=0;if(b)return;}"],
    [
      "return",
      "frame value() ret bool {return 1;}frame main() {if(value())return;}",
    ],
    ["argument", "frame take(b:bool) {if(b)return;}frame main() {take(1);}"],
    [
      "unsigned-argument",
      "frame take(b:bool) {if(b)return;}frame main() {local n:u8=1;take(n);}",
    ],
    [
      "indirect",
      "frame take(b:bool) {if(b)return;}frame main() {local f:Func<void>(bool)=take;f(1);}",
    ],
    [
      "struct",
      "struct S {b:bool}frame main() {local s:S=S{b:0};if(s.b)return;}",
    ],
    [
      "enum",
      "enum E {Value(bool)}frame main() {local e:E=E.Value(1);match(e){E.Value(v)=>{if(v)return;}}}",
    ],
    [
      "array",
      "frame main() {local flags:bool[2]=[true,1];if(flags[0])return;}",
    ],
    ["tuple", "frame main() {local t:(bool,int)=(1,2);if(t.0)return;}"],
    [
      "destructure",
      "frame main() {local (b:bool,n:int)=(1,2);if(b && n>0)return;}",
    ],
    ["ternary", "frame main() {local b:bool=true ? true : 2;if(b)return;}"],
    ["comparison", "frame main() {if(true==2)return;}"],
    ["arithmetic", "frame main() {local b:bool=true+2;if(b)return;}"],
    ["bitwise", "frame main() {local b:bool=true|2;if(b)return;}"],
    ["compound", "frame main() {local b:bool=true;b|=2;if(b)return;}"],
  ];
  const codes: Record<string, string> = {
    assignment: "BPL_ASSIGNMENT_TYPE_MISMATCH",
    return: "BPL_RETURN_TYPE_MISMATCH",
    argument: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
    "unsigned-argument": "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
    indirect: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
    struct: "BPL_STRUCT_LITERAL_FIELD_TYPE_MISMATCH",
    enum: "BPL_ENUM_VARIANT_ARGUMENT_TYPE_MISMATCH",
    array: "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
    ternary: "BPL_TERNARY_BRANCH_TYPE_MISMATCH",
    comparison: "BPL_COMPARISON_TYPE_MISMATCH",
    arithmetic: "BPL_BINARY_OPERAND_TYPE_MISMATCH",
    bitwise: "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
    compound: "BPL_BITWISE_OPERAND_TYPE_MISMATCH",
  };
  expectCheckDiagnostics(
    cases.map(([name, source]) => ({
      name: `bool-${name}`,
      source,
      code: codes[name] ?? "E001",
    })),
  );
});

// spec: R-CONV-1, R-CONV-2, R-CONV-10
test("explicit bool casts, comparisons, and bool-to-integer conversions remain valid at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "explicit-bool-conversions",
      validateLlvm: true,
      expectedStdout: "",
      source: `type Flag=bool;
frame take(b:Flag) ret bool {return b;}
frame main() ret int {
 local two:int=2;local three:int=3;
 if(take(cast<bool>(two)))return 1;
 if(!take(three as bool))return 2;
 if(!take(two!=0))return 3;
 local n:int=true;if(n!=1)return 4;
 local bits:bool=true+false;if(!bits)return 5;
 local value:int=2+true;if(value!=3)return 6;
 return 0;
}`,
    },
  ]);
}, 60000);
