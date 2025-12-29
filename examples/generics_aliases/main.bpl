extern printf(fmt: string, ...);

struct Box<T> {
    value: T,
}

type BoxedInt = Box<int>;
type Boxed<T> = Box<T>;

frame main() ret int {
    local b1: BoxedInt;
    b1.value = 10;
    printf("BoxedInt: %d\n", b1.value);

    local b2: Boxed<float>;
    b2.value = 3.14;
    printf("Boxed<float>: %.2f\n", b2.value);

    return 0;
}
