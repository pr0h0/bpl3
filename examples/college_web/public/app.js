"use strict";
const tasks = document.querySelector("#tasks");
const status = document.querySelector("#status");
const create = document.querySelector("#create");
let csrf = "";
let page = 1;
let busy = false;
const limit = 20;
function signedOut() {
  csrf = "";
  tasks.replaceChildren();
  document.querySelector("#auth").hidden = false;
  document.querySelector("#board").hidden = true;
  document.querySelector("#password").value = "";
}
function signedIn(reply) {
  csrf = reply.csrf;
  document.querySelector("#account").textContent =
    `Signed in as ${reply.user.username}`;
  document.querySelector("#auth").hidden = true;
  document.querySelector("#board").hidden = false;
  document.querySelector("#password").value = "";
}
async function api(path, options = {}) {
  const method = options.method || "GET";
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf && method !== "GET" && method !== "HEAD"
        ? { "X-CSRF-Token": csrf }
        : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : { error: `Request failed (${response.status})` };
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith("/login")) signedOut();
    throw new Error(
      data.error || JSON.stringify(data.errors) || "Request failed",
    );
  }
  return data;
}
async function action(work) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button,input").forEach((element) => {
    element.disabled = true;
  });
  try {
    status.textContent = "";
    await work();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    busy = false;
    document.querySelectorAll("button,input").forEach((element) => {
      element.disabled = false;
    });
    document.querySelector("#previous").disabled = page <= 1;
  }
}
async function load() {
  const data = await api(`/api/tasks?page=${page}&limit=${limit}`);
  tasks.replaceChildren();
  for (const task of data.items) {
    const row = document.createElement("li");
    const title = document.createElement("span");
    // User data is text, never HTML.
    title.textContent = task.title;
    title.className = task.done ? "done" : "";
    const toggle = document.createElement("button");
    toggle.textContent = task.done ? "Reopen" : "Complete";
    toggle.addEventListener("click", () =>
      action(async () => {
        await api(`/api/tasks/${task.id}`, {
          method: "PUT",
          body: JSON.stringify({ title: task.title, done: !task.done }),
        });
        await load();
      }),
    );
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.className = "secondary";
    remove.addEventListener("click", () =>
      action(async () => {
        await api(`/api/tasks/${task.id}`, { method: "DELETE" });
        await load();
      }),
    );
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
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title, done: false }),
    });
    create.reset();
    page = 1;
    await load();
  });
});
document.querySelector("#previous").addEventListener("click", () =>
  action(async () => {
    if (page > 1) {
      page -= 1;
      await load();
    }
  }),
);
document.querySelector("#next").addEventListener("click", () =>
  action(async () => {
    if (page < 10000) {
      page += 1;
      await load();
    }
  }),
);
async function authenticate(path) {
  const form = document.querySelector("#sign-in");
  if (!form.reportValidity()) return;
  const username = document.querySelector("#username").value;
  const password = document.querySelector("#password").value;
  await action(async () => {
    const reply = await api(path, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    signedIn(reply);
    page = 1;
    await load();
  });
}
document.querySelector("#sign-in").addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("/auth/login");
});
document
  .querySelector("#register")
  .addEventListener("click", () => authenticate("/auth/register"));
document.querySelector("#logout").addEventListener("click", () =>
  action(async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    signedOut();
  }),
);
action(async () => {
  try {
    signedIn(await api("/auth/me"));
    await load();
  } catch (error) {
    signedOut();
    if (error.message !== "authentication required") throw error;
  }
});
