import { expect, test } from "bun:test";
import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import type {
  CodeAction,
  Diagnostic,
  PublishDiagnosticsParams,
} from "vscode-languageserver/node";

test("live auto-import action resolves the server's Undefined type diagnostic", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-live-import-"));
  writeFileSync(
    join(directory, "exports.x"),
    "export [Widget]; struct Widget { number: int, }",
  );
  const uri = pathToFileURL(join(directory, "main.bpl")).href;
  const document = TextDocument.create(
    uri,
    "bpl",
    1,
    "frame main() ret int { local value: Widget = Widget { number: 42 }; return value.number; }",
  );
  const child = spawn(
    process.execPath,
    [resolve("vscode-ext/src/server.ts"), "--stdio"],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  child.stderr.resume();
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  let acceptDiagnostics: ((diagnostics: Diagnostic[]) => void) | undefined;
  connection.onNotification(
    "textDocument/publishDiagnostics",
    (params: PublishDiagnosticsParams) => {
      if (params.uri !== uri || !acceptDiagnostics) return;
      const accept = acceptDiagnostics;
      acceptDiagnostics = undefined;
      accept(params.diagnostics);
    },
  );
  const nextDiagnostics = () =>
    new Promise<Diagnostic[]>((accept) => {
      acceptDiagnostics = accept;
    });
  connection.listen();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await connection.sendRequest("initialize", {
          processId: process.pid,
          rootUri: null,
          capabilities: {},
        });
        await connection.sendNotification("initialized", {});
        const initial = nextDiagnostics();
        await connection.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: "bpl",
            version: 1,
            text: document.getText(),
          },
        });
        const diagnostics = await initial;
        const diagnostic = diagnostics.find((item) =>
          item.message.includes("Undefined type 'Widget'"),
        );
        expect(diagnostic).toBeDefined();
        const actions = await connection.sendRequest<CodeAction[]>(
          "textDocument/codeAction",
          {
            textDocument: { uri },
            range: diagnostic!.range,
            context: { diagnostics },
          },
        );
        const action = actions.find(
          (item) => item.title === "Import Widget from ./exports.x",
        );
        expect(action).toBeDefined();
        const fixed = TextDocument.applyEdits(
          document,
          action!.edit!.changes![uri]!,
        );
        const updated = nextDiagnostics();
        await connection.sendNotification("textDocument/didChange", {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: fixed }],
        });
        expect(await updated).toEqual([]);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Live auto-import request timed out")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    connection.dispose();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}, 15000);
