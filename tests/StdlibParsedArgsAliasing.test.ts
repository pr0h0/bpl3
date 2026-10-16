import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("ParsedArgs.setFlag copies borrowed stored values before replacing them", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [ParsedArgs] from "std/arg_parser.bpl";import [String] from "std/string.bpl";
 extern free(ptr:*void);extern strcmp(a:string,b:string)ret int;
 frame main()ret int{
  local args:*ParsedArgs=ParsedArgs.new();local key:String=String.new("mode");local value:String=String.new("original");
  args.setFlag(key,value);local stored:*String=args.getFlag("mode").unwrap();
  args.setFlag(key,*stored);if(strcmp(args.getFlag("mode").unwrap().data,"original")!=0){return 1;}
  local suffix:String; suffix.data=stored.data+3;suffix.length=stored.length-3;
  args.setFlag(key,suffix);if(strcmp(args.getFlag("mode").unwrap().data,"ginal")!=0){return 2;}
  args.destroy();free(cast<*void>(args));key.destroy();value.destroy();return 0;
 }`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
