import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { request } from "node:http";
import { makeRepoTempDir } from "./helpers/repoTempDir";

test.skipIf(process.platform !== "linux")(
  "HTTP shutdown drains active responses, cleans workers, and bounds stuck handlers",
  async () => {
    const dir = makeRepoTempDir("web-shutdown-test-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [App],[Request],[Response] from "bpl-express";
extern atoi(text:string) ret int;extern usleep(time:uint) ret int;extern printf(fmt:string,...) ret int;extern fflush(stream:*void) ret int;
frame initialize(){}frame broken(){throw "initialization fixture";}frame cleanup(){printf("worker cleaned\\n");fflush(nullptr);}
frame health(_req:*Request,res:*Response){res.text("ready");}
frame slow(_req:*Request,res:*Response){res.write("begin");usleep(600000);res.write("end");res.end();}
frame stuck(_req:*Request,res:*Response){res.write("begin");usleep(10000000);res.write("end");res.end();}
frame main(argc:int,argv:*string)ret int{if(argc!=3){return 2;}local app:App=App.new();app.shutdown_timeout_seconds=2;app.worker_restart_limit=2;app.onWorkerShutdown(cleanup);app.router.get("/",health);app.router.get("/slow",slow);app.router.get("/stuck",stuck);if(atoi(argv[2])==0){app.listenOn(atoi(argv[1]),"127.0.0.1");}else if(atoi(argv[2])==3){app.listenWorkers(atoi(argv[1]),"127.0.0.1",2,broken);}else{app.listenWorkers(atoi(argv[1]),"127.0.0.1",2,initialize);}return 0;}`,
      );
      const exe = join(dir, "server");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          join(dir, "main.bpl"),
          "-O",
          "3",
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      for (const mode of ["single", "workers", "stuck"]) {
        const probe = createServer();
        await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
        const address = probe.address();
        if (!address || typeof address === "string") throw new Error("No port");
        const port = address.port;
        await new Promise<void>((done) => probe.close(() => done()));
        child = Bun.spawn([exe, String(port), mode === "single" ? "0" : "2"], {
          stdout: "pipe",
          stderr: "pipe",
        });
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
        const workerPids = readFileSync(
          `/proc/${child.pid}/task/${child.pid}/children`,
          "utf8",
        )
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(Number);
        let began!: () => void;
        const started = new Promise<void>((done) => (began = done));
        const response = new Promise<{ body: string; complete: boolean }>(
          (done, reject) => {
            const req = request(
              {
                host: "127.0.0.1",
                port,
                path: mode === "stuck" ? "/stuck" : "/slow",
                agent: false,
                timeout: 5000,
              },
              (res) => {
                let body = "";
                res.on("data", (chunk) => {
                  body += chunk.toString();
                  began();
                });
                res.on("end", () => done({ body, complete: true }));
                res.on("error", () => done({ body, complete: false }));
              },
            );
            req.on("error", reject);
            req.on("timeout", () => req.destroy(new Error("timeout")));
            req.end();
          },
        );
        await started;
        const before = performance.now();
        child.kill(mode === "single" ? "SIGINT" : "SIGTERM");
        const exit = await child.exited;
        const result = await response;
        expect(exit).toBe(0);
        expect(performance.now() - before).toBeLessThan(4000);
        const stdout = child.stdout;
        if (!stdout || typeof stdout === "number")
          throw new Error("Expected captured stdout");
        const logs = await new Response(stdout).text();
        expect(
          result,
          mode + " elapsed:" + (performance.now() - before) + " logs:" + logs,
        ).toEqual(
          mode === "stuck"
            ? { body: "begin", complete: false }
            : { body: "beginend", complete: true },
        );

        if (mode === "workers")
          expect(logs.match(/worker cleaned/g)?.length).toBe(2);
        for (const pid of workerPids)
          expect(spawnSync("kill", ["-0", String(pid)]).status).not.toBe(0);
        child = undefined;
      }
    } finally {
      child?.kill("SIGKILL");
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
