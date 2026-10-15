import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test.skipIf(process.platform !== "linux")(
  "HTTP client applies HEAD response semantics to the actual method token",
  async () => {
    const dir = mkdtempSync(resolve(".web-client-methods-"));
    const sockets = new Set<Socket>();
    const methods: string[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.on("close", () => sockets.delete(socket));
      let request = "";
      socket.on("data", (chunk) => {
        request += chunk.toString();
        if (!request.includes("\r\n\r\n")) return;
        const method = request.split(" ")[0]!;
        methods.push(method);
        socket.end(
          "HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: close\r\n\r\n" +
            (method === "HEAD" ? "" : "body data"),
        );
      });
    });
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      writeFileSync(
        join(dir, "main.bpl"),
        `import [RequestBuilder], [HttpResponse], [HttpMethod] from "bpl-http-client";
extern printf(format:string,...)ret int;
frame main()ret int {
${[
  ["request.setMethod(HttpMethod.HEAD);", 0],
  ['request.methodCustom("HEAD");', 0],
  ['request.methodCustom("head");', 9],
  ["", 9],
]
  .map(
    ([configure, length], i) => `{
local request:RequestBuilder=RequestBuilder.new("http://127.0.0.1:${address.port}/");
${configure}
local response:*HttpResponse=request.send();
if(response.status!=200||response.body_length!=${length}){printf("case ${i}: %d %ld %s\\n",response.status,response.body_length,response.error);response.destroy();request.destroy();return ${i + 1};}
response.destroy();request.destroy();
}`,
  )
  .join("\n")}
return 0;
}`,
      );
      const exe = join(dir, "client");
      const build = spawnSync(
        "bun",
        [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const processHandle = Bun.spawn([exe], {
        stdout: "pipe",
        stderr: "pipe",
      });
      child = processHandle;
      const timeout = setTimeout(() => child?.kill(), 10000);
      try {
        const [status, stdout, stderr] = await Promise.all([
          processHandle.exited,
          new Response(processHandle.stdout).text(),
          new Response(processHandle.stderr).text(),
        ]);
        expect(status, stdout + stderr).toBe(0);
        expect(methods).toEqual(["HEAD", "HEAD", "head", "GET"]);
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
