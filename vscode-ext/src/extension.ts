import * as fs from "fs";
import * as path from "path";
import {
  window,
  workspace,
  commands,
  languages,
  Range,
  TextEdit,
  TextDocumentSaveReason,
  tasks,
  Task,
  TaskScope,
  ShellExecution,
  ShellQuoting,
  Uri,
  type ExtensionContext,
  type TextEdit as TextEditType,
} from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

import { FormattingFailures } from "./FormattingFailures";
import { saveAndRunDocument } from "./RunDocument";
import { shouldUseBplSaveFormatting } from "./FormatOnSave";

let client: LanguageClient;
const formattingFailures = new FormattingFailures();

/**
 * The `bpl` to run: `<bplHome>/bpl` when the `bplLanguageServer.bplHome`
 * setting names an installation that has one, with `BPL_HOME` set to it;
 * otherwise `bpl` on PATH with the environment unchanged. A relative setting
 * is resolved against the file's workspace folder (or its directory).
 */
function bplExecutable(resource: Uri): {
  command: string;
  env?: Record<string, string>;
} {
  const home = workspace
    .getConfiguration("bplLanguageServer", resource)
    .get<string>("bplHome")
    ?.trim();
  if (home) {
    const base =
      workspace.getWorkspaceFolder(resource)?.uri.fsPath ??
      path.dirname(resource.fsPath);
    const root = path.resolve(base, home);
    const candidate = path.join(root, "bpl");
    if (fs.existsSync(candidate)) {
      return { command: candidate, env: { BPL_HOME: root } };
    }
  }
  return { command: "bpl" };
}

export async function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(
    path.join("out", "vscode-ext", "src", "server.js"),
  );

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: "file", language: "bpl" }],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/*.{bpl,x,json}"),
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "bplLanguageServer",
    "BPL Language Server",
    serverOptions,
    clientOptions,
  );

  // Start the client. This will also launch the server
  client.start();

  // Register Run Command
  context.subscriptions.push(
    commands.registerCommand("bpl.runFile", async (target?: string | Uri) => {
      try {
        let uri = typeof target === "string" ? Uri.file(target) : target;
        if (typeof target === "string" && target.startsWith("file:"))
          uri = Uri.parse(target);
        uri ||= window.activeTextEditor?.document.uri;
        if (!uri || uri.scheme !== "file") {
          void window.showErrorMessage("Save the BPL file before running it.");
          return;
        }
        const fileUri = uri;
        const executable = bplExecutable(fileUri);
        const document = await workspace.openTextDocument(fileUri);
        const launched = await saveAndRunDocument(document, () =>
          tasks.executeTask(
            new Task(
              { type: "bpl", file: fileUri.fsPath },
              workspace.getWorkspaceFolder(fileUri) || TaskScope.Global,
              "Run BPL file",
              "BPL",
              // Strong quoting passes the configured path literally.
              new ShellExecution(
                { value: executable.command, quoting: ShellQuoting.Strong },
                [
                  "run",
                  { value: fileUri.fsPath, quoting: ShellQuoting.Strong },
                ],
                { cwd: path.dirname(fileUri.fsPath), env: executable.env },
              ),
            ),
          ),
        );
        if (!launched)
          void window.showWarningMessage(
            "BPL Run cancelled because the file was not saved.",
          );
      } catch (error) {
        void window.showErrorMessage(
          `BPL Run failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );

  // Untitled buffers are intentionally outside the file-only language server.
  context.subscriptions.push(
    languages.registerDocumentFormattingEditProvider(
      { language: "bpl", scheme: "untitled" },
      {
        async provideDocumentFormattingEdits(document, options) {
          try {
            const { formatDocumentText } =
              await import("./services/DocumentFormatter");
            const text = document.getText();
            const formatted = formatDocumentText(
              text,
              document.uri.toString(),
              options,
            );
            formattingFailures.clear(document.uri.toString());
            return [
              TextEdit.replace(
                new Range(
                  document.positionAt(0),
                  document.positionAt(text.length),
                ),
                formatted,
              ),
            ];
          } catch (error) {
            formattingFailures.report(
              document.uri.toString(),
              error,
              (message) => {
                void window.showErrorMessage(message);
              },
            );
            return [];
          }
        },
      },
    ),
    workspace.onDidCloseTextDocument((document) =>
      formattingFailures.clear(document.uri.toString()),
    ),
    workspace.onWillSaveTextDocument((event) => {
      if (event.reason === TextDocumentSaveReason.AfterDelay) return;
      const document = event.document;
      const editor = workspace.getConfiguration("editor", document);
      const enabled = workspace
        .getConfiguration("bplLanguageServer", document)
        .get<boolean>("formatOnSave", true);
      if (!shouldUseBplSaveFormatting(document.languageId, enabled, editor))
        return;
      event.waitUntil(
        commands
          .executeCommand<TextEditType[]>(
            "vscode.executeFormatDocumentProvider",
            document.uri,
            {
              tabSize: editor.get<number>("tabSize", 4),
              insertSpaces: editor.get<boolean>("insertSpaces", true),
            },
          )
          .then(
            (edits) => edits ?? [],
            (error) => {
              formattingFailures.report(
                document.uri.toString(),
                error,
                (message) => {
                  void window.showErrorMessage(message);
                },
              );
              return [];
            },
          ),
      );
    }),
  );
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
