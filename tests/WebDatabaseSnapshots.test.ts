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

// BUG-459: save wrote rows that load rejects (> 1 MiB once hex-encoded) and
// truncated the file in place, so a failed save lost the previous snapshot.
test("database saves reject oversized rows and keep the previous snapshot", () => {
  native(String.raw`
import [Database], [Table], [Value], [DataType] from "bpl-db";
import [Array] from "std/array.bpl";
extern getpid()ret int;
extern sprintf(out:string,format:string,...)ret int;
extern unlink(path:string)ret int;
extern access(path:string,mode:int)ret int;
extern malloc(size:long)ret string;
extern memset(p:string,c:int,n:long)ret string;
frame main()ret int{
 local path:char[128];sprintf(cast<string>(&path[0]),"/tmp/bpl-db-atomic-%d",getpid());defer unlink(cast<string>(&path[0]));
 local tmp:char[136];sprintf(cast<string>(&tmp[0]),"%s.tmp",cast<string>(&path[0]));
 local db:Database=Database.new();local owner:*Database=&db;defer owner.destroy();
 local table:*Table=db.create_table("t");table.add_column("s",DataType.Str);
 local small:Array<Value>=Array<Value>.new(1);small.push(Value.Str("hello"));
 if(table.insert(&small)!=1){return 1;}
 db.save(cast<string>(&path[0]));
 local big:string=malloc(600001);memset(big,65,600000);big[600000]=cast<char>(0);
 local large:Array<Value>=Array<Value>.new(1);large.push(Value.Str(big));
 if(table.insert(&large)!=2){return 2;}
 local rejected:bool=false;
 try { db.save(cast<string>(&path[0])); } catch (_e: string) { rejected=true; }
 if(!rejected){return 3;}
 if(access(cast<string>(&tmp[0]),0)==0){return 4;}
 local loaded:Database=Database.new();local loadedOwner:*Database=&loaded;defer loadedOwner.destroy();
 loaded.load(cast<string>(&path[0]));
 local back:*Table=loaded.get_table("t");
 if(back==nullptr||back.rows.len()!=1){return 5;}
 return 0;
}`);
}, 90000);
