# BUG-121: sizeof on floating point types (FIXED)
# sizeof<float>() and sizeof<f64>() now work correctly

import [printf] from "std/c.bpl";

frame main() {
    # Integer types
    printf("sizeof(int) = %lu\n", sizeof<int>());
    printf("sizeof(i64) = %lu\n", sizeof<i64>());
    printf("sizeof(char) = %lu\n", sizeof<char>());

    # Float types - now working!
    printf("sizeof(float) = %lu\n", sizeof<float>());
    printf("sizeof(f32) = %lu\n", sizeof<f32>());
    printf("sizeof(f64) = %lu\n", sizeof<f64>());
    printf("sizeof(double) = %lu\n", sizeof<double>());

    printf("BUG-121 FIXED: sizeof<float>() now works!\n");
}
