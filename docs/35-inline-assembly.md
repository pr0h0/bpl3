# Inline Assembly

BPL allows embedding LLVM IR directly into the generated code. This is useful for performance-critical sections or accessing platform-specific features.

## Syntax

The `asm` block allows you to write raw LLVM IR instructions.

```bpl
asm {
    "add i32 1, 2"
}
```

## Variable Interpolation

You can access BPL variables (locals and globals) using the `(variableName)` syntax. The compiler will replace this with the corresponding LLVM register or global name.

```bpl
frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local res: int = 0;

    asm {
        # Load values from stack pointers
        "%val_a = load i64, i64* (a)"
        "%val_b = load i64, i64* (b)"

        # Perform operation
        "%sum = add i64 %val_a, %val_b"

        # Store result back
        "store i64 %sum, i64* (res)"
    }

    return res;
}
```

- `(local_var)` resolves to the register holding the pointer to the local variable (e.g., `%local_var_ptr.0`).
- `(global_var)` resolves to the global variable name (e.g., `@global_var`).

## Assembly Flavors

BPL supports different assembly flavors to make writing inline assembly easier.

### 1. Raw LLVM IR (Default)

If no flavor is specified, the block is treated as raw LLVM IR. You can use this to write optimized LLVM instructions directly.

Variable interpolation in raw LLVM works by substituting the variable name with its LLVM register/pointer name.

- `(local_var)`: Replaced with the pointer to the local variable (e.g., `%local_var_ptr.0`). You must `load` it to get the value.
- `(global_var)`: Replaced with the global variable name (e.g., `@global_var`).

```bpl
frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local res: int = 0;

    asm {
        # Load values from stack pointers
        # (a) becomes %a_ptr.0, (b) becomes %b_ptr.1
        "%val_a = load i64, i64* (a)"
        "%val_b = load i64, i64* (b)"

        # Perform operation
        "%sum = add i64 %val_a, %val_b"

        # Store result back
        "store i64 %sum, i64* (res)"
    }

    return res;
}
```

### 2. Intel Syntax (`asm("x86")` or `asm("intel")`)

```bpl
asm {
    "%val = add i32 1, 2"
}
```

### 2. x86 / Intel Syntax

You can use `asm("x86")` or `asm("intel")` to write Intel-style assembly. This mode automatically handles the LLVM `call asm` boilerplate and enables Intel syntax (destination first).

```bpl
asm("x86") {
    "mov eax, 42"
    "add eax, 10"
}
```

#### Variable Interpolation in Intel Syntax

You can pass BPL variables into the assembly block using `(var)` for values and `(&var)` for pointers.

- **Values `(var)`**: The variable's value is loaded and passed as an input register.
- **Pointers `(&var)`**: The variable's memory address is passed as an input register. This is required if you want to write to the variable.

```bpl
frame main() ret int {
    local val: int = 10;
    local res: int = 0;

    asm("x86") {
        # Read value: (val) is substituted with a register containing 10
        "mov eax, (val)"

        # Modify
        "add eax, 5"

        # Write result: (&res) is substituted with a register containing the address of res
        # Use [ptr] syntax to write to memory
        "mov [(&res)], eax"
    }

    # res is now 15
    return res;
}
```

### 3. AT&T Syntax

You can use `asm("att")` to write AT&T-style assembly (`op src, dest`).

```bpl
asm("att") {
    "movl $42, %eax"
}
```

#### Variable Interpolation in AT&T Syntax

Variable interpolation works similarly to Intel syntax, but you must follow AT&T addressing rules.

- **Values `(var)`**: Passed as a register operand (e.g., `%eax`).
- **Pointers `(&var)`**: Passed as a register operand holding the address. To dereference, wrap in parentheses `((&var))`.

```bpl
frame main() ret int {
    local val: int = 10;
    local res: int = 0;

    asm("att") {
        # Read value: (val) -> register
        "movl (val), %eax"

        # Add immediate 5
        "addl $5, %eax"

        # Write result: (&res) -> register holding address
        # Use (%reg) syntax to write to memory
        "movl %eax, ((&res))"
    }

    return res;
}
```

## Variable Interpolation Details

### In Raw LLVM IR (`asm`)

- `(local_var)` resolves to the register holding the **pointer** to the local variable (e.g., `%local_var_ptr.0`).
- `(global_var)` resolves to the global variable name (e.g., `@global_var`).
- You must manually `load` values if needed.

```bpl
asm {
    "%ptr = bitcast i32* (x) to i8*"
}
```

### In Assembly Flavors (`asm("x86")`, `asm("att")`)

- `(var)`: Passes the **value** of the variable (automatically loaded).
- `(&var)`: Passes the **pointer** (address) of the variable.

The compiler automatically generates the necessary `load` instructions and constraint strings for LLVM.

## Clobbers

When using assembly flavors (like `intel` or `att`), you can specify a list of clobbered registers or flags at the end of the block. This tells the compiler which registers are modified by your assembly code so it can save/restore them or avoid using them.

```bpl
asm("intel") {
    mov rax, 1
    add rax, 2
    [ "rax", "cc" ]
}
```

Common clobbers:

- `"memory"`: The assembly modifies memory.
- `"cc"`: The assembly modifies the condition code flags (EFLAGS).
- `"rax"`, `"rbx"`, etc.: Specific registers.
- `"dirflag"`, `"fpsr"`, `"flags"`: Other flags.

You can pass a list of clobbers as the last element in the assembly block.
You can pass ["default"] to use the default set explicitly.
You can pass ["default", "other clobber"] to add to the default set. (default + your additions)
You can pass ["empty"] to indicate no clobbers (use with caution).
If no clobbers are specified, the compiler uses a default set (including "memory", "cc", "dirflag", "fpsr", "flags") + auto-detected registers using register name regex matching.

## Writing x86 Assembly (Legacy / Manual)

If you need full control over the `call asm` instruction, you can write it manually in a raw `asm` block.

### Example: x86-64 Assembly (AT&T Syntax)

```bpl
frame main() ret int {
    local res: int = 0;

    asm {
        # Use 'call asm sideeffect' to execute inline assembly
        # Note: Immediates must be escaped as $$ (e.g., $$42)
        # $0 refers to the first output constraint
        "%val = call i64 asm sideeffect \"movq $$42, %rax; movq %rax, $0\", \"=r,~{rax},~{dirflag},~{fpsr},~{flags}\"()"

        # Store the result back to BPL variable
        "store i64 %val, i64* (res)"
    }

    return res;
}
```

### Key Points for x86 Assembly

1.  **Wrap in LLVM IR**: Use `call <type> asm sideeffect "code", "constraints"(args)`.
2.  **Syntax**: LLVM defaults to AT&T syntax (`op src, dest`).
3.  **Immediates**: Use `$$` prefix for immediate values (e.g., `$$42`) to avoid conflict with operand placeholders (`$0`).
4.  **Constraints**: Use standard LLVM inline asm constraints (e.g., `"=r"` for output register, `"r"` for input register, `~{rax}` for clobbered registers).
