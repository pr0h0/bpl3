import * as path from "path";
import {
  window,
  workspace,
  commands,
  type Terminal,
  type ExtensionContext,
} from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

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
        terminal.sendText(`bpl --run "${filePath}"`);
      } else {
        window.showErrorMessage("No file to run.");
      }
    }),
  );

  // Enable format-on-save by default, honoring user setting
  const config = workspace.getConfiguration();
  const enabled = config.get<boolean>("bplLanguageServer.formatOnSave", true);
  if (enabled) {
    const _currentLanguages = config.get<string[]>(
      "editor.formatOnSaveAllowList",
    );
    // Prefer per-language setting; if unavailable, set global formatOnSave true
    config.update("editor.formatOnSave", true, true).then(() => {
      // Optionally inform the user how to disable
      window.setStatusBarMessage(
        "BPL: format-on-save enabled (toggle in settings)",
        3000,
      );
    });
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
