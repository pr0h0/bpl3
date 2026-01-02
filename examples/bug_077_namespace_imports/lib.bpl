extern printf(fmt: string, ...);

frame helper() {
    printf("Helper called\n");
}

frame add(a: int, b: int) ret int {
    return a + b;
}

export helper;
export add;
