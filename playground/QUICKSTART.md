# BPL Playground - Quick Start Guide

## 🎯 Getting Started

1. **Start the server:**

   ```bash
   cd playground
   ./start.sh
   ```

   Or manually:

   ```bash
   cd playground/backend
   bun run dev
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3001`

3. **Start learning:**
   - Click any example in the sidebar
   - Read the description at the top
   - Study the annotated code
   - Click "Run Code" to see it execute
   - Explore the IR, AST, and Tokens tabs

## 🎓 Learning Path

### Beginner (Examples 1-7)

- Hello World
- Variables & types
- Basic math & operators
- If statements
- While & For loops
- Functions (frames)

### Intermediate (Examples 8-16)

- Structs
- Pointers
- Arrays
- Strings
- Boolean logic
- Switch statements
- Recursion
- Type casting
- Ternary operator

### Advanced (Examples 17-25)

- Bitwise operations
- Sizeof operator
- Struct methods
- Command-line arguments
- Standard input
- Global variables
- Type aliases
- Multi-dimensional arrays
- Fibonacci (algorithm practice)

## 💡 Tips & Tricks

### Using Input & Arguments

1. Expand the "Input & Arguments" section
2. Enter text in "Standard Input" for `scanf` programs
3. Add space-separated arguments for command-line programs
4. Example 20 and 21 demonstrate these features

### Understanding Output Tabs

**Output Tab**

- Shows program stdout/stderr
- Displays runtime errors
- Green for success, red for errors

**LLVM IR Tab**

- View the generated intermediate representation
- Learn how BPL compiles to LLVM
- Useful for understanding optimization

**AST Tab**

- See the Abstract Syntax Tree
- Understand program structure
- Debug parser issues

**Tokens Tab**

- View lexer output
- See how source code tokenizes
- Useful for syntax errors

### Modifying Examples

- Edit any example code directly
- Changes don't affect the original
- Click another example to reset
- Use Format button for clean code

### Common Issues

**Server not starting?**

```bash
# Check if port 3001 is in use
lsof -i :3001

# Kill existing process
kill -9 <PID>
```

**Compilation fails?**

- Check if Clang is installed: `clang --version`
- Ensure BPL compiler is built: `cd .. && bun run build`
- Look at error message for syntax issues

**Examples not loading?**

- Check browser console (F12)
- Verify all JSON files are valid
- Restart the server

## 🔧 Development

### Adding Your Own Example

1. Create `playground/examples/26-your-example.json`:

```json
{
  "order": 26,
  "title": "Your Feature",
  "snippet": "Short description",
  "description": "Detailed explanation...",
  "code": "frame main() ret int {\n  return 0;\n}"
}
```

2. Restart server to load new example
3. It will appear in the sidebar

### Customizing the UI

- Edit `frontend/style.css` for appearance
- Modify `frontend/app.js` for behavior
- Update `frontend/index.html` for structure
- Changes take effect on browser refresh

### Backend API

Add custom endpoints in `backend/server.ts`:

```typescript
if (url.pathname === "/my-endpoint" && req.method === "GET") {
  return new Response(JSON.stringify({ data: "..." }), { headers });
}
```

## 📚 BPL Language Quick Reference

### Variables

```bpl
local name: type;
global count: int;
```

### Functions

```bpl
frame functionName(param: type) ret returnType {
  return value;
}
```

### Structs

```bpl
struct MyStruct {
  field: type,
  frame method(this: MyStruct) ret type {
    return this.field;
  }
}
```

### Control Flow

```bpl
if (condition) { }
while (condition) { }
for (init; condition; update) { }
switch (value) { case x: break; }
```

### Types

- `int`, `float`, `string`, `bool`
- `byte`, `char`
- `type*` (pointer)
- `type[size]` (array)

### Operators

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!`
- Bitwise: `&`, `|`, `^`, `~`, `<<`, `>>`
- Ternary: `condition ? true : false`

## 🚀 Next Steps

1. Complete all 25 examples in order
2. Try modifying examples to experiment
3. Write your own BPL programs
4. Explore the compiler source code
5. Contribute examples or features!

## 📞 Support

- Check `playground/README.md` for detailed docs
- View compiler docs in parent directory
- Report issues on the project repository
