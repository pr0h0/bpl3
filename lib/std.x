import strlen, popen, pclose, fread, malloc from "libc";
extern strlen (str: *u8) ret u64;

frame print(s: *u8) {
    local len: u64 = call strlen(s);
    asm {
        mov rax, 1
        mov rdi, 1
        mov rsi, [(s)]
        mov rdx, [(len)]
        syscall
    }
}

frame exit(code: u64) {
    asm {
        mov rax, 60
        mov rdi, [(code)]
        syscall
    }
}

extern popen(command: *u8, mode: *u8) ret *u8;
extern pclose(stream: *u8) ret i32;
extern fread(ptr: *u8, size: u64, nmemb: u64, stream: *u8) ret u64;
extern malloc(size: u64) ret *u8;

frame exec(command: *u8) ret *u8 {
    local mode: *u8 = "r";
    local fp: *u8 = call popen(command, mode);
    if fp == NULL {
        return NULL;
    }
    
    local buffer: *u8 = call malloc(4096);
    if buffer == NULL {
        call pclose(fp);
        return NULL;
    }
    
    local read: u64 = call fread(buffer, 1, 4095, fp);
    buffer[read] = 0;
    
    call pclose(fp);
    return buffer;
}export print;
export exit;
export exec;
