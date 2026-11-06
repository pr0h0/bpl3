// BPL tutorial: lesson outline, lesson rendering, runnable examples, quizzes
// and locally stored progress.

const TUTORIAL_API_BASE =
  window.location.protocol === "file:" ? "http://localhost:3001" : "";
const PROGRESS_KEY = "bpl-tutorial-progress";
const MONACO_BASE =
  "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs";

let tutorials = [];
let currentIndex = -1;
let completedLessons = new Set();
/** Code examples on the current page, indexed by their `data-example` id. */
let lessonExamples = [];
/** The run in progress, if any: { controller, example }. */
let activeRun = null;

const esc = (text) => BplMarkdown.escapeHtml(text ?? "");
const md = (text, headingOffset = 2) =>
  BplMarkdown.render(text, { highlight: BplSyntax.highlight, headingOffset });
const inline = (text) => BplMarkdown.renderInline(text ?? "");

require.config({ paths: { vs: MONACO_BASE } });
window.addEventListener("pagehide", () => activeRun?.controller.abort());

// ---------- Progress ----------

function loadProgress() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PROGRESS_KEY));
    if (Array.isArray(saved)) {
      completedLessons = new Set(saved.filter((id) => typeof id === "string"));
    }
  } catch {
    completedLessons = new Set();
  }
}

function saveProgress() {
  try {
    window.localStorage.setItem(
      PROGRESS_KEY,
      JSON.stringify([...completedLessons]),
    );
  } catch {
    /* progress is a convenience; private storage just forgets it */
  }
}

function setCompleted(id, done) {
  if (done) completedLessons.add(id);
  else completedLessons.delete(id);
  saveProgress();
  renderOutline();
}

// ---------- Loading and routing ----------

async function loadTutorials() {
  try {
    const response = await fetch(`${TUTORIAL_API_BASE}/tutorials`);
    tutorials = await response.json();
  } catch (error) {
    console.error("Failed to load tutorials:", error);
    document.getElementById("lesson").innerHTML = `
      <div class="load-error">
        <strong>The lessons could not be loaded.</strong>
        <p>Start the playground server from the repository root with
        <code>bun run playground</code>, then reload this page.</p>
      </div>`;
    document.getElementById("course-progress").textContent = "";
    return;
  }
  tutorials.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  renderOutline();
  if (tutorials.length === 0) {
    document.getElementById("lesson").innerHTML =
      '<p class="lesson-meta">No lessons are available.</p>';
    return;
  }
  showLesson(indexFromUrl(), { replace: true });
}

function indexFromUrl() {
  const id = new URLSearchParams(window.location.search).get("lesson");
  const index = tutorials.findIndex((lesson) => lesson.id === id);
  return index === -1 ? 0 : index;
}

function lessonHref(lesson) {
  return `?lesson=${encodeURIComponent(lesson.id)}`;
}

function showLesson(index, { replace = false, push = false } = {}) {
  if (index < 0 || index >= tutorials.length) return;
  activeRun?.controller.abort();
  currentIndex = index;
  const lesson = tutorials[index];
  const url = new URL(window.location.href);
  url.searchParams.set("lesson", lesson.id);
  if (push) window.history.pushState({}, "", url);
  else if (replace) window.history.replaceState({}, "", url);
  document.title = `${lesson.title} - BPL Tutorial`;
  renderOutline();
  renderLesson(lesson);
  window.scrollTo?.(0, 0);
}

window.addEventListener("popstate", () => {
  if (tutorials.length > 0) showLesson(indexFromUrl());
});

// Lesson links navigate in place; modified clicks open new tabs as usual.
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[data-lesson]");
  if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
  event.preventDefault();
  const index = Number(link.dataset.lesson);
  if (link.dataset.completes) setCompleted(tutorials[currentIndex].id, true);
  closeOutlineOnMobile();
  showLesson(index, { push: true });
});

// ---------- Outline ----------

function renderOutline() {
  const done = tutorials.filter((lesson) => completedLessons.has(lesson.id));
  document.getElementById("course-progress").innerHTML = tutorials.length
    ? `${done.length} of ${tutorials.length} lessons complete
       <progress max="${tutorials.length}" value="${done.length}"></progress>`
    : "";

  const groups = [];
  tutorials.forEach((lesson, index) => {
    const category = lesson.category || "Lessons";
    let group = groups.at(-1);
    if (!group || group.category !== category) {
      group = { category, items: [] };
      groups.push(group);
    }
    group.items.push({ lesson, index });
  });

  document.getElementById("outline-list").innerHTML = groups
    .map(
      (group) => `
      <section class="outline-group">
        <h3>${esc(group.category)}</h3>
        <ol>${group.items
          .map(({ lesson, index }) => {
            const complete = completedLessons.has(lesson.id);
            return `<li><a href="${lessonHref(lesson)}" data-lesson="${index}"
              data-complete="${complete}"
              ${index === currentIndex ? 'aria-current="page"' : ""}>
              <span class="outline-number">${complete ? "&#10003;" : index + 1}</span>
              <span>${esc(lesson.title)}</span>
              ${complete ? '<span class="visually-hidden">(complete)</span>' : ""}
            </a></li>`;
          })
          .join("")}</ol>
      </section>`,
    )
    .join("");
}

document.getElementById("outline-toggle").addEventListener("click", () => {
  const outline = document.getElementById("course-outline");
  const open = outline.dataset.open !== "true";
  outline.dataset.open = String(open);
  const toggle = document.getElementById("outline-toggle");
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "Hide lessons" : "Show all lessons";
});

function closeOutlineOnMobile() {
  const outline = document.getElementById("course-outline");
  if (outline.dataset.open === "true") {
    document.getElementById("outline-toggle").click();
  }
}

// ---------- Lesson ----------

function capitalize(text) {
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function renderLesson(lesson) {
  lessonExamples = [];
  const index = currentIndex;
  const previous = tutorials[index - 1];
  const next = tutorials[index + 1];
  const meta = [capitalize(lesson.difficulty), lesson.duration]
    .filter(Boolean)
    .map(esc)
    .join(" &middot; ");
  const goals = lesson.objectives?.length
    ? `<section class="lesson-goals">
        <h2>In this lesson</h2>
        <ul>${lesson.objectives.map((goal) => `<li>${inline(goal)}</li>`).join("")}</ul>
      </section>`
    : "";
  const complete = completedLessons.has(lesson.id);

  document.getElementById("lesson").innerHTML = `
    <p class="lesson-eyebrow">Lesson ${index + 1} of ${tutorials.length} &middot; ${esc(lesson.category)}</p>
    <h1>${esc(lesson.title)}</h1>
    ${meta ? `<p class="lesson-meta">${meta}</p>` : ""}
    ${lesson.description ? `<p class="lesson-lead">${inline(lesson.description)}</p>` : ""}
    ${goals}
    ${(lesson.sections || []).map(renderSection).join("")}
    <p class="lesson-complete">
      <label class="checkbox">
        <input type="checkbox" id="lesson-complete" ${complete ? "checked" : ""} />
        I have finished this lesson
      </label>
    </p>
    <nav class="lesson-pager" aria-label="Lesson navigation">
      ${
        previous
          ? `<a class="pager-link pager-prev" href="${lessonHref(previous)}" data-lesson="${index - 1}">
              <span>Previous</span><strong>${esc(previous.title)}</strong></a>`
          : ""
      }
      ${
        next
          ? `<a class="pager-link pager-next" href="${lessonHref(next)}" data-lesson="${index + 1}" data-completes="true">
              <span>Next</span><strong>${esc(next.title)}</strong></a>`
          : ""
      }
    </nav>`;

  document
    .getElementById("lesson-complete")
    .addEventListener("change", (event) =>
      setCompleted(lesson.id, event.target.checked),
    );
  attachLessonHandlers();
}

function renderSection(section) {
  switch (section.type) {
    case "text":
      return `<section class="lesson-section">
        ${section.title ? `<h2>${esc(section.title)}</h2>` : ""}
        <div class="prose">${md(section.content)}</div>
      </section>`;
    case "code":
      return `<section class="lesson-section">
        ${section.title ? `<h2>${esc(section.title)}</h2>` : ""}
        ${section.note ? `<div class="callout prose">${md(section.note)}</div>` : ""}
        ${renderExample(section.code, {
          runnable: section.runnable !== false,
          expectedOutput: section.expectedOutput,
          lineNotes: section.lineExplanations,
        })}
      </section>`;
    case "comparison":
      return renderComparison(section);
    case "challenge":
      return renderExercise(section);
    case "quiz":
      return renderQuiz(section);
    default:
      return "";
  }
}

function renderExample(
  code,
  { runnable, expectedOutput, lineNotes, label = "Example" },
) {
  const id = lessonExamples.length;
  lessonExamples.push({ code, editor: null });
  const notes = lineNotes ? Object.entries(lineNotes) : [];
  return `<div class="example" data-example="${id}">
    <div class="example-bar">
      <span class="label">${esc(label)}</span>
      ${runnable ? `<button class="btn btn-small" type="button" data-action="edit">Edit</button>` : ""}
      <button class="btn btn-small" type="button" data-action="copy">Copy</button>
      ${runnable ? `<button class="btn btn-small btn-primary" type="button" data-action="run">Run</button>` : ""}
    </div>
    <pre class="code-block"><code>${BplSyntax.highlight(code)}</code></pre>
    <div class="example-editor" hidden></div>
    <div class="example-output" hidden>
      <div class="example-output-label">Output</div>
      <pre></pre>
    </div>
    ${
      expectedOutput
        ? `<details><summary>Expected output</summary>
            <pre class="code-block details-body">${esc(expectedOutput)}</pre></details>`
        : ""
    }
    ${
      notes.length
        ? `<details><summary>Notes on this code</summary>
            <ul class="line-notes details-body">${notes
              .map(
                ([line, text]) =>
                  `<li><span class="line-ref">Line ${esc(line)}</span><span>${inline(text)}</span></li>`,
              )
              .join("")}</ul></details>`
        : ""
    }
  </div>`;
}

function renderComparison(section) {
  const figures = Object.entries(section.languages || {})
    .map(
      ([language, code]) => `<figure>
        <figcaption>${esc(language)}</figcaption>
        <pre class="code-block"><code>${
          language === "BPL" ? BplSyntax.highlight(code) : esc(code)
        }</code></pre>
      </figure>`,
    )
    .join("");
  return `<section class="lesson-section">
    <h2>${esc(section.title || "Compared with other languages")}</h2>
    <div class="comparison">${figures}</div>
    ${section.explanation ? `<div class="prose">${md(section.explanation)}</div>` : ""}
  </section>`;
}

function renderExercise(section) {
  return `<section class="lesson-section exercise">
    <h2>${esc(section.title || "Exercise")}</h2>
    <div class="prose">${md(section.instructions)}</div>
    ${
      section.hint
        ? `<details><summary>Hint</summary><div class="prose details-body">${md(section.hint)}</div></details>`
        : ""
    }
    ${
      section.solution
        ? `<details><summary>Solution</summary><div class="details-body">${renderExample(
            section.solution,
            { runnable: section.runnable !== false, label: "Solution" },
          )}</div></details>`
        : ""
    }
  </section>`;
}

function renderQuiz(section) {
  const questions = (section.questions || [])
    .map(
      (
        question,
        qIndex,
      ) => `<div class="quiz-question" data-correct="${Number(question.correct)}">
        <h3>${qIndex + 1}. ${inline(question.question)}</h3>
        <div class="quiz-options">${(question.options || [])
          .map(
            (option, oIndex) =>
              `<button class="quiz-option" type="button" data-option="${oIndex}">${inline(option)}</button>`,
          )
          .join("")}</div>
        <div class="quiz-feedback prose" hidden data-explanation="${esc(question.explanation || "")}"></div>
      </div>`,
    )
    .join("");
  return `<section class="lesson-section">
    <h2>${esc(section.title || "Check your understanding")}</h2>
    ${questions}
  </section>`;
}

// ---------- Interaction ----------

function attachLessonHandlers() {
  const root = document.getElementById("lesson");
  root.querySelectorAll(".example").forEach((element) => {
    const example = lessonExamples[Number(element.dataset.example)];
    element.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.action === "copy") copyExample(example);
        if (button.dataset.action === "edit")
          toggleEditor(element, example, button);
        if (button.dataset.action === "run")
          runExample(element, example, button);
      });
    });
  });

  root.querySelectorAll(".quiz-question").forEach((question) => {
    question.querySelectorAll(".quiz-option").forEach((option) => {
      option.addEventListener("click", () => answerQuestion(question, option));
    });
  });
}

function exampleSource(example) {
  return example.editor ? example.editor.getValue() : example.code;
}

async function copyExample(example) {
  try {
    await navigator.clipboard.writeText(exampleSource(example));
    showToast("Code copied", "success");
  } catch {
    showToast("Could not copy to the clipboard.", "error");
  }
}

function toggleEditor(element, example, button) {
  const pre = element.querySelector(".code-block");
  const host = element.querySelector(".example-editor");
  if (example.editor) {
    // Reset: discard edits and show the original code again.
    example.editor.dispose();
    example.editor = null;
    host.hidden = true;
    pre.hidden = false;
    button.textContent = "Edit";
    return;
  }
  button.disabled = true;
  require(["vs/editor/editor.main"], () => {
    BplSyntax.registerMonaco(monaco);
    const lines = example.code.split("\n").length;
    host.style.height = `${Math.min(32, Math.max(8, lines + 2)) * 19}px`;
    host.hidden = false;
    pre.hidden = true;
    example.editor = monaco.editor.create(host, {
      value: example.code,
      language: "bpl",
      theme: BplSyntax.monacoTheme(),
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 4,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: "on",
    });
    example.editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => element.querySelector('button[data-action="run"]')?.click(),
    );
    example.editor.focus();
    button.disabled = false;
    button.textContent = "Reset";
  }, () => {
    button.disabled = false;
    showToast("The code editor could not be loaded.", "error");
  });
}

/** Compile and run `code` on the playground server. */
async function compileLesson(code, signal) {
  const response = await fetch(`${TUTORIAL_API_BASE}/compile`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      input: "",
      args: [],
      includeArtifacts: false,
    }),
  });
  return response.json();
}

async function runExample(element, example, button) {
  if (activeRun) {
    // The active example's button reads "Stop"; any Run press cancels it.
    activeRun.controller.abort();
    return;
  }
  const controller = new AbortController();
  activeRun = { controller, example };
  const output = element.querySelector(".example-output");
  const text = output.querySelector("pre");
  output.hidden = false;
  output.dataset.status = "running";
  text.textContent = "Running...";
  button.textContent = "Stop";
  try {
    const result = await compileLesson(
      exampleSource(example),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    if (result.success) {
      output.dataset.status = "success";
      text.textContent = result.output || "(no output)";
    } else {
      output.dataset.status = "error";
      text.textContent = result.error || "Compilation failed.";
      if (result.output) {
        text.textContent += `\n\nOutput before the error:\n${result.output}`;
      }
    }
  } catch (error) {
    output.dataset.status = "error";
    text.textContent = controller.signal.aborted
      ? "Execution cancelled."
      : `Could not reach the playground server: ${error.message}`;
  } finally {
    activeRun = null;
    button.textContent = "Run";
  }
}

function answerQuestion(question, option) {
  if (question.dataset.answered) return;
  question.dataset.answered = "true";
  const correct = Number(question.dataset.correct);
  const chosen = Number(option.dataset.option);
  const options = [...question.querySelectorAll(".quiz-option")];
  options.forEach((button, index) => {
    button.disabled = true;
    if (index === correct) button.dataset.result = "correct";
    else if (index === chosen) button.dataset.result = "incorrect";
  });
  const feedback = question.querySelector(".quiz-feedback");
  const right = chosen === correct;
  const explanation = feedback.dataset.explanation;
  feedback.innerHTML = `<strong data-result="${right ? "correct" : "incorrect"}">${
    right ? "Correct." : "Not quite."
  }</strong> ${explanation ? inline(explanation) : ""}`;
  feedback.hidden = false;
}

// ---------- Toasts ----------

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.textContent = message;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---------- Keyboard ----------

document.addEventListener("keydown", (event) => {
  if (!event.altKey || tutorials.length === 0) return;
  if (event.target.closest?.(".monaco-editor, input, textarea")) return;
  if (event.key === "ArrowLeft" && currentIndex > 0) {
    showLesson(currentIndex - 1, { push: true });
  } else if (
    event.key === "ArrowRight" &&
    currentIndex < tutorials.length - 1
  ) {
    setCompleted(tutorials[currentIndex].id, true);
    showLesson(currentIndex + 1, { push: true });
  }
});

loadProgress();
loadTutorials();
