import { test } from "bun:test";
import { native } from "./helpers/webPackages";
test("JSON rejects null and excessive nesting without throwing and ignores brackets inside strings", () => {
  native(`import [JSON] from "std/json.bpl";import [StringBuilder] from "std/string_builder.bpl";
    struct Input {title:string,}
    frame main() ret int {
      if(JSON.parse<Input>(nullptr)!=nullptr){return 1;}
      local text:StringBuilder=StringBuilder.new(32);text.append("{\\\"title\\\":\\\"ok\\\",\\\"ignored\\\":");
      loop(local i:int=0;i<63;i=i+1){text.append("[");}text.append("0");loop(local i:int=0;i<63;i=i+1){text.append("]");}text.append("}");
      local value:*Input=JSON.parse<Input>(text.toString());if(value==nullptr){return 2;}JSON.free<Input>(value);text.destroy();
      text=StringBuilder.new(32);text.append("{\\\"title\\\":\\\"ok\\\",\\\"ignored\\\":");loop(local i:int=0;i<64;i=i+1){text.append("[");}text.append("0");loop(local i:int=0;i<64;i=i+1){text.append("]");}text.append("}");
      if(JSON.parse<Input>(text.toString())!=nullptr){return 3;}text.destroy();
      text=StringBuilder.new(32);text.append("{\\\"title\\\":\\\"");loop(local i:int=0;i<200;i=i+1){text.append("[");}text.append("\\\"}");
      value=JSON.parse<Input>(text.toString());if(value==nullptr){return 4;}JSON.free<Input>(value);text.destroy();return 0;
    }`);
}, 90000);
