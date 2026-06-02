import [printf] from "std/c.bpl";

type Arr = int[10];
type PtrInt = *int;

frame main() {
    # Test 1: What is sizeof?
    printf("sizeof<int>() = %llu\n", sizeof<int>());
    printf("sizeof<int[10]>() = %llu\n", sizeof<int[10]>());
    printf("sizeof<Arr>() = %llu\n", sizeof<Arr>());
    printf("sizeof<*int>() = %llu\n", sizeof<*int>());
    printf("sizeof<*Arr>() = %llu\n", sizeof<*Arr>());
    printf("sizeof<PtrInt>() = %llu\n", sizeof<PtrInt>());
    printf("sizeof<*PtrInt>() = %llu\n", sizeof<*PtrInt>());
}
