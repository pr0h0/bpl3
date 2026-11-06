import { describe, expect, it } from "bun:test";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { STD_QUICK_IMPORT_TYPES } from "../services/stdQuickImports";

const extensionRoot = path.resolve(__dirname, "../..");
const repoRoot = path.resolve(extensionRoot, "..");

/** Starts the language server over stdio and returns each request's result. */
function exchange(
  requests: { method: string; params: unknown }[],
): Promise<unknown[]> {
  const server = spawn("bun", ["src/server.ts", "--stdio"], {
    cwd: extensionRoot,
    stdio: ["pipe", "pipe", "ignore"],
  });
  return new Promise<unknown[]>((resolve, reject) => {
    const results = new Map<number, unknown>();
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(
      () => reject(new Error("language server did not answer")),
      20000,
    );
    server.on("error", reject);
    server.stdout!.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const length = Number(
          /Content-Length: (\d+)/i.exec(
            buffer.subarray(0, headerEnd).toString(),
          )?.[1],
        );
        if (buffer.length < headerEnd + 4 + length) break;
        const message = JSON.parse(
          buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString(),
        );
        buffer = buffer.subarray(headerEnd + 4 + length);
        if (typeof message.id === "number" && "result" in message) {
          results.set(message.id, message.result);
        }
      }
      if (results.size === requests.length) {
        clearTimeout(timer);
        resolve(requests.map((_, index) => results.get(index + 1)));
      }
    });
    requests.forEach((request, index) => {
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: index + 1,
        ...request,
      });
      server.stdin!.write(
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
      );
    });
  }).finally(() => {
    server.kill();
  });
}

// BUG-446: language-server defects visible over the protocol.
describe("language server protocol", () => {
  it("triggers member completion on `.` and keeps resolved item details", async () => {
    const [initialized, resolved, keyword] = (await exchange([
      {
        method: "initialize",
        params: { processId: null, rootUri: null, capabilities: {} },
      },
      {
        method: "completionItem/resolve",
        params: { label: "Point", kind: 7, detail: "struct Point" },
      },
      { method: "completionItem/resolve", params: { label: "loop", kind: 14 } },
    ])) as [
      { capabilities: { completionProvider: { triggerCharacters: string[] } } },
      { detail: string; documentation?: string },
      { detail: string },
    ];

    expect(
      initialized.capabilities.completionProvider.triggerCharacters,
    ).toContain(".");
    expect(resolved.detail).toBe("struct Point");
    expect(resolved.documentation).toBeUndefined();
    expect(keyword.detail).toBe("Keyword");
  }, 30000);

  it("offers std quick imports only for types std exports", () => {
    const std = fs.readFileSync(path.join(repoRoot, "lib", "std.bpl"), "utf8");
    for (const name of STD_QUICK_IMPORT_TYPES) {
      expect({ name, exported: std.includes(`export [${name}];`) }).toEqual({
        name,
        exported: true,
      });
    }
  });
});
