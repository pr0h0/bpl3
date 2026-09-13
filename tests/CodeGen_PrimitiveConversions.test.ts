import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
test("primitive conversions use real wrapper declarations with selective imports", () => {
  expectCorrectnessSuite([
    {
      name: "implicit-primitive-conversions",
      validateLlvm: true,
      source: `import [String] from "std"; import printf from "std/c.bpl";
frame main() ret int {
 local x:long=123;local text:String=x.toString();printf("%s\\n",text.data);text.destroy();
 local count:int=3;local price:float=2.5;
 text=\`total: \${cast<float>(count)*price}\`;printf("%s\\n",text.data);text.destroy();
 return 0;
}`,
      expectedStdout: "123\ntotal: 7.500000\n",
    },
  ]);
}, 60000);
