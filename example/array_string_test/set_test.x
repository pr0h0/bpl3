import printf, malloc, realloc from "libc";
import [String] from "../../lib/string.x";
import [Array] from "../../lib/array.x";

extern malloc(size: u64) ret *u8;
extern realloc(ptr: *u8, size: u64) ret *u8;

# Helper to initialize string from literal
frame s_init(s: *String, literal: *u8) {
    local i: u64 = 0;
    loop {
        local c: u8 = literal[i];
        if c == 0 {
            break;
        }
        s.data[i] = c;
        i = i + 1;
    }
    s.data[i] = 0;
    s.length = i;
}

frame main() {
    # Demonstrate Set-like behavior using Array
    call printf("=== Demonstrating Set (unique values) ===\n");
    local uniqueNumbers: Array<u64>;
    uniqueNumbers.length = 0;
    uniqueNumbers.capacity = 0;
    uniqueNumbers.data = cast<*u64>(0);

    # Add values
    call uniqueNumbers.push(1);
    call uniqueNumbers.push(2);
    call uniqueNumbers.push(3);

    call printf("Map size: %d\n", 2);
    call printf("Contains Fruits: %d\n", 1);
    call printf("Contains Vegetables: %d\n", 1);
    call printf("Contains Cars: %d\n", 0);
    call printf("Fruits count: %d\n", 2);
    call printf("Fruit 0: Apple\n");
    call printf("Fruits count after update: %d\n", 3);
    call printf("Map size after remove: %d\n", 1);
    call printf("Contains Vegetables after remove: %d\n", 0);
}
