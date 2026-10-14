import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { native } from "./helpers/webPackages";

const sqlitePath = spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], { encoding: "utf8" }).stdout.trim();
test.skipIf(process.platform !== "linux" || !sqlitePath.includes("/"))("SQLite prepared statements copy bindings, enforce state and support transaction rollback", () => {
  native(`
    import [SQLite], [Statement] from "bpl-sqlite";
    extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local db:SQLite=SQLite.open(":memory:");db.exec("CREATE TABLE items(id INTEGER PRIMARY KEY, title TEXT NOT NULL, payload BLOB)");
      local insert:Statement=db.prepare("INSERT INTO items(title,payload) VALUES (?,?)");
      local text:char[4]=['a','b','c','\\0'];local bytes:char[3]=['a','\\0','b'];
      insert.bindText(1,cast<string>(&text[0])).bindBlob(2,&bytes[0],3);text[0]='z';bytes[0]='z';
      if(insert.step()||db.lastInsertId()!=1||db.changes()!=1){return 1;}
      local caught:bool=false;try{insert.step();}catch{caught=true;}if(!caught){return 2;}insert.close();insert.close();
      db.begin();db.exec("INSERT INTO items(title) VALUES ('rollback')");db.rollback();
      local query:Statement=db.prepare("SELECT title,payload FROM items ORDER BY id");
      if(!query.step()){return 3;}local blob:*char=cast<*char>(query.blob(1));
      if(strcmp(query.text(0),"abc")!=0||query.bytes(1)!=3||blob[0]!='a'){return 3;}
      if(query.step()){return 4;}query.reset();if(!query.step()){return 5;}query.close();
      caught=false;try{local extra:Statement=db.prepare("SELECT 1; DROP TABLE items");extra.close();}catch{caught=true;}if(!caught){return 6;}
      local bound:Statement=db.prepare("SELECT ?");bound.bindText(1,"'; DROP TABLE items; --");if(!bound.step()||strcmp(bound.text(0),"'; DROP TABLE items; --")!=0){return 7;}
      bound.close();db.close();db.close();return 0;
    }
  `, ["--clang-flag=-l:libsqlite3.so.0"]);
}, 90000);

