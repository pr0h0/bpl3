extern printf(fmt: string, ...);

frame do_nothing() {
    return;
}

frame main() ret int {
    do_nothing();
    printf("Done\n");
    return 0;
}
