import printf from "libc";

struct Box<T> {
    value: T,
}

frame main() ret u64 {
    # 10 levels of nesting
    # Box<Box<Box<Box<Box<Box<Box<Box<Box<Box<u64>>>>>>>>>>
    local b1: Box<u64>;
    b1.value = 42;

    local b2: Box<Box<u64>>;
    b2.value = b1;

    local b3: Box<Box<Box<u64>>>;
    b3.value = b2;

    local b4: Box<Box<Box<Box<u64>>>>;
    b4.value = b3;

    local b5: Box<Box<Box<Box<Box<u64>>>>>;
    b5.value = b4;

    local b6: Box<Box<Box<Box<Box<Box<u64>>>>>>;
    b6.value = b5;

    local b7: Box<Box<Box<Box<Box<Box<Box<u64>>>>>>>;
    b7.value = b6;

    local b8: Box<Box<Box<Box<Box<Box<Box<Box<u64>>>>>>>>;
    b8.value = b7;

    local b9: Box<Box<Box<Box<Box<Box<Box<Box<Box<u64>>>>>>>>>;
    b9.value = b8;

    local b10: Box<Box<Box<Box<Box<Box<Box<Box<Box<Box<u64>>>>>>>>>>;
    b10.value = b9;

    # Accessing the value back
    local val: u64 = b10.value.value.value.value.value.value.value.value.value.value;
    call printf("Deeply nested value: %lu\n", val);
    return 0;
}
