import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("right padding uses total field width and preserves longer strings", () => {
  expectCorrectnessSuite([
    {
      name: "fmt-right-padding",
      validateLlvm: true,
      source: `import [Fmt] from "std/fmt.bpl";
extern printf(format:string,...)ret int;
frame main(){
 printf("[");Fmt.printPaddedRight("abc",5);printf("]\\n");
 printf("[");Fmt.printPaddedRight("abc",2);printf("]\\n");
 printf("[");Fmt.printPaddedRight("",3);printf("]\\n");
 printf("[");Fmt.printPaddedRight("abc",0);printf("]\\n");
 printf("[");Fmt.printPaddedRight("abc",-2147483648);printf("]\\n");
 printf("[");Fmt.printPaddedRight("é",3);printf("]\\n");
}`,
      expectedStdout: "[abc  ]\n[abc]\n[   ]\n[abc]\n[abc]\n[é ]\n",
    },
  ]);
}, 60000);
