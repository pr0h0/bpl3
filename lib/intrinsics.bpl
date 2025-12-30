# LLVM Intrinsics
# These functions are mapped directly to LLVM intrinsics by the compiler.

# Branch Prediction
extern likely(cond: bool) ret bool;
extern unlikely(cond: bool) ret bool;

# Prefetch
# locality: 0-3 (0 = no locality, 3 = extreme locality)
# rw: 0 = read, 1 = write
extern prefetch(ptr: *void, rw: int, locality: int);

# Traps
extern trap();
extern debugtrap();

export likely;
export unlikely;
export prefetch;
export trap;
export debugtrap;
