extern printf(fmt: string, ...);

frame is_even(n: int) ret bool {
    if (n == 0) {
        return true;
    }
    return is_odd(n - 1);
}

frame is_odd(n: int) ret bool {
    if (n == 0) {
        return false;
    }
    return is_even(n - 1);
}

frame main() ret int {
    if (is_even(10)) {
        printf("10 is even\n");
    }
    if (is_odd(11)) {
        printf("11 is odd\n");
    }
    return 0;
}
