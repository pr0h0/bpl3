import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("validation detects overflow and records structured errors", () => {
  native(`
    import [Validator] from "bpl-validation";
    import [Option] from "std/option.bpl";import [String] from "std/string.bpl";import [Array] from "std/array.bpl";
    extern strlen(s:string) ret long;extern strcmp(a:string,b:string) ret int;extern strstr(a:string,b:string) ret string;
    frame main() ret int {
      local v:Validator=Validator.new();
      if(v.integer("id","2147483648",-2147483648,2147483647).isSome()){return 1;}
      if(v.integer("minimum","-2147483648",-2147483648,2147483647).unwrap()!=-2147483648){return 2;}
      if(v.integer("bad","12oops",0,100).isSome()){return 3;}
      v.required("title","").length("title","",3,80);if(v.ok()){return 4;}
      local allowed:Array<string>=Array<string>.new(2);allowed.push("open");allowed.push("done");v.oneOf("state","done",&allowed);
      local json:String=v.json();if(strstr(json.data,"\\\"title\\\":\\\"required\\\"")==nullptr){return 5;}json.destroy();v.destroy();allowed.destroy();
      return 0;
    }
  `);
}, 90000);
