import [Hash] from "std";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("fnv1a32 hello: %u\n", Hash.fnv1a32("hello"));
    printf("checksum abc: %u\n", Hash.checksum32("abc"));
    return 0;
}
