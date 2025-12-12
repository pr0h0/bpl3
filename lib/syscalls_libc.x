# Portable syscall wrappers using libc functions
# This version works on all platforms (macOS, Linux, etc.) by using
# standard C library functions instead of raw syscalls.

import malloc, free from "std/libc.x";

# Use POSIX functions via extern declarations
extern open(pathname: *u8, flags: i32, mode: i32) ret i32;
extern close(fd: i32) ret i32;
extern read(fd: i32, buf: *u8, count: u64) ret i64;
extern write(fd: i32, buf: *u8, count: u64) ret i64;
extern lseek(fd: i32, offset: i64, whence: i32) ret i64;
extern unlink(pathname: *u8) ret i32;
extern _exit(status: i32);

# Syscall number constants (kept for API compatibility)
# These are not actually used when using libc, but kept for backwards compatibility
frame SYS_READ() ret u64 {
    return 0;
}
frame SYS_WRITE() ret u64 {
    return 1;
}
frame SYS_OPEN() ret u64 {
    return 2;
}
frame SYS_CLOSE() ret u64 {
    return 3;
}
frame SYS_MMAP() ret u64 {
    return 9;
}
frame SYS_MUNMAP() ret u64 {
    return 11;
}
frame SYS_EXIT() ret u64 {
    return 60;
}
frame SYS_LSEEK() ret u64 {
    return 8;
}
frame SYS_UNLINK() ret u64 {
    return 87;
}

# mmap constants (for compatibility)
frame PROT_READ() ret u64 {
    return 1;
}
frame PROT_WRITE() ret u64 {
    return 2;
}
frame MAP_PRIVATE() ret u64 {
    return 2;
}
frame MAP_ANONYMOUS() ret u64 {
    return 32;
}

# Wrapper functions with the same API as syscalls.x
frame sys_write(fd: u64, buf: *u8, count: u64) ret u64 {
    local result: i64 = call write(cast<i32>(fd), buf, count);
    if result < 0 {
        # Return error as large unsigned value (like Linux syscalls)
        return cast<u64>(result);
    }
    return cast<u64>(result);
}

frame sys_read(fd: u64, buf: *u8, count: u64) ret u64 {
    local result: i64 = call read(cast<i32>(fd), buf, count);
    if result < 0 {
        return cast<u64>(result);
    }
    return cast<u64>(result);
}

frame sys_exit(code: u64) {
    call _exit(cast<i32>(code));
}

frame sys_mmap(addr: *u8, length: u64, prot: u64, flags: u64, fd: u64, offset: u64) ret *u8 {
    # Use malloc as a simple replacement for mmap
    # This works for anonymous mappings which is the common use case
    return call malloc(length);
}

frame sys_munmap(addr: *u8, length: u64) ret u64 {
    call free(addr);
    return 0;
}

frame sys_open(filename: *u8, flags: u64, mode: u64) ret u64 {
    local result: i32 = call open(filename, cast<i32>(flags), cast<i32>(mode));
    if result < 0 {
        return cast<u64>(cast<i64>(result));
    }
    return cast<u64>(result);
}

frame sys_close(fd: u64) ret u64 {
    local result: i32 = call close(cast<i32>(fd));
    if result < 0 {
        return cast<u64>(cast<i64>(result));
    }
    return cast<u64>(result);
}

frame sys_lseek(fd: u64, offset: u64, whence: u64) ret u64 {
    local result: i64 = call lseek(cast<i32>(fd), cast<i64>(offset), cast<i32>(whence));
    if result < 0 {
        return cast<u64>(result);
    }
    return cast<u64>(result);
}

frame sys_unlink(filename: *u8) ret u64 {
    local result: i32 = call unlink(filename);
    if result < 0 {
        return cast<u64>(cast<i64>(result));
    }
    return cast<u64>(result);
}

export sys_write;
export sys_read;
export sys_exit;
export sys_mmap;
export sys_munmap;
export sys_open;
export sys_close;
export sys_lseek;
export sys_unlink;
export SYS_READ;
export SYS_WRITE;
export SYS_OPEN;
export SYS_CLOSE;
export SYS_MMAP;
export SYS_MUNMAP;
export SYS_EXIT;
export SYS_LSEEK;
export SYS_UNLINK;
export PROT_READ;
export PROT_WRITE;
export MAP_PRIVATE;
export MAP_ANONYMOUS;
