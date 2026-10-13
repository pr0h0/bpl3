# Portable C runtime adapters. Keep these as externs so unused imports do not
# emit BPL wrappers or pull runtime support into otherwise runtime-free code.
export [__bpl_write];
extern __bpl_write(fd: int, buf: *char, count: long) ret long;
