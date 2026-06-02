import [printf] from "std/c.bpl";

spec A {
    frame foo(this: *Self);
}

spec B {
    frame bar(this: *Self);
}

struct C: A, B {
    val: int,
    frame foo(this: *C) {
        printf("foo: %d\n", this.val);
    }

    frame bar(this: *C) {
        printf("bar: %d\n", this.val * 2);
    }
}

frame main() {
    local c: C = C { val: 10 };
    c.foo();
    c.bar();
}
