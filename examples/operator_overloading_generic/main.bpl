# Test generic operator overloading
# This tests the new generic-aware operator resolution feature

import [IndexOutOfBoundsError] from "std/errors.bpl";

import [printf] from "std/c.bpl";
extern malloc(size: ulong) ret *void;
import [free] from "std/c.bpl";

# Generic Array with operator overloading
struct Array<T> {
    data: *T,
    length: int,
    capacity: int,
    # Constructor
    frame new(capacity: int) ret Array<T> {
        local arr: Array<T>;
        local size: long = sizeof<T>() * cast<long>(capacity);
        arr.data = cast<*T>(malloc(cast<ulong>(size)));
        arr.length = 0;
        arr.capacity = capacity;
        return arr;
    }

    # Push operator: arr << value
    frame __lshift__(this: *Array<T>, value: T) ret int {
        if (this.length >= this.capacity) {
            printf("Array is full!\n");
            return 0;
        }
        this.data[this.length] = value;
        this.length = this.length + 1;
        return 1;
    }

    # Index operator: arr[i]
    frame __get__(this: *Array<T>, index: int) ret T {
        if ((index < 0) || (index >= this.length)) {
            # Use the new static constructor method
            throw IndexOutOfBoundsError.new(index, this.length);
        }
        return this.data[index];
    }

    # Comparison operator: arr1 == arr2 (compares length)
    frame __eq__(this: *Array<T>, other: Array<T>) ret bool {
        return this.length == other.length;
    }

    # Destructor
    frame destroy(this: *Array<T>) {
        if (this.data != cast<*T>(0)) {
            free(cast<*void>(this.data));
            this.data = cast<*T>(0);
        }
    }
}

frame main() ret int {
    printf("=== Testing Generic Operator Overloading ===\n\n");

    # Test with integers
    printf("--- Integer Array Test ---\n");
    local intArr: Array<int> = Array<int>.new(10);
    intArr << 10;
    intArr << 20;
    intArr << 30;

    printf("Integer array size: %d\n", intArr.length);
    printf("intArr[0] = %d\n", intArr[0]);
    printf("intArr[1] = %d\n", intArr[1]);
    printf("intArr[2] = %d\n", intArr[2]);

    # Test comparison
    local intArr2: Array<int> = Array<int>.new(10);
    intArr2 << 1;
    intArr2 << 2;
    intArr2 << 3;

    if (intArr == intArr2) {
        printf("Arrays have same length (both 3)\n");
    }
    intArr.destroy();
    intArr2.destroy();

    # Test with floats
    printf("\n--- Float Array Test ---\n");
    local floatArr: Array<float> = Array<float>.new(10);
    floatArr << 1.5;
    floatArr << 2.5;
    floatArr << 3.5;

    printf("Float array size: %d\n", floatArr.length);
    printf("floatArr[0] = %.1f\n", floatArr[0]);
    printf("floatArr[1] = %.1f\n", floatArr[1]);
    printf("floatArr[2] = %.1f\n", floatArr[2]);

    floatArr.destroy();

    printf("\n=== All tests passed! ===\n");

    return 0;
}
