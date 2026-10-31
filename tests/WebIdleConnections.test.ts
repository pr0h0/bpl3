import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { connect, createServer, type Socket } from "node:net";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";

// BUG-461: each worker served one connection at a time from accept, so idle
// sockets (browser preconnects) held it for the whole request timeout.
test.skipIf(process.platform !== "linux")(
  "idle connections do not block requests and are closed after the request timeout",
  async () => {
    const dir = makeRepoTempDir("web-idle-test-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    const idle: Socket[] = [];
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [App],[Request],[Response] from "bpl-express";
extern atoi(text:string) ret int;
frame initialize(){}
frame health(_req:*Request,res:*Response){res.text("ready");}
frame main(argc:int,argv:*string)ret int{if(argc!=3){return 2;}local app:App=App.new();app.request_timeout_seconds=2;app.router.get("/",health);if(atoi(argv[2])==0){app.listenOn(atoi(argv[1]),"127.0.0.1");}else{app.listenWorkers(atoi(argv[1]),"127.0.0.1",1,initialize);}return 0;}`,
      );
      const exe = join(dir, "server");
      const build = spawnSync(
        "bun",
        [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);

      for (const mode of ["0", "1"]) {
        const probe = createServer();
        await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
        const address = probe.address();
        if (!address || typeof address === "string") throw new Error("No port");
        const port = address.port;
        await new Promise<void>((done) => probe.close(() => done()));
        child = Bun.spawn([exe, String(port), mode], {
          stdout: "ignore",
          stderr: "pipe",
        });
        let ready = false;
        for (let i = 0; i < 200 && !ready; i++) {
          try {
            ready = (await fetch(`http://127.0.0.1:${port}/`)).ok;
          } catch {
            await Bun.sleep(20);
          }
        }
        expect(ready).toBe(true);

        const closed: Promise<number>[] = [];
        const opened = performance.now();
        for (let i = 0; i < 4; i++) {
          const socket = connect(port, "127.0.0.1");
          await new Promise<void>((done) => socket.once("connect", done));
          closed.push(
            new Promise((done) =>
              socket.once("close", () => done(performance.now() - opened)),
            ),
          );
          socket.on("error", () => {});
          idle.push(socket);
        }

        const started = performance.now();
        const response = await fetch(`http://127.0.0.1:${port}/`);
        expect(await response.text()).toBe("ready");
        expect(performance.now() - started).toBeLessThan(1000);

        // Silent connections are dropped once the request timeout passes.
        for (const after of await Promise.all(closed)) {
          expect(after).toBeGreaterThan(1500);
          expect(after).toBeLessThan(6000);
        }
        idle.splice(0).forEach((socket) => socket.destroy());
        child.kill("SIGTERM");
        await child.exited;
        child = undefined;
      }
    } finally {
      idle.forEach((socket) => socket.destroy());
      child?.kill("SIGKILL");
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
