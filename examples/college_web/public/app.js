"use strict";
const tasks = document.querySelector("#tasks");
const status = document.querySelector("#status");
const create = document.querySelector("#create");
let page = 1;
let busy = false;
const limit = 20;
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || JSON.stringify(data.errors) || "Request failed");
  return data;
}
async function action(work) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button,input").forEach((element) => { element.disabled = true; });
  try { status.textContent = ""; await work(); }
  catch (error) { status.textContent = error.message; }
  finally {
    busy = false;
    document.querySelectorAll("button,input").forEach((element) => { element.disabled = false; });
    document.querySelector("#previous").disabled = page <= 1;
  }
}
async function load() {
  const data = await api(`/tasks?page=${page}&limit=${limit}`);
  tasks.replaceChildren();
  for (const task of data.items) {
    const row = document.createElement("li");
    const title = document.createElement("span");
    // User data is text, never HTML.
    title.textContent = task.title;
    title.className = task.done ? "done" : "";
    const toggle = document.createElement("button");
    toggle.textContent = task.done ? "Reopen" : "Complete";
    toggle.addEventListener("click", () => action(async () => {
      await api(`/tasks/${task.id}`, { method: "PUT", body: JSON.stringify({ title: task.title, done: !task.done }) });
      await load();
    }));
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.className = "secondary";
    remove.addEventListener("click", () => action(async () => {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      await load();
    }));
    row.append(title, toggle, remove);
    tasks.append(row);
  }
  if (data.items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No tasks on this page.";
    tasks.append(empty);
  }
  document.querySelector("#page").textContent = `Page ${page}`;
}
create.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#title").value;
  action(async () => {
    await api("/tasks", { method: "POST", body: JSON.stringify({ title, done: false }) });
    create.reset(); page = 1; await load();
  });
});
document.querySelector("#previous").addEventListener("click", () => action(async () => {
  if (page > 1) { page -= 1; await load(); }
}));
document.querySelector("#next").addEventListener("click", () => action(async () => {
  if (page < 10000) { page += 1; await load(); }
}));
action(load);
