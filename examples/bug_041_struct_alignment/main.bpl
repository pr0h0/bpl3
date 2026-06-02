import [printf] from "std/c.bpl";

struct Simple {
    a: u8,
    b: u64,
}

struct WithMethod {
    a: u8,
    b: u64,
    frame foo(this: WithMethod) {
        printf("foo\n");
    }
}

frame main() ret int {
    printf("sizeof(Simple): %d\n", sizeof<Simple>());
    printf("sizeof(WithMethod): %d\n", sizeof<WithMethod>());
    return 0;
}
