import printf from "libc";
import [Array] from "../../lib/array.x";
import [String] from "../../lib/string.x";

frame main() {
    # Test Array<String>
    local stringArr: Array<String>;
    stringArr.length = 0;
    stringArr.capacity = 0;
    stringArr.data = cast<*String>(0);

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

    call stringArr.push(s1);
    call stringArr.push(s2);

    call printf("String Array Length: %d\n", call stringArr.len());

    local retrieved: String = call stringArr.get(0);
    call printf("First string: %s\n", retrieved.data);

    retrieved = (call stringArr.get(1));
    call printf("Second string: %s\n", retrieved.data);

    # Test String methods
    call printf("s1 charAt 1: %c\n", call s1.charAt(1));
    call printf("s1 indexOf 'l': %d\n", call s1.indexOf('l'));
    call printf("s1 indexOf 'z': %d\n", call s1.indexOf('z'));

    local s3: String;
    s3.length = 5;
    s3.data[0] = 'H';
    s3.data[1] = 'e';
    s3.data[2] = 'l';
    s3.data[3] = 'l';
    s3.data[4] = 'o';
    s3.data[5] = 0;

    call printf("s1 equals s3: %d\n", call s1.equals(&s3));
    call printf("s1 equals s2: %d\n", call s1.equals(&s2));

    # Test Array methods
    local intArr: Array<u64>;
    intArr.length = 0;
    intArr.capacity = 0;
    intArr.data = cast<*u64>(0);
    call intArr.push(100);
    call intArr.push(200);
    call intArr.set(0, 999);
    call printf("Modified intArr[0]: %d\n", call intArr.get(0));
    call intArr.clear();
    call printf("Cleared intArr length: %d\n", call intArr.len());
}
