import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("web extension archives install transitively and compile outside the source workspace", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-web-install-"));
  try {
    writeFileSync(
      join(dir, "bpl.json"),
      JSON.stringify({
        name: "web-consumer",
        version: "0.1.0",
        main: "main.bpl",
      }),
    );
    for (const name of [
      "bpl-web-middleware",
      "bpl-validation",
      "bpl-http-client",
      "bpl-db",
    ]) {
      const install = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "install",
          resolve(`packages/${name}/${name}-0.1.0.tgz`),
        ],
        { cwd: dir, encoding: "utf8", timeout: 60000 },
      );
      expect(install.status, install.stdout + install.stderr).toBe(0);
    }
    writeFileSync(
      join(dir, "main.bpl"),
      `
      import [RequestBuilder], [HttpResponse] from "bpl-http-client";
      import [Validator] from "bpl-validation";
      import [Database], [Table], [Value] from "bpl-db";
      import [Array] from "std/array.bpl";
      import [Form], [Negotiation] from "bpl-web-middleware";
      import [Option] from "std/option.bpl";
      extern strcmp(a:string,b:string) ret int;
      frame main() ret int {
        local request:RequestBuilder=RequestBuilder.new("https://");local response:*HttpResponse=request.send();if(response.status!=0){return 3;}response.destroy();request.destroy();
        if(Negotiation.quality("text/plain;profile=one","application/json;profile=one",true)!=0){return 4;}
        if(Negotiation.quality("text/html;charset=\\\"utf-8\\\"","text/html;charset=UTF-8",true)!=1000){return 5;}
        local db:Database=Database.new();local table:*Table=db.create_table("empty");local values:Array<Value>=Array<Value>.new(0);
        table.insert(&values);db.save("zero.snapshot");db.destroy();db=Database.new();db.load("zero.snapshot");table=db.get_table("empty");
        if(table==nullptr||table.rows.len()!=1||table.insert(&values)!=2){return 6;}db.destroy();values.destroy();
        local v:Validator=Validator.new();v.required("title","works");if(!v.ok()){return 1;}v.destroy();
        local form:Form=Form.parse("title=a%26b",11);if(strcmp(form.get("title").unwrap(),"a&b")!=0){return 2;}form.destroy();return 0;
      }
    `,
    );
    const exe = join(dir, "app");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
      { cwd: dir, encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], {
      cwd: dir,
      encoding: "utf8",
      timeout: 10000,
    });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}, 90000);

const sqlite =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
  }).stdout?.trim() ?? "";
test.skipIf(process.platform !== "linux" || !sqlite.includes("/"))(
  "optional throttling and migration archives install and operate outside the checkout",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-rate-install-"));
    try {
      writeFileSync(
        join(dir, "bpl.json"),
        JSON.stringify({
          name: "rate-consumer",
          version: "0.1.0",
          main: "main.bpl",
        }),
      );
      const install = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "install",
          resolve("packages/bpl-rate-limit/bpl-rate-limit-0.1.0.tgz"),
        ],
        { cwd: dir, encoding: "utf8", timeout: 60000 },
      );
      expect(install.status, install.stdout + install.stderr).toBe(0);
      writeFileSync(
        join(dir, "main.bpl"),
        `
 import [RateLimiter],[RateDecision] from "bpl-rate-limit";
 import [SQLite],[Migrations] from "bpl-sqlite";
 frame migrate(db:*SQLite){db.exec("CREATE TABLE fixture(id INTEGER)");}
 frame main()ret int{local db:SQLite=SQLite.open(":memory:");local limiter:RateLimiter=RateLimiter.new(&db);if(!limiter.check("scope","id",1,60).allowed||limiter.check("scope","id",1,60).allowed){return 1;}if(!Migrations.apply(&db,1,"fixture","v1",migrate)){return 2;}db.backupTo("backup.sqlite",2);db.close();return 0;}`,
      );
      const exe = join(dir, "app");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          join(dir, "main.bpl"),
          "--clang-flag=-l:libsqlite3.so.0",
          "-o",
          exe,
        ],
        { cwd: dir, encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = spawnSync(exe, [], {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);
      const check = spawnSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('SELECT name FROM bpl_migrations').fetchone()[0])",
          join(dir, "backup.sqlite"),
        ],
        { encoding: "utf8" },
      );
      expect(check.status).toBe(0);
      expect(check.stdout.trim()).toBe("fixture");
      const manifest = JSON.parse(
        readFileSync(
          join(dir, "bpl_modules", "bpl-rate-limit", "bpl.json"),
          "utf8",
        ),
      );
      expect(manifest.name).toBe("bpl-rate-limit");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);

const sodium =
  spawnSync("clang", ["-print-file-name=libsodium.so.23"], {
    encoding: "utf8",
  }).stdout?.trim() ?? "";
test.skipIf(
  process.platform !== "linux" ||
    !sqlite.includes("/") ||
    !sodium.includes("/"),
)(
  "Passport archives install transitively and authenticate outside the checkout",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "bpl-passport-install-"));
    try {
      writeFileSync(
        join(dir, "bpl.json"),
        JSON.stringify({
          name: "passport-consumer",
          version: "0.1.0",
          main: "main.bpl",
        }),
      );
      const install = (name: string) => {
        const result = spawnSync(
          "bun",
          [
            resolve("index.ts"),
            "install",
            resolve(`packages/${name}/${name}-0.1.0.tgz`),
          ],
          {
            cwd: dir,
            encoding: "utf8",
            timeout: 60000,
          },
        );
        expect(result.status, result.stdout + result.stderr).toBe(0);
      };
      const buildAndRun = (source: string, flags: string[] = []) => {
        writeFileSync(join(dir, "main.bpl"), source);
        const build = spawnSync(
          "bun",
          [
            resolve("index.ts"),
            "build",
            join(dir, "main.bpl"),
            "-o",
            join(dir, "app"),
            ...flags,
          ],
          {
            cwd: dir,
            encoding: "utf8",
            timeout: 60000,
          },
        );
        expect(build.status, build.stdout + build.stderr).toBe(0);
        const run = spawnSync(join(dir, "app"), [], {
          cwd: dir,
          encoding: "utf8",
          timeout: 10000,
        });
        expect(run.status, run.stdout + run.stderr).toBe(0);
      };
      install("bpl-passport-local");
      buildAndRun(String.raw`
import [Passport] from "bpl-passport";
import [LocalStrategy] from "bpl-passport-local";
import [Request], [Response] from "bpl-express";
import [HttpParser] from "bpl-http-parser";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
extern strlen(text:string)ret ulong;
frame verify(_context:*void,_req:*Request,_res:*Response,_username:string,_password:string)ret long{return 42;}
frame main()ret int{
 local passport:Passport=Passport.new();local strategy:LocalStrategy=LocalStrategy.new(nullptr,verify);strategy.install(&passport,"local");
 local req:Request=Request.new();local res:Response=Response.new(-1);
 local payload:string="{\"username\":\"student\",\"password\":\"test-password\"}";
 req.body_length=cast<long>(strlen(payload));req.body=HttpParser.copy(payload,0,req.body_length);
 local user:long=passport.authenticate("local",&req,&res);req.destroy();res.destroy();passport.destroy();if(user!=42){return 1;}return 0;
}`);
      install("bpl-auth");
      buildAndRun(
        String.raw`
import [Auth], [AuthCrypto] from "bpl-auth";
import [SQLite], [Statement] from "bpl-sqlite";
import [Request], [Response] from "bpl-express";
import [HttpParser] from "bpl-http-parser";
import [String] from "std/string.bpl";
import [Map] from "std/map.bpl";
import [Option] from "std/option.bpl";
extern strlen(text:string)ret ulong;
extern strcpy(target:string,source:string)ret string;
frame main()ret int{
 local db:SQLite=SQLite.open(":memory:");local auth:Auth=Auth.new(&db,"http://app.example",false);
 local hash:String=AuthCrypto.passwordHash("test-password");local q:Statement=db.prepare("INSERT INTO auth_users(username,password_hash) VALUES (?,?)");
 q.bindText(1,"student").bindText(2,hash.data);q.step();q.close();hash.destroy();
 local req:Request=Request.new();local res:Response=Response.new(-1);
 strcpy(cast<string>(&req.peer_ip[0]),"127.0.0.1");req.headers.set("origin","http://app.example");
 local payload:string="{\"username\":\"student\",\"password\":\"test-password\"}";
 req.body_length=cast<long>(strlen(payload));req.body=HttpParser.copy(payload,0,req.body_length);
 auth.login(&req,&res);
 if(res.status_code!=200||!res.headers.get("Set-Cookie").isSome()){return 1;}
 loop(local i:long=0;i<req.body_length;i=i+1){if(req.body[i]!=0){return 2;}}
 q=db.prepare("SELECT count(*) FROM auth_sessions");if(!q.step()||q.integer(0)!=1){return 3;}q.close();
 req.destroy();res.destroy();auth.destroy();db.close();return 0;
}`,
        ["--clang-flag=-l:libsqlite3.so.0", "--clang-flag=-l:libsodium.so.23"],
      );
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  },
  90000,
);
