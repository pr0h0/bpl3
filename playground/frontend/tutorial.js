// Tutorial JavaScript - BPL Learn from Zero to Hero

let tutorials = [];
let currentTutorial = null;
let currentTutorialIndex = 0;
let completedLessons = [];
let modalEditor = null;

// Load completed lessons from localStorage
function loadProgress() {
  const saved = localStorage.getItem("bpl-tutorial-progress");
  if (saved) {
    completedLessons = JSON.parse(saved);
  }
}

// Save progress to localStorage
function saveProgress() {
  localStorage.setItem(
    "bpl-tutorial-progress",
    JSON.stringify(completedLessons),
  );
}

// Mark lesson as completed
function markCompleted(lessonId) {
  if (!completedLessons.includes(lessonId)) {
    completedLessons.push(lessonId);
    saveProgress();
    updateProgressUI();
    updateLessonsList();
  }
}

// Initialize Monaco Editor configuration
require.config({
  paths: {
    vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs",
  },
});

// Load tutorials from backend
async function loadTutorials() {
  try {
    const response = await fetch("http://localhost:3001/tutorials");
    tutorials = await response.json();

    // Build lessons list
    buildLessonsList();

    // Build category filter
    buildCategoryFilter();

    // Load first tutorial or from URL
    const urlParams = new URLSearchParams(window.location.search);
    const lessonId = urlParams.get("lesson");

    if (lessonId) {
      const index = tutorials.findIndex((t) => t.id === lessonId);
      if (index !== -1) {
        loadTutorial(index);
        return;
      }
    }

    // Load first tutorial
    if (tutorials.length > 0) {
      loadTutorial(0);
    }
  } catch (error) {
    console.error("Failed to load tutorials:", error);
    document.getElementById("lessons-list").innerHTML = `
      <div style="padding: 1rem; color: var(--error);">
        <i class="fas fa-exclamation-triangle"></i>
        Failed to load tutorials. Make sure the server is running.
      </div>
    `;
  }
}

// Build the lessons list in sidebar
function buildLessonsList() {
  const list = document.getElementById("lessons-list");
  list.innerHTML = "";

  tutorials.forEach((tutorial, index) => {
    const item = document.createElement("div");
    item.className = "lesson-item";
    if (completedLessons.includes(tutorial.id)) {
      item.classList.add("completed");
    }

    item.innerHTML = `
      <div class="lesson-number">${completedLessons.includes(tutorial.id) ? '<i class="fas fa-check"></i>' : tutorial.order}</div>
      <div class="lesson-info">
        <div class="lesson-name">${tutorial.title}</div>
        <div class="lesson-meta-small">
          <span>${tutorial.difficulty}</span>
          <span>•</span>
          <span>${tutorial.duration}</span>
        </div>
      </div>
    `;

    item.addEventListener("click", () => loadTutorial(index));
    list.appendChild(item);
  });

  updateProgressUI();
}

// Build category filter options
function buildCategoryFilter() {
  const categories = [...new Set(tutorials.map((t) => t.category))];
  const select = document.getElementById("category-filter");

  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat;
    option.textContent = cat;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    filterLessons(select.value);
  });
}

// Filter lessons by category
function filterLessons(category) {
  const items = document.querySelectorAll(".lesson-item");
  items.forEach((item, index) => {
    if (category === "all" || tutorials[index].category === category) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

// Update progress UI
function updateProgressUI() {
  const completed = completedLessons.length;
  const total = tutorials.length;
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  document.getElementById("progress-fill").style.width = `${percentage}%`;
  document.getElementById("progress-text").textContent =
    `${completed} / ${total} lessons`;
}

// Update lessons list active state
function updateLessonsList() {
  const items = document.querySelectorAll(".lesson-item");
  items.forEach((item, index) => {
    item.classList.toggle("active", index === currentTutorialIndex);

    // Update completed state
    if (completedLessons.includes(tutorials[index]?.id)) {
      item.classList.add("completed");
      item.querySelector(".lesson-number").innerHTML =
        '<i class="fas fa-check"></i>';
    }
  });
}

// Load a specific tutorial
function loadTutorial(index) {
  if (index < 0 || index >= tutorials.length) return;

  currentTutorialIndex = index;
  currentTutorial = tutorials[index];

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set("lesson", currentTutorial.id);
  window.history.pushState({}, "", url);

  // Update active state in sidebar
  updateLessonsList();

  // Update header
  document.getElementById("lesson-title").textContent = currentTutorial.title;
  document.getElementById("lesson-description").textContent =
    currentTutorial.description;

  // Update meta badges
  const difficultyBadge = document.getElementById("lesson-difficulty");
  difficultyBadge.textContent = currentTutorial.difficulty;
  difficultyBadge.className = `difficulty-badge ${currentTutorial.difficulty}`;

  document.getElementById("lesson-duration").innerHTML =
    `<i class="fas fa-clock"></i> ${currentTutorial.duration}`;
  document.getElementById("lesson-category").textContent =
    currentTutorial.category;

  // Update objectives
  const objectivesEl = document.getElementById("lesson-objectives");
  if (currentTutorial.objectives && currentTutorial.objectives.length > 0) {
    objectivesEl.innerHTML = `
      <h4><i class="fas fa-bullseye"></i> What you'll learn</h4>
      <ul>
        ${currentTutorial.objectives.map((obj) => `<li>${obj}</li>`).join("")}
      </ul>
    `;
    objectivesEl.style.display = "block";
  } else {
    objectivesEl.style.display = "none";
  }

  // Render content sections
  renderSections(currentTutorial.sections);

  // Update navigation buttons
  updateNavigation();

  // Scroll to top
  document.querySelector(".tutorial-main").scrollTop = 0;
}

// Render all sections
function renderSections(sections) {
  const container = document.getElementById("tutorial-content");
  container.innerHTML = "";

  sections.forEach((section, index) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "tutorial-section";

    switch (section.type) {
      case "text":
        sectionEl.innerHTML = renderTextSection(section);
        break;
      case "code":
        sectionEl.innerHTML = renderCodeSection(section, index);
        break;
      case "comparison":
        sectionEl.innerHTML = renderComparisonSection(section);
        break;
      case "challenge":
        sectionEl.className += " challenge-section";
        sectionEl.innerHTML = renderChallengeSection(section, index);
        break;
      case "quiz":
        sectionEl.className += " quiz-section";
        sectionEl.innerHTML = renderQuizSection(section);
        break;
      default:
        sectionEl.innerHTML = `<div class="section-body"><p>Unknown section type: ${section.type}</p></div>`;
    }

    container.appendChild(sectionEl);
  });

  // Attach event handlers
  attachSectionHandlers();
}

// Render text section
function renderTextSection(section) {
  return `
    <div class="section-header">
      <h3><i class="fas fa-book-open"></i> ${section.title || "Overview"}</h3>
    </div>
    <div class="section-body">
      <div class="text-content">${parseMarkdown(section.content)}</div>
    </div>
  `;
}

// Render code section
function renderCodeSection(section, index) {
  const lineExplanations = section.lineExplanations
    ? Object.entries(section.lineExplanations)
        .map(
          ([line, text]) => `
    <div class="line-explanation">
      <span class="line-number">Line ${line}:</span>
      <span class="line-text">${text}</span>
    </div>
  `,
        )
        .join("")
    : "";

  const expectedOutput = section.expectedOutput
    ? `
    <div class="expected-output">
      <h5><i class="fas fa-check-circle"></i> Expected Output</h5>
      <pre>${escapeHtml(section.expectedOutput)}</pre>
    </div>
  `
    : "";

  return `
    <div class="section-header">
      <h3><i class="fas fa-code"></i> ${section.title || "Code Example"}</h3>
    </div>
    <div class="section-body">
      <div class="code-section">
        <div class="code-header">
          <span>BPL Code</span>
          <div class="code-actions">
            <button class="code-btn copy-btn" data-code="${encodeURIComponent(section.code)}">
              <i class="fas fa-copy"></i> Copy
            </button>
            ${
              section.runnable !== false
                ? `
              <button class="code-btn run-code-btn" data-code="${encodeURIComponent(section.code)}" data-index="${index}">
                <i class="fas fa-play"></i> Run
              </button>
            `
                : ""
            }
          </div>
        </div>
        <pre class="code-block">${highlightBPL(section.code)}</pre>
      </div>
      ${expectedOutput}
      ${
        lineExplanations
          ? `
        <div class="line-explanations">
          <h5><i class="fas fa-lightbulb"></i> Line-by-Line Explanation</h5>
          ${lineExplanations}
        </div>
      `
          : ""
      }
    </div>
  `;
}

// Render comparison section
function renderComparisonSection(section) {
  const languages = section.languages || {};
  const items = Object.entries(languages)
    .map(
      ([lang, code]) => `
    <div class="comparison-item">
      <div class="comparison-header">${lang}</div>
      <pre class="comparison-code">${escapeHtml(code)}</pre>
    </div>
  `,
    )
    .join("");

  const explanation = section.explanation
    ? `
    <div class="comparison-explanation">
      <i class="fas fa-info-circle"></i> ${section.explanation}
    </div>
  `
    : "";

  return `
    <div class="section-header">
      <h3><i class="fas fa-balance-scale"></i> ${section.title || "Language Comparison"}</h3>
    </div>
    <div class="section-body">
      <div class="comparison-grid">${items}</div>
      ${explanation}
    </div>
  `;
}

// Render challenge section
function renderChallengeSection(section, index) {
  return `
    <div class="section-header">
      <h3><i class="fas fa-trophy"></i> ${section.title || "Challenge"}</h3>
    </div>
    <div class="section-body">
      <div class="challenge-instructions">${parseMarkdown(section.instructions)}</div>
      ${
        section.hint
          ? `
        <button class="hint-toggle" data-target="hint-${index}">
          <i class="fas fa-lightbulb"></i> Show Hint
        </button>
        <div class="hint-content" id="hint-${index}">
          <i class="fas fa-lightbulb"></i> ${section.hint}
        </div>
      `
          : ""
      }
      ${
        section.solution
          ? `
        <button class="solution-toggle" data-target="solution-${index}">
          <i class="fas fa-eye"></i> Show Solution
        </button>
        <div class="solution-content" id="solution-${index}">
          <div class="code-section">
            <div class="code-header">
              <span>Solution</span>
              <div class="code-actions">
                <button class="code-btn copy-btn" data-code="${encodeURIComponent(section.solution)}">
                  <i class="fas fa-copy"></i> Copy
                </button>
                <button class="code-btn run-code-btn" data-code="${encodeURIComponent(section.solution)}" data-index="${index}">
                  <i class="fas fa-play"></i> Run
                </button>
              </div>
            </div>
            <pre class="code-block">${highlightBPL(section.solution)}</pre>
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
}

// Render quiz section
function renderQuizSection(section) {
  const questions = (section.questions || [])
    .map((q, qIndex) => {
      const options = (q.options || [])
        .map(
          (opt, oIndex) => `
      <div class="quiz-option" data-question="${qIndex}" data-option="${oIndex}" data-correct="${q.correct}">
        ${opt}
      </div>
    `,
        )
        .join("");

      return `
      <div class="quiz-question" data-qindex="${qIndex}">
        <h4>Q${qIndex + 1}: ${q.question}</h4>
        <div class="quiz-options">${options}</div>
        <div class="quiz-explanation" id="quiz-exp-${qIndex}">${q.explanation || ""}</div>
      </div>
    `;
    })
    .join("");

  return `
    <div class="section-header">
      <h3><i class="fas fa-question-circle"></i> Knowledge Check</h3>
    </div>
    <div class="section-body">
      ${questions}
    </div>
  `;
}

// Attach event handlers to sections
function attachSectionHandlers() {
  // Copy buttons
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code);
      navigator.clipboard.writeText(code);
      showToast("Code copied to clipboard!", "success");
    });
  });

  // Run buttons
  document.querySelectorAll(".run-code-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = decodeURIComponent(btn.dataset.code);
      openCodeModal(code);
    });
  });

  // Hint toggles
  document.querySelectorAll(".hint-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      target.classList.toggle("show");
      btn.innerHTML = target.classList.contains("show")
        ? '<i class="fas fa-lightbulb"></i> Hide Hint'
        : '<i class="fas fa-lightbulb"></i> Show Hint';
    });
  });

  // Solution toggles
  document.querySelectorAll(".solution-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      target.classList.toggle("show");
      btn.innerHTML = target.classList.contains("show")
        ? '<i class="fas fa-eye-slash"></i> Hide Solution'
        : '<i class="fas fa-eye"></i> Show Solution';
    });
  });

  // Quiz options
  document.querySelectorAll(".quiz-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      const qIndex = opt.dataset.question;
      const selected = parseInt(opt.dataset.option);
      const correct = parseInt(opt.dataset.correct);

      // Disable further clicks on this question
      const questionEl = opt.closest(".quiz-question");
      if (questionEl.classList.contains("answered")) return;
      questionEl.classList.add("answered");

      // Mark options
      questionEl.querySelectorAll(".quiz-option").forEach((o, i) => {
        if (i === correct) {
          o.classList.add("correct");
        } else if (i === selected && selected !== correct) {
          o.classList.add("incorrect");
        }
      });

      // Show explanation
      document.getElementById(`quiz-exp-${qIndex}`).classList.add("show");

      // Check if all questions answered
      const allAnswered =
        document.querySelectorAll(".quiz-question.answered").length ===
        document.querySelectorAll(".quiz-question").length;

      if (allAnswered && currentTutorial) {
        markCompleted(currentTutorial.id);
      }
    });
  });
}

// Update navigation buttons
function updateNavigation() {
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  prevBtn.disabled = currentTutorialIndex === 0;
  nextBtn.disabled = currentTutorialIndex === tutorials.length - 1;

  prevBtn.onclick = () => {
    if (currentTutorialIndex > 0) {
      loadTutorial(currentTutorialIndex - 1);
    }
  };

  nextBtn.onclick = () => {
    // Mark current as completed when moving to next
    if (currentTutorial) {
      markCompleted(currentTutorial.id);
    }

    if (currentTutorialIndex < tutorials.length - 1) {
      loadTutorial(currentTutorialIndex + 1);
    }
  };
}

// Open code runner modal
function openCodeModal(code) {
  const modal = document.getElementById("code-modal");
  const editorContainer = document.getElementById("modal-editor");

  // Show modal first (Monaco needs visible container)
  modal.style.display = "flex";

  document.getElementById("modal-output").textContent =
    'Click "Run" to execute the code...';
  document.getElementById("modal-output").style.color = "var(--text-primary)";

  // Initialize Monaco editor in modal
  require(["vs/editor/editor.main"], function () {
    // Register BPL language if not already
    if (!monaco.languages.getLanguages().find((l) => l.id === "bpl")) {
      monaco.languages.register({ id: "bpl" });
      monaco.languages.setMonarchTokensProvider(
        "bpl",
        getBPLLanguageDefinition(),
      );
    }

    if (modalEditor) {
      // Editor exists, just update the value
      modalEditor.setValue(code);
      // Force layout refresh
      modalEditor.layout();
    } else {
      // Create new editor
      modalEditor = monaco.editor.create(editorContainer, {
        value: code,
        language: "bpl",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
      });
    }

    // Focus the editor after a short delay to ensure it's ready
    setTimeout(() => {
      if (modalEditor) {
        modalEditor.focus();
        modalEditor.layout();
      }
    }, 100);
  });
}

// Close code modal
document.getElementById("close-modal-btn")?.addEventListener("click", () => {
  document.getElementById("code-modal").style.display = "none";
});

// Run code in modal
document
  .getElementById("modal-run-btn")
  ?.addEventListener("click", async () => {
    if (!modalEditor) return;

    const code = modalEditor.getValue();
    const output = document.getElementById("modal-output");

    output.textContent = "Running...";

    try {
      const response = await fetch("http://localhost:3001/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input: "", args: [] }),
      });

      const result = await response.json();

      if (result.success) {
        output.textContent = result.output || "(no output)";
        output.style.color = "var(--success)";
      } else {
        output.textContent = result.error || "Compilation failed";
        output.style.color = "var(--error)";
      }
    } catch (error) {
      output.textContent = "Failed to connect to server";
      output.style.color = "var(--error)";
    }
  });

// Close modal on backdrop click
document.getElementById("code-modal")?.addEventListener("click", (e) => {
  if (e.target.id === "code-modal") {
    document.getElementById("code-modal").style.display = "none";
  }
});

// Simple markdown parser
function parseMarkdown(text) {
  if (!text) return "";

  return (
    text
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
      // Inline code
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      // Italic
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      // Links
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank">$1</a>',
      )
      // Headers
      .replace(/^### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^## (.+)$/gm, "<h3>$1</h3>")
      // Lists
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>")
      // Line breaks
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>")
      // Wrap in paragraph
      .replace(/^(.+)$/, "<p>$1</p>")
  );
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Simple BPL syntax highlighter
function highlightBPL(code) {
  // First escape HTML
  let result = escapeHtml(code);

  // Store placeholders for strings and comments to prevent nested replacements
  const placeholders = [];

  // Replace comments first
  result = result.replace(/#.*/g, (match) => {
    const idx = placeholders.length;
    placeholders.push(`<span class="hl-comment">${match}</span>`);
    return `__PH${idx}__`;
  });

  // Replace strings
  result = result.replace(/(&quot;|&#39;)(?:(?!\1)[^\\]|\\.)*\1/g, (match) => {
    const idx = placeholders.length;
    placeholders.push(`<span class="hl-string">${match}</span>`);
    return `__PH${idx}__`;
  });

  // Keywords
  result = result.replace(
    /\b(frame|ret|local|global|struct|import|export|extern|if|else|loop|return|break|continue|true|false|nullptr|sizeof|typeof|switch|case|default|try|catch|throw|defer|match|enum|type|const|spec|from|as|asm)\b/g,
    '<span class="hl-keyword">$1</span>',
  );

  // Types
  result = result.replace(
    /\b(int|float|string|bool|void|char|i8|i16|i32|i64|u8|u16|u32|u64|f32|f64|Func|Lambda|Option|Result)\b/g,
    '<span class="hl-type">$1</span>',
  );

  // Numbers (only match standalone numbers, not inside placeholders)
  result = result.replace(
    /(?<!__)\b(\d+\.?\d*)\b(?!__)/g,
    '<span class="hl-number">$1</span>',
  );

  // Restore placeholders
  placeholders.forEach((value, idx) => {
    result = result.replace(`__PH${idx}__`, value);
  });

  return result;
}

// Get BPL language definition for Monaco
function getBPLLanguageDefinition() {
  return {
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
      "loop",
      "return",
      "break",
      "continue",
      "true",
      "false",
      "nullptr",
      "sizeof",
      "typeof",
      "switch",
      "case",
      "default",
      "try",
      "catch",
      "throw",
      "defer",
      "match",
      "enum",
      "type",
      "const",
      "spec",
      "from",
      "as",
      "asm",
    ],
    typeKeywords: [
      "int",
      "float",
      "string",
      "bool",
      "void",
      "char",
      "i8",
      "i16",
      "i32",
      "i64",
      "u8",
      "u16",
      "u32",
      "u64",
      "f32",
      "f64",
      "Func",
      "Lambda",
      "Option",
      "Result",
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
    ],
    tokenizer: {
      root: [
        [/#.*/, "comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
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
        [/[A-Z][\w$]*/, "type.identifier"],
        [/\d+/, "number"],
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
    },
  };
}

// Toast notification
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadProgress();
  loadTutorials();

  // Pre-load Monaco editor so it's ready when user clicks Run
  require(["vs/editor/editor.main"], function () {
    // Register BPL language
    if (!monaco.languages.getLanguages().find((l) => l.id === "bpl")) {
      monaco.languages.register({ id: "bpl" });
      monaco.languages.setMonarchTokensProvider(
        "bpl",
        getBPLLanguageDefinition(),
      );
    }
    console.log("Monaco editor pre-loaded");
  });
});

// Handle keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Escape to close modal
  if (e.key === "Escape") {
    document.getElementById("code-modal").style.display = "none";
  }

  // Arrow keys for navigation
  if (e.key === "ArrowLeft" && e.altKey) {
    if (currentTutorialIndex > 0) {
      loadTutorial(currentTutorialIndex - 1);
    }
  }
  if (e.key === "ArrowRight" && e.altKey) {
    if (currentTutorial) {
      markCompleted(currentTutorial.id);
    }
    if (currentTutorialIndex < tutorials.length - 1) {
      loadTutorial(currentTutorialIndex + 1);
    }
  }
});
