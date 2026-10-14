import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer, createConnection } from "node:net";
import { request } from "node:https";
import { connect } from "node:tls";

const openssl = spawnSync("openssl", ["version"], {
  encoding: "utf8",
  timeout: 10000,
});
const sslPath =
  spawnSync("clang", ["-print-file-name=libssl.so.3"], {
    encoding: "utf8",
    timeout: 10000,
  }).stdout?.trim() ?? "";

test.skipIf(
  process.platform !== "linux" ||
    openssl.status !== 0 ||
    !sslPath.includes("/"),
)(
  "native HTTPS serves streaming/binary/HEAD responses, survives bad peers and isolates stalled handshakes",
  async () => {
    const dir = mkdtempSync(resolve(".web-tls-server-"));
    let child: ReturnType<typeof Bun.spawn> | undefined;
    const sockets: import("node:net").Socket[] = [];
    try {
      const cert = spawnSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          "key.pem",
          "-out",
          "cert.pem",
          "-subj",
          "/CN=localhost",
          "-days",
          "2",
          "-addext",
          "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        { cwd: dir, encoding: "utf8" },
      );
      expect(cert.status, cert.stderr).toBe(0);
      const ca = readFileSync(join(dir, "cert.pem"));
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
extern atoi(value:string) ret int;
frame initialize(){}
frame health(_req:*Request,res:*Response){res.text("ready");}
frame stream(_req:*Request,res:*Response){res.write("one");res.write("two");res.end();}
frame binary(_req:*Request,res:*Response){local body:char[4]=['a',0,'b',0];res.sendBytes(cast<string>(&body[0]),4);}
frame echo(req:*Request,res:*Response){res.sendBytes(req.body,req.body_length);}
frame main(argc:int,argv:*string) ret int {
 if(argc!=5){return 2;}
 local app:App=App.new();app.timeout_seconds=2;app.request_timeout_seconds=2;
 app.router.get("/",health);app.router.get("/stream",stream);app.router.get("/binary",binary);app.router.post("/echo",echo);
 if(atoi(argv[4])==1){app.listenTLS(atoi(argv[1]),"127.0.0.1",argv[2],argv[3]);}else{app.listenTLSWorkers(atoi(argv[1]),"127.0.0.1",2,initialize,argv[2],argv[3]);}return 0;
}`,
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
      const bad = spawnSync(
        exe,
        [String(port), join(dir, "cert.pem"), join(dir, "missing.pem"), "1"],
        { encoding: "utf8", timeout: 10000 },
      );
      expect(bad.status).not.toBe(0);
      const encryptedKey = spawnSync(
        "openssl",
        [
          "pkey",
          "-in",
          "key.pem",
          "-aes-256-cbc",
          "-passout",
          "pass:local-fixture",
          "-out",
          "encrypted.pem",
        ],
        { cwd: dir, encoding: "utf8" },
      );
      expect(encryptedKey.status, encryptedKey.stderr).toBe(0);
      const encrypted = spawnSync(
        exe,
        [String(port), join(dir, "cert.pem"), join(dir, "encrypted.pem"), "1"],
        { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
      );
      expect(encrypted.error).toBeUndefined();
      expect(encrypted.status).not.toBeNull();
      expect(encrypted.status).not.toBe(0);
      expect(encrypted.stderr).not.toContain("Enter PEM pass phrase");
      child = Bun.spawn(
        [exe, String(port), join(dir, "cert.pem"), join(dir, "key.pem"), "2"],
        { stdout: "ignore", stderr: "pipe" },
      );
      function get(
        path = "/",
        method = "GET",
        body?: Buffer,
        trusted = true,
      ): Promise<{
        status: number | undefined;
        body: Buffer;
        headers: import("node:http").IncomingHttpHeaders;
      }> {
        return new Promise((done, reject) => {
          const req = request(
            {
              hostname: "127.0.0.1",
              port,
              path,
              method,
              ca: trusted ? ca : undefined,
              agent: false,
              timeout: 5000,
              headers: body ? { "Content-Length": body.length } : undefined,
            },
            (response) => {
              const chunks: Buffer[] = [];
              response.on("data", (data) => chunks.push(data));
              response.on("error", reject);
              response.on("end", () =>
                done({
                  status: response.statusCode,
                  body: Buffer.concat(chunks),
                  headers: response.headers,
                }),
              );
            },
          );
          req.on("error", reject);
          req.on("timeout", () => req.destroy(new Error("timeout")));
          req.end(body);
        });
      }
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await get()).status === 200) {
            ready = true;
            break;
          }
        } catch {}
        await Bun.sleep(20);
      }
      expect(ready).toBe(true);
      expect((await get()).body.toString()).toBe("ready");
      await expect(get("/", "GET", undefined, false)).rejects.toThrow();
      expect((await get("/stream")).body.toString()).toBe("onetwo");
      expect((await get("/binary")).body).toEqual(Buffer.from([97, 0, 98, 0]));
      const head = await get("/", "HEAD");
      expect(head.body.length).toBe(0);
      expect(head.headers["content-length"]).toBe("5");
      const large = Buffer.alloc(100000, 120);
      large[1000] = 0;
      expect((await get("/echo", "POST", large)).body).toEqual(large);
      // Plain HTTP must never be processed as HTTP on the TLS listener.
      const plain = createConnection({ host: "127.0.0.1", port });
      sockets.push(plain);
      const plainChunks: Buffer[] = [];
      plain.on("data", (data) => plainChunks.push(data));
      plain.on("error", () => {});
      await new Promise<void>((done) => {
        plain.on("connect", () =>
          plain.write("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n"),
        );
        plain.on("close", () => done());
      });
      expect(Buffer.concat(plainChunks).toString()).not.toContain("ready");
      // An unfinished TLS handshake occupies one worker, while another serves normally.
      const stalled = createConnection({ host: "127.0.0.1", port });
      sockets.push(stalled);
      stalled.on("error", () => {});
      await new Promise<void>((done) => stalled.on("connect", () => done()));
      const start = performance.now();
      expect((await get()).status).toBe(200);
      expect(performance.now() - start).toBeLessThan(1500);
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(
          () => reject(new Error("TLS handshake did not time out")),
          4000,
        );
        stalled.on("close", () => {
          clearTimeout(timer);
          done();
        });
      });
      // Decrypted byte trickling must also obey the total request deadline.
      const slow = connect({ host: "127.0.0.1", port, ca });
      sockets.push(slow);
      slow.on("error", () => {});
      const slowChunks: Buffer[] = [];
      slow.on("data", (data) => slowChunks.push(data));
      await new Promise<void>((done, reject) => {
        slow.on("secureConnect", () => {
          slow.write("GET / HTTP/1.1\r\nHost: localhost\r\n");
          done();
        });
        slow.once("error", reject);
      });
      const timer = setInterval(() => slow.write("X"), 150);
      try {
        await new Promise<void>((done, reject) => {
          const limit = setTimeout(
            () => reject(new Error("TLS request deadline missing")),
            4000,
          );
          slow.on("close", () => {
            clearTimeout(limit);
            done();
          });
        });
        expect(Buffer.concat(slowChunks).toString()).toContain("408");
      } finally {
        clearInterval(timer);
      }
      // Abort connections during writes; workers must remain alive (no SIGPIPE).
      for (let i = 0; i < 8; i++) {
        await new Promise<void>((done) => {
          const socket = connect({ host: "127.0.0.1", port, ca });
          sockets.push(socket);
          socket.on("error", () => {});
          socket.on("secureConnect", () => {
            socket.write("GET /stream HTTP/1.1\r\nHost: localhost\r\n\r\n");
            socket.destroy();
            done();
          });
        });
      }
      expect((await get()).body.toString()).toBe("ready");
      expect(child.exitCode).toBeNull();
      child.kill();
      await child.exited;
      child = Bun.spawn(
        [exe, String(port), join(dir, "cert.pem"), join(dir, "key.pem"), "1"],
        { stdout: "ignore", stderr: "pipe" },
      );
      let singleReady = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await get()).status === 200) {
            singleReady = true;
            break;
          }
        } catch {}
        await Bun.sleep(20);
      }
      expect(singleReady).toBe(true);
      expect((await get("/stream")).body.toString()).toBe("onetwo");
    } finally {
      for (const socket of sockets) socket.destroy();
      child?.kill();
      if (child) await child.exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
