extern printf(fmt: string, ...);

frame print_msg() {
    printf("Message\n");
    # No explicit return
}

frame main() ret int {
    print_msg();
    return 0;
}
