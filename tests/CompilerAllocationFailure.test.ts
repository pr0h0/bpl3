import { test } from "bun:test";
import { expectTrackedAllocations } from "./helpers/trackedAllocations";

test("failed lambda and defer allocations throw without publishing invalid captures or leaking contexts", () => {
  expectTrackedAllocations(`extern tracking_begin();extern tracking_live() ret int;extern tracking_fail(index:int);
extern strcmp(a:string,b:string) ret int;
extern exit(code:int);
global cleaned:int=0;
frame cleanup(value:int) {cleaned=cleaned+value;}
frame main() ret int {
 tracking_begin();local captured:int=7;local caught:bool=false;
 tracking_fail(0);
 try {local operation:Lambda<int>(int)=|x:int| ret int {return x+captured;};operation(1);}
 catch(error:string) {caught=strcmp(error,"Cannot allocate lambda capture")==0;}
 tracking_fail(-1);if(!caught || tracking_live()!=0) {return 1;}
 loop(local failure:int=0;failure<2;failure=failure+1) {
  caught=false;tracking_fail(failure);
  try {defer {cleanup(captured);}}
  catch(error:string) {caught=strcmp(error,failure==0 ? "Cannot allocate lambda capture" : "Cannot allocate defer node")==0;}
  tracking_fail(-1);if(!caught || cleaned!=0 || tracking_live()!=0) {return 2;}
 }
 caught=false;tracking_fail(0);
 try {defer {cleaned=cleaned+1;}}
 catch(error:string) {caught=strcmp(error,"Cannot allocate defer node")==0;}
 tracking_fail(-1);if(!caught || cleaned!=0 || tracking_live()!=0) {return 3;}
 caught=false;
 try {
  defer {cleaned=cleaned+10;}
  tracking_fail(0);
  defer {cleanup(captured);}
 }catch(error:string) {caught=error!=nullptr;}
 tracking_fail(-1);if(!caught) {return 4;}if(cleaned!=10) {return 5;}if(tracking_live()!=0) {return 6;}
 cleaned=0;caught=false;
 try {
  defer {cleaned=cleaned+10;}
  defer {cleanup(captured);if(cleaned>7) {exit(91);}throw 123;}
  throw 1;
 }catch(error:int) {caught=error==123;}
 if(!caught || cleaned!=17 || tracking_live()!=0) {return 7;}
 cleaned=0;caught=false;
 try {defer {cleanup(captured);throw 23;}}
 catch(error:int) {caught=error==23;}
 if(!caught || cleaned!=7 || tracking_live()!=0) {return 8;}
 return 0;
}`);
}, 60000);
