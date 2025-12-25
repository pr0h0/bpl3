import [String] from "std/string.bpl";
extern printf(f: string, ...);

struct X {
    a: String,
}

frame main() ret int {
    # New semantics: Pointers are nullable, Structs are not.
    local y: *X = nullptr;

    try {
        # This should throw NullAccessError because y is nullptr
        # Note: y.a is sugar for (*y).a
        y.a = String.new("nullptr assignment");
        printf("ERROR: Should have thrown on y.a access!\n");
    } catch (e: NullAccessError) {
        printf("Caught: %s\n", e.message);
    }
    return 0;
}
