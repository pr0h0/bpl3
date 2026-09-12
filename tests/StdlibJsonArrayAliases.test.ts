import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
test("JSON reflection resolves fixed-array aliases and alias chains", () => {
  expectCorrectnessSuite([
    {
      name: "json-array-aliases",
      validateLlvm: true,
      source: `
  import [JSON] from "std/json.bpl";
  import [String] from "std/string.bpl";
  import printf from "std/c.bpl";
  type Pair = int[2];
  type Chained = Pair;
  type FloatPair = float[2];
  struct Record { values: Chained, nested: FloatPair, optional: *Pair }
  frame main() ret int {
    local pair:*Pair=JSON.parse<Pair>("[1,2]");
    if (pair == nullptr || pair[1] != 2) { return 1; }
    local text:String=JSON.stringify<Pair>(pair); printf("%s\\n",text.toString()); text.destroy(); JSON.free<Pair>(pair);
    local record:*Record=JSON.parse<Record>("{\\"values\\":[3,4],\\"nested\\":[1.5,2.5],\\"optional\\":[5,6]}");
    if (record == nullptr || record.values[1] != 4 || record.nested[1] != 2.5 || record.optional == nullptr) {return 2;}
    local encoded:String=JSON.stringify<Record>(record); printf("%s\\n",encoded.toString()); encoded.destroy();JSON.free<Record>(record);
    return 0;
  }`,
      expectedStdout:
        '[1, 2]\n{"values": [3, 4], "nested": [1.5, 2.5], "optional": [5, 6]}\n',
    },
  ]);
}, 60000);
