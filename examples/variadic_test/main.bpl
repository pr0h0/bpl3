import [IO] from "std/io.bpl";

frame main() ret int {
    # please test with different number of args from 0 to 10
    IO.bpl_printf("Hello %s, count is %d %d\n", "World", 42, 5);
    return 0;
}
