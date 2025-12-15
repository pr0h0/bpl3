extern printf(fmt: string, ...);
extern malloc(size: i64) ret *i8;
extern free(ptr: *i8);
struct Array<T> {
    data: *T,
    length: int,
    capacity: int,
    frame new(cap: int) ret Array<T> {
        local result: Array<T>;
        local size: i64 = sizeof<T>() * cast<i64>(cap);
        local buffer: *T = cast<*T>(malloc(size));
        result.data = buffer;
        result.length = 0;
        result.capacity = cap;
        return result;
    }
    frame push(this: *Array<T>, val: T) {
        if (this.length < this.capacity) {
            this.data[this.length] = val;
            this.length = this.length + 1;
        } else {
            printf("Error: Array full\n");
        }
    }
    frame pop(this: *Array<T>) ret T {
        if (this.length > 0) {
            this.length = this.length - 1;
            return this.data[this.length];
        }
        # Throw error or return null, try null  if compilation fails then throw
        local err: string = "Array is empty";
        throw err;
    }
    frame forEach(this: *Array<T>, fn: Func<void>(T)) {
        local i: int = 0;
        loop (i < this.length) {
            fn(this.data[i]);
            i = i + 1;
        }
    }
    # Map to new array (JavaScript-style)
    frame map<U>(this: *Array<T>, fn: Func<U>(T)) ret Array<U> {
        local result: Array<U> = Array<U>.new(this.capacity);
        local i: int = 0;
        loop (i < this.length) {
            result.push(fn(this.data[i]));
            i = i + 1;
        }
        return result;
    }
    # Filter to new array (JavaScript-style)
    frame filter(this: *Array<T>, fn: Func<bool>(T)) ret Array<T> {
        local result: Array<T> = Array<T>.new(this.capacity);
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
    frame destroy(this: *Array<T>) {
        free(cast<*i8>(this.data));
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
    local arr1: Array<int> = Array<int>.new(10);
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
    local arr2: Array<int> = arr1.map<int>(square);
    printf("Squared: ");
    arr2.forEach(printInt);
    printf("\n");
    # Filter - returns new array
    local arr3: Array<int> = arr1.filter(isEven);
    printf("Filtered (even): ");
    arr3.forEach(printInt);
    printf("\n");
    # Clean up malloc'd memory
    arr1.destroy();
    arr2.destroy();
    arr3.destroy();
    return 0;
}
