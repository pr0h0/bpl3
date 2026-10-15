import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test.skipIf(process.platform !== "linux")(
  "HTTP client retries interrupted writes and reads within its existing deadline",
  async () => {
    const dir = mkdtempSync(resolve(".web-client-io-"));
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => sockets.delete(socket));
      let request = "";
      let replied = false;
      socket.on("data", (chunk) => {
        request += chunk.toString();
        if (!replied && request.includes("\r\n\r\n")) {
          replied = true;
          socket.end("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");
        }
      });
    });
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      const shim = join(dir, "io.c");
      writeFileSync(
        shim,
        String.raw`
#include <errno.h>
#include <sys/socket.h>
#include <unistd.h>
static int mode, sends, reads;
void configureIO(int value) { mode=value; sends=0; reads=0; }
ssize_t __real_send(int,const void*,size_t,int);
ssize_t __real_read(int,void*,size_t);
ssize_t __wrap_send(int fd,const void *data,size_t count,int flags) {
 if(mode==1 && sends++==0) {errno=EINTR;return -1;}
 return __real_send(fd,data,count>7?7:count,flags);
}
ssize_t __wrap_read(int fd,void *data,size_t count) {
 if(mode==2 && reads++==0) {errno=EINTR;return -1;}
 return __real_read(fd,data,count);
}
`,
      );
      const source = join(dir, "main.bpl");
      writeFileSync(
        source,
        `
import [RequestBuilder], [HttpResponse] from "bpl-http-client";
extern configureIO(mode:int);
extern strcmp(a:string,b:string)ret int;
extern printf(format:string,...)ret int;
frame main()ret int{
 loop(local mode:int=1;mode<=2;mode=mode+1){
  configureIO(mode);local request:RequestBuilder=RequestBuilder.new("http://127.0.0.1:${address.port}/");
  local response:*HttpResponse=request.send();
  local ok:bool=(response.status==200)&&(response.body_length==2)&&(strcmp(response.body,"ok")==0);
  if(!ok){printf("mode %d: %s\\n",mode,response.error);}response.destroy();request.destroy();if(!ok){return mode;}
 }
 return 0;
}`,
      );
      const exe = join(dir, "client");
      const build = spawnSync(
        "bun",
        [
          resolve("index.ts"),
          "build",
          source,
          "-o",
          exe,
          "--clang-flag=-Wl,--wrap=send",
          "--clang-flag=-Wl,--wrap=read",
          `--clang-flag=${shim}`,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const processHandle = Bun.spawn([exe], {
        stdout: "pipe",
        stderr: "pipe",
      });
      child = processHandle;
      const timeout = setTimeout(() => processHandle.kill(), 15000);
      try {
        const [status, stdout, stderr] = await Promise.all([
          processHandle.exited,
          new Response(processHandle.stdout).text(),
          new Response(processHandle.stderr).text(),
        ]);
        expect(status, stdout + stderr).toBe(0);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      child?.kill();
      if (child) await child.exited;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
