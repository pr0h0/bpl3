import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("tuple members support indexing, assignment and addresses at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "tuple-member-addresses",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      type Pair=(int[2],int);
      struct Box { pair:Pair, }
      frame read(pair:Pair)ret int{return pair.0[0]+pair.1;}
      frame change(pair:(int,int))ret int{pair.0=9;return pair.0;}
      frame main()ret int{
        local pair:Pair=([1,2],3);
        pair.0[0]=7;
        local scalar:*int=&pair.1;
        *scalar=5;
        local nested:((int,int),int)=((1,2),3);
        nested.0.1=8;
        local box:Box=Box{pair:([10,11],12)};
        box.pair.0[1]=13;
        local values:int[2]=[20,21];
        local borrowed:int[]=values;
        local sliced:(int[],int)=(borrowed,22);
        sliced.0[1]=23;
        local original:(int,int)=(1,2);
        local changed:int=change(original);
        printf("%d %d %d %d %d %d %d\\n",read(pair),(pair).0[1],nested.0.1,box.pair.0[1],values[1],changed,original.0);
        return 0;
      }`,
      expectedStdout: "12 2 8 13 23 9 1\n",
    },
  ]);
}, 60000);

for (const statement of ["pair.0=3;", "pair.0[0]=3;"]) {
  test(`tuple address support retains const assignment checks: ${statement}`, () => {
    const type = statement.includes("[") ? "(int[2],int)" : "(int,int)";
    const value = statement.includes("[") ? "([1,2],3)" : "(1,2)";
    const source = `frame main(){local const pair:${type}=${value};${statement}}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "const-tuple.bpl").parse());
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_ASSIGNMENT_TARGET_CONSTANT"),
    ).toBe(true);
  });
}

test("returned tuple array members are materialized once before indexing at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "returned-tuple-member-addresses",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      global calls:int=0;
      frame make()ret (int[2],int){calls=calls+1;return ([1,2],3);}
      frame main()ret int{
        local first:int=make().0[1];
        local second:int=((make())).0[0];
        printf("%d %d %d\\n",first,second,calls);
        return 0;
      }`,
      expectedStdout: "2 1 2\n",
    },
  ]);
}, 60000);
