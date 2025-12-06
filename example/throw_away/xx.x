import printf, malloc from "libc";
import [String] from "../../lib/string.x";
import [Array] from "../../lib/array.x";

extern malloc(size: u64) ret *u8;

frame add_two(a: T, b: U) ret V {
    local res: V = a + b;
    return res;
}

frame main() {
    local result: u64 = call add_two(-273, cast<u8>(13));
    call printf("Result: %lld\n", result);

    local my_string: String = {data: "resiiio"};

    call printf("String length: %d\n", my_string.length);
    call printf("String data: %s\n", my_string.data);

    local new_string: String = {data: "-sam-te"};

    # call my_string.concat(&new_string);
    call printf("Concatenated String: %s\n", my_string.data);
    call printf("Concatenated String length: %d\n", my_string.length);

    local int_array: Array<u64>;

    call int_array.push(42);
    call int_array.push(84);
    call int_array.push(33);
    call printf("Array length after pushes: %d\n", int_array.length);
    local popped_value: u64 = call int_array.pop();
    call printf("Popped value: %d\n", popped_value);
    call int_array.pop();
    call int_array.pop();
    local underflow_value: u64 = call int_array.pop();
    call printf("Underflow pop value: %d\n", underflow_value);

    local string_array: Array<String>;
    string_array.data = cast<*String>(call malloc(5 * 16)); # Allocate space for 5 String elements
    string_array.length = 0;
    call string_array.push(my_string);
    call string_array.push(new_string);
    call printf("String Array length after pushes: %d\n", string_array.length);
    local poped_string: String = call string_array.pop();
    call printf("First poped string data: %s\n", poped_string.data);
    poped_string = (call string_array.pop());
    call printf("Second poped string data: %s\n", poped_string.data);
    poped_string = (call string_array.pop());
    call printf("Underflow poped string data: %s\n", poped_string.data);
}
