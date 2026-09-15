import { test } from "bun:test";
import { expectTrackedAllocations } from "./helpers/trackedAllocations";

test("path operations release allocations and handle allocation failures", () => {
  expectTrackedAllocations(`import [Path] from "std/path.bpl";
import [String] from "std/string.bpl";
extern tracking_begin();extern tracking_live() ret int;extern tracking_fail(index:int);
frame main() ret int {
 tracking_begin();
 local paths:string[6]=["/a/b/../c","a/./b","/../../..","a/..","../../a/../b",""];
 loop(local iteration:int=0;iteration<20;iteration=iteration+1) {
  loop(local i:int=0;i<6;i=i+1) {
   local value:String=Path.normalize(paths[i]);value.destroy();
   if(tracking_live()!=0) {return 1;}
  }
 }
 tracking_fail(0);local caught:bool=false;
 try {local value:String=Path.normalize("a/b");value.destroy();}
 catch(error:string) {caught=error!=nullptr;}
 tracking_fail(-1);
 if(!caught || tracking_live()!=0) {return 2;}
 local resolved:String=Path.resolve("a/b","../c");resolved.destroy();
 if(tracking_live()!=0) {return 3;}
 tracking_fail(1);caught=false;
 try {local value:String=Path.resolve("a/b","../c");value.destroy();}
 catch(error:string) {caught=error!=nullptr;}
 tracking_fail(-1);
 if(!caught || tracking_live()!=0) {return 4;}
 local relative:String=Path.relative("/a/b","/a/c");relative.destroy();
 if(tracking_live()!=0) {return 5;}
 loop(local failure:int=0;failure<3;failure=failure+1) {
  tracking_fail(failure);caught=false;
  try {local value:String=Path.relative("/a/b","/a/c");value.destroy();}
  catch(error:string) {caught=error!=nullptr;}
  tracking_fail(-1);if(!caught || tracking_live()!=0) {return 6;}
 }
 return 0;
}`);
}, 60000);
