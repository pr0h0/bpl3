const API_URL = '/todos';

async function fetchTodos() {
    const response = await fetch(API_URL);
    const todos = await response.json();
    const list = document.getElementById('todoList');
    list.innerHTML = '';
    todos.forEach(todo => {
        const li = document.createElement('li');
        li.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleTodo(${todo.id}, this.checked)">
            <span class="${todo.completed ? 'completed' : ''}">${todo.title}</span>
            <button class="delete-btn" onclick="deleteTodo(${todo.id})">Delete</button>
        `;
        list.appendChild(li);
    });
}

async function addTodo() {
    const input = document.getElementById('todoInput');
    const title = input.value;
    if (!title) return;

    await fetch(API_URL, {
        method: 'POST',
        body: title
    });
    input.value = '';
    fetchTodos();
}

async function deleteTodo(id) {
    await fetch(`${API_URL}/${id}`, {
        method: 'DELETE'
    });
    fetchTodos();
}

async function toggleTodo(id, completed) {
    await fetch(`${API_URL}/${id}`, {
        method: 'PUT',
        body: completed ? 'true' : 'false'
    });
    fetchTodos();
}

async function greetUser() {
    const input = document.getElementById('greetInput');
    const name = input.value;
    if (!name) return;

    const response = await fetch(`/greet/${name}`);
    const data = await response.json();
    document.getElementById('greetResult').innerText = data.message;
}

fetchTodos();