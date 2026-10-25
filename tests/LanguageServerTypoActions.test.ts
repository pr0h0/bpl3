import { expect, test } from "bun:test";
import { spawn } from "child_process";
import { once } from "events";
import { mkdtempSync, rmSync } from "fs";
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

test("live typo actions use compiler hints rather than comments, strings and unrelated locals", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bpl-live-typo-"));
  const uri = pathToFileURL(join(directory, "main.bpl")).href;
  const source = [
    "# calcuateSun is only a comment",
    "frame calculateSum(a: int, b: int) ret int { return a + b; }",
    "frame decoy() ret int { local calcuateSut: int = 0; return calcuateSut; }",
    'frame message() ret string { return "calcuateSym"; }',
    "frame main() ret int { return calcuateSum(2, 3); }",
  ].join("\n");
  const document = TextDocument.create(uri, "bpl", 1, source);
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
          textDocument: { uri, languageId: "bpl", version: 1, text: source },
        });
        const diagnostics = await initial;
        const diagnostic = diagnostics.find((item) =>
          item.message.includes("Undefined symbol 'calcuateSum'"),
        );
        expect(diagnostic).toBeDefined();
        expect(diagnostic!.message).toContain("Did you mean 'calculateSum'?");
        const actions = await connection.sendRequest<CodeAction[]>(
          "textDocument/codeAction",
          {
            textDocument: { uri },
            range: diagnostic!.range,
            context: { diagnostics: [diagnostic] },
          },
        );
        const typoActions = actions.filter((action) =>
          action.title.startsWith("Change to"),
        );
        expect(typoActions.map((action) => action.title)).toEqual([
          "Change to 'calculateSum'",
        ]);
        const fixed = TextDocument.applyEdits(
          document,
          typoActions[0]!.edit!.changes![uri]!,
        );
        const updated = nextDiagnostics();
        await connection.sendNotification("textDocument/didChange", {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: fixed }],
        });
        expect(await updated).toEqual([]);

        const noHint = nextDiagnostics();
        await connection.sendNotification("textDocument/didChange", {
          textDocument: { uri, version: 3 },
          contentChanges: [
            {
              text: "# missingIdentifierY is only a comment\nframe main() ret int { return missingIdentifierZ; }",
            },
          ],
        });
        const missing = (await noHint).find((item) =>
          item.message.includes("Undefined symbol 'missingIdentifierZ'"),
        );
        expect(missing).toBeDefined();
        expect(missing!.message).not.toContain("Did you mean");
        const noActions = await connection.sendRequest<CodeAction[]>(
          "textDocument/codeAction",
          {
            textDocument: { uri },
            range: missing!.range,
            context: { diagnostics: [missing] },
          },
        );
        expect(
          noActions.filter((action) => action.title.startsWith("Change to")),
        ).toEqual([]);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Live typo action request timed out")),
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
