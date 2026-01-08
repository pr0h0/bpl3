# System calls for memory management
# Currently targeting Linux x86_64

export [mmap, munmap, MAP_PRIVATE, MAP_ANONYMOUS, PROT_READ, PROT_WRITE, MAP_FAILED];

# void *mmap(void *addr, size_t length, int prot, int flags, int fd, off_t offset);
extern frame mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;

# int munmap(void *addr, size_t length);
extern frame munmap(addr: *void, len: ulong) ret int;

local const PROT_READ: int = 1;
local const PROT_WRITE: int = 2;

# Linux Defaults
local const MAP_PRIVATE: int = 2;
local const MAP_ANONYMOUS: int = 32; # 0x20

# MAP_FAILED is usually -1 cast to a pointer
# 0xFFFFFFFFFFFFFFFF = 18446744073709551615
local const MAP_FAILED: ulong = 18446744073709551615;
