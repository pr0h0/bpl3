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
`BplWasmHostAdapter.runHostedWasmInWorker(wasmBase64, args, options)` so browser
and backend-compiled modules use the same host import adapter, cancellation,
and execution limits.

## Quick Start

### Docker workers (default)

Install Bun and Docker with Linux containers enabled. From the repository root:

```bash
bun install --frozen-lockfile
bun run playground:build
bun run playground
```

Open `http://localhost:3001`. Set `PORT=3011` to use another port.
The web server runs on the host; each compilation, native execution, or formatting
request runs in a disposable Docker container. The image bundles Bun 1.4.2,
Ubuntu 24.04, Clang/lld 18, and the BPL runtime. Host LLVM is unnecessary in this
mode. Rebuild the image after changing compiler, library, or worker code, then
restart the server: it pins the image ID at startup.

Docker must be running and the image must already exist. Startup fails with setup
instructions if either is unavailable; it never falls back to host execution.

### Trusted local development on the host

Install Bun, Clang, and lld (`wasm-ld`, or set `WASM_LD`) locally, then run:

```bash
bun install --frozen-lockfile
bun run build:runtime
bun run playground:host
```

This explicitly sets `BPL_PLAYGROUND_RUNNER=host`. Submitted code has your account's
filesystem, network, and environment access. Use it only for your own trusted code.
Host mode always binds to `127.0.0.1` and rejects foreign browser origins and
non-local Host headers. It preserves the development compiler and native binary
caches, so repeated runs avoid container startup and compilation costs.

### Configuration and deployment

| Setting                          | Default                       | Purpose                                                              |
| -------------------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `BPL_PLAYGROUND_RUNNER`          | `docker`                      | `docker` or explicitly trusted `host`                                |
| `BPL_PLAYGROUND_IMAGE`           | `bpl-playground-worker:local` | Trusted, locally built worker image                                  |
| `BPL_PLAYGROUND_HOST`            | `127.0.0.1`                   | Docker-mode HTTP bind address; ignored in host mode                  |
| `BPL_PLAYGROUND_TRUSTED_PROXIES` | unset                         | Comma-separated exact proxy IPs allowed to supply a single client IP |
| `PORT`                           | `3001`                        | HTTP port                                                            |

These are server settings; visitors cannot select a runner or image. `/health`
reports the selected runner. For a shared deployment, use Docker mode and place
the HTTP server behind your reverse proxy with appropriate access and rate limits.
Set `BPL_PLAYGROUND_HOST=0.0.0.0` only when you intend to expose it. Run the trusted
controller under a dedicated account with Docker access; never give a worker the
Docker socket, credentials, or host bind mounts. Docker workers share the host
kernel, so keep Docker and the host patched and use a dedicated machine or VM for
an Internet-facing playground.

The controller uses the socket peer address by default and ignores supplied
forwarding headers. Behind a reverse proxy, configure its exact IP in
`BPL_PLAYGROUND_TRUSTED_PROXIES` and have it **overwrite** `X-Forwarded-For` with
the client address (for Nginx: `proxy_set_header X-Forwarded-For $remote_addr;`).
Forwarded chains are ignored. Configure this only for proxies you control.

The Stop button cancels the active request in the editor and tutorial modal.
Disconnecting a client also cancels its job; the execution slot stays reserved
until Docker cleanup completes. If cancellation arrives during container creation,
creation is allowed to settle before removal to avoid an orphan race. Host mode
kills subprocess groups when cancelled; its synchronous parsing and compilation
cannot be interrupted mid-call.

Browser Wasm runs in a disposable Web Worker, so Stop remains responsive even for
an infinite loop. Browser execution has a five-second timeout and a 1 MiB combined
stdout/stderr budget. Serve the playground over HTTP(S) to use Web Workers.
Auto-format completes before Run submits the formatted source.

Each worker has no external network, runs as UID/GID 10001, drops all capabilities,
sets `no-new-privileges`, and uses a read-only root filesystem. Its temporary
workspace is a 128 MiB tmpfs. Limits are 1 CPU, 768 MiB memory with no additional
swap, 64 processes, and 256 file descriptors. At most two jobs run per server;
additional submissions receive HTTP 429. Each client IP may have one active job,
a burst of ten submissions, and twenty further submissions per minute. HTTP 429
responses include `Retry-After`. Tracking is bounded to 4,096 client addresses;
clients behind the same NAT share a budget. Host mode does not apply these quotas. Request bodies are limited to 512 KiB,
source to 128 KiB, stdin to 256 KiB, and argv to 64 arguments of at most 4 KiB each.

Native execution has a 5-second limit and a 1 MiB output budget. Each complete
worker job has a 30-second watchdog independent of the web server, and the Docker
client allows 35 seconds for attach/completion. Combined worker output and
diagnostics are capped at 16 MiB. Worker failures return HTTP 502; cleanup failures
return 503 and disable new jobs until cleanup succeeds. The controller retries
cleanup and checks Docker every 15 seconds; `/health` returns 503 while unavailable. Containers are removed
on completion and explicitly force-removed on errors. The PID 1 watchdog also
terminates jobs left running after controller failure. A 60-second expiry label
lets startup and periodic recovery remove containers abandoned before startup.
Recovery leaves unexpired workers and unrelated containers alone. If every
controller is stopped, expired unstarted containers are collected on the next
controller startup. Do not add `--init` before
this watchdog: that would allow a submitted program to suspend the watchdog.

Docker jobs start fresh, so they do not share native binaries or compiler caches
across requests. Wasm compilation happens in a worker; Wasm execution continues
in the browser. To run the real-container regression suite:

```bash
bun run playground:build
bun run test:playground-docker
```

The regular test suite covers runner contracts without requiring Docker. A
separate GitHub Actions job builds the image and runs the Docker integration tests.

## Project Structure

```
playground/
├── backend/
│   ├── runner.ts         # Docker lifecycle, limits, and explicit host selection
│   ├── worker.ts         # One-job JSON worker entry point
│   ├── engine.ts         # Compilation, formatting, and native execution
│   ├── server.ts         # Bun server with API endpoints
│   ├── runtimeFiles.ts   # Native runtime object cache for faster playground links
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
  "args": ["arg1", "arg2"],
  "includeArtifacts": false,
  "execute": true
}
```

The default Run Code request omits IR, AST, and token payloads so small programs
return quickly. Debug tabs load artifacts lazily by sending
`includeArtifacts: true` with `execute: false`; that compiles and returns
compiler internals without linking or rerunning the native binary.

**Default response:**

```json
{
  "success": true,
  "output": "program output",
  "warnings": []
}
```

**Artifact response:**

```json
{
  "success": true,
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
4. **View Internals**: Switch tabs to lazily load IR, AST, or tokens
5. **Add Input**: Expand "Input & Arguments" to provide stdin/args
6. **Start Tutorial**: Click "Start Tutorial: Zero to Hero" for structured learning
7. **Track Progress**: Tutorial progress is saved in your browser

## Development

### Start Development Server

```bash
bun run playground:host
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
- In Docker mode, check `docker info`, run `bun run playground:build`, and restart
- In host mode, check the local toolchain and run `bun run build:runtime`

**Compilation errors:**

- In host mode, verify Clang/LLVM is installed: `clang --version`
- In Docker mode, rebuild the image after compiler or runtime changes
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
