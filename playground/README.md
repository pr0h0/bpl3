# BPL Playground

An interactive web-based playground for learning and experimenting with BPL (Best Programming Language). Inspired by [gobyexample.com](https://gobyexample.com), this playground provides an educational environment with 70+ annotated examples and a comprehensive "Zero to Hero" tutorial series.

## Features

✨ **Interactive Code Editor**

- Monaco Editor with BPL syntax highlighting
- Real-time code editing with proper indentation
- Line numbers and code folding

🎓 **Learn by Example**

- 65+ curated examples covering all BPL features
- Each example includes detailed descriptions and explanations
- Progressive learning from "Hello World" to advanced topics

📚 **Zero to Hero Tutorial Series** _(NEW!)_

- 26 structured lessons from basics to advanced topics
- Interactive code snippets with "Run" functionality
- Multi-language comparisons (C, Python, Rust, JavaScript, Go)
- Hands-on challenges with hints and solutions
- Knowledge-check quizzes for retention
- Progress tracking with local storage

🔧 **Powerful Development Tools**

- **Output Tab**: See program output and errors
- **LLVM IR Tab**: View generated intermediate representation
- **AST Tab**: Explore the Abstract Syntax Tree
- **Tokens Tab**: Examine lexer tokens
- **Wasm Tab**: Build hosted WebAssembly and execute it through the browser runtime adapter

📥 **Input & Arguments**

- Pass standard input (stdin) to programs
- Provide command-line arguments
- Test interactive programs

🚀 **Fast Compilation**

- Bun-powered backend for quick responses
- Real-time compilation and execution
- Detailed error messages with line numbers
- Hosted wasm builds use `wasm-ld`/LLVM lld and the playground runs the module through browser `WebAssembly.instantiate`
- The Wasm tab reports browser runtime capability separately from BPL
  compilation. The default playground uses the backend `/wasm` endpoint for
  compilation, then runs the module in the browser. If a future
  `BplBrowserCompiler.compileToHostedWasm` bundle is loaded, the same UI can
  compile and run without the backend.

### Browser Compiler Hook

Browser-only compilation is opt-in. A compiler bundle can register
`window.BplBrowserCompiler.compileToHostedWasm` before `app.js` runs. The
playground calls `BplBrowserCompiler.compileToHostedWasm({ code, args })` where
`code` is the editor source string and `args` is the argv array passed to
`main`.

Successful responses return `success: true` and a required `wasmBase64` string.
`wasmBytes` and `imports` are optional display metadata using the same shape as
the backend `/wasm` response. Failure responses return `success: false` with an
`error` string. The playground then calls
`BplWasmHostAdapter.runHostedWasmInBrowser(wasmBase64, args)` so browser and
backend-compiled modules use the same host import adapter.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Clang/LLVM](https://llvm.org/) (for compiling LLVM IR)
- LLVM lld with `wasm-ld` on PATH, or `WASM_LD` set, for the Run Wasm path
- Node.js and TypeScript (for building BPL compiler)

### Installation

1. Build the BPL compiler first:

```bash
cd /path/to/bpl3
bun install
bun run build
```

2. Start the playground server:

```bash
cd playground
bun run start
```

If port 3001 is already in use:

```bash
PORT=3011 bun run start
```

3. Open your browser to `http://localhost:3001` or the custom `PORT` you selected.

## Project Structure

```
playground/
├── backend/
│   ├── server.ts         # Bun server with API endpoints
│   └── package.json
├── frontend/
│   ├── index.html        # Main playground UI
│   ├── tutorial.html     # Tutorial page UI
│   ├── style.css         # Styling and dark theme
│   ├── tutorial.css      # Tutorial-specific styles
│   ├── app.js            # Frontend logic and Monaco setup
│   └── tutorial.js       # Tutorial JavaScript functionality
├── examples/
│   ├── 01-hello-world.json
│   ├── 02-variables.json
│   └── ... (65+ examples)
└── tutorials/
    ├── 01-welcome-to-bpl.json
    ├── 02-variables-and-types.json
    └── ... (26 lessons)
```

## Tutorial Topics

The "Zero to Hero" tutorial covers:

### Beginner (Lessons 1-10)

1. Welcome to BPL - First program
2. Variables and Types - Data types, declarations
3. Operators - Arithmetic, comparison, logical
4. Control Flow (If/Else) - Conditionals
5. Loops - While, for, break, continue
6. Functions (Frames) - Parameters, returns
7. Arrays - Creation, indexing, iteration
8. Structs - Data structures
9. Struct Methods - Instance methods
10. Pointers - Memory addresses

### Intermediate (Lessons 11-20)

11. Enums & Pattern Matching - ADTs
12. Generics - Type parameters
13. Error Handling - try/catch/throw
14. Lambdas & Closures - Anonymous functions
15. Modules & Imports - Code organization
16. Memory Management - Stack/heap
17. Type Aliases - Type simplification
18. String Interpolation - Dynamic strings
19. Bitwise Operations - Bit manipulation
20. Inline Assembly - Low-level access

### Advanced (Lessons 21-26)

21. FFI - Calling C libraries
22. Building & Debugging - Compiler tools
23. Standard Library - Overview
24. Patterns & Idioms - Builder, Option, Result
25. Best Practices - Coding standards
26. What's Next - Continuing journey

## Advanced Example Coverage

The example catalog includes runnable coverage for recent compiler features:

- `64-raii-auto-destroy.json` - opt-in `@[auto_destroy]` cleanup at scope exit
- `65-runtime-type-guards.json` - runtime `is` checks and nullable `as` downcasts
- `66-native-variadic-functions.json` - native variadic functions with compiler-supplied `count`

## API Endpoints

### `GET /examples`

Returns all available examples with metadata.

### `GET /tutorials`

Returns all tutorial lessons with content and metadata.

### `POST /compile`

Compiles and runs BPL code.

**Request:**

```json
{
  "code": "frame main() ret int { return 0; }",
  "input": "optional stdin input",
  "args": ["arg1", "arg2"]
}
```

**Response:**

```json
{
  "success": true,
  "output": "program output",
  "ir": "LLVM IR code",
  "ast": "Abstract Syntax Tree JSON",
  "tokens": "Lexer tokens JSON",
  "warnings": []
}
```

Native execution responses preserve the frontend-facing shape for both success
and failure cases. On success, `success: true` is returned and `output` combines
stdout and stderr, with stderr appended under a `STDERR:` section. Nonzero
native exits return `success: false`, keep captured stdout in `output`, and set
`error` to `Runtime error: <stderr-or-message>`. Runtime timeouts return
`success: false`, keep any captured stdout in `output`, and use
`Execution timeout (5 seconds)` for the default playground timeout. The focused
contract tests are `tests/PlaygroundNativeExecution.test.ts` for payload
shaping and `tests/PlaygroundProcessRunner.test.ts` for argv/stdin process
execution.

When `/compile` native execution fails in CI, start with `bun run ci:triage`.
The mapping covers failures that mention
`playground/backend/nativeExecution.ts`,
`playground/backend/processRunner.ts`, `PlaygroundNativeExecution.test`,
`PlaygroundProcessRunner.test`, and argv-vector playground example failures.
Use the focused repro commands before broad suites:

```bash
bun test tests/PlaygroundNativeExecution.test.ts
bun test tests/PlaygroundProcessRunner.test.ts
bun test tests/PlaygroundExamples.test.ts -t "shell metacharacter args|argv-vector execution"
bun test tests/TutorialExamples.test.ts -t "argv-vector execution"
```

## Usage Tips

1. **Browse Examples**: Click examples in the sidebar to load them
2. **Edit Code**: Modify code in the Monaco editor
3. **Run Programs**: Click "Run Code" to compile and execute
4. **View Internals**: Switch tabs to see IR, AST, or tokens
5. **Add Input**: Expand "Input & Arguments" to provide stdin/args
6. **Start Tutorial**: Click "Start Tutorial: Zero to Hero" for structured learning
7. **Track Progress**: Tutorial progress is saved in your browser

## Development

### Start Development Server

```bash
cd playground
bun run dev
```

### Modify Examples

Examples are JSON files in `playground/examples/`. Each example has:

- `order`: Display order in sidebar
- `title`: Example name
- `snippet`: Short description
- `description`: Detailed explanation
- `code`: BPL source code
- `input` (optional): Default stdin
- `args` (optional): Default command-line arguments

### Adding New Examples

Create a new JSON file in `examples/`:

```json
{
  "order": 26,
  "title": "Your Example",
  "snippet": "Short description",
  "description": "Detailed explanation of the concept",
  "code": "frame main() ret int {\n    return 0;\n}"
}
```

### Adding New Tutorial Lessons

Create a new JSON file in `tutorials/`:

```json
{
  "id": "unique-id",
  "order": 27,
  "title": "Lesson Title",
  "category": "Category Name",
  "difficulty": "beginner|intermediate|advanced",
  "duration": "5 min",
  "description": "Brief description",
  "prerequisites": ["previous-lesson-id"],
  "objectives": ["Learning goal 1", "Learning goal 2"],
  "sections": [
    {
      "type": "text",
      "title": "Section Title",
      "content": "Markdown content..."
    },
    {
      "type": "code",
      "title": "Code Example",
      "code": "frame main() ret int { return 0; }",
      "runnable": true,
      "expectedOutput": "0",
      "lineExplanations": { "1": "Explanation for line 1" }
    },
    {
      "type": "comparison",
      "title": "Language Comparison",
      "languages": { "BPL": "...", "C": "...", "Python": "..." }
    },
    {
      "type": "challenge",
      "title": "Practice Challenge",
      "instructions": "Task description",
      "hint": "Optional hint",
      "solution": "Solution code"
    },
    {
      "type": "quiz",
      "questions": [
        {
          "question": "Question text?",
          "options": ["A", "B", "C", "D"],
          "correct": 0,
          "explanation": "Why A is correct"
        }
      ]
    }
  ],
  "nextLesson": "next-lesson-id"
}
```

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Monaco Editor
- **Backend**: Bun runtime, TypeScript
- **Compiler**: BPL → LLVM IR → Native binary (via Clang)
- **Styling**: Custom dark theme with CSS variables

## Troubleshooting

**Server won't start:**

- Ensure Bun is installed: `bun --version`
- Check if port 3001 is available
- Make sure BPL compiler is built

**Compilation errors:**

- Verify Clang/LLVM is installed: `clang --version`
- Check file permissions in `/tmp`
- Look at browser console for detailed errors
- In the Wasm tab, "Browser BPL compiler: unavailable" means browser execution
  is available but BPL-to-wasm compilation is still delegated to the backend
  `/wasm` endpoint.

**Examples not loading:**

- Check that JSON files are valid
- Ensure server.ts can read `examples/` directory
- Look for errors in server console

## License

Same as the BPL compiler project.

## Contributing

Feel free to add more examples or improve the playground UI!
