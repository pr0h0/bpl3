import * as path from "path";
import {
  window,
  workspace,
  commands,
  languages,
  Range,
  TextEdit,
  type Terminal,
  type ExtensionContext,
  type TextEdit as TextEditType,
} from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

import { shouldUseBplSaveFormatting } from "./FormatOnSave";

let client: LanguageClient;
let terminal: Terminal | undefined;

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
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
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
    commands.registerCommand("bpl.runFile", (uri: string) => {
      if (!terminal) {
        terminal = window.createTerminal("BPL Run");
      }
      terminal.show();
      // If uri is passed as string (from CodeLens), use it. Otherwise use active editor.
      let filePath = uri;
      if (!filePath && window.activeTextEditor) {
        filePath = window.activeTextEditor.document.uri.fsPath;
      }
      if (filePath) {
        // Quote path to handle spaces
        terminal.sendText(`bpl run "${filePath}"`);
      } else {
        window.showErrorMessage("No file to run.");
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
            console.error("BPL formatting failed:", error);
            return [];
          }
        },
      },
    ),
    workspace.onWillSaveTextDocument((event) => {
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
              console.error("BPL format-on-save failed:", error);
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
