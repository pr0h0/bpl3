import [printf] from "std/c.bpl";
extern malloc(size: long) ret string;
extern free(ptr: string);
struct MyArray<T> {
    data: *T,
    length: int,
    capacity: int,
    frame new(cap: int) ret MyArray<T> {
        local result: MyArray<T>;
        local size: long = sizeof<T>() * cast<long>(cap);
        local buffer: *T = cast<*T>(malloc(size));
        result.data = buffer;
        result.length = 0;
        result.capacity = cap;
        return result;
    }
    frame push(this: *MyArray<T>, val: T) {
        if (this.length < this.capacity) {
            this.data[this.length] = val;
            this.length = this.length + 1;
        } else {
            printf("Error: Array full\n");
        }
    }
    frame pop(this: *MyArray<T>) ret T {
        if (this.length > 0) {
            this.length = this.length - 1;
            return this.data[this.length];
        }
        # Throw error or return nullptr, try nullptr  if compilation fails then throw
        local err: string = "Array is empty";
        throw err;
    }
    frame forEach(this: *MyArray<T>, fn: Func<void>(T)) {
        local i: int = 0;
        loop (i < this.length) {
            fn(this.data[i]);
            i = i + 1;
        }
    }
    # Map to new array (JavaScript-style)
    frame map<U>(this: *MyArray<T>, fn: Func<U>(T)) ret MyArray<U> {
        local result: MyArray<U> = MyArray<U>.new(this.capacity);
        local i: int = 0;
        loop (i < this.length) {
            result.push(fn(this.data[i]));
            i = i + 1;
        }
        return result;
    }
    # Filter to new array (JavaScript-style)
    frame filter(this: *MyArray<T>, fn: Func<bool>(T)) ret MyArray<T> {
        local result: MyArray<T> = MyArray<T>.new(this.capacity);
        local i: int = 0;
        loop (i < this.length) {
            local val: T = this.data[i];
            if (fn(val)) {
                result.push(val);
            }
            i = i + 1;
        }
        return result;
    }
    frame destroy(this: *MyArray<T>) {
        free(cast<string>(this.data));
    }
}
# Callbacks
frame printInt(x: int) {
    printf("%d ", x);
}
frame square(x: int) ret int {
    return x * x;
}
frame isEven(x: int) ret bool {
    return (x % 2) == 0;
}
frame main() ret int {
    local arr1: MyArray<int> = MyArray<int>.new(10);
    try {
        arr1.push(10);
        printf("Poped first value: %d\n", arr1.pop());
        arr1.pop();
        # should throw
    } catch (e: string) {
        printf("Error: %s\n", e);
    }
    arr1.push(1);
    arr1.push(2);
    arr1.push(3);
    arr1.push(4);
    arr1.push(5);
    printf("Original: ");
    arr1.forEach(printInt);
    printf("\n");
    printf("Popped: %d\n", arr1.pop());
    printf("After pop: ");
    arr1.forEach(printInt);
    printf("\n");
    # Map - returns new array
    local arr2: MyArray<int> = arr1.map<int>(square);
    printf("Squared: ");
    arr2.forEach(printInt);
    printf("\n");
    # Filter - returns new array
    local arr3: MyArray<int> = arr1.filter(isEven);
    printf("Filtered (even): ");
    arr3.forEach(printInt);
    printf("\n");
    # Clean up malloc'd memory
    arr1.destroy();
    arr2.destroy();
    arr3.destroy();
    return 0;
}
