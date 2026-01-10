# System calls for memory management
# Currently targeting Linux x86_64

export [mmap];
export [munmap];
export {MAP_PRIVATE};
export {MAP_ANONYMOUS};
export {PROT_READ};
export {PROT_WRITE};
export {MAP_FAILED};

# void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset);
extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;

# int munmap(void *addr, size_t length);
extern munmap(addr: *void, len: ulong) ret int;

global const PROT_READ: int = 1;
global const PROT_WRITE: int = 2;

# Linux Defaults
global const MAP_PRIVATE: int = 2;
global const MAP_ANONYMOUS: int = 32; # 0x20

# MAP_FAILED is usually -1 cast to a pointer
# 0xFFFFFFFFFFFFFFFF = 18446744073709551615
global const MAP_FAILED: ulong = 18446744073709551615;
