import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer as tlsServer } from "node:tls";
import { createServer as tcpServer } from "node:net";
import { makeRepoTempDir } from "./helpers/repoTempDir";

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
  "native TLS verifies trust, DNS/IP identity and expiry, and bounds stalled handshakes",
  async () => {
    const dir = makeRepoTempDir("web-tls-test-");
    const servers: ReturnType<typeof tcpServer>[] = [];
    try {
      function command(args: string[]) {
        const result = spawnSync("openssl", args, {
          cwd: dir,
          encoding: "utf8",
        });
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
      command([
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        "ca.key",
        "-out",
        "ca.pem",
        "-subj",
        "/CN=BPL test CA",
        "-days",
        "2",
      ]);
      command([
        "req",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        "leaf.key",
        "-out",
        "leaf.csr",
        "-subj",
        "/CN=localhost",
      ]);
      writeFileSync(
        join(dir, "extensions"),
        "subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n",
      );
      command([
        "x509",
        "-req",
        "-in",
        "leaf.csr",
        "-CA",
        "ca.pem",
        "-CAkey",
        "ca.key",
        "-CAcreateserial",
        "-out",
        "leaf.pem",
        "-days",
        "1",
        "-extfile",
        "extensions",
      ]);
      writeFileSync(join(dir, "index"), "");
      writeFileSync(join(dir, "serial"), "1000\n");
      writeFileSync(
        join(dir, "ca.cnf"),
        "[ca]\ndefault_ca=local\n[local]\ndatabase=index\nserial=serial\nnew_certs_dir=.\ncertificate=ca.pem\nprivate_key=ca.key\ndefault_md=sha256\npolicy=policy\n[policy]\ncommonName=supplied\n",
      );
      command([
        "ca",
        "-batch",
        "-config",
        "ca.cnf",
        "-in",
        "leaf.csr",
        "-out",
        "expired.pem",
        "-startdate",
        "20200101000000Z",
        "-enddate",
        "20200102000000Z",
        "-extfile",
        "extensions",
      ]);
      writeFileSync(
        join(dir, "main.bpl"),
        `
import [TlsContext],[TlsConnection] from "bpl-tls";
import socket,htons,close,memset,[sockaddr_in],atoi from "${resolve("packages/bpl-http-client/src/libc.bpl")}";
extern connect(fd:int,address:*sockaddr_in,size:uint) ret int;
extern printf(fmt:string,...) ret int;
frame main(argc:int,argv:*string) ret int {
 if(argc!=4){return 9;}
 local context:TlsContext=TlsContext.client(argv[1]);local c:*TlsContext=&context;defer c.destroy();
 local fd:int=socket(2,1,0);defer close(fd);local addr:sockaddr_in;memset(&addr,0,sizeof<sockaddr_in>());
 addr.sin_family=2;addr.sin_addr=16777343;addr.sin_port=htons(cast<ushort>(atoi(argv[2])));
 if(connect(fd,&addr,16)!=0){return 8;}
 local tls:TlsConnection=TlsConnection.empty();local t:*TlsConnection=&tls;defer t.destroy();
 local deadline:long=TlsConnection.deadline(2);
 if(!tls.open(&context,fd,argv[3],deadline)){return 2;}
 if(!tls.writeAll("ping",4,deadline)){return 3;}
 local buffer:char[128];local used:long=0;
 loop {local n:long=tls.read(cast<string>(&buffer[used]),128-used,deadline);if(n<0){return 4;}if(n==0){break;}used=used+n;}
 printf("received:%ld:%c%c%c%c\\n",used,buffer[0],buffer[1],buffer[2],buffer[3]);return 0;
}`,
      );
      const exe = join(dir, "probe");
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
      async function listen(server: ReturnType<typeof tcpServer>) {
        servers.push(server);
        await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No port");
        return address.port;
      }
      async function run(port: number, host: string, ca = join(dir, "ca.pem")) {
        const child = Bun.spawn([exe, ca, String(port), host], {
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
          return { status, output, error };
        } finally {
          clearTimeout(timer);
        }
      }
      const server = tlsServer(
        {
          key: readFileSync(join(dir, "leaf.key")),
          cert: readFileSync(join(dir, "leaf.pem")),
        },
        (socket) => {
          socket.on("error", () => {});
          socket.once("data", (data) => {
            expect(data.toString()).toBe("ping");
            socket.end("pong");
          });
        },
      );
      server.on("tlsClientError", () => {});
      const port = await listen(server);
      for (const host of ["localhost", "127.0.0.1"]) {
        const result = await run(port, host);
        expect(result.status, result.error).toBe(0);
        expect(result.output).toContain("received:4:pong");
      }
      expect((await run(port, "wrong.example")).status).toBe(2);
      expect((await run(port, "127.0.0.2")).status).toBe(2);
      expect((await run(port, "localhost", join(dir, "leaf.pem"))).status).toBe(
        2,
      );

      writeFileSync(
        join(dir, "wildcard-ext"),
        "subjectAltName=DNS:www*.example.test\nextendedKeyUsage=serverAuth\n",
      );
      command([
        "x509",
        "-req",
        "-in",
        "leaf.csr",
        "-CA",
        "ca.pem",
        "-CAkey",
        "ca.key",
        "-out",
        "partial.pem",
        "-days",
        "1",
        "-extfile",
        "wildcard-ext",
      ]);
      const partial = tlsServer({
        key: readFileSync(join(dir, "leaf.key")),
        cert: readFileSync(join(dir, "partial.pem")),
      });
      partial.on("tlsClientError", () => {});
      expect(
        (await run(await listen(partial), "www1.example.test")).status,
      ).toBe(2);
      writeFileSync(
        join(dir, "wildcard-ext"),
        "subjectAltName=DNS:*.example.test\nextendedKeyUsage=serverAuth\n",
      );
      command([
        "x509",
        "-req",
        "-in",
        "leaf.csr",
        "-CA",
        "ca.pem",
        "-CAkey",
        "ca.key",
        "-out",
        "wildcard.pem",
        "-days",
        "1",
        "-extfile",
        "wildcard-ext",
      ]);
      const wildcard = tlsServer(
        {
          key: readFileSync(join(dir, "leaf.key")),
          cert: readFileSync(join(dir, "wildcard.pem")),
        },
        (socket) => {
          socket.on("error", () => {});
          socket.once("data", () => socket.end("pong"));
        },
      );
      wildcard.on("tlsClientError", () => {});
      const wildcardPort = await listen(wildcard);
      expect((await run(wildcardPort, "www1.example.test")).status).toBe(0);
      expect((await run(wildcardPort, "www1.sub.example.test")).status).toBe(2);
      const tls12 = tlsServer(
        {
          key: readFileSync(join(dir, "leaf.key")),
          cert: readFileSync(join(dir, "leaf.pem")),
          minVersion: "TLSv1.2",
          maxVersion: "TLSv1.2",
        },
        (socket) => {
          socket.on("error", () => {});
          socket.once("data", () => socket.end("pong"));
        },
      );
      tls12.on("tlsClientError", () => {});
      expect((await run(await listen(tls12), "localhost")).status).toBe(0);
      const expired = tlsServer({
        key: readFileSync(join(dir, "leaf.key")),
        cert: readFileSync(join(dir, "expired.pem")),
      });
      expired.on("tlsClientError", () => {});
      expect((await run(await listen(expired), "localhost")).status).toBe(2);
      const sockets = new Set<import("node:net").Socket>();
      const stalled = tcpServer((socket) => {
        sockets.add(socket);
        socket.on("error", () => {});
        socket.on("close", () => sockets.delete(socket));
      });
      const start = performance.now();
      expect((await run(await listen(stalled), "localhost")).status).toBe(2);
      expect(performance.now() - start).toBeLessThan(4000);
      for (const socket of sockets) socket.destroy();
    } finally {
      for (const server of servers)
        await new Promise<void>((done) => server.close(() => done()));
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
