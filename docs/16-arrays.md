# Arrays

Arrays in BPL are contiguous sequences of elements of the same type. BPL supports both fixed-size arrays (allocated on the stack) and dynamic arrays (via the standard library).

## Table of Contents

- [Fixed-Size Arrays](#fixed-size-arrays)
- [Array Literals](#array-literals)
- [Accessing Elements](#accessing-elements)
- [Array Length](#array-length)
- [Arrays and Pointers](#arrays-and-pointers)
- [Multi-Dimensional Arrays](#multi-dimensional-arrays)
- [Arrays in Structs](#arrays-in-structs)
- [Passing Arrays to Functions](#passing-arrays-to-functions)
- [Dynamic Arrays](#dynamic-arrays)
- [Common Operations](#common-operations)
- [Best Practices](#best-practices)

## Fixed-Size Arrays

Fixed-size arrays have a compile-time known size and are typically allocated on the stack.

### Declaration

```bpl
# Syntax: type[size]
local arr: int[5];          # Array of 5 integers
local chars: char[256];     # Array of 256 characters
local flags: bool[10];      # Array of 10 booleans
```

### Initialization

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Declare without initialization (contains garbage values!)
    local uninitialized: int[3];

    # Initialize with array literal
    local initialized: int[5] = [1, 2, 3, 4, 5];

    # Partial initialization (remaining elements are zero)
    local partial: int[5] = [1, 2];  # [1, 2, 0, 0, 0]

    # Zero-initialize manually
    local zeros: int[5];
    loop (local i: int = 0; i < 5; i = i + 1) {
        zeros[i] = 0;
    }

    return 0;
}
```

## Array Literals

Array literals provide a concise way to create arrays with initial values:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # Integer array
    local numbers: int[] = [1, 2, 3, 4, 5];

    # String array
    local names: string[] = ["Alice", "Bob", "Charlie"];

    # Float array
    local values: float[] = [1.0, 2.5, 3.7];

    # Nested arrays (2D)
    local matrix: int[3][3] = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ];

    # Print first element
    printf("First number: %d\n", numbers[0]);
    printf("First name: %s\n", names[0]);

    return 0;
}
```

## Accessing Elements

Elements are accessed using square brackets `[]` with 0-based indices:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[5] = [10, 20, 30, 40, 50];

    # Read elements
    local first: int = arr[0];    # 10
    local third: int = arr[2];    # 30
    local last: int = arr[4];     # 50

    printf("Elements: %d, %d, %d\n", first, third, last);

    # Write elements
    arr[0] = 100;
    arr[2] = 300;

    printf("Modified: %d, %d\n", arr[0], arr[2]);

    # Using expressions as indices
    local idx: int = 3;
    local value: int = arr[idx];  # arr[3] = 40
    printf("arr[%d] = %d\n", idx, value);

    return 0;
}
```

### Bounds Checking

**Warning:** BPL does not perform automatic bounds checking at runtime by default. Accessing out-of-bounds indices leads to undefined behavior:

```bpl
local arr: int[5] = [1, 2, 3, 4, 5];

# DANGER: Out of bounds access!
# local bad: int = arr[10];  # Undefined behavior!
# arr[-1] = 0;               # Undefined behavior!
```

Always ensure indices are within valid range:

```bpl
frame safeGet(arr: *int, len: int, idx: int) ret int {
    if (idx < 0 || idx >= len) {
        return -1;  # Or throw an error
    }
    return arr[idx];
}
```

## Array Length

For fixed-size arrays, you can use `sizeof` to calculate the length:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[5] = [1, 2, 3, 4, 5];

    # Calculate array length
    local len: int = sizeof(arr) / sizeof(int);
    printf("Array length: %d\n", len);  # 5

    # Or track length separately (recommended)
    local const ARR_LEN: int = 5;
    local arr2: int[5];
    loop (local i: int = 0; i < ARR_LEN; i = i + 1) {
        arr2[i] = i * 10;
    }

    return 0;
}
```

## Arrays and Pointers

Arrays decay to pointers when passed to functions or used in expressions:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[5] = [10, 20, 30, 40, 50];

    # Get pointer to first element
    local ptr: *int = &arr[0];

    # Arrays decay to pointers
    local ptr2: *int = arr;  # Same as &arr[0]

    # Access through pointer
    printf("*ptr = %d\n", *ptr);      # 10
    printf("ptr[0] = %d\n", ptr[0]);  # 10
    printf("ptr[2] = %d\n", ptr[2]);  # 30

    # Pointer arithmetic
    local ptr3: *int = ptr + 2;
    printf("*(ptr+2) = %d\n", *ptr3); # 30

    return 0;
}
```

## Multi-Dimensional Arrays

BPL supports multi-dimensional arrays:

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    # 2D array (3 rows × 4 columns)
    local matrix: int[3][4];

    # Initialize
    loop (local i: int = 0; i < 3; i = i + 1) {
        loop (local j: int = 0; j < 4; j = j + 1) {
            matrix[i][j] = i * 4 + j;
        }
    }

    # Print matrix
    printf("Matrix:\n");
    loop (local i: int = 0; i < 3; i = i + 1) {
        loop (local j: int = 0; j < 4; j = j + 1) {
            printf("%2d ", matrix[i][j]);
        }
        printf("\n");
    }

    # 3D array
    local cube: int[2][3][4];
    cube[0][1][2] = 42;

    return 0;
}
```

### 2D Array with Literal Initialization

```bpl
extern printf(fmt: string, ...);

frame main() ret int {
    local grid: int[3][3] = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9]
    ];

    # Access element at row 1, column 2
    local val: int = grid[1][2];  # 6
    printf("grid[1][2] = %d\n", val);

    return 0;
}
```

## Arrays in Structs

Arrays can be members of structs:

```bpl
extern printf(fmt: string, ...);

struct Buffer {
    data: char[256],
    length: int,

    frame init(this: *Buffer) ret void {
        this.length = 0;
        loop (local i: int = 0; i < 256; i = i + 1) {
            this.data[i] = 0;
        }
    }

    frame append(this: *Buffer, ch: char) ret bool {
        if (this.length >= 256) {
            return false;
        }
        this.data[this.length] = ch;
        this.length = this.length + 1;
        return true;
    }
}

struct Matrix3x3 {
    values: float[3][3],

    frame identity(this: *Matrix3x3) ret void {
        loop (local i: int = 0; i < 3; i = i + 1) {
            loop (local j: int = 0; j < 3; j = j + 1) {
                if (i == j) {
                    this.values[i][j] = 1.0;
                } else {
                    this.values[i][j] = 0.0;
                }
            }
        }
    }
}

frame main() ret int {
    local buf: Buffer;
    buf.init();
    buf.append('H');
    buf.append('i');
    printf("Buffer length: %d\n", buf.length);

    local mat: Matrix3x3;
    mat.identity();
    printf("mat[0][0] = %f\n", mat.values[0][0]);

    return 0;
}
```

## Passing Arrays to Functions

Arrays decay to pointers when passed to functions. Always pass the length separately:

```bpl
extern printf(fmt: string, ...);

# Pass array as pointer + length
frame printArray(arr: *int, len: int) ret void {
    printf("[");
    loop (local i: int = 0; i < len; i = i + 1) {
        printf("%d", arr[i]);
        if (i < len - 1) {
            printf(", ");
        }
    }
    printf("]\n");
}

frame sum(arr: *int, len: int) ret int {
    local total: int = 0;
    loop (local i: int = 0; i < len; i = i + 1) {
        total = total + arr[i];
    }
    return total;
}

frame reverse(arr: *int, len: int) ret void {
    loop (local i: int = 0; i < len / 2; i = i + 1) {
        local temp: int = arr[i];
        arr[i] = arr[len - 1 - i];
        arr[len - 1 - i] = temp;
    }
}

frame main() ret int {
    local arr: int[5] = [1, 2, 3, 4, 5];

    printf("Original: ");
    printArray(&arr[0], 5);

    printf("Sum: %d\n", sum(&arr[0], 5));

    reverse(&arr[0], 5);
    printf("Reversed: ");
    printArray(&arr[0], 5);

    return 0;
}
```

## Dynamic Arrays

For dynamic arrays, use the standard library's `Array<T>` type or manual heap allocation:

### Using Standard Library Array

```bpl
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);

frame main() ret int {
    # Create dynamic array
    local arr: Array<int> = Array<int>.new();

    # Add elements
    arr.push(10);
    arr.push(20);
    arr.push(30);

    # Access elements
    printf("First: %d\n", arr.get(0));
    printf("Length: %d\n", arr.length());

    # Iterate
    loop (local i: int = 0; i < arr.length(); i = i + 1) {
        printf("arr[%d] = %d\n", i, arr.get(i));
    }

    # Clean up
    arr.destroy();
    return 0;
}
```

### Manual Heap Allocation

```bpl
extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);
extern realloc(ptr: *void, size: int) ret *void;

frame main() ret int {
    local size: int = 5;

    # Allocate array on heap
    local arr: *int = cast<*int>(malloc(size * sizeof(int)));

    # Initialize
    loop (local i: int = 0; i < size; i = i + 1) {
        arr[i] = i * 10;
    }

    # Print
    loop (local i: int = 0; i < size; i = i + 1) {
        printf("arr[%d] = %d\n", i, arr[i]);
    }

    # Resize (grow to 10 elements)
    local newSize: int = 10;
    arr = cast<*int>(realloc(cast<*void>(arr), newSize * sizeof(int)));

    # Initialize new elements
    loop (local i: int = size; i < newSize; i = i + 1) {
        arr[i] = i * 10;
    }

    # Free when done
    free(cast<*void>(arr));

    return 0;
}
```

## Common Operations

### Copying Arrays

```bpl
extern printf(fmt: string, ...);

frame copyArray(dest: *int, src: *int, len: int) ret void {
    loop (local i: int = 0; i < len; i = i + 1) {
        dest[i] = src[i];
    }
}

frame main() ret int {
    local src: int[5] = [1, 2, 3, 4, 5];
    local dest: int[5];

    copyArray(&dest[0], &src[0], 5);

    # Verify copy
    loop (local i: int = 0; i < 5; i = i + 1) {
        printf("dest[%d] = %d\n", i, dest[i]);
    }

    return 0;
}
```

### Finding Elements

```bpl
extern printf(fmt: string, ...);

frame findIndex(arr: *int, len: int, value: int) ret int {
    loop (local i: int = 0; i < len; i = i + 1) {
        if (arr[i] == value) {
            return i;
        }
    }
    return -1;  # Not found
}

frame contains(arr: *int, len: int, value: int) ret bool {
    return findIndex(arr, len, value) != -1;
}

frame main() ret int {
    local arr: int[5] = [10, 20, 30, 40, 50];

    local idx: int = findIndex(&arr[0], 5, 30);
    printf("Index of 30: %d\n", idx);  # 2

    if (contains(&arr[0], 5, 25)) {
        printf("Found 25\n");
    } else {
        printf("25 not found\n");
    }

    return 0;
}
```

### Sorting (Simple Bubble Sort)

```bpl
extern printf(fmt: string, ...);

frame bubbleSort(arr: *int, len: int) ret void {
    loop (local i: int = 0; i < len - 1; i = i + 1) {
        loop (local j: int = 0; j < len - i - 1; j = j + 1) {
            if (arr[j] > arr[j + 1]) {
                # Swap
                local temp: int = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
}

frame printArray(arr: *int, len: int) ret void {
    printf("[");
    loop (local i: int = 0; i < len; i = i + 1) {
        printf("%d", arr[i]);
        if (i < len - 1) {
            printf(", ");
        }
    }
    printf("]\n");
}

frame main() ret int {
    local arr: int[5] = [64, 34, 25, 12, 22];

    printf("Before: ");
    printArray(&arr[0], 5);

    bubbleSort(&arr[0], 5);

    printf("After:  ");
    printArray(&arr[0], 5);

    return 0;
}
```

## Best Practices

### 1. Always Track Array Length

```bpl
# Good: Length tracked with array
struct IntArray {
    data: *int,
    length: int,
    capacity: int,
}

# Avoid: Magic numbers
local arr: int[5];
loop (local i: int = 0; i < 5; i = i + 1) { ... }  # 5 is repeated

# Better: Use constants
local const LEN: int = 5;
local arr: int[5];
loop (local i: int = 0; i < LEN; i = i + 1) { ... }
```

### 2. Validate Indices

```bpl
frame safeAccess(arr: *int, len: int, idx: int) ret int {
    if (idx < 0 || idx >= len) {
        # Handle error - return default, throw, etc.
        return 0;
    }
    return arr[idx];
}
```

### 3. Initialize Before Use

```bpl
# Always initialize arrays before reading
local arr: int[10];
loop (local i: int = 0; i < 10; i = i + 1) {
    arr[i] = 0;  # Or meaningful initial value
}
```

### 4. Free Dynamic Arrays

```bpl
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    local arr: *int = cast<*int>(malloc(100 * sizeof(int)));

    # ... use arr ...

    free(cast<*void>(arr));  # Always free heap memory!
    return 0;
}
```

---

**Next:** Learn about [Tuples](17-tuples.md) for grouping values of different types.
