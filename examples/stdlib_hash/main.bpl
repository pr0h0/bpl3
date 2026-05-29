import [Hash] from "std";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("fnv1a32 hello: %u\n", Hash.fnv1a32("hello"));
    printf("checksum abc: %u\n", Hash.checksum32("abc"));
    return 0;
}
