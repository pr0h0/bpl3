export [ArenaAllocator];

import [Allocator] from "./allocator.bpl";

extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;
extern munmap(addr: *void, len: ulong) ret int;

local const PROT_READ: int = 1;
local const PROT_WRITE: int = 2;
local const MAP_PRIVATE: int = 2;
local const MAP_ANONYMOUS: int = 32;
local const MAP_FAILED: ulong = 18446744073709551615;

struct ArenaBlock {
    next: *ArenaBlock,
    capacity: ulong,
    used: ulong,
    data: *u8,
}

/# Arena Allocator
   Allocates memory in large blocks (pages) and distributes small chunks from them.
   Features:
   - Fast allocation (bump pointer).
   - No individual free (must free entire arena).
   - Good for per-frame or per-request memory. #/
struct ArenaAllocator: Allocator {
    head: *ArenaBlock,
    current: *ArenaBlock,
    default_block_size: ulong,

    # Initialize the arena.
    # @param block_size: Minimum size for new underlying memory blocks. 
    #                    If 0, defaults to 1MB.
    frame init(this: *ArenaAllocator, block_size: ulong) {
        this.head = nullptr;
        this.current = nullptr;
        if (block_size == 0) {
            this.default_block_size = 1024 * 1024; # 1MB
        } else {
            this.default_block_size = block_size;
        }
    }

    # Allocate memory from the arena.
    # @param size: Number of bytes to allocate.
    # @returns Pointer to aligned memory, or nullptr if allocation fails.
    frame alloc(this: *ArenaAllocator, size: ulong) ret *void {
        if (size == 0) 
            return nullptr;
        # Align to 8 bytes
        if ((size % 8) != 0) 
            size = size + (cast<ulong>(8) - (size % 8));
        # 1. Large allocation: If size is > default block size, allocate separate block
        #    This prevents a huge allocation from filling a standard block and causing fragmentation
        if (size > this.default_block_size) {
            return this.alloc_large(size);
        }
        # 2. Try current block
        if (this.current != nullptr) {
            local available: ulong = this.current.capacity - this.current.used;
            if (available >= size) {
                local ptr: *void = cast<*void>(cast<ulong>(this.current.data) + this.current.used);
                this.current.used = this.current.used + size;
                return ptr;
            }
        }
        return this.grow_and_alloc(size);
    }

    # Internal: Allocate a dedicated large block.
    # Does NOT update `this.current`, but prepends to `this.head` for cleanup.
    frame alloc_large(this: *ArenaAllocator, size: ulong) ret *void {
        local total_req: ulong = size + sizeof(ArenaBlock);
        local pages_needed: ulong = ((total_req + 4096) - 1) / 4096;
        local real_size: ulong = pages_needed * 4096;

        local raw_mem: *void = mmap(nullptr, real_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (cast<ulong>(raw_mem) == MAP_FAILED) 
            return nullptr;
        local new_block: *ArenaBlock = cast<*ArenaBlock>(raw_mem);
        new_block.capacity = real_size - sizeof(ArenaBlock);
        new_block.used = size;
        new_block.data = cast<*u8>(cast<ulong>(new_block) + sizeof(ArenaBlock));

        # Prepend to head so it gets freed
        new_block.next = this.head;
        this.head = new_block;

        return cast<*void>(new_block.data);
    }

    # Internal: Allocate a new standard block from OS and allocate from it.
    frame grow_and_alloc(this: *ArenaAllocator, size: ulong) ret *void {
        local alloc_size: ulong = this.default_block_size;
        local total_req: ulong = alloc_size + sizeof(ArenaBlock);
        local pages_needed: ulong = ((total_req + 4096) - 1) / 4096;
        local real_size: ulong = pages_needed * 4096;

        local raw_mem: *void = mmap(nullptr, real_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (cast<ulong>(raw_mem) == MAP_FAILED) 
            return nullptr;
        local new_block: *ArenaBlock = cast<*ArenaBlock>(raw_mem);
        new_block.capacity = real_size - sizeof(ArenaBlock);
        new_block.used = size;
        new_block.data = cast<*u8>(cast<ulong>(new_block) + sizeof(ArenaBlock));

        if (this.current != nullptr) {
            # Insert after current to keep chain
            new_block.next = this.current.next;
            this.current.next = new_block;
            this.current = new_block;
        } else {
            # Start new chain (or prepend to existing large blocks)
            new_block.next = this.head;
            this.head = new_block;
            this.current = new_block;
        }

        return cast<*void>(new_block.data);
    }

    # No-op for ArenaAllocator. Individual items cannot be freed.
    frame free(this: *ArenaAllocator, ptr: *void) {
        if (ptr == nullptr) 
            return;
        # No-op in Arena
    }

    # Reset the arena, allowing reuse of all allocated memory blocks.
    # Does not return memory to the OS, but marks it as free for reuse.
    frame reset(this: *ArenaAllocator) {
        local iter: *ArenaBlock = this.head;
        loop (iter != nullptr) {
            iter.used = 0;
            iter = iter.next;
        }
        this.current = this.head;
    }

    # Return all memory to the OS and destroy the arena.
    # The allocator structure itself remains valid but is empty.
    frame destroy(this: *ArenaAllocator) {
        local iter: *ArenaBlock = this.head;
        loop (iter != nullptr) {
            local next: *ArenaBlock = iter.next;
            local total_size: ulong = iter.capacity + sizeof(ArenaBlock);
            munmap(cast<*void>(iter), total_size);
            iter = next;
        }
        this.head = nullptr;
        this.current = nullptr;
    }
}
