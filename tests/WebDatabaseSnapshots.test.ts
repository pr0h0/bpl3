import { test } from "bun:test";
import { native } from "./helpers/webPackages";

test("database snapshots preserve rows in zero-column tables", () => {
  native(String.raw`
import [Database], [Table], [Value] from "bpl-db";
import [Array] from "std/array.bpl";
extern getpid()ret int;
extern sprintf(out:string,format:string,...)ret int;
extern unlink(path:string)ret int;
frame main()ret int{
 local path:char[128];sprintf(cast<string>(&path[0]),"/tmp/bpl-zero-columns-%d",getpid());defer unlink(cast<string>(&path[0]));
 local db:Database=Database.new();local owner:*Database=&db;defer owner.destroy();
 local table:*Table=db.create_table("empty");local values:Array<Value>=Array<Value>.new(0);local input:*Array<Value>=&values;defer input.destroy();
 if(table.insert(&values)!=1||table.insert(&values)!=2){return 1;}
 db.save(cast<string>(&path[0]));
 local loaded:Database=Database.new();local loadedOwner:*Database=&loaded;defer loadedOwner.destroy();loaded.load(cast<string>(&path[0]));
 table=loaded.get_table("empty");if(table==nullptr||table.rows.len()!=2){return 2;}
 if(table.rows.get(0).id!=1||table.rows.get(1).id!=2||table.rows.get(0).values.len()!=0){return 3;}
 if(table.insert(&values)!=3){return 4;}
 return 0;
}`);
}, 90000);
