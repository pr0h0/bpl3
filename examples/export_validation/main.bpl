export counter;
export main;

global counter: int = 42;

frame main() ret int {
    return counter - 42;
}
