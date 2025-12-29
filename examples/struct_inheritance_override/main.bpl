extern printf(fmt: string, ...);

struct Parent {
    frame greet(this: Parent) {
        printf("Parent\n");
    }
}

struct Child: Parent {
    frame greet(this: Child) {
        printf("Child\n");
    }
}

frame main() ret int {
    local p: Parent;
    local c: Child;
    p.greet();
    c.greet();
    return 0;
}
