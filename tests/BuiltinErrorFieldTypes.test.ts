import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("builtin runtime error text fields are C strings", () => {
  expectCorrectnessSuite([
    {
      name: "builtin-error-string-fields",
      validateLlvm: true,
      expectedStdout: "[Attempted to access member of nullptr] [main] [y.a]\n",
      source: `extern printf(fmt:string,...) ret int;
extern strlen(s:string) ret ulong;
struct X {a:int,}
frame main() ret int {
 local y:*X=nullptr;
 local arr:int[2];
 local i:int=5;
 local zero:int=0;
 try {printf("%d\\n",y.a);} catch(e:NullAccessError) {
  local m:string=e.message;
  printf("[%s] [%s] [%s]\\n",m,e.function,e.expression);
 }
 try {printf("%d\\n",arr[i]);} catch(e:IndexOutOfBoundsError) {
  local m:string=e.message;
  if(strlen(m)==0) {return 1;}
 }
 try {printf("%d\\n",10/zero);} catch(e:DivisionByZeroError) {
  local m:string=e.message;
  if(strlen(m)==0) {return 2;}
 }
 return 0;
}`,
    },
  ]);
}, 60000);
