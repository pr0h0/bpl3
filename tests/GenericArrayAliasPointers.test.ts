import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("generic array aliases preserve element types through pointers and generic forwarding", () => {
  expectCorrectnessSuite([
    {
      name: "generic-array-alias-pointers",
      validateLlvm: true,
      source: `extern printf(fmt:string,...) ret int;
      type Pair<T> = T[2];type Grid<T> = T[2][3];
      type Chain<U> = Pair<U>;
      frame second<T>(items:*Pair<T>) ret T {return items[1];}
      frame forwarded<U>(items:*Chain<U>) ret U {return second<U>(items);}
      frame main() ret int {
        local values:Pair<int>=[11,22];local p:*Pair<int>=&values;
        if(p[1]!=22) {return 1;}p[0]=7;
        if(values[0]!=7 || second<int>(p)!=22 || forwarded<int>(p)!=22) {return 2;}
        local floats:Chain<float>=[1.5,2.5];local fp:*Chain<float>=&floats;
        if(fp[1]!=2.5 || forwarded<float>(fp)!=2.5) {return 3;}
        local bytes:Pair<uchar>=[cast<uchar>(1),cast<uchar>(255)];
        if(second<uchar>(&bytes)!=cast<uchar>(255)) {return 4;}
        local x:int=9;local y:int=10;
        local pointers:Pair<*int>=[&x,&y];local pointerPair:*Pair<*int>=&pointers;
        local selected:*int=second<*int>(pointerPair);
        if(selected!=&y || *selected!=10 || pointerPair[0]!=&x) {return 5;}
        local grid:Grid<int>=[[1,2,3],[4,5,6]];local gp:*Grid<int>=&grid;
        if(gp[1][2]!=6) {return 7;}
        printf("generic alias pointers passed\\n");return 0;
      }`,
      expectedStdout: "generic alias pointers passed\n",
    },
  ]);
}, 60000);

test("JSON parses and frees generic array aliases at roots and in fields", () => {
  expectCorrectnessSuite([
    {
      name: "json-generic-array-aliases",
      validateLlvm: true,
      source: `import [JSON] from "std/json.bpl";import [String] from "std/string.bpl";
      import printf from "std/c.bpl";
      type Pair<T> = T[2];type Chain<U> = Pair<U>;
      struct Record<T> {values:Pair<T>,optional:*Chain<int>}
      frame main() ret int {
        local p:*Pair<int>=JSON.parse<Pair<int>>("[1,2]");
        if(p==nullptr || p[1]!=2) {return 1;}
        local text:String=JSON.stringify<Pair<int>>(p);printf("%s\\n",text.toString());text.destroy();JSON.free<Pair<int>>(p);
        local invalid:*Pair<int>=JSON.parse<Pair<int>>("[1,2,3]");
        if(invalid!=nullptr) {return 4;}
        local shortPair:*Pair<int>=JSON.parse<Pair<int>>("[9]");
        if(shortPair==nullptr || shortPair[1]!=0) {return 5;}JSON.free<Pair<int>>(shortPair);
        local f:*Chain<float>=JSON.parse<Chain<float>>("[1.5,2.5]");
        if(f==nullptr || f[1]!=2.5) {return 2;}
        text=JSON.stringify<Chain<float>>(f);printf("%s\\n",text.toString());text.destroy();JSON.free<Chain<float>>(f);
        local r:*Record<ushort>=JSON.parse<Record<ushort>>("{\\"values\\":[1,65535],\\"optional\\":[3,4]}");
        if(r==nullptr || r.values[1]!=cast<ushort>(65535) || r.optional==nullptr || r.optional[1]!=4) {return 3;}
        text=JSON.stringify<Record<ushort>>(r);printf("%s\\n",text.toString());text.destroy();JSON.free<Record<ushort>>(r);
        return 0;
      }`,
      expectedStdout:
        '[1, 2]\nJSON Parse Error: Too many fixed-array elements at line 1, column 6\n[1.5, 2.5]\n{"values": [1, 65535], "optional": [3, 4]}\n',
    },
  ]);
}, 60000);
