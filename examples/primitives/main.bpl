frame main() ret int {
    local a: char = 10;
    local b: uchar = 20;
    local c: short = 300;
    local d: ushort = 400;
    local e: int = 50000;
    local f: uint = 60000;
    local g: long = 7000000000;
    local h: ulong = 8000000000;
    # Test casts
    local _i: int = cast<int>(a);
    local _j: long = cast<long>(e);
    local _k: short = cast<short>(c);
    local _l: char = cast<char>(a);
    # Test arithmetic
    local _m: int = e + 100;
    printf("a=%d\n", cast<int>(a));
    printf("b=%d\n", cast<int>(b));
    printf("c=%d\n", cast<int>(c));
    printf("d=%d\n", cast<int>(d));
    printf("e=%d\n", e);
    printf("f=%d\n", cast<int>(f));
    printf("g=%ld\n", g);
    printf("h=%lu\n", h);
    # Test signed vs unsigned extension
    local neg: char = -10;
    local neg_int: int = cast<int>(neg);
    # Should be -10
    printf("neg=%d\n", neg_int);
    local uneg: uchar = 250;
    # -6 in 8-bit signed, but 250 unsigned
    local uneg_int: int = cast<int>(uneg);
    # Should be 250
    printf("uneg=%d\n", uneg_int);
    # Test implicit widening
    local n: long = e;
    # int -> long
    printf("n=%ld\n", n);
    local o: int = a;
    # char -> int
    printf("o=%d\n", o);
    return 0;
}
import [printf] from "std/c.bpl";
