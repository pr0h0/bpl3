export [PageAllocator];

import [Allocator] from "./allocator.bpl";

# Syscalls
extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;
extern munmap(addr: *void, len: ulong) ret int;
local const PROT_READ: int = 1;
local const PROT_WRITE: int = 2;
local const MAP_PRIVATE: int = 2;
local const MAP_ANONYMOUS: int = 32;
local const MAP_FAILED: ulong = 18446744073709551615;

local const PAGE_SIZE: ulong = 4096;

/# Page Allocator
   Allocates memory directly from the OS in page-sized chunks (4KB).
   Features:
   - Slow allocation (syscall per alloc).
   - Memory is always page-aligned.
   - Can free individual items (returns pages to OS).
   - Good for large allocations. #/
struct PageAllocator: Allocator {
    # Allocate memory directly from OS.
    # Rounds up size to nearest page multiple.
    frame alloc(this: *PageAllocator, size: ulong) ret *void {
        local total_size: ulong = size + 8; # Header

        # Round up
        local pages: ulong = ((total_size + PAGE_SIZE) - 1) / PAGE_SIZE;
        local real_size: ulong = pages * PAGE_SIZE;

        local ptr: *ulong = cast<*ulong>(mmap(nullptr, real_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0));

        if (cast<ulong>(ptr) == MAP_FAILED) {
            return nullptr;
        }
        # Store full size (for munmap)
        *ptr = real_size;

        return cast<*void>(cast<ulong>(ptr) + 8);
    }

    # Free memory returned by alloc.
    # Unmaps the pages from the OS.
    # @param ptr: Pointer returned by alloc (must not be nullptr).
    frame free(this: *PageAllocator, ptr: *void) {
        if (ptr == nullptr) 
            return;
        local real_ptr: *ulong = cast<*ulong>(cast<ulong>(ptr) - 8);
        local size: ulong = *real_ptr;

        munmap(cast<*void>(real_ptr), size);
    }

    # No-op for PageAllocator.
    # Since it doesn't track allocations, it cannot free them all at once.
    frame reset(this: *PageAllocator) {
        # Stateless, cannot reset all
    }
}
