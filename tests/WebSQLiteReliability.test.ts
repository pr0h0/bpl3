import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  statSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
const sqlite =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
  }).stdout?.trim() ?? "";

test.skipIf(process.platform !== "linux" || !sqlite.includes("/"))(
  "SQLite migrations roll back failures and backups restore live WAL data without overwriting",
  () => {
    const dir = mkdtempSync(resolve(".web-sqlite-reliable-"));
    try {
      const path = join(dir, "source.sqlite"),
        backup = join(dir, "snapshot.sqlite"),
        missing = join(dir, "missing.sqlite");
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [SQLite],[Statement],[Migrations] from "bpl-sqlite";
extern strcmp(a:string,b:string)ret int;
frame create(db:*SQLite){db.exec("CREATE TABLE entries(id INTEGER PRIMARY KEY,value TEXT NOT NULL)");db.exec("INSERT INTO entries VALUES(1,'original')");}
frame fail(db:*SQLite){db.exec("CREATE TABLE rolled_back(id INTEGER)");throw "fixture failure";}
frame earlyCommit(db:*SQLite){db.exec("CREATE TABLE rolled_back(id INTEGER)");db.commit();}
frame extend(db:*SQLite){db.exec("ALTER TABLE entries ADD COLUMN done INTEGER NOT NULL DEFAULT 0");}
frame scalar(db:*SQLite,sql:string)ret long{local q:Statement=db.prepare(sql);local owner:*Statement=&q;defer owner.close();if(!q.step()){return -1;}return q.integer(0);}
frame main()ret int{
 local db:SQLite=SQLite.open(${JSON.stringify(path)});local d:*SQLite=&db;defer d.close();db.setWAL(true);
 if(!Migrations.apply(&db,1,"entries","entries-v1",create)){return 1;}
 if(Migrations.apply(&db,1,"entries","entries-v1",create)){return 2;}
 local caught:bool=false;try{Migrations.apply(&db,1,"entries","changed",create);}catch{caught=true;}if(!caught){return 3;}
 caught=false;try{Migrations.apply(&db,3,"gap","gap-v3",extend);}catch{caught=true;}if(!caught){return 4;}
 caught=false;try{Migrations.apply(&db,2,"failed","failed-v2",fail);}catch{caught=true;}if(!caught||scalar(&db,"SELECT count(*) FROM sqlite_master WHERE name='rolled_back'")!=0){return 5;}
 caught=false;try{Migrations.apply(&db,2,"commit","commit-v2",earlyCommit);}catch{caught=true;}if(!caught||scalar(&db,"SELECT count(*) FROM sqlite_master WHERE name='rolled_back'")!=0){return 6;}
 if(!Migrations.apply(&db,2,"done","done-v2",extend)){return 7;}
 db.backupTo(${JSON.stringify(backup)},2);
 db.exec("UPDATE entries SET value='changed' WHERE id=1");
 caught=false;try{db.backupTo(${JSON.stringify(backup)},2);}catch{caught=true;}if(!caught){return 8;}
 db.begin();caught=false;try{db.backupTo(${JSON.stringify(join(dir, "in-tx.sqlite"))},1);}catch{caught=true;}db.rollback();if(!caught){return 9;}
 local restored:SQLite=SQLite.openReadOnly(${JSON.stringify(backup)});local r:*SQLite=&restored;defer r.close();
 if(!restored.integrityCheck()||scalar(&restored,"SELECT MAX(version) FROM bpl_migrations")!=2){return 10;}
 local q:Statement=restored.prepare("SELECT value FROM entries WHERE id=1");if(!q.step()||strcmp(q.text(0),"original")!=0){return 11;}q.close();
 caught=false;try{restored.exec("DELETE FROM entries");}catch{caught=true;}if(!caught){return 12;}
 caught=false;try{local absent:SQLite=SQLite.openReadOnly(${JSON.stringify(missing)});absent.close();}catch{caught=true;}if(!caught){return 13;}
 local memory:SQLite=SQLite.open(":memory:");caught=false;try{memory.setWAL(true);}catch{caught=true;}memory.close();if(!caught){return 14;}
 if(db.busy_timeout_ms!=5000){return 15;}return 0;
}`,
      );
      const exe = join(dir, "app");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          join(dir, "main.bpl"),
          "-O",
          "3",
          "--clang-flag=-l:libsqlite3.so.0",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = spawnSync(exe, [], { encoding: "utf8", timeout: 15000 });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      expect(statSync(backup).mode & 0o777).toBe(0o600);
      expect(existsSync(missing)).toBe(false);
      expect(existsSync(join(dir, "in-tx.sqlite"))).toBe(false);
      expect(readdirSync(dir).some((name) => name.includes(".tmp."))).toBe(
        false,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
