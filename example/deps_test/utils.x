import printf from "libc";

frame util_func() {
    call printf("Utility function called\n");
}

export util_func;
