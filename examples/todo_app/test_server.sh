#!/bin/bash
./examples/todo_app/todo_app &
PID=$!
echo "Server started with PID $PID"
sleep 2

echo "--- GET /todos ---"
curl -s http://localhost:8080/todos
echo ""

echo "--- POST /todos ---"
curl -s -X POST http://localhost:8080/todos
echo ""

echo "--- GET /todos ---"
curl -s http://localhost:8080/todos
echo ""

echo "--- DELETE /todos/1 ---"
curl -s -X DELETE http://localhost:8080/todos/1
echo ""

echo "--- GET /todos (after delete) ---"
curl -s http://localhost:8080/todos
echo ""

echo "--- GET /index.html ---"
curl -s http://localhost:8080/index.html | head -n 5
echo ""

echo "--- GET /style.css ---"
curl -s http://localhost:8080/style.css | head -n 5
echo ""

echo "--- GET /app.js ---"
curl -s http://localhost:8080/app.js | head -n 5
echo ""

echo "--- GET / ---"
curl -s http://localhost:8080/ | head -n 5
echo ""

kill $PID
echo "Server killed"
