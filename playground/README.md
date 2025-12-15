# BPL Playground

An interactive web-based playground for learning and experimenting with BPL (Basic Programming Language). Inspired by [gobyexample.com](https://gobyexample.com), this playground provides an educational environment with 25+ annotated examples covering all BPL features.

## Features

✨ **Interactive Code Editor**

- Monaco Editor with BPL syntax highlighting
- Real-time code editing with proper indentation
- Line numbers and code folding

🎓 **Learn by Example**

- 25+ curated examples covering all BPL features
- Each example includes detailed descriptions and explanations
- Progressive learning from "Hello World" to advanced topics

🔧 **Powerful Development Tools**

- **Output Tab**: See program output and errors
- **LLVM IR Tab**: View generated intermediate representation
- **AST Tab**: Explore the Abstract Syntax Tree
- **Tokens Tab**: Examine lexer tokens

📥 **Input & Arguments**

- Pass standard input (stdin) to programs
- Provide command-line arguments
- Test interactive programs

🚀 **Fast Compilation**

- Bun-powered backend for quick responses
- Real-time compilation and execution
- Detailed error messages with line numbers

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Clang/LLVM](https://llvm.org/) (for compiling LLVM IR)
- Node.js and TypeScript (for building BPL compiler)

### Installation

1. Build the BPL compiler first:

```bash
cd /home/pr0h0/Projects/asm-bpl/transpiler
bun install
bun run build
```

2. Start the playground server:

```bash
cd playground
bun run start
```

3. Open your browser to `http://localhost:3001`

## Project Structure

```
playground/
├── backend/
│   ├── server.ts         # Bun server with API endpoints
│   └── package.json
├── frontend/
│   ├── index.html        # Main playground UI
│   ├── style.css         # Styling and dark theme
│   └── app.js            # Frontend logic and Monaco setup
└── examples/
    ├── 01-hello-world.json
    ├── 02-variables.json
    ├── ... (25+ examples)
    └── 25-fibonacci.json
```

## Example Topics Covered

1. **Basics**: Hello World, Variables, Math
2. **Control Flow**: If statements, While/For loops, Switch
3. **Functions**: Frames, Recursion, Return values
4. **Data Structures**: Structs, Arrays, Pointers
5. **Advanced**: Bitwise ops, Type casting, Struct methods
6. **I/O**: Command-line args, Standard input
7. **Language Features**: Globals, Type aliases, Sizeof

## API Endpoints

### `GET /examples`

Returns all available examples with metadata.

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

## Usage Tips

1. **Browse Examples**: Click examples in the sidebar to load them
2. **Edit Code**: Modify code in the Monaco editor
3. **Run Programs**: Click "Run Code" to compile and execute
4. **View Internals**: Switch tabs to see IR, AST, or tokens
5. **Add Input**: Expand "Input & Arguments" to provide stdin/args
6. **Learn Progressively**: Follow examples in order from 1-25

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

**Examples not loading:**

- Check that JSON files are valid
- Ensure server.ts can read `examples/` directory
- Look for errors in server console

## License

Same as the BPL compiler project.

## Contributing

Feel free to add more examples or improve the playground UI!
