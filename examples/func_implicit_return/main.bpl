import [printf] from "std/c.bpl";

frame print_msg() {
    printf("Message\n");
    # No explicit return
}

frame main() ret int {
    print_msg();
    return 0;
}
