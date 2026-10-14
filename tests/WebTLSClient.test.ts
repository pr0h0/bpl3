import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:https";
import { createServer as tcpServer } from "node:net";
import { createServer as tlsServer } from "node:tls";

const openssl = spawnSync("openssl", ["version"], { encoding: "utf8" });

test.skipIf(process.platform !== "linux" || openssl.status !== 0)(
  "HTTPS client sends verified requests, reads large/binary/chunked bodies, and never downgrades failures",
  async () => {
    const dir = mkdtempSync(resolve(".web-tls-client-"));
    const servers: ReturnType<typeof tcpServer>[] = [];
    const sockets = new Set<import("node:net").Socket>();
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
      const caFile = join(dir, "cert.pem");
      const credentials = {
        key: readFileSync(join(dir, "key.pem")),
        cert: readFileSync(caFile),
      };
      const received: {
        url: string | undefined;
        method: string | undefined;
        header: string | string[] | undefined;
        body: string;
      }[] = [];
      const server = createServer(credentials, (req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (data) => chunks.push(data));
        req.on("end", () => {
          received.push({
            url: req.url,
            method: req.method,
            header: req.headers["x-example"],
            body: Buffer.concat(chunks).toString(),
          });
          if (req.url === "/binary") {
            res.end(Buffer.from([97, 0, 98]));
          } else if (req.url === "/large") {
            res.end(Buffer.alloc(100000, 120));
          } else if (req.url === "/stream") {
            res.write("one");
            res.end("two");
          } else {
            res.setHeader("Content-Type", "application/json");
            res.end('{"ok":true}');
          }
        });
      });
      server.on("tlsClientError", () => {});
      async function listen(server: ReturnType<typeof tcpServer>) {
        servers.push(server);
        server.on("connection", (socket) => {
          sockets.add(socket);
          socket.on("error", () => {});
          socket.on("close", () => sockets.delete(socket));
        });
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No port");
        return address.port;
      }
      const port = await listen(server);
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [RequestBuilder],[HttpResponse],[HttpMethod] from "bpl-http-client";
extern strcmp(a:string,b:string) ret int;extern printf(fmt:string,...) ret int;
frame main(argc:int,argv:*string) ret int {
 if(argc!=4){return 9;}
 local req:RequestBuilder=RequestBuilder.new(argv[1]);local q:*RequestBuilder=&req;defer q.destroy();req.timeout_seconds=2;
 if(strcmp(argv[2],"system")!=0){req.caBundle(argv[2]);}
 if(strcmp(argv[3],"post")==0){req.setMethod(HttpMethod.POST).header("X-Example","works").json("{\\"hello\\":true}");}
 if(strcmp(argv[3],"head")==0){req.setMethod(HttpMethod.HEAD);}
 local res:*HttpResponse=req.send();defer res.destroy();
 printf("status:%d length:%ld error:%s\\n",res.status,res.body_length,res.error);
 if(res.body_length>=3){printf("bytes:%d,%d,%d\\n",cast<int>(res.body[0]),cast<int>(res.body[1]),cast<int>(res.body[2]));}
 return 0;
}`,
      );
      const exe = join(dir, "client");
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
      async function run(url: string, ca = caFile, mode = "get") {
        const child = Bun.spawn([exe, url, ca, mode], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const timer = setTimeout(() => child.kill(), 6000);
        try {
          const [status, output, error] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          expect(status, error).toBe(0);
          return output;
        } finally {
          clearTimeout(timer);
        }
      }
      expect(
        await run(`https://localhost:${port}/?x=1`, caFile, "post"),
      ).toContain("status:200");
      expect(received[0]).toEqual({
        url: "/?x=1",
        method: "POST",
        header: "works",
        body: '{"hello":true}',
      });
      expect(await run(`https://127.0.0.1:${port}/binary`)).toContain(
        "bytes:97,0,98",
      );
      expect(await run(`https://127.0.0.1:${port}/large`)).toContain(
        "status:200 length:100000",
      );
      expect(await run(`https://127.0.0.1:${port}/stream`)).toContain(
        "status:200 length:6",
      );
      expect(await run(`https://127.0.0.1:${port}/`, caFile, "head")).toContain(
        "status:200 length:0",
      );
      expect(await run(`https://127.0.0.1:${port}/`, "system")).toContain(
        "status:0",
      );
      expect(
        await run(`https://127.0.0.1:${port}/`, join(dir, "missing.pem")),
      ).toContain("status:0");
      // Peer sends plaintext instead of a TLS handshake. No plaintext HTTP request is sent.
      const wire: Buffer[] = [];
      const plain = tcpServer((socket) => {
        socket.on("data", (data) => {
          wire.push(data);
          socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
        });
      });
      expect(await run(`https://127.0.0.1:${await listen(plain)}/`)).toContain(
        "status:0",
      );
      expect(Buffer.concat(wire).includes(Buffer.from("GET / HTTP/1.1"))).toBe(
        false,
      );
      const stalled = tcpServer(() => {});
      const before = performance.now();
      expect(
        await run(`https://127.0.0.1:${await listen(stalled)}/`),
      ).toContain("status:0");
      expect(performance.now() - before).toBeLessThan(4000);
      const trickled = tlsServer(credentials, (socket) => {
        socket.on("error", () => {});
        socket.once("data", () => {
          socket.write("HTTP/1.1 200 OK\r\nContent-Length: 10000\r\n\r\n");
          const interval = setInterval(() => socket.write("x"), 150);
          socket.on("close", () => clearInterval(interval));
        });
      });
      trickled.on("tlsClientError", () => {});
      const trickleStart = performance.now();
      expect(
        await run(`https://127.0.0.1:${await listen(trickled)}/`),
      ).toContain("status:0");
      expect(performance.now() - trickleStart).toBeLessThan(4000);

      // TLS data followed by unauthenticated EOF must not be accepted as a complete response.
      const truncated = tlsServer(credentials, (socket) => {
        socket.on("error", () => {});
        socket.once("data", () =>
          socket.write("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nab", () =>
            socket.destroy(),
          ),
        );
      });
      truncated.on("tlsClientError", () => {});
      expect(
        await run(`https://127.0.0.1:${await listen(truncated)}/`),
      ).toContain("status:0");
    } finally {
      for (const socket of sockets) socket.destroy();
      for (const server of servers)
        await new Promise<void>((done) => server.close(() => done()));
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
