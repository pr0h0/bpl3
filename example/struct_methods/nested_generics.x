# Test nested structs with nested generics and methods

import printf from "libc";

# Inner generic struct with methods
struct Inner<T> {
    value: T,
    multiplier: i32,

    frame getValue() ret T {
        return this.value;
    }

    frame setValue(v: T) {
        this.value = v;
    }

    frame getMultiplier() ret i32 {
        return this.multiplier;
    }

    frame setMultiplier(m: i32) {
        this.multiplier = m;
    }
}

# Outer generic struct containing inner generic struct
struct Outer<T> {
    inner: Inner<T>,
    count: i32,

    frame getCount() ret i32 {
        return this.count;
    }

    frame incrementCount() {
        this.count = this.count + 1;
    }

    frame getInnerMultiplier() ret i32 {
        return this.inner.multiplier;
    }

    frame setInnerMultiplier(m: i32) {
        this.inner.multiplier = m;
    }
}

# Container with two different generic types
struct Container<A, B> {
    first: Inner<A>,
    second: Inner<B>,

    frame getFirstMultiplier() ret i32 {
        return this.first.multiplier;
    }

    frame getSecondMultiplier() ret i32 {
        return this.second.multiplier;
    }

    frame swapMultipliers() {
        local temp: i32 = this.first.multiplier;
        this.first.multiplier = this.second.multiplier;
        this.second.multiplier = temp;
    }
}

# Wrapper for triple nesting
struct Wrapper<T> {
    outer: Outer<T>,
    id: i32,

    frame getId() ret i32 {
        return this.id;
    }

    frame getOuterCount() ret i32 {
        return this.outer.count;
    }

    frame incrementOuterCount() {
        this.outer.count = this.outer.count + 1;
    }

    frame getInnerMultiplier() ret i32 {
        return this.outer.inner.multiplier;
    }
}

frame main() ret i32 {
    # Test 1: Inner<i32> - basic generic methods
    call printf("=== Test 1: Inner<i32> ===\n");
    local inner1: Inner<i32>;
    inner1.value = 42;
    inner1.multiplier = 2;

    local val1: i32 = call inner1.getValue();
    call printf("Inner value: %d\n", val1);

    call inner1.setValue(100);
    local val2: i32 = call inner1.getValue();
    call printf("After setValue(100): %d\n", val2);

    local mult1: i32 = call inner1.getMultiplier();
    call printf("Multiplier: %d\n", mult1);

    # Test 2: Inner<i64>
    call printf("\n=== Test 2: Inner<i64> ===\n");
    local inner2: Inner<i64>;
    inner2.value = 9999;
    inner2.multiplier = 5;

    local val3: i64 = call inner2.getValue();
    call printf("Inner value (i64): %lld\n", val3);

    call inner2.setMultiplier(10);
    local mult2: i32 = call inner2.getMultiplier();
    call printf("After setMultiplier(10): %d\n", mult2);

    # Test 3: Outer<i32> with nested Inner<i32>
    call printf("\n=== Test 3: Outer<i32> with nested Inner<i32> ===\n");
    local outer1: Outer<i32>;
    outer1.inner.value = 42;
    outer1.inner.multiplier = 2;
    outer1.count = 0;

    # Access inner value directly
    call printf("Inner value: %d\n", outer1.inner.value);

    # Call outer methods that access inner fields
    local mult3: i32 = call outer1.getInnerMultiplier();
    call printf("Inner multiplier via outer method: %d\n", mult3);

    call outer1.setInnerMultiplier(7);
    local mult4: i32 = call outer1.getInnerMultiplier();
    call printf("After setInnerMultiplier(7): %d\n", mult4);

    call outer1.incrementCount();
    local cnt1: i32 = call outer1.getCount();
    call printf("Count after increment: %d\n", cnt1);

    # Test 4: Outer<i64> with nested Inner<i64>
    call printf("\n=== Test 4: Outer<i64> with nested Inner<i64> ===\n");
    local outer2: Outer<i64>;
    outer2.inner.value = 8888;
    outer2.inner.multiplier = 3;
    outer2.count = 10;

    call printf("Inner value (i64): %lld\n", outer2.inner.value);

    local cnt2: i32 = call outer2.getCount();
    call printf("Outer count: %d\n", cnt2);

    # Test 5: Container<i32, i64> with two Inner types
    call printf("\n=== Test 5: Container<i32, i64> ===\n");
    local container: Container<i32, i64>;
    container.first.value = 10;
    container.first.multiplier = 3;
    container.second.value = 20;
    container.second.multiplier = 7;

    local fval: i32 = call container.first.getValue();
    local sval: i64 = call container.second.getValue();
    call printf("First: %d, Second: %lld\n", fval, sval);

    call container.first.setValue(99);
    call container.second.setValue(88);

    local fval2: i32 = call container.first.getValue();
    local sval2: i64 = call container.second.getValue();
    call printf("After set - First: %d, Second: %lld\n", fval2, sval2);

    local fmult1: i32 = call container.getFirstMultiplier();
    local smult1: i32 = call container.getSecondMultiplier();
    call printf("Before swap - First mult: %d, Second mult: %d\n", fmult1, smult1);

    call container.swapMultipliers();

    local fmult2: i32 = call container.getFirstMultiplier();
    local smult2: i32 = call container.getSecondMultiplier();
    call printf("After swap - First mult: %d, Second mult: %d\n", fmult2, smult2);

    # Test 6: Triple-nested Wrapper<i32>
    call printf("\n=== Test 6: Wrapper<i32> (triple nested) ===\n");
    local wrapper: Wrapper<i32>;
    wrapper.id = 123;
    wrapper.outer.count = 5;
    wrapper.outer.inner.value = 777;
    wrapper.outer.inner.multiplier = 4;

    local wid: i32 = call wrapper.getId();
    call printf("Wrapper ID: %d\n", wid);

    local wcnt: i32 = call wrapper.getOuterCount();
    call printf("Outer count: %d\n", wcnt);

    local wval: i32 = call wrapper.outer.inner.getValue();
    call printf("Inner value from wrapper: %d\n", wval);

    call wrapper.outer.inner.setValue(555);
    local wval2: i32 = call wrapper.outer.inner.getValue();
    call printf("After set via wrapper: %d\n", wval2);

    call wrapper.incrementOuterCount();
    call wrapper.incrementOuterCount();
    local wcnt2: i32 = call wrapper.getOuterCount();
    call printf("After 2 increments: %d\n", wcnt2);

    local wmult: i32 = call wrapper.getInnerMultiplier();
    call printf("Inner multiplier via wrapper: %d\n", wmult);

    call printf("\n=== All nested generic tests completed ===\n");
    return 0;
}
