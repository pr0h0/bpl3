import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("duplicate JSON fields replace owned values and clean partial replacements", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const duplicate =
    '{"name":"first","name":"last","child":{"label":"a"},"child":{"label":"b"},"values":["a"],"values":["b","c"],"nested":{"label":"a"},"nested":{"label":"b"},"ints":[1,2],"ints":[3]}';
  const invalid = [
    '{"name":"first","name":123}',
    '{"child":{"label":"first"},"child":{"label":123}}',
    '{"values":["first"],"values":["second",123]}',
  ];
  const source = `import [JSON] from "std/json.bpl";import [Array] from "std/array.bpl";
 extern strcmp(a:string,b:string)ret int;
 struct Child{label:string}struct Record{name:string,child:*Child,values:Array<string>,nested:Child,ints:int[2]}
 frame main()ret int{
  local record:*Record=JSON.parse<Record>(${JSON.stringify(duplicate)});
  if(record==nullptr){return 1;}
  local ok:bool=strcmp(record.name,"last")==0&&strcmp(record.child.label,"b")==0&&record.values.length==2&&strcmp(record.values.data[1],"c")==0&&strcmp(record.nested.label,"b")==0&&record.ints[0]==3&&record.ints[1]==0;
  JSON.free<Record>(record);if(!ok){return 2;}
  ${invalid.map((input) => `record=JSON.parse<Record>(${JSON.stringify(input)});if(record!=nullptr){JSON.free<Record>(record);return 3;}`).join("\n")}
  record=JSON.parse<Record>(${JSON.stringify('{"child":{"label":"first"},"child":null}')});
  if(record==nullptr){return 4;}ok=record.child==nullptr;JSON.free<Record>(record);if(!ok){return 5;}return 0;
 }`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
