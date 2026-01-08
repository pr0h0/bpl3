export [StackAllocator];

import [Allocator] from "./allocator.bpl";

extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;
extern munmap(addr: *void, len: ulong) ret int;
local const PROT_READ: int = 1;
local const PROT_WRITE: int = 2;
local const MAP_PRIVATE: int = 2;
local const MAP_ANONYMOUS: int = 32;
local const MAP_FAILED: ulong = 18446744073709551615;

/# Stack Allocator
   Allocates memory sequentially in a LIFO (Last-In-First-Out) manner.
   Features:
   - Fastest allocation (pointer increment).
   - Memory can only be freed by rewinding to a previous marker.
   - Good for temporary scope-based allocations. #/
struct StackAllocator: Allocator {
    base_ptr: *u8,
    top_offset: ulong,
    capacity: ulong,

    # Initialize the stack allocator.
    # @param size: Total capacity of the stack in bytes.
    #              Will be rounded up to page size.
    frame init(this: *StackAllocator, size: ulong) {
        if (size == 0) 
            size = 1024 * 1024;
        # 1MB default
        # Round up to page size
        local page_size: ulong = 4096;
        size = (((size + page_size) - 1) / page_size) * page_size;

        local ptr: *void = mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (cast<ulong>(ptr) == MAP_FAILED) {
            this.base_ptr = nullptr;
            this.capacity = 0;
        } else {
            this.base_ptr = cast<*u8>(ptr);
            this.capacity = size;
        }
        this.top_offset = 0;
    }

    # Allocate memory from the stack.
    # @param size: Number of bytes to allocate.
    # @returns Pointer to aligned memory, or nullptr on overflow.
    frame alloc(this: *StackAllocator, size: ulong) ret *void {
        if (this.base_ptr == nullptr) 
            return nullptr;
        # Align 8
        if ((size % 8) != 0) 
            size = size + (cast<ulong>(8) - (size % 8));
        if ((this.top_offset + size) > this.capacity) {
            return nullptr; # Stack overflow
        }
        local ptr: *u8 = cast<*u8>(cast<ulong>(this.base_ptr) + this.top_offset);
        this.top_offset = this.top_offset + size;

        return cast<*void>(ptr);
    }

    # No-op for StackAllocator.
    # Individual items cannot be freed. Use mark() or rewind().
    frame free(this: *StackAllocator, ptr: *void) {
        if (ptr == nullptr) 
            return;
        # Cannot free individual items
    }

    # Get the current stack top marker.
    # @returns Current offset in the stack.
    frame get_marker(this: *StackAllocator) ret ulong {
        return this.top_offset;
    }

    # Rewind the stack to a previous marker.
    # Frees all memory allocated since that marker was obtained.
    # @param marker: Marker returned by get_marker().
    frame free_to_marker(this: *StackAllocator, marker: ulong) {
        this.top_offset = marker;
    }

    # Reset the stack to empty.
    frame reset(this: *StackAllocator) {
        this.top_offset = 0;
    }

    # Destroy the stack and release memory to OS.
    # After this, the allocator is invalid.
    frame destroy(this: *StackAllocator) {
        if (this.base_ptr != nullptr) {
            munmap(cast<*void>(this.base_ptr), this.capacity);
            this.base_ptr = nullptr;
        }
    }
}
