import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("database updates retain a replacement borrowed from a row being changed", () => {
  native(String.raw`
import [Engine], [Table], [DataType], [Value], [Query], [Command] from "bpl-db";
import [Array] from "std/array.bpl";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 local engine:Engine=Engine.new();engine.silent=true;local owner:*Engine=&engine;defer owner.destroy();
 local table:*Table=engine.db.create_table("items");table.add_column("name",DataType.Str);
 local values:Array<Value>=Array<Value>.new(1);local input:*Array<Value>=&values;defer input.destroy();
 local text:string="replacement borrowed from first row of a multi-row update";values.push(Value.Str(text));
 loop(local i:int=0;i<4;i=i+1){table.insert(&values);}
 local replacement:Value=table.rows.get(0).values.get(0);
 local query:Query;query.command=Command.Update("items",nullptr,"name",replacement);engine.execute(&query);
 loop(local i:int=0;i<4;i=i+1){
  local value:Value=table.rows.get(i).values.get(0);
  match(value){Value.Str(actual)=>{if(strcmp(actual,text)!=0){return 1;}},_=>{return 2;},};
 }
 return 0;
}`);
}, 90000);
