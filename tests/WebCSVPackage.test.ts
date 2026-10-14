import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("optional CSV writer preserves quotes, UTF-8 and newlines and guards spreadsheet cells", () => {
  native(`
    import [CSV] from "bpl-csv";
    import [Array] from "std/array.bpl";import [StringBuilder] from "std/string_builder.bpl";
    extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local fields:Array<string>=Array<string>.new(4);
      fields.push("λ,quote\\\"\\nline");fields.push(" =1+1");fields.push("-42");fields.push(nullptr);
      local out:StringBuilder=StringBuilder.new(2);CSV.row(&out,&fields);
      if(strcmp(out.toString(),"\\\"λ,quote\\\"\\\"\\nline\\\",\\\"' =1+1\\\",\\\"'-42\\\",\\\"\\\"\\r\\n")!=0){return 1;}
      out.destroy();out=StringBuilder.new(2);CSV.row(&out,&fields,false);
      if(strcmp(out.toString(),"\\\"λ,quote\\\"\\\"\\nline\\\",\\\" =1+1\\\",\\\"-42\\\",\\\"\\\"\\r\\n")!=0){return 2;}
      out.destroy();fields.destroy();return 0;
    }
  `);
}, 90000);
