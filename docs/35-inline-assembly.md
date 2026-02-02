# Inline Assembly

BPL allows embedding assembly code directly in your programs. This is useful for performance-critical sections, accessing platform-specific CPU features, or interfacing with hardware. BPL supports multiple assembly syntax flavors to accommodate different preferences and use cases.

## Table of Contents

- [Overview](#overview)
- [Assembly Flavors](#assembly-flavors)
- [Variable Interpolation](#variable-interpolation)
- [Input and Output Constraints](#input-and-output-constraints)
- [Clobbers](#clobbers)
- [Complete Examples](#complete-examples)
- [Raw LLVM IR](#raw-llvm-ir)
- [Best Practices](#best-practices)
- [Common Pitfalls](#common-pitfalls)

## Overview

The `asm` block allows you to embed assembly instructions within BPL code:

```bpl
asm("flavor") {
    # Assembly instructions
}
```

**Supported flavors:**

| Flavor  | Aliases          | Description                               |
| ------- | ---------------- | ----------------------------------------- |
| `llvm`  | `raw`, (default) | Raw LLVM IR instructions                  |
| `intel` | `x86`            | Intel syntax assembly (destination first) |
| `att`   | -                | AT&T syntax assembly (source first)       |

## Assembly Flavors

### 1. Intel Syntax (`intel` or `x86`)

Intel syntax uses the familiar `op dest, src` ordering and is often preferred by developers coming from Windows/MASM backgrounds.

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local result: int = 0;

    asm("intel") {
        mov eax, (a)        # Load 'a' into eax
        add eax, (b)        # Add 'b' to eax
        mov (=result), eax  # Store result
    }

    printf("Result: %d\n", result);  # 30
    return 0;
}
```

**Key characteristics:**

- Destination comes before source: `mov dest, src`
- Register names without prefix: `eax`, `rbx`, etc.
- Memory access with brackets: `[rax]`, `[rbp-8]`
- Immediate values without prefix: `mov eax, 42`

### 2. AT&T Syntax (`att`)

AT&T syntax uses `op src, dest` ordering and is common in Unix/Linux environments and GCC.

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local result: int = 0;

    asm("att") {
        movl (a), %eax        # Load 'a' into eax
        addl (b), %eax        # Add 'b' to eax
        movl %eax, (=result)  # Store result
    }

    printf("Result: %d\n", result);  # 30
    return 0;
}
```

**Key characteristics:**

- Source comes before destination: `movl src, dest`
- Register names with `%` prefix: `%eax`, `%rbx`
- Immediate values with `$` prefix: `movl $42, %eax`
- Size suffixes: `b` (byte), `w` (word), `l` (long/32-bit), `q` (quad/64-bit)
- Memory access with parentheses: `(%rax)`, `-8(%rbp)`

### 3. Raw LLVM IR (`llvm` or `raw`)

For maximum control, you can write raw LLVM IR instructions:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local result: int = 0;

    asm("llvm") {
        "%val_a = load i32, i32* (a)"
        "%val_b = load i32, i32* (b)"
        "%sum = add i32 %val_a, %val_b"
        "store i32 %sum, i32* (result)"
    }

    printf("Result: %d\n", result);  # 30
    return 0;
}
```

## Variable Interpolation

BPL provides powerful variable interpolation to bridge between BPL variables and assembly code.

### For Intel/AT&T Flavors

| Syntax                 | Description                    | Example               |
| ---------------------- | ------------------------------ | --------------------- |
| `(var)`                | Pass value of variable         | `mov eax, (x)`        |
| `(&var)`               | Pass address of variable       | `lea rax, (&x)`       |
| `(=var)`               | Store result into variable     | `mov (=result), eax`  |
| `(var: "constraint")`  | Pass with explicit constraint  | `(x: "{eax}")`        |
| `(=var: "constraint")` | Store with explicit constraint | `(=result: "={eax}")` |

### Input Examples

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 42;
    local y: int = 10;
    local result: int = 0;

    asm("intel") {
        # (x) loads the VALUE of x into a register
        mov eax, (x)

        # (y) loads the VALUE of y into a register
        add eax, (y)

        # Store to result
        mov (=result), eax
    }

    printf("42 + 10 = %d\n", result);
    return 0;
}
```

### Output Examples

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local result: int = 0;

    asm("intel") {
        mov eax, 100
        add eax, 23
        # (=result) stores eax into the 'result' variable
        mov (=result), eax
    }

    printf("Result: %d\n", result);  # 123
    return 0;
}
```

### Address Examples

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[3] = [10, 20, 30];
    local result: int = 0;

    asm("intel") {
        # (&arr) loads the ADDRESS of arr
        mov rax, (&arr)

        # Access second element (offset 4 bytes for int)
        mov eax, [rax + 4]

        mov (=result), eax
    }

    printf("arr[1] = %d\n", result);  # 20
    return 0;
}
```

### For Raw LLVM IR

In raw LLVM mode, interpolation provides pointers to variables:

```bpl
frame main() ret int {
    local x: int = 42;
    local result: int = 0;

    asm("llvm") {
        # (x) becomes the LLVM pointer to x (e.g., %x_ptr.0)
        "%val = load i32, i32* (x)"

        # Perform operation
        "%doubled = mul i32 %val, 2"

        # (result) becomes the LLVM pointer to result
        "store i32 %doubled, i32* (result)"
    }

    return result;  # 84
}
```

## Input and Output Constraints

### Default Constraints

| Syntax   | Default Constraint | Meaning                        |
| -------- | ------------------ | ------------------------------ |
| `(var)`  | `"r"`              | Use any general register       |
| `(=var)` | `"=r"`             | Output to any general register |

### Explicit Constraints

Specify exact registers or constraint types:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local input: int = 42;
    local output: int = 0;

    asm("intel") {
        # Force input into ebx
        mov eax, (input: "{ebx}")

        # Multiply by 2
        shl eax, 1

        # Force output from eax
        mov (=output: "={eax}"), eax
    }

    printf("42 * 2 = %d\n", output);  # 84
    return 0;
}
```

### Common Constraint Strings

| Constraint | Meaning                     |
| ---------- | --------------------------- |
| `"r"`      | Any general register        |
| `"m"`      | Memory operand              |
| `"i"`      | Immediate integer           |
| `"{eax}"`  | Specific register (eax)     |
| `"={eax}"` | Output to specific register |
| `"+r"`     | Read-write register         |

## Clobbers

Clobbers tell the compiler which registers or resources your assembly modifies, so it can preserve them if needed.

### Syntax

Add a clobber list at the end of the assembly block:

```bpl
asm("intel") {
    mov eax, 42
    mov ebx, 10
    add eax, ebx
    mov (=result), eax
    [ "eax", "ebx", "cc" ]  # Clobber list
}
```

### Common Clobbers

| Clobber                | Meaning                                |
| ---------------------- | -------------------------------------- |
| `"memory"`             | Assembly modifies memory               |
| `"cc"`                 | Condition code flags (EFLAGS) modified |
| `"eax"`, `"rbx"`, etc. | Specific register is modified          |
| `"dirflag"`            | Direction flag modified                |
| `"fpsr"`               | Floating-point status register         |
| `"flags"`              | General flags                          |

### Clobber Options

```bpl
# Use default clobbers (memory, cc, dirflag, fpsr, flags + auto-detected)
asm("intel") {
    # ...
}

# Explicit default
asm("intel") {
    # ...
    [ "default" ]
}

# Add to default
asm("intel") {
    # ...
    [ "default", "rax", "rbx" ]
}

# No clobbers (use with caution!)
asm("intel") {
    # ...
    [ "empty" ]
}
```

## Complete Examples

### Example 1: Bit Manipulation

```bpl
extern printf(fmt: string, ...);

frame countSetBits(n: int) ret int {
    local count: int = 0;

    asm("intel") {
        mov eax, (n)
        xor ecx, ecx      # count = 0

        popcnt ecx, eax   # Count set bits (requires POPCNT support)

        mov (=count), ecx
        [ "eax", "ecx", "cc" ]
    }

    return count;
}

frame main() ret int {
    local n: int = 0b10101010;  # 4 bits set
    printf("Set bits in %d: %d\n", n, countSetBits(n));
    return 0;
}
```

### Example 2: CPUID Instruction

```bpl
extern printf(fmt: string, ...);

struct CPUIDResult {
    eax: int,
    ebx: int,
    ecx: int,
    edx: int,
}

frame cpuid(leaf: int) ret CPUIDResult {
    local result: CPUIDResult;

    asm("intel") {
        mov eax, (leaf)
        cpuid
        mov (=result.eax), eax
        mov (=result.ebx), ebx
        mov (=result.ecx), ecx
        mov (=result.edx), edx
        [ "eax", "ebx", "ecx", "edx" ]
    }

    return result;
}

frame main() ret int {
    local info: CPUIDResult = cpuid(0);
    printf("CPUID max leaf: %d\n", info.eax);
    return 0;
}
```

### Example 3: Memory Fence

```bpl
frame memoryBarrier() ret void {
    asm("intel") {
        mfence
        [ "memory" ]
    }
}

frame loadAcquire(ptr: *int) ret int {
    local result: int = 0;

    asm("intel") {
        mov rax, (ptr)
        mov eax, [rax]
        mov (=result), eax
        [ "memory" ]
    }

    return result;
}
```

### Example 4: Atomic Increment

```bpl
extern printf(fmt: string, ...);

frame atomicIncrement(ptr: *int) ret int {
    local oldValue: int = 0;

    asm("intel") {
        mov rax, (ptr)
        mov ebx, 1
        lock xadd [rax], ebx
        mov (=oldValue), ebx
        [ "eax", "ebx", "memory", "cc" ]
    }

    return oldValue;
}

frame main() ret int {
    local counter: int = 10;
    local old: int = atomicIncrement(&counter);
    printf("Old: %d, New: %d\n", old, counter);  # Old: 10, New: 11
    return 0;
}
```

### Example 5: SIMD Operations (SSE)

```bpl
extern printf(fmt: string, ...);

frame addFloat4(a: *float, b: *float, result: *float) ret void {
    asm("intel") {
        mov rax, (a)
        mov rbx, (b)
        mov rcx, (result)

        movups xmm0, [rax]     # Load 4 floats from a
        movups xmm1, [rbx]     # Load 4 floats from b
        addps xmm0, xmm1       # Add packed single-precision
        movups [rcx], xmm0     # Store result

        [ "rax", "rbx", "rcx", "xmm0", "xmm1", "memory" ]
    }
}

frame main() ret int {
    local a: float[4] = [1.0, 2.0, 3.0, 4.0];
    local b: float[4] = [5.0, 6.0, 7.0, 8.0];
    local result: float[4];

    addFloat4(&a[0], &b[0], &result[0]);

    printf("Results: %f, %f, %f, %f\n",
           result[0], result[1], result[2], result[3]);
    # 6.0, 8.0, 10.0, 12.0

    return 0;
}
```

## Raw LLVM IR

For complex scenarios, write LLVM IR directly:

### Basic LLVM IR

```bpl
frame llvmExample() ret int {
    local a: int = 10;
    local b: int = 20;
    local result: int = 0;

    asm("llvm") {
        # Load values
        "%a_val = load i32, i32* (a)"
        "%b_val = load i32, i32* (b)"

        # Arithmetic
        "%sum = add i32 %a_val, %b_val"
        "%product = mul i32 %sum, 2"

        # Store result
        "store i32 %product, i32* (result)"
    }

    return result;  # (10 + 20) * 2 = 60
}
```

### LLVM Intrinsics

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local x: float = 2.0;
    local result: float = 0.0;

    asm("llvm") {
        "%x_val = load float, float* (x)"
        "%sqrt = call float @llvm.sqrt.f32(float %x_val)"
        "store float %sqrt, float* (result)"
    }

    printf("sqrt(2.0) = %f\n", result);
    return 0;
}
```

### Manual x86-64 in LLVM

```bpl
frame manualAsm() ret int {
    local result: int = 0;

    asm("llvm") {
        # Manual call asm for full control
        # Note: $$ for immediate values, $0 for operands
        "%val = call i64 asm sideeffect \"movq $$42, %rax; addq $$8, %rax; movq %rax, $0\", \"=r,~{rax},~{cc}\"()"
        "%truncated = trunc i64 %val to i32"
        "store i32 %truncated, i32* (result)"
    }

    return result;  # 50
}
```

## Best Practices

### 1. Minimize Assembly Usage

```bpl
# Good: Small, focused assembly for specific operations
frame atomicAdd(ptr: *int, val: int) ret int {
    local result: int = 0;
    asm("intel") {
        mov rax, (ptr)
        mov ebx, (val)
        lock xadd [rax], ebx
        mov (=result), ebx
        [ "eax", "ebx", "memory", "cc" ]
    }
    return result;
}

# Avoid: Large assembly blocks with complex logic
```

### 2. Document Clobbers Thoroughly

```bpl
frame myAsmFunc() ret void {
    asm("intel") {
        # ... assembly code ...

        # Document what each clobber means
        [ "eax",    # Used for computation
          "ebx",    # Temporary storage
          "memory", # Writes to memory via pointer
          "cc" ]    # Modifies flags with cmp/test
    }
}
```

### 3. Wrap Assembly in Functions

```bpl
# Good: Encapsulated in a function with clear interface
frame rdtsc() ret u64 {
    local low: u32 = 0;
    local high: u32 = 0;

    asm("intel") {
        rdtsc
        mov (=low), eax
        mov (=high), edx
        [ "eax", "edx" ]
    }

    return (cast<u64>(high) << 32) | cast<u64>(low);
}

# Usage is clean
local timestamp: u64 = rdtsc();
```

### 4. Use Constraints Correctly

```bpl
# Good: Let compiler choose registers when possible
asm("intel") {
    mov eax, (input)
    # ...
}

# Use specific registers only when required by instruction
asm("intel") {
    mov eax, (dividend)
    cdq                # Sign-extend eax into edx:eax
    idiv (divisor)     # idiv requires eax/edx
    mov (=quotient), eax
    mov (=remainder), edx
    [ "eax", "edx", "cc" ]
}
```

## Common Pitfalls

### 1. Forgetting Clobbers

```bpl
# BAD: Missing clobbers can cause subtle bugs
asm("intel") {
    mov eax, 42  # Compiler might have used eax!
}

# GOOD: Declare all modified registers
asm("intel") {
    mov eax, 42
    [ "eax" ]
}
```

### 2. Wrong Operand Size

```bpl
# BAD: Size mismatch
local x: i64 = 100;
asm("intel") {
    mov eax, (x)  # x is 64-bit, eax is 32-bit!
}

# GOOD: Match sizes
local x: i64 = 100;
asm("intel") {
    mov rax, (x)  # Both 64-bit
}
```

### 3. Memory Alignment

```bpl
# SSE requires 16-byte alignment for some operations
# Use movups (unaligned) instead of movaps (aligned) when unsure
asm("intel") {
    movups xmm0, [rax]  # Safe for any alignment
    # movaps xmm0, [rax]  # Crashes if not 16-byte aligned!
}
```

### 4. Side Effects Not Declared

```bpl
# BAD: Writes to memory but doesn't declare it
asm("intel") {
    mov rax, (ptr)
    mov dword ptr [rax], 42  # Memory write!
}

# GOOD: Declare memory clobber
asm("intel") {
    mov rax, (ptr)
    mov dword ptr [rax], 42
    [ "rax", "memory" ]
}
```

---

**Next:** Learn about [FFI (Foreign Function Interface)](36-ffi.md) for calling C libraries from BPL.
