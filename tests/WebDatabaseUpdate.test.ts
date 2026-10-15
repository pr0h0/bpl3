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

test("database mutations preserve predicate strings borrowed from affected rows", () => {
  native(String.raw`
import [Engine], [Table], [DataType], [Value], [Query], [Command], [Condition], [Operator] from "bpl-db";
import [Array] from "std/array.bpl";
extern strcmp(a:string,b:string)ret int;
frame main()ret int{
 local engine:Engine=Engine.new();engine.silent=true;local owner:*Engine=&engine;defer owner.destroy();
 local table:*Table=engine.db.create_table("items");table.add_column("name",DataType.Str);
 local values:Array<Value>=Array<Value>.new(1);local input:*Array<Value>=&values;defer input.destroy();
 values.push(Value.Str("predicate borrowed from a row of a multi-row mutation"));
 loop(local i:int=0;i<4;i=i+1){table.insert(&values);}
 local conditions:Array<Condition>=Array<Condition>.new(1);local predicates:*Array<Condition>=&conditions;defer predicates.destroy();
 local condition:Condition;condition.column="name";condition.op=Operator.Eq;condition.value=table.rows.get(0).values.get(0);conditions.push(condition);
 local query:Query;query.command=Command.Update("items",&conditions,"name",Value.Str("new"));engine.execute(&query);
 loop(local i:int=0;i<4;i=i+1){match(table.rows.get(i).values.get(0)){Value.Str(text)=>{if(strcmp(text,"new")!=0){return 1;}},_=>{return 2;},};}
 condition.value=table.rows.get(3).values.get(0);conditions.set(0,condition);
 query.command=Command.Delete("items",&conditions);engine.execute(&query);
 if(table.rows.len()!=0){return 3;}
 return 0;
}`);
}, 90000);
