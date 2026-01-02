extern printf(fmt: string, ...);
extern malloc(size: u64) ret *void;
extern strcpy(dest: *char, src: *char) ret *char;
extern strcat(dest: *char, src: *char) ret *char;
extern strlen(s: *char) ret u64;

frame main() {
    local str1: string = "Hello ";
    local str2: string = "World";

    # String concatenation using + operator
    # This should work if operator overload is defined or handled
    local len1: u64 = strlen(str1);
    local len2: u64 = strlen(str2);
    local result: *char = cast<*char>(malloc(len1 + len2 + cast<u64>(1)));

    strcpy(result, str1);
    strcat(result, str2);

    printf("Result: %s\n", result);
}
