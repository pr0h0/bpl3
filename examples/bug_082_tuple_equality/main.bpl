extern printf(fmt: string, ...) ret int;

frame main() {
    # Test tuple equality
    local t1: (int, int, bool) = (42, 100, true);
    local t2: (int, int, bool) = (42, 100, true);

    if (t1 == t2) {
        printf("Tuples are equal\n");
    } else {
        printf("Tuples are not equal\n");
    }

    # Change one element
    local t3: (int, int, bool) = (42, 999, true);

    if (t1 == t3) {
        printf("Tuples are equal (WRONG!)\n");
    } else {
        printf("Tuples are not equal (correct)\n");
    }

    # Test with different types
    local t4: (int, float) = (10, 3.14);
    local t5: (int, float) = (10, 3.14);
    local t6: (int, float) = (10, 2.71);

    if (t4 == t5) {
        printf("Float tuples are equal\n");
    } else {
        printf("Float tuples are not equal\n");
    }

    if (t4 == t6) {
        printf("Float tuples are equal (WRONG!)\n");
    } else {
        printf("Float tuples are not equal (correct)\n");
    }

    printf("SUCCESS\n");
}
