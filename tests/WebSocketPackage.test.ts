import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { connect, createServer } from "node:net";
import { join, resolve } from "node:path";
import { makeRepoTempDir } from "./helpers/repoTempDir";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((done) => probe.close(() => done()));
  return address.port;
}

// A masked client frame (RFC 6455 5.2).
function frame(
  opcode: number,
  payload: Buffer,
  { fin = true, mask = true, rsv = 0 } = {},
): Buffer {
  const head = [(fin ? 0x80 : 0) | rsv | opcode];
  const length = payload.length;
  const maskBit = mask ? 0x80 : 0;
  if (length < 126) head.push(maskBit | length);
  else if (length < 65536) head.push(maskBit | 126, length >> 8, length & 255);
  else {
    head.push(maskBit | 127, 0, 0, 0, 0);
    head.push(
      (length >>> 24) & 255,
      (length >>> 16) & 255,
      (length >>> 8) & 255,
      length & 255,
    );
  }
  if (!mask) return Buffer.concat([Buffer.from(head), payload]);
  const key = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.from(payload.map((b, i) => b ^ key[i % 4]!));
  return Buffer.concat([Buffer.from(head), key, masked]);
}

// Performs a raw handshake, sends `frames`, and returns the server's frames
// (opcode and payload) received until it closes.
function raw(
  port: number,
  frames: Buffer[],
): Promise<{ handshake: string; frames: { op: number; data: Buffer }[] }> {
  return new Promise((resolveResult, reject) => {
    const key = Buffer.from("0123456789abcdef").toString("base64");
    const socket = connect(port, "127.0.0.1");
    let data = Buffer.alloc(0);
    socket.setTimeout(5000, () => socket.destroy(new Error("timeout")));
    socket.on("error", reject);
    socket.on("data", (chunk) => (data = Buffer.concat([data, chunk])));
    socket.on("connect", () => {
      socket.write(
        `GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: keep-alive, Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${key}\r\n\r\n`,
      );
      setTimeout(() => frames.forEach((f) => socket.write(f)), 50);
    });
    socket.on("close", () => {
      const end = data.indexOf("\r\n\r\n");
      const handshake = data.subarray(0, end).toString();
      const parsed: { op: number; data: Buffer }[] = [];
      let at = end + 4;
      while (at + 2 <= data.length) {
        let length = data[at + 1]! & 0x7f;
        let offset = at + 2;
        if (length === 126) {
          length = data.readUInt16BE(offset);
          offset += 2;
        } else if (length === 127) {
          length = Number(data.readBigUInt64BE(offset));
          offset += 8;
        }
        parsed.push({
          op: data[at]! & 0x0f,
          data: data.subarray(offset, offset + length),
        });
        at = offset + length;
      }
      resolveResult({ handshake, frames: parsed });
    });
  });
}

const closeCode = (frames: { op: number; data: Buffer }[]) => {
  const close = frames.find((f) => f.op === 8);
  return close ? close.data.readUInt16BE(0) : -1;
};

test.skipIf(process.platform !== "linux")(
  "bpl-websocket echoes messages for a standard client and enforces RFC 6455 framing",
  async () => {
    const dir = makeRepoTempDir("websocket-");
    let child: ReturnType<typeof Bun.spawn> | undefined;
    try {
      writeFileSync(
        join(dir, "main.bpl"),
        String.raw`
import [App], [Request], [Response] from "bpl-express";
import [WebSocket], [WsMessage], [WsKind] from "bpl-websocket";
extern atoi(text: string) ret int;
frame chat(req: *Request, res: *Response) {
    if (!WebSocket.isUpgrade(req)) {
        res.status(426).setHeader("Upgrade", "websocket").text("upgrade required");
        return;
    }
    local socket: WebSocket = WebSocket.accept(req, res, "chat");
    local cleanup: *WebSocket = &socket;
    defer cleanup.destroy();
    socket.setMaxMessage(100000);
    socket.setReadTimeout(3000);
    loop {
        local message: WsMessage = socket.receive();
        if (message.ended() || (message.kind == WsKind.Timeout)) {
            message.destroy();
            break;
        }
        if (message.isText()) {
            if (message.data[0] == '!') {
                socket.close(4000, "requested");
                message.destroy();
                break;
            }
            socket.sendText(message.data);
        } else {
            socket.sendBinary(message.data, message.size);
        }
        message.destroy();
    }
}
frame main(_argc: int, argv: *string) ret int {
    local app: App = App.new();
    app.keepAlive(10, 5);
    app.router.get("/ws", chat);
    app.listenOn(atoi(argv[1]), "127.0.0.1");
    return 0;
}`,
      );
      const exe = join(dir, "server");
      const build = spawnSync(
        "bun",
        [resolve("index.ts"), "build", join(dir, "main.bpl"), "-o", exe],
        { encoding: "utf8", timeout: 60000 },
      );
      expect(build.status, build.stdout + build.stderr).toBe(0);
      const port = await freePort();
      child = Bun.spawn([exe, String(port)], {
        stdout: "ignore",
        stderr: "pipe",
      });
      let plain: Response | undefined;
      for (let i = 0; i < 200 && !plain; i++) {
        try {
          plain = await fetch(`http://127.0.0.1:${port}/ws`);
        } catch {
          await Bun.sleep(20);
        }
      }
      expect(plain!.status).toBe(426);
      expect(plain!.headers.get("upgrade")).toBe("websocket");

      // A standard client: text (UTF-8), binary, and a 64-bit length frame.
      const echoed = await new Promise<unknown[]>((done, fail) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, ["chat"]);
        ws.binaryType = "arraybuffer";
        const got: unknown[] = [];
        ws.onopen = () => {
          expect(ws.protocol).toBe("chat");
          ws.send("hello é");
          ws.send(new Uint8Array([0, 1, 2, 255]));
          ws.send("y".repeat(70000));
        };
        ws.onmessage = (event) => {
          got.push(
            typeof event.data === "string"
              ? event.data.length > 100
                ? event.data.length
                : event.data
              : [...new Uint8Array(event.data as ArrayBuffer)],
          );
          if (got.length === 3) ws.send("!");
        };
        ws.onclose = (event) => {
          got.push(event.code);
          done(got);
        };
        ws.onerror = () => fail(new Error("websocket error"));
      });
      expect(echoed).toEqual(["hello é", [0, 1, 2, 255], 70000, 4000]);

      // Handshake answer and fragmentation with an interleaved ping.
      let result = await raw(port, [
        frame(1, Buffer.from("frag"), { fin: false }),
        frame(9, Buffer.from("p")),
        frame(0, Buffer.from("ment")),
        frame(8, Buffer.from([0x03, 0xe8])),
      ]);
      const accept = createHash("sha1")
        .update(
          Buffer.from("0123456789abcdef").toString("base64") +
            "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
        )
        .digest("base64");
      expect(result.handshake).toContain("HTTP/1.1 101 Switching Protocols");
      expect(result.handshake).toContain(`Sec-WebSocket-Accept: ${accept}`);
      expect(result.handshake).toContain("Sec-WebSocket-Protocol: chat");
      expect(
        result.frames.map((f) => [f.op, f.data.toString("latin1")]),
      ).toEqual([
        [10, "p"],
        [1, "fragment"],
        [8, "\x03\xe8"],
      ]);

      const violations: [Buffer[], number][] = [
        [[frame(1, Buffer.from("x"), { mask: false })], 1002],
        [[frame(1, Buffer.from([0xc3, 0x28]))], 1007],
        [[frame(1, Buffer.from([0xed, 0xa0, 0x80]))], 1007],
        [[frame(2, Buffer.alloc(100001))], 1009],
        [[frame(0, Buffer.from("x"))], 1002],
        [
          [
            frame(1, Buffer.from("a"), { fin: false }),
            frame(1, Buffer.from("b")),
          ],
          1002,
        ],
        [[frame(9, Buffer.alloc(126))], 1002],
        [[frame(9, Buffer.from("x"), { fin: false })], 1002],
        [[frame(3, Buffer.from("x"))], 1002],
        [[frame(1, Buffer.from("x"), { rsv: 0x40 })], 1002],
        [[frame(8, Buffer.from([0x03, 0xed]))], 1002],
        [[frame(8, Buffer.from([0x03]))], 1002],
      ];
      for (const [frames, code] of violations) {
        result = await raw(port, frames);
        expect(closeCode(result.frames)).toBe(code);
      }
      // A close without a status code is answered with 1000.
      result = await raw(port, [frame(8, Buffer.alloc(0))]);
      expect(closeCode(result.frames)).toBe(1000);
    } finally {
      child?.kill("SIGKILL");
      rmSync(dir, { force: true, recursive: true });
    }
  },
  120000,
);

test("bpl-websocket validates upgrade requests and accept keys", () => {
  const dir = makeRepoTempDir("websocket-unit-");
  try {
    writeFileSync(
      join(dir, "main.bpl"),
      String.raw`
import [App], [Request], [Response] from "bpl-express";
import [WebSocket] from "bpl-websocket";
extern strcmp(a: string, b: string) ret int;
extern free(p: *void) ret void;
frame upgrade(app: *App, headers: string) ret bool {
    local raw: String = String.new("GET /ws HTTP/1.1\r\nHost: x\r\n");
    raw << headers;
    raw << "\r\n";
    local req: Request = app.parseRequest(raw.data);
    local result: bool = WebSocket.isUpgrade(&req);
    req.destroy();
    raw.destroy();
    return result;
}
import [String] from "std/string.bpl";
frame main() ret int {
    local key: string = WebSocket.acceptKey("dGhlIHNhbXBsZSBub25jZQ==");
    if (strcmp(key, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=") != 0) { return 1; }
    free(key);
    local app: App = App.new();
    local good: string = "Upgrade: WebSocket\r\nConnection: keep-alive, Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n";
    if (!upgrade(&app, good)) { return 2; }
    if (upgrade(&app, "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 8\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n")) { return 3; }
    if (upgrade(&app, "Upgrade: websocket\r\nConnection: close\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n")) { return 4; }
    if (upgrade(&app, "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: short\r\n")) { return 5; }
    if (upgrade(&app, "Upgrade: h2c\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n")) { return 6; }
    local req: Request = app.parseRequest("GET / HTTP/1.1\r\nHost: x\r\n\r\n");
    local res: Response = Response.new(-1);
    local caught: bool = false;
    try { WebSocket.accept(&req, &res, nullptr); } catch { caught = true; }
    if (!caught || res.headers_sent) { return 7; }
    req.destroy();
    res.destroy();
    app.destroy();
    return 0;
}`,
    );
    const run = spawnSync(
      "bun",
      [resolve("index.ts"), "run", join(dir, "main.bpl")],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(run.status, run.stdout + run.stderr).toBe(0);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}, 90000);
