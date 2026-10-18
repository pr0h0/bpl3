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
      enum Box{Value(int[]),}
      struct Count<T>{value:T,}
      struct Holder{v:int[],frame first(this:Holder)ret int{return this.v[0];}}
      frame selected(v:int[])ret int[]{return [cast<int[]>([1,2]),v][1];}
      frame consumeReceiver()ret int{return (Holder{v:cast<int[]>([2,3])}).first();}
      frame consumeIndex()ret int{return [cast<int[]>([4,5])][0][1];}
      frame consumePointer()ret int{return *(cast<*int>([6,7])+1);}
      frame counted(v:int[])ret Count<int>{return Count<int>{value:v[0]};}
      frame consumeCount()ret Count<int>{return counted(cast<int[]>([31,32]));}
      frame copied(v:int[])ret int[2]{return [v[0],v[1]];}
      frame consumeCopy()ret int[2]{return copied(cast<int[]>([33,34]));}
      frame consumeMatch()ret int{return match(true){true=>read(cast<int[]>([1,2])),false=>0,};}
      frame localMatch()ret int{local v:int[]=match(true){true=>{type LocalView=int[];return cast<LocalView>([4,5]);},false=>cast<int[]>([6,7]),};return v[0];}
      frame matched(v:int[])ret int[]{return match(true){true=>{return v;},false=>v,};}
      frame boxed(v:int[])ret Box{return Box.Value(cast<int[]>(v));}
      frame first(v:Box)ret int{return match(v){Box.Value(data)=>data[0],};}
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
        local count:Count<int>=consumeCount();
        local copy:int[2]=consumeCopy();
        if(count.value!=31 || copy[1]!=34 || consumeMatch()!=3 || localMatch()!=4 || matched(s)[0]!=11) return 1;
        if(selected(s)[1]!=12 || consumeReceiver()!=2 || consumeIndex()!=5 || consumePointer()!=7) return 2;
        return *ptr(p)+first(boxed(s))-22;
      }`,
      expectedStdout: "11 12 11 11 13 16 15 12\n",
    },
  ]);
}, 60000);
