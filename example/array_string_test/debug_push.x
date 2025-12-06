import printf from "libc";
import [Array] from "../../lib/array.x";
import [String] from "../../lib/string.x";

frame main() {
    call printf("sizeof(String) = %d\n", sizeof(String));

    local stringArr: Array<String>;
    stringArr.length = 0;
    stringArr.capacity = 0;
    stringArr.data = cast<*String>(0);

    call printf("Before push\n");

    local s1: String;
    s1.length = 5;
    s1.data[0] = 'H';
    s1.data[1] = 'e';
    s1.data[2] = 'l';
    s1.data[3] = 'l';
    s1.data[4] = 'o';
    s1.data[5] = 0;

    local s2: String;
    s2.length = 5;
    s2.data[0] = 'W';
    s2.data[1] = 'o';
    s2.data[2] = 'r';
    s2.data[3] = 'l';
    s2.data[4] = 'd';
    s2.data[5] = 0;

    call printf("Created s1 and s2\n");
    call printf("About to push s1\n");
    call stringArr.push(s1);
    call printf("Pushed s1\n");
    call printf("About to push s2\n");
    call stringArr.push(s2);
    call printf("Pushed s2\n");

    call printf("Array length: %d\n", call stringArr.len());
    call printf("About to get element 0\n");
    local retrieved: String = call stringArr.get(0);
    call printf("Retrieved: %s\n", retrieved.data);
}
