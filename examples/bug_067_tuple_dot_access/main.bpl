extern printf(fmt: string, ...);

frame main() {
    local pair: (int, string) = (42, "hello");
    local triple: (int, int, int) = (10, 20, 30);
    local nested: ((int, string), bool) = ((7, "world"), true);

    # Access tuple elements using dot notation with numbers
    printf("First element: %d\n", pair.0);
    printf("Second element: %s\n", pair.1);

    printf("Triple sum: %d\n", triple.0 + triple.1 + triple.2);

    printf("Nested first element: %d\n", nested.0.0);
    printf("Nested second element: %s\n", nested.0.1);
    printf("Nested bool element: %d\n", cast<int>(nested.1));
}
