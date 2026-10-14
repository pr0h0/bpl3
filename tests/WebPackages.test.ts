import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function native(source: string) {
  // Keep the source in the repository so workspace package resolution is exercised.
  const dir = mkdtempSync(resolve(".web-package-test-"));
  try {
    const file = join(dir, "main.bpl");
    writeFileSync(file, source);
    const exe = join(tmpdir(), `bpl-web-${process.pid}-${dir.split("-").at(-1)}`);
    try {
      const build = spawnSync("bun", [resolve("index.ts"), "build", file, "-o", exe], { encoding: "utf8", timeout: 60000 });
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
      expect(run.status, run.stdout + run.stderr).toBe(0);
    } finally { rmSync(exe, { force: true }); }
  } finally { rmSync(dir, { force: true, recursive: true }); }
}

test("HTTP parser bounds framing, normalizes headers, decodes query segments and owns memory", () => {
  native(`
    import [HttpParser], [ParsedRequest] from "bpl-http-parser";
    import [Option] from "std/option.bpl";
    import [Map] from "std/map.bpl";
    extern strcmp(a:string,b:string) ret int;
    frame main() ret int {
      local p: ParsedRequest = HttpParser.parse("POST /users?flag&name=a%26b+z&x=1&x=2 HTTP/1.1\\r\\nHost: localhost\\r\\ncOnTeNt-LeNgTh: 3\\r\\n\\r\\nabc");
      if (!p.valid || p.body_length != 3 || strcmp(p.body, "abc") != 0 || strcmp(p.path, "/users") != 0) { return 1; }
      if (strcmp(p.query.get("flag").unwrap(), "") != 0 || strcmp(p.query.get("name").unwrap(), "a&b z") != 0 || strcmp(p.query.get("x").unwrap(), "2") != 0) { return 2; }
      if (strcmp(p.headers.get("host").unwrap(), "localhost") != 0) { return 3; }
      p.destroy(); p.destroy();
      p = HttpParser.parse("POST / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 5\\r\\n\\r\\nabc");
      if (p.valid || p.error_code != 0) { return 4; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nBad\\r\\nHost: x\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 5; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 1\\r\\nContent-Length: 2\\r\\n\\r\\naa");
      if (p.valid || p.error_code != 400) { return 6; } p.destroy();
      p = HttpParser.parse("GET /?x=%00 HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 7; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nTransfer-Encoding: chunked\\r\\n\\r\\n0\\r\\n\\r\\n");
      if (p.valid || p.error_code != 501) { return 8; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\nHost: x\\r\\nContent-Length: 999999999999999999\\r\\n\\r\\n");
      if (p.valid || p.error_code != 413) { return 9; } p.destroy();
      p = HttpParser.parse("GET / HTTP/1.1\\r\\n\\r\\n");
      if (p.valid || p.error_code != 400) { return 10; } p.destroy();
      return 0;
    }
  `);
}, 90000);
