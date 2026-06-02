import [printf] from "std/c.bpl";

# 1. Generic Struct
struct Box<T> {
    value: T,
    frame new(val: T) ret Box<T> {
        local b: Box<T>;
        b.value = val;
        return b;
    }
    frame get(this: Box<T>) ret T {
        return this.value;
    }
}

# 2. Generic Function
frame identity<T>(val: T) ret T {
    return val;
}

frame swap<T>(a: T, b: T) ret (T, T) {
    return (b, a);
}

# 3. Generic Inheritance
struct Parent<T> {
    parentVal: T,
}

struct Child<T>: Parent<T> {
    childVal: T,
    frame new(p: T, c: T) ret Child<T> {
        local obj: Child<T>;
        obj.parentVal = p;
        obj.childVal = c;
        return obj;
    }
}

# 4. Generic Spec (Interface)
spec Container<T> {
    frame get(this: Container<T>) ret T;
}

frame main() ret int {
    printf("--- Generic Struct ---\n");
    local b1: Box<int> = Box<int>.new(42);
    printf("Box<int>: %d\n", b1.get());

    local b2: Box<float> = Box<float>.new(3.14);
    printf("Box<float>: %.2f\n", b2.get());

    printf("\n--- Generic Function ---\n");
    local i: int = identity<int>(10);
    printf("identity<int>: %d\n", i);

    local f: float = identity<float>(2.5);
    printf("identity<float>: %.2f\n", f);

    local (x: int, y: int) = swap<int>(1, 2);
    printf("swap<int>: %d, %d\n", x, y);

    printf("\n--- Generic Inheritance ---\n");
    local c: Child<int> = Child<int>.new(100, 200);
    printf("Child<int>: parent=%d, child=%d\n", c.parentVal, c.childVal);

    # printf("\n--- Lambda in Generic Function ---\n");
    testLambda<int>(55);

    return 0;
}

frame testLambda<T>(_val: T) {
    # Lambda capturing generic type T
    local f: Lambda<T>(T) = |x: T| ret T {
        return x;
    };
    local res: T = f(_val);

    # Since we instantiate with int, we can cast to int for printing
    # Note: In a real generic function, we wouldn't know T is int,
    # but here we rely on monomorphization.
    local i: int = cast<int>(res);
    printf("Lambda result: %d\n", i);
}
