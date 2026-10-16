import { test } from "bun:test";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";

test("interpolation releases compiler temporaries on success and throw while borrowing String operands", () => {
  const flags = checkBplSanitizerSupport().supported
    ? [
        "--clang-flag=-fsanitize=address,undefined",
        "--clang-flag=-fno-sanitize-recover=all",
      ]
    : [];
  const source = `
import [String] from "std/string.bpl";
extern strcmp(a:string,b:string)ret int;
global calls:int=0;
frame next()ret int{calls=calls+1;return calls;}
struct Failing{frame toString(this:*Failing)ret String{throw "conversion failed";}}
struct Borrowed{frame toString(this:*Borrowed)ret string{return "borrowed";}}
frame main()ret int{
 local __bpl_interpolation_0:String=String.new("reserved");
 local input:String=String.new("input");local raw:string="raw";
 loop(local i:int=0;i<8;i=i+1){
  local empty:String=\`\`;if(empty.length!=0){return 1;}empty.destroy();
  local literal:String=\`literal\`;if(strcmp(literal.data,"literal")!=0){return 2;}literal.destroy();
  local borrowed:Borrowed;
  local result:String=\`prefix \${input} \${raw} \${42} \${true} \${borrowed} \${__bpl_interpolation_0}\`;
  if(strcmp(result.data,"prefix input raw 42 true borrowed reserved")!=0){return 3;}
  result.destroy();if(strcmp(input.data,"input")!=0){return 4;}
  local nested:String=\`outer \${\`inner \${i}\`} end\`;nested.destroy();
  local address:String=\`ptr \${&i}\`;address.destroy();
  local failed:bool=false;local bad:Failing;
  try{local never:String=\`first \${i} then \${bad}\`;never.destroy();}catch{failed=true;}
  if(!failed){return 5;}
 }
 calls=0;local ordered:String=\`\${next()} \${next()}\`;
 if(calls!=2||strcmp(ordered.data,"1 2")!=0){return 6;}ordered.destroy();
 input.destroy();__bpl_interpolation_0.destroy();return 0;
}`;
  for (const opt of [0, 3]) native(source, ["-O", String(opt), ...flags]);
}, 120000);
