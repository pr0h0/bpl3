// Initialize Monaco Editor
let editor;
let currentExample = null;
let allExamples = []; // Store all examples for searching
const API_BASE =
  window.location.protocol === "file:" ? "http://localhost:3001" : "";

require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs",
  },
});

require(["vs/editor/editor.main"], function () {
  // Register BPL language
  monaco.languages.register({ id: "bpl" });

  // Define BPL syntax highlighting
  monaco.languages.setMonarchTokensProvider("bpl", {
    keywords: [
      "frame",
      "ret",
      "local",
      "global",
      "struct",
      "import",
      "export",
      "extern",
      "if",
      "else",
      "while",
      "for",
      "return",
      "break",
      "continue",
      "true",
      "false",
      "null",
      "sizeof",
      "typeof",
      "switch",
      "case",
      "default",
    ],
    typeKeywords: [
      "int",
      "float",
      "string",
      "bool",
      "void",
      "byte",
      "char",
      "long",
      "i1",
      "i8",
      "i16",
      "i32",
      "i64",
      "float32",
      "float64",
      "u8",
      "u16",
      "u32",
      "u64",
      "Func",
    ],
    operators: [
      "=",
      ">",
      "<",
      "!",
      "~",
      "?",
      ":",
      "==",
      "<=",
      ">=",
      "!=",
      "&&",
      "||",
      "++",
      "--",
      "+",
      "-",
      "*",
      "/",
      "&",
      "|",
      "^",
      "%",
      "<<",
      ">>",
      ">>>",
      "+=",
      "-=",
      "*=",
      "/=",
      "&=",
      "|=",
      "^=",
      "%=",
      "<<=",
      ">>=",
      ">>>=",
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    escapes:
      /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

    tokenizer: {
      root: [
        [
          /[a-z_$][\w$]*/,
          {
            cases: {
              "@typeKeywords": "keyword.type",
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],
        [/[A-Z][\w\$]*/, "type.identifier"],
        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [
          /@symbols/,
          {
            cases: {
              "@operators": "operator",
              "@default": "",
            },
          },
        ],
        [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
        [/0[xX][0-9a-fA-F]+/, "number.hex"],
        [/\d+/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],

      comment: [
        [/[^#]+/, "comment"],
        [/#/, "comment", "@pop"],
      ],

      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],

      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/#.*$/, "comment"],
      ],
    },
  });

  // Create editor instance
  editor = monaco.editor.create(document.getElementById("editor"), {
    value:
      "# Welcome to BPL Playground!\n# Select an example from the sidebar to start learning.",
    language: "bpl",
    theme: "vs-dark",
    minimap: { enabled: false },
    fontSize: 14,
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
  });

  // Update editor info on content change
  editor.onDidChangeModelContent(() => {
    updateEditorInfo();
  });

  // Add keyboard shortcuts
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    document.getElementById("run-btn").click();
  });

  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
    () => {
      document.getElementById("run-wasm-btn").click();
    },
  );

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, (e) => {
    e.preventDefault();
    document.getElementById("format-btn").click();
  });

  // Setup split pane resizing
  setupSplitPaneResize();

  // Setup output panel toggle
  setupOutputToggle();

  // Setup additional UI features
  setupQuickActions();
  setupSearch();
  setupCopyButtons();
  setupFullscreen();
  updateEditorInfo();

  // Load examples
  loadExamples();

  // Start stats polling
  pollServerStats();
  setInterval(pollServerStats, 5000); // Update every 5 seconds
});

// Split pane resizing
function setupSplitPaneResize() {
  const divider = document.getElementById("resize-divider");
  const panelLeft = document.querySelector(".panel-left");
  const panelRight = document.querySelector(".panel-right");
  const contentPanels = document.querySelector(".content-panels");

  let isResizing = false;

  divider.addEventListener("mousedown", () => {
    isResizing = true;
    divider.classList.add("active");
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    const containerRect = contentPanels.getBoundingClientRect();
    const newLeftWidth = e.clientX - containerRect.left;
    const minWidth = 300; // Minimum width for each panel

    // Don't allow resizing past minimums
    if (
      newLeftWidth < minWidth ||
      containerRect.width - newLeftWidth < minWidth
    ) {
      return;
    }

    const totalWidth = containerRect.width;
    const rightWidth = totalWidth - newLeftWidth - 4; // 4px for divider

    panelLeft.style.flex = `0 0 ${newLeftWidth}px`;
    panelRight.style.flex = `0 0 ${rightWidth}px`;

    // Trigger editor layout recalculation
    if (editor) {
      setTimeout(() => editor.layout(), 0);
    }
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      divider.classList.remove("active");
    }
  });

  // Prevent text selection during resize
  document.addEventListener("selectstart", (e) => {
    if (isResizing) {
      e.preventDefault();
    }
  });
}

// Output panel toggle
function setupOutputToggle() {
  const toggleBtn = document.getElementById("toggle-output-btn");
  const panelRight = document.querySelector(".panel-right");
  let isCollapsed = false;

  toggleBtn.addEventListener("click", () => {
    isCollapsed = !isCollapsed;

    if (isCollapsed) {
      panelRight.classList.add("collapsed");
      toggleBtn.textContent = "⊖ Output";
    } else {
      panelRight.classList.remove("collapsed");
      toggleBtn.textContent = "⊕ Output";
    }

    // Trigger editor layout recalculation
    if (editor) {
      setTimeout(() => editor.layout(), 0);
    }
  });
}

// Tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    // Update buttons
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Update panes
    document
      .querySelectorAll(".tab-pane")
      .forEach((p) => p.classList.remove("active"));
    document.getElementById(`tab-${tab}`).classList.add("active");
  });
});

// Run code
document.getElementById("run-btn").addEventListener("click", async () => {
  // Auto-format before running if checkbox is checked
  const autoFormat = document.getElementById("auto-format-checkbox")?.checked;
  if (autoFormat) {
    document.getElementById("format-btn")?.click();
    // Wait a bit for formatting to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const code = editor.getValue();

  if (!code.trim()) {
    showToast("Editor is empty. Please write some code first!", "warning");
    return;
  }

  const stdin = document.getElementById("stdin-input").value;
  const argsInput = document.getElementById("args-input").value;
  const args = argsInput ? argsInput.split(/\s+/).filter((a) => a) : [];

  // Show loading
  document.getElementById("loading").style.display = "flex";
  document.getElementById("loading-status").textContent = "Lexical analysis...";

  // Clear previous results
  document.getElementById("output-content").textContent = "Compiling...";
  document.getElementById("ir-content").textContent = "";
  document.getElementById("ast-content").textContent = "";
  document.getElementById("tokens-content").textContent = "";

  // Reset execution info
  document.getElementById("exec-time").textContent = "...";
  document.getElementById("output-size").textContent = "...";
  document.getElementById("exec-status").textContent = "Running";
  document.getElementById("exec-status").style.color = "var(--warning)";

  const startTime = Date.now();

  // Switch to output tab
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.querySelector('[data-tab="output"]').classList.add("active");
  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-output").classList.add("active");

  try {
    document.getElementById("loading-status").textContent =
      "Compiling to LLVM IR...";

    const response = await fetch(`${API_BASE}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, input: stdin, args }),
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    // Update output
    const outputEl = document.getElementById("output-content");
    if (result.success) {
      outputEl.textContent = result.output || "(no output)";
      outputEl.className = "success";

      // Update execution info
      document.getElementById("exec-time").textContent = duration + "ms";
      document.getElementById("output-size").textContent =
        (result.output?.length || 0) + " bytes";
      document.getElementById("exec-status").textContent = "Success";
      document.getElementById("exec-status").style.color = "var(--success)";

      showToast("Code executed successfully!", "success");
    } else {
      outputEl.textContent = result.error || "Unknown error";
      outputEl.className = "error";
      if (result.output) {
        outputEl.textContent += "\n\nPartial output:\n" + result.output;
      }

      // Update execution info with error
      document.getElementById("exec-time").textContent = duration + "ms";
      document.getElementById("output-size").textContent = "N/A";
      document.getElementById("exec-status").textContent = "Failed";
      document.getElementById("exec-status").style.color = "var(--error)";

      showToast("Compilation failed", "error");
    }

    // Update IR
    if (result.ir) {
      document.getElementById("ir-content").textContent = result.ir;
    }

    // Update AST
    if (result.ast) {
      document.getElementById("ast-content").textContent = result.ast;
    }

    // Update Tokens
    if (result.tokens) {
      document.getElementById("tokens-content").textContent = result.tokens;
    }

    // Show warnings
    if (result.warnings && result.warnings.length > 0) {
      outputEl.textContent += "\n\nWarnings:\n" + result.warnings.join("\n");
    }

    // Update server stats after compilation
    setTimeout(pollServerStats, 500);
  } catch (error) {
    const outputEl = document.getElementById("output-content");
    outputEl.textContent = `Failed to connect to server: ${error.message}\n\nMake sure the backend server is running:\ncd playground/backend && bun run dev`;
    outputEl.className = "error";
    showToast("Server connection failed", "error");
  } finally {
    document.getElementById("loading").style.display = "none";
  }
});

document.getElementById("run-wasm-btn").addEventListener("click", async () => {
  const code = editor.getValue();
  if (!code.trim()) {
    showToast("Editor is empty. Please write some code first!", "warning");
    return;
  }

  const argsInput = document.getElementById("args-input").value;
  const args = argsInput ? argsInput.split(/\s+/).filter((a) => a) : [];
  const startTime = Date.now();

  document.getElementById("loading").style.display = "flex";
  document.getElementById("loading-status").textContent =
    "Compiling hosted WebAssembly...";
  activateTab("wasm");

  const wasmContent = document.getElementById("wasm-content");
  wasmContent.textContent = "Compiling hosted wasm module...";
  document.getElementById("exec-time").textContent = "...";
  document.getElementById("output-size").textContent = "...";
  document.getElementById("exec-status").textContent = "Wasm";
  document.getElementById("exec-status").style.color = "var(--info)";

  try {
    const response = await fetch(`${API_BASE}/wasm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, args }),
    });
    const result = await response.json();

    if (!result.success) {
      wasmContent.textContent = result.error || "WebAssembly build failed";
      wasmContent.className = "error";
      document.getElementById("exec-status").textContent = "Wasm failed";
      document.getElementById("exec-status").style.color = "var(--error)";
      showToast("WebAssembly build failed", "error");
      return;
    }

    document.getElementById("loading-status").textContent =
      "Instantiating in browser...";
    const runResult = await runHostedWasmInBrowser(result.wasmBase64, args);
    const duration = Date.now() - startTime;
    const imports = (result.imports || [])
      .map((entry) => `${entry.module}.${entry.name}`)
      .join("\n");

    wasmContent.className = runResult.trapped ? "error" : "success";
    wasmContent.textContent = [
      `Return code: ${runResult.returnCode}`,
      `Wasm bytes: ${result.wasmBytes}`,
      imports ? `Imports:\n${imports}` : "Imports: none",
      "",
      "stdout:",
      runResult.stdout || "(empty)",
      "",
      "stderr:",
      runResult.stderr || "(empty)",
      runResult.error ? `\ntrap:\n${runResult.error}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");

    if (result.ir) {
      document.getElementById("ir-content").textContent = result.ir;
    }
    document.getElementById("exec-time").textContent = duration + "ms";
    document.getElementById("output-size").textContent =
      `${result.wasmBytes || 0} bytes`;
    document.getElementById("exec-status").textContent = runResult.trapped
      ? "Wasm trapped"
      : "Wasm success";
    document.getElementById("exec-status").style.color = runResult.trapped
      ? "var(--error)"
      : "var(--success)";
    showToast("WebAssembly executed in browser", "success");
  } catch (error) {
    wasmContent.textContent = `WebAssembly run failed: ${error.message}`;
    wasmContent.className = "error";
    document.getElementById("exec-status").textContent = "Wasm failed";
    document.getElementById("exec-status").style.color = "var(--error)";
    showToast("WebAssembly run failed", "error");
  } finally {
    document.getElementById("loading").style.display = "none";
  }
});

function activateTab(tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((button) => button.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");
  document
    .querySelectorAll(".tab-pane")
    .forEach((pane) => pane.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");
}

function decodeBase64Bytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const HOSTED_WASM_ENV_IMPORTS = Object.freeze([
  "__bpl_host_write",
  "__bpl_host_exit",
  "__bpl_host_argc",
  "__bpl_host_argv_len",
  "__bpl_host_argv_copy",
  "__bpl_host_error",
]);

function assertHostedWasmEnvImports(env) {
  const missing = HOSTED_WASM_ENV_IMPORTS.filter(
    (importName) => typeof env[importName] !== "function",
  );

  if (missing.length > 0) {
    throw new Error(
      `Hosted wasm env import contract mismatch: missing ${missing.join(", ")}`,
    );
  }
}

async function runHostedWasmInBrowser(wasmBase64, argv) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encodedArgs = ["program", ...argv].map((arg) => encoder.encode(arg));
  let exports;
  let stdout = "";
  let stderr = "";
  let returnCode = null;
  let trapped = false;
  let error = "";

  const getMemory = () => {
    if (!(exports?.memory instanceof WebAssembly.Memory)) {
      throw new Error("Wasm module did not export memory.");
    }
    return exports.memory;
  };

  const readBytes = (ptr, len) => new Uint8Array(getMemory().buffer, ptr, len);
  const readString = (ptr) => {
    if (!ptr) return null;
    const memory = new Uint8Array(getMemory().buffer);
    let end = ptr;
    while (end < memory.length && memory[end] !== 0) {
      end++;
    }
    return decoder.decode(memory.subarray(ptr, end));
  };

  class WasmExit extends Error {
    constructor(code) {
      super(`wasm exit(${code})`);
      this.code = code;
    }
  }

  const imports = {
    env: {
      __bpl_host_write(fd, ptr, len) {
        const text = decoder.decode(readBytes(ptr, len));
        if (fd === 2) {
          stderr += text;
        } else {
          stdout += text;
        }
      },
      __bpl_host_exit(code) {
        throw new WasmExit(code);
      },
      __bpl_host_argc() {
        return encodedArgs.length;
      },
      __bpl_host_argv_len(index) {
        return encodedArgs[index]?.length ?? -1;
      },
      __bpl_host_argv_copy(index, ptr) {
        const arg = encodedArgs[index];
        if (arg) {
          readBytes(ptr, arg.length).set(arg);
        }
      },
      __bpl_host_error(code, detailPtr, funcPtr, line, col) {
        stderr += `BPL runtime error ${code}`;
        const detail = readString(detailPtr);
        const func = readString(funcPtr);
        if (detail) stderr += ` ${detail}`;
        if (func) stderr += ` in ${func}`;
        if (line || col) stderr += ` at ${line}:${col}`;
        stderr += "\n";
      },
    },
  };
  assertHostedWasmEnvImports(imports.env);

  const instantiated = await WebAssembly.instantiate(
    decodeBase64Bytes(wasmBase64),
    imports,
  );
  exports = instantiated.instance.exports;

  try {
    returnCode = exports.main(0, 0);
  } catch (caught) {
    if (caught instanceof WasmExit) {
      returnCode = caught.code;
    } else {
      trapped = true;
      error = caught?.message || String(caught);
    }
  }

  return { stdout, stderr, returnCode, trapped, error };
}

// Format code
document.getElementById("format-btn").addEventListener("click", async () => {
  const code = editor.getValue();

  if (!code.trim()) {
    showToast("Editor is empty", "warning");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/format`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (result.success && result.code) {
      editor.setValue(result.code);
      showToast("Code formatted successfully!", "success");
    } else {
      showToast(
        "Formatting failed: " + (result.error || "Unknown error"),
        "error",
      );
    }
  } catch (error) {
    showToast("Failed to connect to server", "error");
  }
});

// Load examples from backend
async function loadExamples() {
  try {
    const response = await fetch(`${API_BASE}/examples`);
    const examples = await response.json();

    const listEl = document.getElementById("examples-list");
    listEl.innerHTML = "";

    examples.forEach((example, index) => {
      const item = document.createElement("div");
      item.className = "example-item";
      item.innerHTML = `
                <div class="example-number">${example.order || index + 1}</div>
                <div class="example-info">
                    <div class="example-name">${example.title}</div>
                    <div class="example-snippet">${example.snippet || ""}</div>
                </div>
            `;
      item.addEventListener("click", () => loadExample(example, item));
      listEl.appendChild(item);
    });

    // Load first example by default
    if (examples.length > 0) {
      loadExample(examples[0], listEl.firstChild);
    }
  } catch (error) {
    console.error("Failed to load examples:", error);
    document.getElementById("examples-list").innerHTML = `
            <div style="padding: 1rem; color: var(--error);">
                Failed to load examples. Make sure the backend server is running.
            </div>
        `;
  }
}

function loadExample(example, itemEl) {
  currentExample = example;

  // Update active state
  document
    .querySelectorAll(".example-item")
    .forEach((el) => el.classList.remove("active"));
  if (itemEl) itemEl.classList.add("active");

  // Update header
  document.getElementById("example-title").textContent = example.title;
  document.getElementById("example-description").textContent =
    example.description;

  // Update editor
  if (editor) {
    editor.setValue(example.code.join("\n"));
    showToast(`Loaded: ${example.title}`, "info");
  }

  // Clear input/args
  document.getElementById("stdin-input").value = example.input || "";
  document.getElementById("args-input").value = example.args
    ? example.args.join(" ")
    : "";

  // Clear output tabs
  document.getElementById("output-content").textContent =
    "Run the code to see output...";
  document.getElementById("ir-content").textContent =
    "LLVM IR will appear here after compilation...";
  document.getElementById("ast-content").textContent =
    "Abstract Syntax Tree will appear here after parsing...";
  document.getElementById("tokens-content").textContent =
    "Lexer tokens will appear here after parsing...";
  document.getElementById("wasm-content").textContent =
    'Hosted WebAssembly output will appear here after "Run Wasm".';

  // Reset execution info
  document.getElementById("exec-time").textContent = "-";
  document.getElementById("output-size").textContent = "-";
  document.getElementById("exec-status").textContent = "Ready";
  document.getElementById("exec-status").style.color = "var(--text-secondary)";

  // Switch to output tab
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.querySelector('[data-tab="output"]').classList.add("active");
  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById("tab-output").classList.add("active");
}

// Poll server stats
async function pollServerStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    const stats = await response.json();

    // Update status indicator
    const statusEl = document.getElementById("server-status");
    const statusDot = statusEl.querySelector(".status-dot");
    statusEl.classList.remove("offline");
    statusEl.innerHTML = '<span class="status-dot"></span>Online';

    // Update compile count
    document.getElementById("compile-count").textContent =
      `${stats.successfulCompilations}/${stats.totalRequests}`;

    // Update average time
    document.getElementById("avg-time").textContent = stats.averageCompileTime
      ? `${stats.averageCompileTime.toFixed(0)}ms`
      : "0ms";
  } catch (error) {
    // Server is offline
    const statusEl = document.getElementById("server-status");
    statusEl.classList.add("offline");
    statusEl.innerHTML = '<span class="status-dot"></span>Offline';
  }
}

// Update editor info
function updateEditorInfo() {
  if (!editor) return;
  const model = editor.getModel();
  const lineCount = model.getLineCount();
  const charCount = model.getValueLength();
  document.getElementById("editor-info").textContent =
    `Lines: ${lineCount} | Chars: ${charCount}`;
}

// Setup quick actions
function setupQuickActions() {
  // Clear editor
  document.getElementById("clear-editor-btn").addEventListener("click", () => {
    if (confirm("Clear the editor? This will remove all your code.")) {
      editor.setValue("");
      showToast("Editor cleared", "info");
    }
  });

  // Copy code to clipboard
  document
    .getElementById("copy-code-btn")
    .addEventListener("click", async () => {
      const code = editor.getValue();
      if (!code.trim()) {
        showToast("Nothing to copy - editor is empty", "warning");
        return;
      }
      try {
        await navigator.clipboard.writeText(code);
        showToast("Code copied to clipboard!", "success");
      } catch (err) {
        showToast("Failed to copy code", "error");
      }
    });
}

// Setup search functionality
function setupSearch() {
  const searchInput = document.getElementById("example-search");
  const clearBtn = document.getElementById("clear-search-btn");

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    clearBtn.style.display = query ? "block" : "none";
    filterExamples(query);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    filterExamples("");
  });
}

function filterExamples(query) {
  const items = document.querySelectorAll(".example-item");

  items.forEach((item) => {
    const title = item.querySelector(".example-name").textContent.toLowerCase();
    const snippet = item
      .querySelector(".example-snippet")
      .textContent.toLowerCase();

    if (!query || title.includes(query) || snippet.includes(query)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

// Setup copy buttons
function setupCopyButtons() {
  const copyBtn = document.getElementById("copy-output-btn");

  copyBtn.addEventListener("click", async () => {
    const activeTab = document.querySelector(".tab-btn.active").dataset.tab;
    const contentEl = document.getElementById(`${activeTab}-content`);
    const text = contentEl.textContent;

    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add("copied");
      copyBtn.innerHTML = '<i class="fas fa-check"></i>';
      showToast("Content copied!", "success");

      setTimeout(() => {
        copyBtn.classList.remove("copied");
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
      }, 2000);
    } catch (err) {
      showToast("Failed to copy", "error");
    }
  });
}

// Setup fullscreen toggle
function setupFullscreen() {
  const fullscreenBtn = document.getElementById("fullscreen-btn");
  const container = document.querySelector(".container");

  fullscreenBtn.addEventListener("click", () => {
    container.classList.toggle("fullscreen");
    const isFullscreen = container.classList.contains("fullscreen");
    fullscreenBtn.innerHTML = isFullscreen
      ? '<i class="fas fa-compress"></i>'
      : '<i class="fas fa-expand"></i>';

    // Trigger editor layout recalculation
    setTimeout(() => editor.layout(), 100);
  });
}

// Toast notification system
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icons = {
    success: "fa-check-circle",
    error: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
    info: "fa-info-circle",
  };

  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close">&times;</button>
  `;

  container.appendChild(toast);

  // Close button
  toast.querySelector(".toast-close").addEventListener("click", () => {
    toast.remove();
  });

  // Auto remove
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
