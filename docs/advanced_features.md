# Advanced Features

## Inline Assembly

BPL allows you to write raw x86-64 assembly code directly within your functions using the `asm` block. This is powerful for performance-critical sections or accessing hardware features not exposed by the language.

### Syntax

```bpl
asm {
    instruction operand1, operand2
    ...
}
```

### Variable Interpolation

You can access BPL variables inside the `asm` block by wrapping them in parentheses `(varName)`. The compiler replaces these with the appropriate memory address or register reference.

- **Local Variables**: Replaced with `[rbp - offset]`.
- **Global Variables**: Replaced with `[rel varName]`.

```bpl
frame main() ret u8 {
    local a: u64 = 10;
    local b: u64 = 20;
    local result: u64;

    asm {
        mov rax, (a)      ; Load 'a' into RAX
        add rax, (b)      ; Add 'b' to RAX
        mov (result), rax ; Store result
    }
    
    return 0;
}
```

### System Calls

You can perform direct Linux system calls using inline assembly.

```bpl
frame write_stdout(msg: *u8, len: u64) {
    asm {
        mov rax, 1       ; syscall: write
        mov rdi, 1       ; fd: stdout
        mov rsi, (msg)   ; buffer
        mov rdx, (len)   ; count
        syscall
    }
}
```

## Memory Management

BPL does not have a garbage collector. Memory management is manual when using heap allocation.

### Stack Allocation
Local variables are allocated on the stack and automatically freed when the function returns.

```bpl
frame foo() {
    local x: u64 = 10; # Stack allocated
}
```

### Heap Allocation
Use `malloc` and `free` from `libc` for dynamic memory.

```bpl
import malloc, free from "libc";

frame main() ret u8 {
    # Allocate 1024 bytes
    local buffer: *u8 = call malloc(1024);
    
    # ... use buffer ...
    
    # Free memory
    call free(buffer);
    return 0;
}
```

## Pointers and Addresses

- `&var`: Get the memory address of a variable.
- `*ptr`: Dereference a pointer.

```bpl
local x: u64 = 42;
local ptr: *u64 = &x;
*ptr = 100; # Changes x to 100
```

## Interfacing with C and Object Files

BPL allows you to link against standard C libraries (libc) or any compiled object files (`.o`).

### Importing External Functions

Use the `import` statement to bring in functions from `libc` or other object files.

```bpl
import printf, malloc from "libc";
import my_c_func from "./legacy_code.o";
```

### Using `extern` for Type Safety

When importing from `.x` files, BPL knows the function signatures. However, for `libc` or `.o` files, this information is missing. The `extern` keyword allows you to manually provide these signatures.

```bpl
import printf from "libc";

# Without extern, BPL might not know how to handle arguments or return types correctly
extern printf(fmt: *u8); 

frame main() {
    call printf("Hello C!\n");
}
```

**Why use `extern`?**
1.  **Type Checking**: Ensures you pass the correct types to C functions.
2.  **Return Values**: Tells the compiler what type the function returns (e.g., `ret *u8` for `malloc`), so it can be assigned to variables correctly.

## Command Line Arguments

The `main` function signature can be expanded to accept arguments.

```bpl
frame main(argc: u32, argv: **u8, envp: **u8) ret u8 {
    # argc: Number of arguments
    # argv: Array of argument strings
    # envp: Array of environment strings
    
    if argc > 1 {
        call print(argv[1]); # Print first argument
    }
    return 0;
}
```
