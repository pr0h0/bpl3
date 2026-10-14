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
