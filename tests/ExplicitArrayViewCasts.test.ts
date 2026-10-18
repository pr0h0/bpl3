import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("explicit fixed-array views use checked types and remain usable within the frame", () => {
  expectCorrectnessSuite([
    {
      name: "explicit-array-view-casts",
      validateLlvm: true,
      source: `import printf from "std/c.bpl";
      type View=int[];
      type Fixed=int[2];
      frame read(v:int[])ret int{return v[0]+v[1];}
      frame consume()ret int{return read(cast<int[]>([7,8]));}
      frame borrow(v:int[])ret int[]{return cast<int[]>(v);}
      frame ptr(v:*int)ret *int{return cast<*int>(v);}
      frame main()ret int{
        local a:Fixed=[11,12];
        local s:int[]=cast<int[]>(a);
        local canonical:i32[]=cast<i32[]>(a);
        local alias:View=cast<View>(a);
        local p:*int=cast<*int>(a);
        local q:*i32=cast<*i32>([13,14]);
        local bytes:u8[2]=[15,16];
        local byteView:u8[]=cast<u8[]>(bytes);
        printf("%d %d %d %d %d %d %d %d\\n",s[0],canonical[1],alias[0],*p,*q,byteView[1],consume(),borrow(s)[1]);
        return *ptr(p)-11;
      }`,
      expectedStdout: "11 12 11 11 13 16 15 12\n",
    },
  ]);
}, 60000);
