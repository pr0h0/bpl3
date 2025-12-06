import printf from "libc";
import [String], streq, atoi, to_upper, to_lower from "../../lib/string.x";
import assert from "./utils.x";

frame main() {
    local s1: String;
    local s2: String;

    # Test manual construction
    s1.data[0] = 'H';
    s1.data[1] = 'e';
    s1.data[2] = 'l';
    s1.data[3] = 'l';
    s1.data[4] = 'o';
    s1.data[5] = 0;
    s1.length = 5;

    call assert((call s1.len()) == 5, "String length is 5");
    call assert((call s1.charAt(0)) == 'H', "First char is H");

    # Test concat
    s2.data[0] = ' ';
    s2.data[1] = 'W';
    s2.data[2] = 'o';
    s2.data[3] = 'r';
    s2.data[4] = 'l';
    s2.data[5] = 'd';
    s2.data[6] = 0;
    s2.length = 6;

    call s1.concat(&s2);
    call assert((call s1.len()) == 11, "String length is 11 after concat");
    call assert(call streq(s1.data, "Hello World"), "String content is Hello World");

    # Test slice
    local s3: String;
    call s1.slice(6, 11, &s3);
    call assert((call s3.len()) == 5, "Slice length is 5");
    call assert(call streq(s3.data, "World"), "Slice content is World");

    # Test equals
    local s4: String;
    s4.data[0] = 'W';
    s4.data[1] = 'o';
    s4.data[2] = 'r';
    s4.data[3] = 'l';
    s4.data[4] = 'd';
    s4.data[5] = 0;
    s4.length = 5;

    call assert(call s3.equals(&s4), "Strings are equal");

    # Test indexOf
    call assert((call s1.indexOf('W')) == 6, "Index of W is 6");
    call assert((call s1.indexOf('z')) == -1, "Index of z is -1");

    # Test atoi
    call assert(call atoi("123") == 123, "atoi 123");
    call assert(call atoi("-456") == -456, "atoi -456");

    # Test to_upper
    local s5: u8[10];
    s5[0] = 'a';
    s5[1] = 'b';
    s5[2] = 'c';
    s5[3] = 0;
    call to_upper(s5);
    call assert(call streq(s5, "ABC"), "to_upper abc -> ABC");

    # Test to_lower
    s5[0] = 'X';
    s5[1] = 'Y';
    s5[2] = 'Z';
    s5[3] = 0;
    call to_lower(s5);
    call assert(call streq(s5, "xyz"), "to_lower XYZ -> xyz");

    # Test atoi edge cases
    call assert(call atoi("  789") == 789, "atoi with leading spaces");
    call assert(call atoi("0") == 0, "atoi 0");

    # Test indexOf edge cases
    call assert((call s1.indexOf('H')) == 0, "Index of H is 0");
    call assert((call s1.indexOf('d')) == 10, "Index of d is 10");
}
