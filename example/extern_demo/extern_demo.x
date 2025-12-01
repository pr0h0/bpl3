# Use extern to define the signature of the imported function.
# This is necessary for functions from libc or .o files where the compiler
# cannot infer the types automatically.
import printf from "libc";
extern printf(fmt: *u8, ...);

frame main() ret u64 {
    call printf("Hello from extern printf! %d\n", 42);
    return 0;
}
