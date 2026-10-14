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
      import [Form] from "bpl-web-middleware";
      import [Option] from "std/option.bpl";
      extern strcmp(a:string,b:string) ret int;
      frame main() ret int {
        local request:RequestBuilder=RequestBuilder.new("https://");local response:*HttpResponse=request.send();if(response.status!=0){return 3;}response.destroy();request.destroy();
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
