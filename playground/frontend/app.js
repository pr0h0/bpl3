// Initialize Monaco Editor
let editor;
let currentExample = null;

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

  // Setup split pane resizing
  setupSplitPaneResize();

  // Setup output panel toggle
  setupOutputToggle();

  // Load examples
  loadExamples();
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
  const code = editor.getValue();
  const stdin = document.getElementById("stdin-input").value;
  const argsInput = document.getElementById("args-input").value;
  const args = argsInput ? argsInput.split(/\s+/).filter((a) => a) : [];

  // Show loading
  document.getElementById("loading").style.display = "flex";

  // Clear previous results
  document.getElementById("output-content").textContent = "Compiling...";
  document.getElementById("ir-content").textContent = "";
  document.getElementById("ast-content").textContent = "";
  document.getElementById("tokens-content").textContent = "";

  try {
    const response = await fetch("http://localhost:3001/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, input: stdin, args }),
    });

    const result = await response.json();

    // Update output
    const outputEl = document.getElementById("output-content");
    if (result.success) {
      outputEl.textContent = result.output || "(no output)";
      outputEl.className = "success";
    } else {
      outputEl.textContent = result.error || "Unknown error";
      outputEl.className = "error";
      if (result.output) {
        outputEl.textContent += "\n\nPartial output:\n" + result.output;
      }
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
  } catch (error) {
    const outputEl = document.getElementById("output-content");
    outputEl.textContent = `Failed to connect to server: ${error.message}\n\nMake sure the backend server is running:\ncd playground/backend && bun run dev`;
    outputEl.className = "error";
  } finally {
    document.getElementById("loading").style.display = "none";
  }
});

// Format code
document.getElementById("format-btn").addEventListener("click", async () => {
  const code = editor.getValue();

  if (!code.trim()) {
    return;
  }

  try {
    const response = await fetch("http://localhost:3001/format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const result = await response.json();

    if (result.success && result.code) {
      editor.setValue(result.code);
    } else {
      alert("Formatting failed: " + (result.error || "Unknown error"));
    }
  } catch (error) {
    alert("Failed to connect to server: " + error.message);
  }
});

// Load examples from backend
async function loadExamples() {
  try {
    const response = await fetch("http://localhost:3001/examples");
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
    editor.setValue(example.code);
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
