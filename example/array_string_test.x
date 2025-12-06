# Demo test for Array and String features
import printf from "libc";

import Array from "../../lib/array.x";
import String from "../../lib/string.x";

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

    # String demo
    local s1: String;
    local s2: String;
    local slice: String;
    s1.length = 7;
    s1.data[0] = 'H';
    s1.data[1] = 'e';
    s1.data[2] = 'l';
    s1.data[3] = 'l';
    s1.data[4] = 'o';
    s1.data[5] = ',';
    s1.data[6] = ' ';
    s1.data[7] = 0;
    s2.length = 6;
    s2.data[0] = 'W';
    s2.data[1] = 'o';
    s2.data[2] = 'r';
    s2.data[3] = 'l';
    s2.data[4] = 'd';
    s2.data[5] = '!';
    s2.data[6] = 0;
    call s1.concat(&s2);
    call printf("Concat: %s\n", s1.data);
    call s1.slice(7, 12, &slice);
    call printf("Slice: %s\n", slice.data);
    call printf("Length: %d\n", call s1.len());
}
