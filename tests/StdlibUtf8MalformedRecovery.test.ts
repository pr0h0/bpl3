import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("malformed UTF-8 preserves subsequent bytes and valid replacement characters", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `import [UTF8] from "std/utf8.bpl";
import [Array] from "std/array.bpl";
frame main()ret int{
 local bad:u8[5]=[cast<u8>(226),cast<u8>(65),cast<u8>(66),cast<u8>(67),cast<u8>(0)];
 local points:Array<u32>=UTF8.toCodepoints(cast<string>(&bad[0]));
 if(points.len()!=4){return 1;}
 if(points.get(0)!=cast<u32>(65533)||points.get(1)!=cast<u32>(65)||points.get(2)!=cast<u32>(66)||points.get(3)!=cast<u32>(67)){return 2;}
 points.destroy();
 local short:u8[3]=[cast<u8>(240),cast<u8>(65),cast<u8>(0)];
 points=UTF8.toCodepoints(cast<string>(&short[0]));
 if(points.len()!=2||points.get(1)!=cast<u32>(65)){return 3;}points.destroy();
 local invalid:u8[4]=[cast<u8>(237),cast<u8>(160),cast<u8>(128),cast<u8>(0)];
 points=UTF8.toCodepoints(cast<string>(&invalid[0]));
 if(points.len()!=3){return 4;}
 loop(local i:int=0;i<3;i=i+1){if(points.get(i)!=cast<u32>(65533)){return 5;}}points.destroy();
 points=UTF8.toCodepoints("�A😀");
 if(points.len()!=3||points.get(0)!=cast<u32>(65533)||points.get(1)!=cast<u32>(65)||points.get(2)!=cast<u32>(128512)){return 6;}points.destroy();
 local final:u8[2]=[cast<u8>(239),cast<u8>(0)];
 points=UTF8.toCodepoints(cast<string>(&final[0]));
 if(points.len()!=1||points.get(0)!=cast<u32>(65533)){return 7;}points.destroy();return 0;
}`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
