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

# Math Intrinsics (Float/Double)
extern sqrt(x: float) ret float;
extern sin(x: float) ret float;
extern cos(x: float) ret float;
extern pow(x: float, y: float) ret float;
extern exp(x: float) ret float;
extern log(x: float) ret float;
extern floor(x: float) ret float;
extern ceil(x: float) ret float;
extern round(x: float) ret float;
extern fabs(x: float) ret float;
extern minnum(x: float, y: float) ret float;
extern maxnum(x: float, y: float) ret float;
extern copysign(x: float, y: float) ret float;
extern fma(a: float, b: float, c: float) ret float;

# Stack & Frame Intrinsics
extern frameaddress(level: int) ret *void;
extern returnaddress(level: int) ret *void;
extern stacksave() ret *void;
extern stackrestore(ptr: *void);

# Bit Manipulation Intrinsics (Int/i32)
extern ctpop(x: int) ret int;
extern ctlz(x: int) ret int;
extern cttz(x: int) ret int;
extern bswap(x: int) ret int;
extern bitreverse(x: int) ret int;

# Memory Intrinsics
# dest, src, len, is_volatile (boolean as int 0/1)
extern memcpy(dest: *void, src: *void, len: long, is_volatile: bool);
extern memmove(dest: *void, src: *void, len: long, is_volatile: bool);
# dest, val (u8), len, is_volatile
extern memset(dest: *void, val: u8, len: long, is_volatile: bool);

export likely;
export unlikely;
export prefetch;
export trap;
export debugtrap;
export sqrt;
export sin;
export cos;
export pow;
export exp;
export log;
export floor;
export ceil;
export round;
export fabs;
export minnum;
export maxnum;
export copysign;
export fma;
export frameaddress;
export returnaddress;
export stacksave;
export stackrestore;
export ctpop;
export ctlz;
export cttz;
export bswap;
export bitreverse;
export memcpy;
export memmove;
export memset;

extern printf(fmt: string, ...) ret int;
extern snprintf(str: *i8, size: long, format: *i8, ...) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Dynamic Linker / Symbol Resolution
struct Dl_info {
    dli_fname: *i8,
    dli_fbase: *void,
    dli_sname: *i8,
    dli_saddr: *void
}

extern dladdr(addr: *void, info: *Dl_info) ret int;

export [Dl_info];
export dladdr;
