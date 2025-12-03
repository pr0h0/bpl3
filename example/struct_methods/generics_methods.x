# Test generics with struct methods

import printf from "libc";

# Test 1: Generic struct with methods that return T
struct Box<T> {
    value: T,

    frame getValue() ret T {
        return this.value;
    }

    frame setValue(newValue: T) {
        this.value = newValue;
    }
}

# Test 2: Generic pair with two type parameters
struct Pair<A, B> {
    first: A,
    second: B,

    frame getFirst() ret A {
        return this.first;
    }

    frame getSecond() ret B {
        return this.second;
    }

    frame setFirst(val: A) {
        this.first = val;
    }

    frame setSecond(val: B) {
        this.second = val;
    }
}

# Test 3: Generic struct with non-generic methods
struct Container<T> {
    value: T,
    count: i32,

    frame getCount() ret i32 {
        return this.count;
    }

    frame incrementCount() {
        this.count = this.count + 1;
    }
}

frame main() ret i32 {
    # Test 1: Box<i32>
    call printf("=== Test 1: Box<i32> ===\n");
    local intBox: Box<i32>;
    intBox.value = 42;
    local val1: i32 = call intBox.getValue();
    call printf("Box<i32> value: %d\n", val1);

    call intBox.setValue(100);
    local val2: i32 = call intBox.getValue();
    call printf("After setValue(100): %d\n", val2);

    # Test 2: Box<i64>
    call printf("\n=== Test 2: Box<i64> ===\n");
    local longBox: Box<i64>;
    longBox.value = 9999;
    local val3: i64 = call longBox.getValue();
    call printf("Box<i64> value: %lld\n", val3);

    # Test 3: Pair<i32, i64>
    call printf("\n=== Test 3: Pair<i32, i64> ===\n");
    local pair: Pair<i32, i64>;
    pair.first = 10;
    pair.second = 20;

    local f1: i32 = call pair.getFirst();
    local s1: i64 = call pair.getSecond();
    call printf("Pair: first=%d, second=%lld\n", f1, s1);

    call pair.setFirst(99);
    call pair.setSecond(88);

    local f2: i32 = call pair.getFirst();
    local s2: i64 = call pair.getSecond();
    call printf("After set: first=%d, second=%lld\n", f2, s2);

    # Test 4: Container<i32>
    call printf("\n=== Test 4: Container<i32> ===\n");
    local intContainer: Container<i32>;
    intContainer.value = 777;
    intContainer.count = 0;

    local cnt1: i32 = call intContainer.getCount();
    call printf("Initial count: %d\n", cnt1);

    call intContainer.incrementCount();
    call intContainer.incrementCount();
    local cnt2: i32 = call intContainer.getCount();
    call printf("After 2 increments: %d\n", cnt2);

    call printf("\n=== All generic method tests completed ===\n");
    return 0;
}
