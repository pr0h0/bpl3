import { mock } from "bun:test";

const mode = process.argv[2] ?? "default";
let updates = 0;
let formatCalls = 0;
interface HarnessDocument {
  languageId?: string;
  getText?: () => string;
  uri: { toString(): string };
  positionAt?: (offset: number) => { line: number; character: number };
}
interface HarnessSaveEvent {
  reason: number;
  document: HarnessDocument;
  waitUntil(promise: Promise<unknown>): void;
}
interface HarnessProvider {
  provideDocumentFormattingEdits(
    document: HarnessDocument,
    options: { tabSize: number; insertSpaces: boolean },
  ): Promise<unknown>;
}
let saveHandler: (event: HarnessSaveEvent) => void = () => {};
let provider = {} as HarnessProvider;
let selector: unknown;
const inspected =
  mode === "native-off"
    ? { globalValue: false }
    : mode === "native-on"
      ? { workspaceLanguageValue: true }
      : {};
const editor = {
  get(key: string, fallback: unknown) {
    if (key === "formatOnSave") return mode === "native-on";
    return fallback;
  },
  inspect: () => inspected,
  update: () => {
    updates++;
    return Promise.resolve();
  },
};
mock.module("vscode", () => ({
  window: {},
  workspace: {
    createFileSystemWatcher: () => ({ dispose() {} }),
    getConfiguration: (section: string) =>
      section === "editor"
        ? editor
        : {
            get: (_key: string, fallback: unknown) =>
              mode === "bpl-off" ? false : fallback,
            update: () => {
              updates++;
              return Promise.resolve();
            },
          },
    onWillSaveTextDocument: (handler: typeof saveHandler) => {
      saveHandler = handler;
      return { dispose() {} };
    },
  },
  commands: {
    registerCommand: () => ({ dispose() {} }),
    executeCommand: async () => {
      formatCalls++;
      return [];
    },
  },
  languages: {
    registerDocumentFormattingEditProvider: (
      selected: unknown,
      registered: HarnessProvider,
    ) => {
      selector = selected;
      provider = registered;
      return { dispose() {} };
    },
  },
  TextDocumentSaveReason: { Manual: 1, AfterDelay: 2, FocusOut: 3 },
  Range: class {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  TextEdit: {
    replace: (range: unknown, newText: string) => ({ range, newText }),
  },
}));
mock.module("vscode-languageclient/node", () => ({
  LanguageClient: class {
    start() {}
  },
  TransportKind: { ipc: 1 },
}));
const { activate } = await import("../../vscode-ext/src/extension");
await activate({
  asAbsolutePath: (file: string) => file,
  subscriptions: [],
} as unknown as Parameters<typeof activate>[0]);
let savePromise: Promise<unknown> | undefined;
for (const languageId of ["bpl", "typescript"]) {
  saveHandler?.({
    reason: mode === "after-delay" ? 2 : mode === "focus-out" ? 3 : 1,
    document: { languageId, uri: { toString: () => "untitled:Untitled-1" } },
    waitUntil: (promise: Promise<unknown>) => {
      savePromise = promise;
    },
  });
  if (savePromise) await savePromise;
}
const source = "frame main(){local value:int=1; # value\n}";
const edits = await provider.provideDocumentFormattingEdits(
  {
    getText: () => source,
    uri: { toString: () => "untitled:Untitled-1" },
    positionAt: (offset: number) => ({ line: 0, character: offset }),
  },
  { tabSize: 2, insertSpaces: true },
);
const invalid = await provider.provideDocumentFormattingEdits(
  {
    getText: () => "frame main({",
    uri: { toString: () => "untitled:Untitled-1" },
    positionAt: () => ({ line: 0, character: 0 }),
  },
  { tabSize: 2, insertSpaces: true },
);
console.log(JSON.stringify({ updates, formatCalls, selector, edits, invalid }));
