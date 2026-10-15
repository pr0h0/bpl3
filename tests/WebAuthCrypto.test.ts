import { test } from "bun:test";
import { spawnSync } from "node:child_process";
import { native } from "./helpers/webPackages";
const sodium =
  spawnSync("clang", ["-print-file-name=libsodium.so.23"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
test.skipIf(process.platform !== "linux" || !sodium.includes("/"))(
  "authentication crypto uses salted Argon2id and unpredictable fixed-length session tokens",
  () => {
    native(
      `import [AuthCrypto] from "bpl-auth";import [String] from "std/string.bpl";
    extern strcmp(a:string,b:string) ret int;extern strncmp(a:string,b:string,n:long) ret int;
    frame main() ret int {
      AuthCrypto.init();local first:String=AuthCrypto.passwordHash("correct-test-password");local second:String=AuthCrypto.passwordHash("correct-test-password");
      if(strncmp(first.data,"$argon2id$",10)!=0||strcmp(first.data,second.data)==0){return 1;}
      if(!AuthCrypto.verify(first.data,"correct-test-password")||AuthCrypto.verify(first.data,"incorrect-password")){return 2;}
      local a:String=AuthCrypto.token();local b:String=AuthCrypto.token();if(!AuthCrypto.tokenValid(a.data)||!AuthCrypto.tokenValid(b.data)||AuthCrypto.equalToken(a.data,b.data)||!AuthCrypto.equalToken(a.data,a.data)){return 3;}
      local digest:String=AuthCrypto.digest(a.data);if(!AuthCrypto.tokenValid(digest.data)||strcmp(digest.data,a.data)==0){return 4;}
      first.destroy();second.destroy();a.destroy();b.destroy();digest.destroy();return 0;
    }`,
      ["--clang-flag=-l:libsodium.so.23"],
    );
  },
  90000,
);
const sqlite =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";
test.skipIf(
  process.platform !== "linux" ||
    !sodium.includes("/") ||
    !sqlite.includes("/"),
)(
  "HTTPS authentication origins force Secure cookies even when the caller omits the flag",
  () => {
    native(
      `import [Auth] from "bpl-auth";import [SQLite] from "bpl-sqlite";import [Response] from "bpl-express";
    import [Map] from "std/map.bpl";import [Option] from "std/option.bpl";
    extern strstr(a:string,b:string) ret string;
    frame main() ret int {local db:SQLite=SQLite.open(":memory:");local auth:Auth=Auth.new(&db,"https://app.example",false);
      if(!auth.secure){return 1;}local res:Response=Response.new(-1);auth.cookie(&res,"test","0");
      if(strstr(res.headers.get("Set-Cookie").unwrap(),"; Secure")==nullptr){return 2;}res.destroy();auth.destroy();db.close();return 0;
    }`,
      ["--clang-flag=-l:libsodium.so.23", "--clang-flag=-l:libsqlite3.so.0"],
    );
  },
  90000,
);

test.skipIf(
  process.platform !== "linux" ||
    !sodium.includes("/") ||
    !sqlite.includes("/"),
)(
  "authentication cookies preserve unrelated Set-Cookie fields",
  () => {
    native(
      String.raw`
import [Auth] from "bpl-auth";
import [SQLite] from "bpl-sqlite";
import [Response] from "bpl-express";
import [Array] from "std/array.bpl";
extern strcmp(a:string,b:string)ret int;
extern strstr(a:string,b:string)ret string;
frame main()ret int{
 local db:SQLite=SQLite.open(":memory:");local database:*SQLite=&db;defer database.close();
 local auth:Auth=Auth.new(&db,"https://app.example",true);local owner:*Auth=&auth;defer owner.destroy();
 local res:Response=Response.new(-1);local response:*Response=&res;defer response.destroy();
 res.appendHeader("Set-Cookie","theme=dark; Path=/");auth.cookie(&res,"session-token","7200");
 local cookies:Array<string>=res.headers.getAll("set-cookie");
 if(cookies.len()!=2){cookies.destroy();return 1;}
 if(strcmp(cookies.get(0),"theme=dark; Path=/")!=0||strstr(cookies.get(1),"bpl_session=session-token;")==nullptr||strstr(cookies.get(1),"; Secure")==nullptr){cookies.destroy();return 2;}
 cookies.destroy();auth.cookie(&res,"","0");cookies=res.headers.getAll("set-cookie");
 if(cookies.len()!=3||strstr(cookies.get(2),"Max-Age=0")==nullptr){cookies.destroy();return 3;}
 cookies.destroy();return 0;
}`,
      ["--clang-flag=-l:libsodium.so.23", "--clang-flag=-l:libsqlite3.so.0"],
    );
  },
  90000,
);
