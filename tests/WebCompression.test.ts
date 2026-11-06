import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { makeRepoTempDir } from "./helpers/repoTempDir";

const zlib =
  spawnSync("clang", ["-print-file-name=libz.so.1"], {
    encoding: "utf8",
  }).stdout?.trim() ?? "";
test.skipIf(process.platform !== "linux" || !zlib.includes("/"))(
  "optional gzip middleware produces browser-compatible bytes and honors HEAD, quality and no-transform",
  () => {
    const dir = makeRepoTempDir("web-package-test-compression-");
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        String.raw`
import [Compression] from "bpl-web-middleware";
import [Request], [Response], [HttpMethod] from "bpl-express";
extern strcmp(a:string,b:string)ret int;
frame main(argc:int,argv:*string)ret int{
 if(argc!=3){return 1;}local req:Request=Request.new();req.method=HttpMethod.GET;req.headers.set("Accept-Encoding",argv[1]);
 local res:Response=Response.new(1);res.setHeader("ETag","\"v1\"");res.setHeader("Vary","Origin");Compression.attach(&req,&res);
 if(strcmp(argv[2],"HEAD")==0){req.method=HttpMethod.HEAD;res.head_only=true;}
 if(strcmp(argv[2],"plain")==0){res.setHeader("Cache-Control","NO-TRANSFORM");}
 if(strcmp(argv[2],"304")==0){res.status(304).end();req.destroy();res.destroy();return 0;}
 if(strcmp(argv[2],"range")==0){res.status(206).setHeader("Content-Range","bytes 0-4095/8192");}
 local data:char[4096];loop(local i:int=0;i<4096;i=i+1){data[i]='a';}data[71]=0;data[72]=cast<char>(255);
 res.sendBytes(cast<string>(&data[0]),4096);req.destroy();res.destroy();return 0;
}`,
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
          "-o",
          exe,
        ],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = (encoding: string, mode = "GET") => {
        const result = spawnSync(exe, [encoding, mode], { timeout: 10000 });
        expect(result.status, result.stderr.toString()).toBe(0);
        const split = result.stdout.indexOf("\r\n\r\n");
        expect(split).toBeGreaterThan(0);
        return {
          headers: result.stdout.subarray(0, split).toString(),
          body: result.stdout.subarray(split + 4),
        };
      };
      const expected = Buffer.alloc(4096, 97);
      expected[71] = 0;
      expected[72] = 255;
      const compressed = run("gzip");
      expect(compressed.headers).toContain("Content-Encoding: gzip");
      expect(compressed.headers).toContain('ETag: W/"v1"');
      expect(compressed.headers).toContain("Vary: Origin, Accept-Encoding");
      expect(gunzipSync(compressed.body)).toEqual(expected);
      for (const encoding of ["identity", "gzip;q=0", "gzip;q=0.5"]) {
        const response = run(encoding);
        expect(response.headers).not.toContain("Content-Encoding:");
        expect(response.body).toEqual(expected);
      }
      const forced = run("gzip, identity;q=0");
      expect(gunzipSync(forced.body)).toEqual(expected);
      const rejected = run("br, identity;q=0");
      expect(rejected.headers).toContain("406 Response");
      const head = run("gzip", "HEAD");
      expect(head.body).toHaveLength(0);
      expect(head.headers).toContain(
        `Content-Length: ${compressed.body.length}`,
      );
      const cached = run("gzip", "304");
      expect(cached.body).toHaveLength(0);
      expect(cached.headers).toContain("Vary: Origin, Accept-Encoding");
      const plain = run("gzip", "plain");
      expect(plain.headers).not.toContain("Content-Encoding:");
      expect(plain.body).toEqual(expected);
      const partial = run("gzip", "range");
      expect(partial.headers).not.toContain("Content-Encoding:");
      expect(partial.body).toEqual(expected);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  90000,
);
