import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

test("indexing array-alias pointers consumes one outer pointer level at a time", () => {
  expectCorrectnessSuite([
    {
      name: "array-alias-pointer-levels",
      validateLlvm: true,
      source: `extern printf(fmt:string,...) ret int;
      type Pair<T>=T[2];type Fixed=int[2];
      frame read<T>(items:**Pair<T>) ret T {local p:*Pair<T>=items[0];return p[1];}
      frame main() ret int {
        local values:Pair<int>=[11,22];local p:*Pair<int>=&values;
        local pp:**Pair<int>=&p;local indirect:*Pair<int>=pp[0];
        if(indirect[1]!=22 || read<int>(pp)!=22) {return 1;}
        local ppp:***Pair<int>=&pp;
        if(ppp[0][0][1]!=22) {return 2;}ppp[0][0][1]=33;
        if(values[1]!=33) {return 3;}
        local fixed:Fixed=[4,5];local fp:*Fixed=&fixed;local fpp:**Fixed=&fp;
        if(fpp[0][1]!=5) {return 4;}
        local x:int=6;local y:int=7;local pointers:Pair<*int>=[&x,&y];
        local pair:*Pair<*int>=&pointers;local pairptr:**Pair<*int>=&pair;
        local selected:*int=pairptr[0][1];if(selected!=&y || *selected!=7) {return 5;}
        printf("array alias pointer levels passed\\n");return 0;
      }`,
      expectedStdout: "array alias pointer levels passed\n",
    },
  ]);
}, 60000);

test("array-alias pointer chains retain null and inner-array bounds checks", () => {
  expectRuntimeFailureSuite([
    {
      name: "null outer alias pointer",
      expectedMessage: "NULL POINTER ACCESS",
      source: `type Pair<T>=T[2]; frame main() ret int {
        local pp:**Pair<int>=nullptr;return pp[0][1];
      }`,
    },
    {
      name: "null inner alias pointer",
      expectedMessage: "NULL POINTER ACCESS",
      source: `type Pair<T>=T[2]; frame main() ret int {
        local p:*Pair<int>=nullptr;local pp:**Pair<int>=&p;return pp[0][1];
      }`,
    },
    {
      name: "inner array alias bounds",
      expectedMessage: "INDEX OUT OF BOUNDS",
      source: `type Pair<T>=T[2]; frame main() ret int {
        local values:Pair<int>=[1,2];local p:*Pair<int>=&values;
        local pp:**Pair<int>=&p;return pp[0][2];
      }`,
    },
  ]);
}, 60000);
