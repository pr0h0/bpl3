#!/bin/bash

# BPL Playground Startup Script

echo "🚀 Starting BPL Playground..."

# Check if we're in the right directory
if [ ! -f "backend/server.ts" ]; then
    echo "❌ Error: Must run from playground directory"
    echo "Usage: cd playground && ./start.sh"
    exit 1
fi

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Error: Bun is not installed"
    echo "Install from: https://bun.sh"
    exit 1
fi

# Check if Clang is installed
if ! command -v clang &> /dev/null; then
    echo "⚠️  Warning: Clang not found. Code execution will fail."
    echo "Install: sudo apt install clang (Ubuntu) or brew install llvm (macOS)"
fi

# Check if BPL compiler is built
if [ ! -f "../bpl" ] && [ ! -f "../index.ts" ]; then
    echo "⚠️  Warning: BPL compiler may not be built"
    echo "Run: cd .. && bun run build"
fi

echo "📦 Installing backend dependencies..."
cd backend
bun install

echo ""
echo "✨ Starting server on http://localhost:3001"
echo "📚 Open your browser to start learning BPL!"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

bun run dev
