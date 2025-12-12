# Syscall numbers for x86_64 Linux
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

# Constants for mmap
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

frame sys_write(fd: u64, buf: *u8, count: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 1
        mov rdi, [(fd)]
        mov rsi, [(buf)]
        mov rdx, [(count)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_read(fd: u64, buf: *u8, count: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 0
        mov rdi, [(fd)]
        mov rsi, [(buf)]
        mov rdx, [(count)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_exit(code: u64) {
    asm {
        mov rax, 60
        mov rdi, [(code)]
        syscall
    }
}

frame sys_mmap(addr: *u8, length: u64, prot: u64, flags: u64, fd: u64, offset: u64) ret *u8 {
    local ret_val: *u8;
    asm {
        mov rax, 9
        mov rdi, [(addr)]
        mov rsi, [(length)]
        mov rdx, [(prot)]
        mov r10, [(flags)]
        mov r8, [(fd)]
        mov r9, [(offset)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_munmap(addr: *u8, length: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 11
        mov rdi, [(addr)]
        mov rsi, [(length)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_open(filename: *u8, flags: u64, mode: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 2
        mov rdi, [(filename)]
        mov rsi, [(flags)]
        mov rdx, [(mode)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_close(fd: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 3
        mov rdi, [(fd)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_lseek(fd: u64, offset: u64, whence: u64) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 8
        mov rdi, [(fd)]
        mov rsi, [(offset)]
        mov rdx, [(whence)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
}

frame sys_unlink(filename: *u8) ret u64 {
    local ret_val: u64;
    asm {
        mov rax, 87
        mov rdi, [(filename)]
        syscall
        mov rcx, (ret_val)
        mov [rcx], rax
    }
    return ret_val;
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
