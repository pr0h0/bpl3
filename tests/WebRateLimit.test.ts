import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { request } from "node:http";
const sqlite =
  spawnSync("clang", ["-print-file-name=libsqlite3.so.0"], {
    encoding: "utf8",
  }).stdout?.trim() ?? "";

test.skipIf(process.platform !== "linux" || !sqlite.includes("/"))(
  "rate limit middleware admits exactly its budget across workers and ignores forwarded identities",
  async () => {
    const dir = mkdtempSync(resolve(".web-rate-test-"));
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      const probe = createServer();
      await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
      const address = probe.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const port = address.port;
      await new Promise<void>((done) => probe.close(() => done()));
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [App],[Request],[Response] from "bpl-express";
import [SQLite],[Statement] from "bpl-sqlite";
import [RateLimiter],[RateDecision] from "bpl-rate-limit";
extern malloc(size:long)ret *void;extern strcmp(a:string,b:string)ret int;
global database:*SQLite;global limiter:RateLimiter;
frame initialize(){database=cast<*SQLite>(malloc(sizeof<SQLite>()));*database=SQLite.open(${JSON.stringify(join(dir, "app.sqlite"))});limiter=RateLimiter.new(database);}
frame health(_req:*Request,res:*Response){res.text("ready");}
frame gate(req:*Request,res:*Response){if(strcmp(req.path,"/limited")==0){limiter.apply(req,res,"test",20,60);}}
frame main(){local db:SQLite=SQLite.open(${JSON.stringify(join(dir, "app.sqlite"))});db.setWAL(true);local limits:RateLimiter=RateLimiter.new(&db);limits.max_keys=1;
 local first:RateDecision=limits.check("capacity","first",2,60);if(!first.allowed){throw "Missing first admission";}
 local denied:RateDecision=limits.check("capacity","second",2,60);if(denied.allowed){throw "Key capacity was exceeded";}
 if(!limits.check("capacity","first",2,60).allowed||limits.check("capacity","first",2,60).allowed){throw "Invalid admission budget";}
 db.exec("UPDATE bpl_rate_limits SET reset_at=0");if(!limits.check("capacity","second",2,60).allowed){throw "Expired key did not release capacity";}
 db.begin();local caught:bool=false;try{limits.check("capacity","tx",1,60);}catch{caught=true;}db.rollback();if(!caught){throw "Rate counter admitted an application transaction";}
 db.exec("DELETE FROM bpl_rate_limits");db.close();local app:App=App.new();app.beforeRequest(gate);app.router.get("/",health);app.router.get("/limited",health);app.listenWorkers(${port},"127.0.0.1",2,initialize);}
`,
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
      child = Bun.spawn([exe], { stdout: "ignore", stderr: "pipe" });
      let ready = false;
      for (let i = 0; i < 200; i++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(20);
      }
      expect(ready).toBe(true);
      function send(
        localAddress = "127.0.0.1",
        forwarded = "203.0.113.1",
      ): Promise<{ status: number; retry: string | undefined }> {
        return new Promise((done, reject) => {
          const req = request(
            {
              host: "127.0.0.1",
              port,
              path: "/limited",
              localAddress,
              agent: false,
              timeout: 10000,
              headers: { "X-Forwarded-For": forwarded, "X-Real-IP": forwarded },
            },
            (res) => {
              res.resume();
              res.on("error", reject);
              res.on("end", () =>
                done({
                  status: res.statusCode ?? 0,
                  retry: res.headers["retry-after"] as string | undefined,
                }),
              );
            },
          );
          req.on("error", reject);
          req.on("timeout", () => req.destroy(new Error("timeout")));
          req.end();
        });
      }
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, i) =>
          send("127.0.0.1", `203.0.113.${i + 1}`),
        ),
      );
      expect(results.filter((row) => row.status === 200).length).toBe(20);
      expect(results.filter((row) => row.status === 429).length).toBe(20);
      for (const denied of results.filter((row) => row.status === 429)) {
        expect(Number(denied.retry)).toBeGreaterThan(0);
        expect(Number(denied.retry)).toBeLessThanOrEqual(60);
      }
      expect((await send("127.0.0.1", "127.0.0.2")).status).toBe(429);
      // Bun's node:http adapter ignores localAddress here; use Node to verify a real bound socket.
      const otherPeer = spawnSync(
        "node",
        [
          "-e",
          `const http=require('node:http');const req=http.request({host:'127.0.0.1',port:Number(process.argv[1]),path:'/limited',localAddress:'127.0.0.2',agent:false,headers:{'X-Forwarded-For':'127.0.0.1'}},res=>{res.resume();res.on('end',()=>{if(req.socket.localAddress!=='127.0.0.2')process.exit(2);console.log(res.statusCode);});});req.on('error',()=>process.exit(3));req.end();`,
          String(port),
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(otherPeer.status, otherPeer.stderr).toBe(0);
      expect(otherPeer.stdout.trim()).toBe("200");
      expect(child.exitCode).toBeNull();
    } finally {
      child?.kill();
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
