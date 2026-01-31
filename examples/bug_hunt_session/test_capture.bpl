# Bug Hunt: Lambda Capture Syntax
extern printf(fmt: string, ...);

# Test capturing by reference
frame test_capture() {
    local counter: int = 0;

    # Try various capture syntaxes
    local inc: Lambda<void>() = || ret void {
        counter = counter + 1; # Will this capture counter?
    };

    inc();
    inc();
    printf("Counter: %d\n", counter);
}

frame main() {
    test_capture();
}
