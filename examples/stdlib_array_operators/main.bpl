# IntArray operator overloading showcase
# Note: Generic Array<T> doesn't support operators due to generic type resolution limitations
# This example uses a concrete IntArray type

extern printf(fmt: string, ...) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memcpy(dest: *void, src: *void, n: long) ret *void;

struct IntArray {
    data: *int,
    capacity: int,
    length: int,
    frame new(initial_capacity: int) ret IntArray {
        local arr: IntArray;
        arr.capacity = initial_capacity;
        arr.length = 0;
        local size: long = cast<long>(initial_capacity * 4);
        arr.data = cast<*int>(malloc(size));
        return arr;
    }

    frame push(this: *IntArray, value: int) {
        if (this.length >= this.capacity) {
            # Grow the array
            local new_capacity: int = (this.capacity * 2) + 1;
            local size: long = cast<long>(new_capacity * 4);
            local new_data: *int = cast<*int>(malloc(size));
            local old_size: long = cast<long>(this.length * 4);
            if (this.data != nullptr) {
                memcpy(cast<*void>(new_data), cast<*void>(this.data), old_size);
                free(cast<*void>(this.data));
            }
            this.data = new_data;
            this.capacity = new_capacity;
        }
        this.data[this.length] = value;
        this.length = this.length + 1;
    }

    frame pop(this: *IntArray) ret int {
        if (this.length == 0) {
            printf("Error: pop from empty array\n");
            return 0;
        }
        this.length = this.length - 1;
        return this.data[this.length];
    }

    frame get(this: *IntArray, index: int) ret int {
        return this.data[index];
    }

    frame set(this: *IntArray, index: int, value: int) {
        this.data[index] = value;
    }

    frame len(this: *IntArray) ret int {
        return this.length;
    }

    # Operator overloading: Push with <<
    # Returns copy to allow chaining (note: chaining creates temporaries)
    frame __lshift__(this: *IntArray, value: int) ret IntArray {
        this.push(value);
        return *this;
    }

    # Operator overloading: Pop with >>
    # Returns copy to allow chaining (note: chaining creates temporaries)
    frame __rshift__(this: *IntArray, dest: *int) ret IntArray {
        *dest = this.pop();
        return *this;
    }

    # Operator overloading: Array indexing with [] for reading
    frame __get__(this: *IntArray, index: int) ret int {
        if ((index < 0) || (index >= this.length)) {
            printf("Error: index %d out of bounds (length: %d)\n", index, this.length);
            return 0;
        }
        return this.data[index];
    }

    # Operator overloading: Array indexing with [] for writing
    frame __set__(this: *IntArray, index: int, value: int) {
        if ((index < 0) || (index >= this.length)) {
            printf("Error: index %d out of bounds (length: %d)\n", index, this.length);
            return;
        }
        this.data[index] = value;
    }

    frame destroy(this: *IntArray) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
    }
}

frame main() ret int {
    printf("=== IntArray Operator Overloading ===\n\n");

    # Test array push with << operator
    printf("--- Array Push with << Operator ---\n");
    local arr: IntArray = IntArray.new(5);

    printf("Creating array and pushing elements with <<:\n");
    arr << 10;
    arr << 20;
    arr << 30;
    arr << 40;
    arr << 50;

    printf("Array contents: [");
    local i: int = 0;
    loop (i < arr.len()) {
        printf("%d", arr.get(i));
        if (i < (arr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");
    printf("Array length: %d\n\n", arr.len());

    # Test multiple << operations
    printf("--- Multiple << Operations ---\n");
    local arr2: IntArray = IntArray.new(3);
    arr2 << 100;
    arr2 << 200;
    arr2 << 300;

    printf("Chained push result: [");
    i = 0;
    loop (i < arr2.len()) {
        printf("%d", arr2.get(i));
        if (i < (arr2.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");
    printf("Array length: %d\n\n", arr2.len());

    # Test array pop with >> operator
    printf("--- Array Pop with >> Operator ---\n");
    local arr3: IntArray = IntArray.new(5);
    arr3 << 100;
    arr3 << 200;
    arr3 << 300;
    printf("Array before pop: [");
    i = 0;
    loop (i < arr3.len()) {
        printf("%d", arr3.get(i));
        if (i < (arr3.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");

    local popped: int;
    arr3 >> &popped;
    printf("Popped value: %d\n", popped);
    arr3 >> &popped;
    printf("Popped value: %d\n", popped);

    printf("Array after pops: [");
    i = 0;
    loop (i < arr3.len()) {
        printf("%d", arr3.get(i));
        if (i < (arr3.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");
    printf("Remaining length: %d\n\n", arr3.len());

    # Test array growth with <<
    printf("--- Testing Array Dynamic Growth ---\n");
    local smallArr: IntArray = IntArray.new(2);
    printf("Initial capacity: %d\n", smallArr.capacity);

    smallArr << 1;
    smallArr << 2;
    smallArr << 3;
    smallArr << 4;
    smallArr << 5;
    printf("After pushing 5 elements with <<:\n");
    printf("  Length: %d\n", smallArr.len());
    printf("  Capacity: %d\n", smallArr.capacity);
    printf("  Contents: [");
    i = 0;
    loop (i < smallArr.len()) {
        printf("%d", smallArr.get(i));
        if (i < (smallArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n\n");

    # Test combining << and >> with other operations
    printf("--- Combining << and >> with get/set ---\n");
    local mixedArr: IntArray = IntArray.new(3);
    mixedArr << 10;
    mixedArr << 20;
    mixedArr << 30;

    printf("Initial: [");
    i = 0;
    loop (i < mixedArr.len()) {
        printf("%d", mixedArr.get(i));
        if (i < (mixedArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");

    mixedArr.set(1, 99);
    mixedArr << 40;
    local val: int;
    mixedArr >> &val;

    printf("After set(1, 99), << 40, and >> (popped %d): [", val);
    i = 0;
    loop (i < mixedArr.len()) {
        printf("%d", mixedArr.get(i));
        if (i < (mixedArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n\n");

    # Test array indexing with [] operator
    printf("--- Array Indexing with [] Operator ---\n");
    local indexArr: IntArray = IntArray.new(5);
    indexArr << 100;
    indexArr << 200;
    indexArr << 300;
    indexArr << 400;
    indexArr << 500;

    printf("Array created with <<: [");
    i = 0;
    loop (i < indexArr.len()) {
        printf("%d", indexArr[i]); # Using [] operator for reading
        if (i < (indexArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");

    printf("Reading with []: indexArr[0] = %d\n", indexArr[0]);
    printf("Reading with []: indexArr[2] = %d\n", indexArr[2]);
    printf("Reading with []: indexArr[4] = %d\n", indexArr[4]);

    printf("Writing with []: indexArr[1] = 999\n");
    indexArr[1] = 999; # Using [] operator for writing
    printf("Writing with []: indexArr[3] = 777\n");
    indexArr[3] = 777; # Using [] operator for writing

    printf("Array after modifications: [");
    i = 0;
    loop (i < indexArr.len()) {
        printf("%d", indexArr[i]);
        if (i < (indexArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n\n");

    # Test [] operator with expressions
    printf("--- Using [] with Expressions ---\n");
    local exprArr: IntArray = IntArray.new(3);
    exprArr << 10;
    exprArr << 20;
    exprArr << 30;

    local idx: int = 1;
    printf("exprArr[idx] where idx=1: %d\n", exprArr[idx]);
    printf("exprArr[0] + exprArr[2]: %d\n", exprArr[0] + exprArr[2]);

    exprArr[idx] = exprArr[0] + exprArr[2];
    printf("After exprArr[1] = exprArr[0] + exprArr[2]: [");
    i = 0;
    loop (i < exprArr.len()) {
        printf("%d", exprArr[i]);
        if (i < (exprArr.len() - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");

    # Cleanup
    indexArr.destroy();
    exprArr.destroy();

    # Cleanup
    arr.destroy();
    arr2.destroy();
    arr3.destroy();
    smallArr.destroy();
    mixedArr.destroy();

    printf("\n=== All IntArray Operator Tests Complete ===\n");
    return 0;
}
