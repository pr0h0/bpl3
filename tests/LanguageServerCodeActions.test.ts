import { expect, test } from "bun:test";
import { spawn } from "child_process";
import { once } from "events";
import { resolve } from "path";
import { pathToFileURL } from "url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import type { CodeAction, Diagnostic } from "vscode-languageserver/node";

test("language server suppresses invalid missing-return edits while retaining other quick fixes", async () => {
  const child = spawn(
    process.execPath,
    [resolve("vscode-ext/src/server.ts"), "--stdio"],
    {
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stderr.resume();
  const connection = createMessageConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.listen();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await connection.sendRequest("initialize", {
          processId: process.pid,
          rootUri: null,
          capabilities: {},
        });
        await connection.sendNotification("initialized", {});
        const uri = pathToFileURL(
          resolve("tmp/missing-return-action.bpl"),
        ).href;
        await connection.sendNotification("textDocument/didOpen", {
          textDocument: {
            uri,
            languageId: "bpl",
            version: 1,
            text: "frame getValue() ret int { }",
          },
        });
        const range = {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 26 },
        };
        // Exercise the old diagnostic spelling as well as the current wording.
        for (const message of [
          "Missing return statement",
          "Not all code paths return a value",
        ]) {
          const diagnostics: Diagnostic[] = [{ range, message }];
          const actions = await connection.sendRequest<CodeAction[]>(
            "textDocument/codeAction",
            {
              textDocument: { uri },
              range,
              context: { diagnostics },
            },
          );
          expect(actions).toEqual([]);
        }
        const actions = await connection.sendRequest<CodeAction[]>(
          "textDocument/codeAction",
          {
            textDocument: { uri },
            range,
            context: { diagnostics: [{ range, message: "Expected ';'" }] },
          },
        );
        expect(actions.map((action) => action.title)).toContain(
          "Add semicolon",
        );
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Language server request timed out")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    connection.dispose();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
}, 15000);
