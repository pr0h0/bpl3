export [PoolAllocator];

import [Allocator] from "./allocator.bpl";

extern mmap(addr: *void, len: ulong, prot: int, flags: int, fd: int, offset: ulong) ret *void;
extern munmap(addr: *void, len: ulong) ret int;
local const PROT_READ: int = 1;
local const PROT_WRITE: int = 2;
local const MAP_PRIVATE: int = 2;
local const MAP_ANONYMOUS: int = 32;
local const MAP_FAILED: ulong = 18446744073709551615;

struct PoolNode {
    next: *PoolNode,
}

struct PoolChunk {
    next: *PoolChunk,
    size: ulong,
    # Size of this chunk in bytes (for unmap)
}

/# Pool Allocator
   Allocates fixed-size blocks from a memory pool.
   Features:
   - Extremely fast alloc/free (O(1)).
   - Low fragmentation for objects of same size.
   - Can free individual items (adds to free list).
   - Good for particle systems, nodes, etc. #/
struct PoolAllocator: Allocator {
    block_size: ulong,
    free_head: *PoolNode,
    # List of free blocks
    chunk_head: *PoolChunk,
    # List of OS pages (to free later)

    # Initialize the pool.
    # @param item_size: Size of each item in bytes. Will be aligned to 8 bytes.
    #                   Minimum size is 8 bytes (to hold pointer).
    frame init(this: *PoolAllocator, item_size: ulong) {
        # Ensure item size is at least size of pointer (nested instruction)
        if (item_size < 8) 
            item_size = 8;
        # Align to 8
        if ((item_size % 8) != 0) 
            item_size = item_size + (cast<ulong>(8) - (item_size % 8));
        this.block_size = item_size;
        this.free_head = nullptr;
        this.chunk_head = nullptr;
    }

    # Allocate a block from the pool.
    # @param size: Must be <= item_size passed to init.
    # @returns Pointer to memory block.
    frame alloc(this: *PoolAllocator, size: ulong) ret *void {
        # Pool can only alloc blocks of its exact size (or smaller)
        if (size > this.block_size) 
            return nullptr;
        if (this.free_head == nullptr) {
            this.grow();
        }
        # OOM
        if (this.free_head == nullptr) 
            return nullptr;
        local ptr: *PoolNode = this.free_head;
        this.free_head = this.free_head.next;

        return cast<*void>(ptr);
    }

    # Internal: Allocate a new chunk from OS and slice it into nodes.
    frame grow(this: *PoolAllocator) {
        # Allocate a new page (4KB)
        # Or larger if block_size is huge
        local chunk_size: ulong = 4096;
        if ((this.block_size * 10) > chunk_size) {
            chunk_size = (this.block_size * 10) + sizeof(PoolChunk);
            # Align to page
            chunk_size = ((chunk_size + 4095) / 4096) * 4096;
        }
        local raw: *void = mmap(nullptr, chunk_size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
        if (cast<ulong>(raw) == MAP_FAILED) 
            return;
        # Setup Chunk Header
        local chunk: *PoolChunk = cast<*PoolChunk>(raw);
        chunk.size = chunk_size;
        chunk.next = this.chunk_head;
        this.chunk_head = chunk;

        # Slice the rest into nodes
        local start_addr: ulong = cast<ulong>(raw) + sizeof(PoolChunk);
        local end_addr: ulong = cast<ulong>(raw) + chunk_size;

        # We need to link them.
        # We'll link them into the free_head list.
        # Add new nodes to FRONT of free_head

        local curr_addr: ulong = start_addr;
        loop ((curr_addr + this.block_size) <= end_addr) {
            local node: *PoolNode = cast<*PoolNode>(curr_addr);
            node.next = this.free_head;
            this.free_head = node;

            curr_addr = curr_addr + this.block_size;
        }
    }

    # Free a block back to the pool.
    # @param ptr: Pointer to free. Must have been allocated by this pool.
    frame free(this: *PoolAllocator, ptr: *void) {
        if (ptr == nullptr) 
            return;
        local node: *PoolNode = cast<*PoolNode>(ptr);
        node.next = this.free_head;
        this.free_head = node;
    }

    # Reset the pool, freeing all chunks and clearing the free list.
    frame reset(this: *PoolAllocator) {
        this.destroy();
        this.free_head = nullptr;
        this.chunk_head = nullptr;
    }

    # Destroy the pool and release all memory to OS.
    frame destroy(this: *PoolAllocator) {
        local iter: *PoolChunk = this.chunk_head;
        loop (iter != nullptr) {
            local next: *PoolChunk = iter.next;
            munmap(cast<*void>(iter), iter.size);
            iter = next;
        }
    }
}
