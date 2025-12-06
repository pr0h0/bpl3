import printf from "libc";
import [Array] from "../../lib/array.x";

frame main() {
    # Array demo
    local arr: Array<u64>;
    arr.length = 0;
    call arr.push(10);
    call arr.push(20);
    call arr.push(30);
    call printf("Array length: %d\n", call arr.len());
    call printf("Array pop: %d\n", call arr.pop());
    call printf("Array length after pop: %d\n", call arr.len());
}
