export [StackAllocator];

import [Allocator] from "./allocator.bpl";

extern __bpl_memory_map(size: ulong) ret *void;
extern __bpl_memory_unmap(ptr: *void, size: ulong);

# Keep mapping sizes and pointer differences within signed 64-bit range.
local const MAX_ALLOCATION: ulong = 0x7ffffffffffff000;

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
        if (size > MAX_ALLOCATION - 4095) {
            this.base_ptr = nullptr;
            this.capacity = 0;
            this.top_offset = 0;
            return;
        }
        local page_size: ulong = 4096;
        size = (((size + page_size) - 1) / page_size) * page_size;

        local ptr: *void = __bpl_memory_map(size);
        if (ptr == nullptr) {
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
        if ((this.base_ptr == nullptr) || (size == 0) || (size > MAX_ALLOCATION - 7))
            return nullptr;
        # Align 8
        if ((size % 8) != 0)
            size = size + (cast<ulong>(8) - (size % 8));
        if ((this.top_offset > this.capacity) || (size > this.capacity - this.top_offset)) {
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
        if ((marker > this.top_offset) || ((marker % 8) != 0)) {
            throw "Invalid stack allocator marker";
        }
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
            __bpl_memory_unmap(cast<*void>(this.base_ptr), this.capacity);
            this.base_ptr = nullptr;
        }
        this.capacity = 0;
        this.top_offset = 0;
    }
}
