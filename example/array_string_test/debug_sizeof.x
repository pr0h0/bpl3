import printf from "libc";
import [Array] from "../../lib/array.x";
import [String] from "../../lib/string.x";

frame main() {
    call printf("sizeof(String) = %d\n", sizeof(String));
    call printf("sizeof(Array<String>) = %d\n", sizeof(Array<String>));

    local arr: Array<String>;
    call printf("arr.data before init = %p\n", arr.data);
    call printf("arr.length before init = %d\n", arr.length);
    call printf("arr.capacity before init = %d\n", arr.capacity);
}
