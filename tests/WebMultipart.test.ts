import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";
import { native } from "./helpers/webPackages";

test("multipart parser reads fields and binary files serialized by a real FormData encoder", async () => {
  const form = new FormData();
  form.append("title", "Report \u00e9");
  form.append("empty", "");
  const bytes = new Uint8Array(300);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  form.append(
    "upload",
    new Blob([bytes], { type: "image/png" }),
    "../../etc/a.png",
  );
  form.append("note", "line1\r\nline2\r\n--not-a-boundary");
  const request = new Request("http://localhost/", {
    method: "POST",
    body: form,
  });
  const contentType = request.headers.get("content-type")!;
  const body = Buffer.from(await request.arrayBuffer());
  const dir = makeRepoTempDir("multipart-test-");
  const outDir = mkdtempSync(join(tmpdir(), "bpl-multipart-"));
  try {
    const bodyPath = join(dir, "body.bin");
    writeFileSync(bodyPath, body);
    const file = join(dir, "main.bpl");
    writeFileSync(
      file,
      String.raw`
import [Multipart], [MultipartPart] from "bpl-web-middleware";
import [Array] from "std/array.bpl";
import [FS] from "std/fs.bpl";
extern strcmp(a: string, b: string) ret int;
frame main() ret int {
    local bytes: Array<u8> = FS.readBytes(${JSON.stringify(bodyPath)});
    local boundary: string = Multipart.boundary(${JSON.stringify(contentType)});
    if (boundary == nullptr) { return 1; }
    local form: Multipart = Multipart.parse(boundary, cast<string>(bytes.data), cast<long>(bytes.len()), 16);
    if (form.count() != 4) { return 2; }
    if (strcmp(form.field("title").unwrap(), "Report \u00e9") != 0 || strcmp(form.field("empty").unwrap(), "") != 0) { return 3; }
    if (strcmp(form.field("note").unwrap(), "line1\r\nline2\r\n--not-a-boundary") != 0) { return 4; }
    if (form.field("upload").isSome() || form.file("title") != nullptr) { return 5; }
    local upload: *MultipartPart = form.file("upload");
    if (upload == nullptr || upload.size != 300 || strcmp(upload.filename, "a.png") != 0 || strcmp(upload.content_type, "image/png") != 0) { return 6; }
    loop (local i: int = 0; i < 300; i = i + 1) {
        if (cast<int>(cast<u8>(upload.data[i])) != (i % 256)) { return 7; }
    }
    if (strcmp(form.get(0).content_type, "text/plain") != 0) { return 8; }
    form.destroy();
    local caught: bool = false;
    try { Multipart.parse(boundary, cast<string>(bytes.data), cast<long>(bytes.len()), 3); } catch { caught = true; }
    if (!caught) { return 9; }
    # Every truncation of the body is rejected rather than half-parsed.
    loop (local cut: int = 0; cut < (bytes.len() - 4); cut = cut + 7) {
        local failed: bool = false;
        try {
            local partial: Multipart = Multipart.parse(boundary, cast<string>(bytes.data), cast<long>(cut), 16);
            partial.destroy();
        } catch {
            failed = true;
        }
        if (!failed) { return 10; }
    }
    bytes.destroy();
    return 0;
}`,
    );
    const exe = join(outDir, "main");
    const build = spawnSync(
      "bun",
      [resolve("index.ts"), "build", file, "-o", exe],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const run = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
    rmSync(outDir, { force: true, recursive: true });
  }
}, 90000);

test("multipart boundaries, requests and malformed bodies", () => {
  native(String.raw`
import [Multipart] from "bpl-web-middleware";
import [App], [Request] from "bpl-express";
extern strcmp(a: string, b: string) ret int;
extern free(p: *void) ret void;
extern strlen(s: string) ret long;
frame boundaryIs(media: string, expected: string) ret bool {
    local found: string = Multipart.boundary(media);
    if (expected == nullptr) {
        return found == nullptr;
    }
    local same: bool = (found != nullptr) && (strcmp(found, expected) == 0);
    free(found);
    return same;
}
frame rejects(body: string) ret bool {
    try {
        local form: Multipart = Multipart.parse("xyz", body, strlen(body), 8);
        form.destroy();
    } catch {
        return true;
    }
    return false;
}
frame main() ret int {
    if (!boundaryIs("multipart/form-data; boundary=abc", "abc") || !boundaryIs("Multipart/Form-Data;charset=utf-8;BOUNDARY=\"a b'c\"", "a b'c")) { return 1; }
    if (!boundaryIs("multipart/mixed; boundary=abc", nullptr) || !boundaryIs("multipart/form-data", nullptr) || !boundaryIs("multipart/form-data; boundary=", nullptr)) { return 2; }
    if (!boundaryIs("multipart/form-data; boundary=\"ends \"", nullptr) || !boundaryIs("multipart/form-data; boundary=a;b", "a") || !boundaryIs("multipart/form-data; boundary=\"unterminated", nullptr)) { return 3; }
    if (!boundaryIs("multipart/form-data; boundary=a\u00e9", nullptr) || !boundaryIs(nullptr, nullptr)) { return 4; }

    local app: App = App.new();
    local req: Request = app.parseRequest("POST /upload HTTP/1.1\r\nHost: x\r\nContent-Type: multipart/form-data; boundary=xyz\r\nContent-Length: 159\r\n\r\npreamble\r\n--xyz\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n1\r\n--xyz \t\r\ncontent-disposition: FORM-DATA; name=b; filename=\"C:\\\\x\\\\y.txt\"\r\n\r\n\r\n--xyz--\r\nepilogue");
    local form: Multipart = Multipart.fromRequest(&req);
    if (form.count() != 2 || strcmp(form.field("a").unwrap(), "1") != 0) { return 5; }
    if (form.file("b") == nullptr || strcmp(form.file("b").filename, "y.txt") != 0 || form.file("b").size != 0) { return 6; }
    form.destroy();
    req.destroy();
    req = app.parseRequest("POST / HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}");
    local caught: bool = false;
    try { Multipart.fromRequest(&req); } catch { caught = true; }
    if (!caught) { return 7; }
    req.destroy();

    if (!rejects("no boundary at all")) { return 10; }
    if (!rejects("--xyz\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nunterminated")) { return 11; }
    if (!rejects("--xyz\r\nContent-Type: text/plain\r\n\r\nx\r\n--xyz--")) { return 12; }
    if (!rejects("--xyz\r\nContent-Disposition: attachment; name=\"a\"\r\n\r\nx\r\n--xyz--")) { return 13; }
    if (!rejects("--xyz\r\nContent-Disposition: form-data; filename=\"f\"\r\n\r\nx\r\n--xyz--")) { return 14; }
    if (!rejects("--xyz\r\nno colon here\r\n\r\nx\r\n--xyz--")) { return 15; }
    if (!rejects("--xyzjunk\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nx\r\n--xyz--")) { return 16; }
    if (!rejects("--xyz\r\nContent-Disposition: form-data; name=\"a\r\n\r\nx\r\n--xyz--")) { return 17; }
    if (!rejects("--xyz\r\nContent-Disposition: form-data; name=\"a\"\r\nContent-Disposition: form-data; name=\"b\"\r\n\r\nx\r\n--xyz--")) { return 18; }
    if (rejects("--xyz\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nx\r\n--xyz--")) { return 19; }
    app.destroy();
    return 0;
}`);
}, 90000);
