// BPL playground: a single-file editor that compiles and runs on the
// playground backend, or as WebAssembly in the browser.

const API_BASE =
  window.location.protocol === "file:" ? "http://localhost:3001" : "";
const COMPILE_ARTIFACT_TABS = new Set(["ir", "ast", "tokens"]);
const MONACO_BASE =
  "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs";

const wasmHostAdapter = window.BplWasmHostAdapter;
if (!wasmHostAdapter) {
  throw new Error("BPL wasm host adapter script must load before app.js");
}
const browserWasmRuntime = window.BplBrowserWasmRuntime;
if (!browserWasmRuntime) {
  throw new Error("BPL browser wasm runtime script must load before app.js");
}

let editor;
let allExamples = [];
let currentExample = null;
let latestCompileRequest = null;
let compileArtifactsLoaded = false;
let compileArtifactsPromise = null;

const $ = (id) => document.getElementById(id);

// ---------- Drafts ----------

let draftReady = false;
let draftChanged = false;
let draftPersisted = false;
let restoredDraft = false;
let draftStorageWarning = false;

/** Persist editor inputs while distinguishing edits from untouched examples. */
function persistDraft(edited = true) {
  if (!draftReady || !editor) return;
  draftChanged = edited !== false;
  try {
    draftPersisted = globalThis.BplDraftStore.save(window.localStorage, {
      edited: draftChanged,
      code: editor.getValue(),
      stdin: $("stdin-input").value,
      args: $("args-input").value,
    });
  } catch {
    draftPersisted = false;
  }
  if (!draftPersisted && !draftStorageWarning) {
    draftStorageWarning = true;
    showToast(
      "Draft storage is unavailable. Copy your code before leaving.",
      "warning",
    );
  }
}

/** Restore a validated local draft without marking a clean example as edited. */
function restoreDraft() {
  let draft;
  try {
    draft = globalThis.BplDraftStore.load(window.localStorage);
  } catch {
    /* private storage */
  }
  if (!draft) return false;
  editor.setValue(draft.code);
  $("stdin-input").value = draft.stdin;
  $("args-input").value = draft.args;
  draftChanged = draft.edited !== false;
  draftPersisted = true;
  showToast("Restored your local draft", "info");
  return true;
}

// ---------- Operations (one request at a time, cancellable) ----------

let activeOperation = null;

function beginOperation(status = "Running") {
  if (activeOperation) return null;
  activeOperation = new AbortController();
  $("loading-status").textContent = status;
  $("loading").style.display = "flex";
  setButtonsDisabled(true);
  return activeOperation;
}

function finishOperation(operation) {
  if (activeOperation === operation) {
    activeOperation = null;
    $("loading").style.display = "none";
    setButtonsDisabled(false);
  }
}

function setButtonsDisabled(disabled) {
  for (const id of ["run-btn", "run-wasm-btn", "format-btn"]) {
    $(id).disabled = disabled;
  }
}

function showCancelled(target = "output-content") {
  $(target).textContent = "Execution cancelled.";
  setStatus("Cancelled", "");
}

$("stop-btn").addEventListener("click", () => activeOperation?.abort());
window.addEventListener("pagehide", () => activeOperation?.abort());

function setStatus(text, state, time = null, size = null) {
  const status = $("exec-status");
  status.textContent = text;
  if (status.dataset) status.dataset.status = state;
  if (time !== null) $("exec-time").textContent = time;
  if (size !== null) $("output-size").textContent = size;
}

function parseArgs() {
  const value = $("args-input").value;
  return value ? value.split(/\s+/).filter((arg) => arg) : [];
}

// ---------- WebAssembly ----------

const runHostedWasmInBrowser = (wasm, args) =>
  wasmHostAdapter.runHostedWasmInWorker(wasm, args, {
    signal: activeOperation?.signal,
  });
const {
  compileAndRunBplInBrowser: compileInBrowser,
  detectBrowserWasmCapabilities,
  formatBrowserWasmFailureReport,
  formatBrowserWasmCapabilitySummary,
  formatHostedWasmRunReport,
} = browserWasmRuntime;
const compileAndRunBplInBrowser = (code, args) =>
  compileInBrowser(code, args, {
    hostAdapter: { runHostedWasmInBrowser },
  });

// ---------- Editor ----------

require.config({ paths: { vs: MONACO_BASE } });

require(["vs/editor/editor.main"], function () {
  BplSyntax.registerMonaco(monaco);
  editor = monaco.editor.create($("editor"), {
    value: "",
    language: "bpl",
    theme: BplSyntax.monacoTheme(),
    minimap: { enabled: false },
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    renderLineHighlight: "line",
  });
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () =>
      monaco.editor.setTheme(BplSyntax.monacoTheme()),
    );

  editor.onDidChangeModelContent(() => {
    updateEditorInfo();
    persistDraft();
    invalidateCompileArtifacts(
      "Run the program, then open this tab to see compiler output for the current source.",
    );
  });
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
    $("run-btn").click(),
  );
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    () => $("run-wasm-btn").click(),
  );
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () =>
    $("format-btn").click(),
  );

  setupQuickActions();
  setupCopyButtons();
  setupExampleSelect();
  updateEditorInfo();

  restoredDraft = restoreDraft();
  draftReady = true;
  for (const id of ["stdin-input", "args-input"]) {
    $(id).addEventListener("input", persistDraft);
  }
  window.addEventListener("beforeunload", (event) => {
    if (draftChanged && !draftPersisted) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  loadExamples();
  pollServerStatus();
  setInterval(pollServerStatus, 30000);
});

function updateEditorInfo() {
  if (!editor) return;
  const model = editor.getModel();
  const lines = model.getLineCount();
  $("editor-info").textContent =
    `${lines} ${lines === 1 ? "line" : "lines"}, ${model.getValueLength()} characters`;
}

// ---------- Tabs and compiler output ----------

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});

function activateTab(tab) {
  document.querySelectorAll(".tab").forEach((button) => {
    button.setAttribute(
      "aria-selected",
      button.dataset.tab === tab ? "true" : "false",
    );
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tab}`;
  });
  if (COMPILE_ARTIFACT_TABS.has(tab)) void loadCompileArtifacts();
}

function currentTab() {
  const selected = document.querySelector('.tab[aria-selected="true"]');
  return selected?.dataset?.tab ?? "output";
}

function setCompileArtifactPlaceholders(message) {
  for (const id of ["ir-content", "ast-content", "tokens-content"]) {
    $(id).textContent = message;
    $(id).className = "placeholder";
  }
}

function invalidateCompileArtifacts(message) {
  latestCompileRequest = null;
  compileArtifactsLoaded = false;
  compileArtifactsPromise = null;
  setCompileArtifactPlaceholders(message);
}

async function loadCompileArtifacts() {
  if (!latestCompileRequest) {
    setCompileArtifactPlaceholders(
      "Run the program, then open this tab to see compiler output.",
    );
    return;
  }
  if (compileArtifactsLoaded) return;
  if (compileArtifactsPromise) {
    await compileArtifactsPromise;
    return;
  }

  const operation = beginOperation("Loading compiler output");
  if (!operation) return;
  setCompileArtifactPlaceholders("Loading compiler output...");
  compileArtifactsPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/compile`, {
        method: "POST",
        signal: operation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...latestCompileRequest,
          includeArtifacts: true,
          execute: false,
        }),
      });
      const result = await response.json();
      operation.signal.throwIfAborted();

      for (const id of ["ir-content", "ast-content", "tokens-content"]) {
        $(id).className = "";
      }
      if (!result.success) {
        const error = result.error || "Compiler output is not available.";
        $("ir-content").textContent = error;
        $("ast-content").textContent = error;
        $("tokens-content").textContent = result.tokens || error;
        return;
      }
      $("ir-content").textContent = result.ir || "(no LLVM IR)";
      $("ast-content").textContent = result.ast || "(no AST)";
      $("tokens-content").textContent = result.tokens || "(no tokens)";
      compileArtifactsLoaded = true;
    } catch (error) {
      setCompileArtifactPlaceholders(
        operation.signal.aborted
          ? "Execution cancelled."
          : `Could not load compiler output: ${error.message}`,
      );
    } finally {
      compileArtifactsPromise = null;
      finishOperation(operation);
    }
  })();
  await compileArtifactsPromise;
}

// ---------- Run ----------

$("run-btn").addEventListener("click", async () => {
  const operation = beginOperation("Running");
  if (!operation) return;
  try {
    if ($("auto-format-checkbox")?.checked) {
      try {
        await formatEditor(operation.signal, { quiet: true });
      } catch {
        showCancelled();
        return;
      }
    }

    const code = editor.getValue();
    if (!code.trim()) {
      showToast("The editor is empty.", "warning");
      return;
    }

    const stdin = $("stdin-input").value;
    const args = parseArgs();
    const output = $("output-content");
    output.textContent = "Compiling...";
    output.className = "placeholder";
    activateTab("output");
    invalidateCompileArtifacts(
      "Open this tab after the run finishes to see compiler output.",
    );
    setStatus("Running", "running", "...", "...");
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE}/compile`, {
        method: "POST",
        signal: operation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          input: stdin,
          args,
          includeArtifacts: false,
        }),
      });
      const result = await response.json();
      operation.signal.throwIfAborted();
      const duration = `${Date.now() - startTime} ms`;
      latestCompileRequest = { code, input: stdin, args };
      setCompileArtifactPlaceholders(
        "Open this tab to load compiler output for the last run.",
      );

      if (result.success) {
        output.textContent = result.output || "(no output)";
        output.className = result.output ? "success" : "placeholder";
        setStatus(
          "Finished",
          "success",
          duration,
          `${result.output?.length || 0} bytes`,
        );
      } else {
        output.textContent = result.error || "Unknown error";
        output.className = "error";
        if (result.output) {
          output.textContent +=
            "\n\nOutput before the error:\n" + result.output;
        }
        setStatus("Failed", "error", duration, "-");
      }
      if (result.warnings && result.warnings.length > 0) {
        output.textContent += "\n\nWarnings:\n" + result.warnings.join("\n");
      }
    } catch (error) {
      if (operation.signal.aborted) {
        showCancelled();
        return;
      }
      output.textContent = `Could not reach the playground server: ${error.message}\n\nStart it from the repository root with: bun run playground`;
      output.className = "error";
      setStatus("Server unavailable", "error", "-", "-");
    }
  } finally {
    finishOperation(operation);
  }
});

$("run-wasm-btn").addEventListener("click", async () => {
  const operation = beginOperation("Compiling to WebAssembly");
  if (!operation) return;
  const wasmContent = $("wasm-content");
  try {
    const code = editor.getValue();
    if (!code.trim()) {
      showToast("The editor is empty.", "warning");
      return;
    }
    const args = parseArgs();
    const startTime = Date.now();
    const capabilities = detectBrowserWasmCapabilities();
    const capabilitySummary = formatBrowserWasmCapabilitySummary(capabilities);

    activateTab("wasm");
    wasmContent.className = "placeholder";
    wasmContent.textContent = [
      capabilitySummary,
      "",
      capabilities.canCompileBplInBrowser
        ? "Compiling to WebAssembly in this browser..."
        : "Compiling to WebAssembly on the server; the program runs in this browser.",
    ].join("\n");
    setStatus("Running as Wasm", "running", "...", "...");

    try {
      if (capabilities.canCompileBplInBrowser) {
        const browserResult = await compileAndRunBplInBrowser(code, args);
        const duration = `${Date.now() - startTime} ms`;
        if (!browserResult.success || !browserResult.runResult) {
          wasmContent.textContent = [
            capabilitySummary,
            "",
            browserResult.error || "The WebAssembly run failed.",
          ].join("\n");
          wasmContent.className = "error";
          setStatus("Wasm failed", "error", duration, "-");
          return;
        }
        const runResult = browserResult.runResult;
        wasmContent.className = runResult.trapped ? "error" : "success";
        wasmContent.textContent = formatHostedWasmRunReport({
          compileMode: "browser",
          capabilitySummary,
          runResult,
        });
        setStatus(
          runResult.trapped ? "Wasm trapped" : "Finished",
          runResult.trapped ? "error" : "success",
          duration,
          "-",
        );
        return;
      }

      const response = await fetch(`${API_BASE}/wasm`, {
        method: "POST",
        signal: operation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, args }),
      });
      const result = await response.json();
      operation.signal.throwIfAborted();
      if (!result.success) {
        wasmContent.textContent = result.error || "WebAssembly build failed.";
        wasmContent.className = "error";
        setStatus("Wasm build failed", "error", "-", "-");
        return;
      }

      $("loading-status").textContent = "Running in this browser";
      const runResult = await runHostedWasmInBrowser(result.wasmBase64, args);
      const duration = `${Date.now() - startTime} ms`;
      wasmContent.className = runResult.trapped ? "error" : "success";
      wasmContent.textContent = formatHostedWasmRunReport({
        compileMode: "backend /wasm",
        capabilitySummary,
        wasmBytes: result.wasmBytes,
        imports: result.imports || [],
        runResult,
      });
      if (result.ir) {
        $("ir-content").textContent = result.ir;
        $("ir-content").className = "";
      }
      setStatus(
        runResult.trapped ? "Wasm trapped" : "Finished",
        runResult.trapped ? "error" : "success",
        duration,
        `${result.wasmBytes || 0} bytes of Wasm`,
      );
    } catch (error) {
      if (operation.signal.aborted) {
        showCancelled("wasm-content");
        return;
      }
      wasmContent.textContent = formatBrowserWasmFailureReport({
        errorMessage: error.message,
        capabilitySummary,
      });
      wasmContent.className = "error";
      setStatus("Wasm failed", "error", "-", "-");
    }
  } finally {
    finishOperation(operation);
  }
});

// ---------- Format ----------

async function formatEditor(signal, { quiet = false } = {}) {
  const code = editor.getValue();
  if (!code.trim()) return;
  try {
    const response = await fetch(`${API_BASE}/format`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = await response.json();
    signal?.throwIfAborted();
    if (result.success && result.code) {
      if (result.code !== code) editor.setValue(result.code);
      if (!quiet) showToast("Formatted", "success");
    } else if (!quiet) {
      showToast(
        `Could not format: ${result.error || "unknown error"}`,
        "error",
      );
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    if (!quiet) showToast("Could not reach the playground server.", "error");
  }
}

$("format-btn").addEventListener("click", async () => {
  const operation = beginOperation("Formatting");
  if (!operation) return;
  try {
    await formatEditor(operation.signal);
  } catch {
    showCancelled();
  } finally {
    finishOperation(operation);
  }
});

// ---------- Examples ----------

async function loadExamples() {
  try {
    const response = await fetch(`${API_BASE}/examples`);
    allExamples = await response.json();
    const select = $("example-select");
    allExamples.forEach((example, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${example.order || index + 1}. ${example.title}`;
      select.appendChild(option);
    });
    if (!restoredDraft && allExamples.length > 0) loadExample(allExamples[0]);
  } catch (error) {
    console.error("Failed to load examples:", error);
    showToast("Could not load the examples.", "error");
  }
}

function setupExampleSelect() {
  const select = $("example-select");
  select.addEventListener("change", () => {
    const example = allExamples[Number(select.value)];
    if (select.value === "" || !example) return;
    if (!loadExample(example)) {
      select.value = currentExample
        ? String(allExamples.indexOf(currentExample))
        : "";
    }
  });
}

/** Replace the editor with an example; returns false if the user declines. */
function loadExample(example) {
  if (
    draftChanged &&
    !confirm(
      "Replace your edited code with this example? Copy anything you want to keep first.",
    )
  )
    return false;
  draftReady = false;
  currentExample = example;
  const index = allExamples.indexOf(example);
  $("example-select").value = index === -1 ? "" : String(index);
  $("example-title").textContent = example.title;
  $("example-description").textContent = example.description || "";

  if (editor) {
    editor.setValue(
      Array.isArray(example.code) ? example.code.join("\n") : example.code,
    );
  }
  $("stdin-input").value = example.input || "";
  $("args-input").value = example.args ? example.args.join(" ") : "";
  draftReady = true;
  persistDraft(false);

  $("output-content").textContent = "Press Run to compile and run the program.";
  $("output-content").className = "placeholder";
  $("wasm-content").textContent =
    "Press Run as Wasm to compile to WebAssembly and run it in this browser.";
  $("wasm-content").className = "placeholder";
  invalidateCompileArtifacts(
    "Run the program, then open this tab to see compiler output.",
  );
  setStatus("Ready", "", "-", "-");
  activateTab("output");
  return true;
}

// ---------- Server status ----------

async function pollServerStatus() {
  const status = $("server-status");
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error(String(response.status));
    status.textContent = "Server online";
    if (status.dataset) status.dataset.state = "online";
  } catch {
    status.textContent = "Server offline";
    if (status.dataset) status.dataset.state = "offline";
  }
}

// ---------- Copy and clear ----------

function setupQuickActions() {
  $("clear-editor-btn").addEventListener("click", () => {
    if (!confirm("Clear the editor? Your code will be removed.")) return;
    draftReady = false;
    editor.setValue("");
    $("stdin-input").value = "";
    $("args-input").value = "";
    try {
      draftPersisted = globalThis.BplDraftStore.clear(window.localStorage);
    } catch {
      draftPersisted = false;
    }
    draftChanged = !draftPersisted;
    draftReady = true;
    if (draftPersisted) showToast("Editor and saved draft cleared", "info");
    else
      showToast(
        "Editor cleared, but the saved draft could not be removed and may return on reload.",
        "warning",
      );
  });

  $("copy-code-btn").addEventListener("click", async () => {
    const code = editor.getValue();
    if (!code.trim()) {
      showToast("The editor is empty.", "warning");
      return;
    }
    await copyText(code, "Code copied");
  });
}

function setupCopyButtons() {
  $("copy-output-btn").addEventListener("click", async () => {
    await copyText($(`${currentTab()}-content`).textContent, "Copied");
  });
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message, "success");
  } catch {
    showToast("Could not copy to the clipboard.", "error");
  }
}

// ---------- Toasts ----------

function showToast(message, type = "info", duration = 3000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  $("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}
