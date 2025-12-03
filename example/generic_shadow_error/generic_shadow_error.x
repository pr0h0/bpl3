import printf from "libc";

# This should throw an error: method generic T shadows struct generic T
struct BadExample<T> {
    value: T,

    frame invalid(x: T) ret T {
        # ERROR: T is already a generic parameter of the struct

        return x;
    }
}

frame main() ret u8 {
    return 0;
}
