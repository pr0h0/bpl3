extern printf(fmt: string, ...);
import [Allocator] from "std/memory/allocator.bpl";
import [PageAllocator] from "std/memory/page_allocator.bpl";
import [ArenaAllocator] from "std/memory/arena_allocator.bpl";
import [PoolAllocator] from "std/memory/pool_allocator.bpl";
import [StackAllocator] from "std/memory/stack_allocator.bpl";
import [showcase_allocator] from "./shared.bpl";

frame main() ret int {
    printf("=== Memory Allocator Showcase ===\n\n");

    # 1. Page Allocator
    # Very coarse, used for getting raw blocks from OS.
    # Usually you don't use this for small objects.
    local page_alloc: PageAllocator;

    printf("--- Testing PageAllocator ---\n");
    # Alloc requests pages, so even 1 byte -> 4KB
    local p1: *void = page_alloc.alloc(100);
    printf("Allocated 100 bytes (1 page) at %p\n", p1);
    page_alloc.free(p1);
    printf("Freed page\n\n");

    # 2. Arena Allocator
    # Fast, great for frames/levels.
    local arena: ArenaAllocator;
    arena.init(1024); # 1KB blocks for testing

    showcase_allocator<ArenaAllocator>(&arena, "ArenaAllocator");

    # Showcase arena reset
    printf("[Arena Special] Resetting arena...\n");
    arena.reset();
    local p2a: *void = arena.alloc(10);
    printf("Allocated after reset: %p\n", p2a);
    arena.destroy();
    printf("Arena destroyed\n\n");

    # 3. Stack Allocator
    # LIFO fast allocation
    local stack: StackAllocator;
    stack.init(1024); # 1KB stack

    showcase_allocator<StackAllocator>(&stack, "StackAllocator");

    printf("[Stack Special] Marker usage\n");
    local m1: ulong = stack.get_marker();
    local s1: *void = stack.alloc(10);
    printf("Allocated 10 at %p\n", s1);

    stack.free_to_marker(m1);
    local s2: *void = stack.alloc(10);
    printf("Allocated 10 after rewind at %p (Should be same as previous)\n", s2);

    stack.destroy();
    printf("Stack destroyed\n\n");

    # 4. Pool Allocator
    # Fixed size blocks (e.g., for Particles or AST nodes)
    local pool: PoolAllocator;
    # Init for 32-byte items
    pool.init(32);

    printf("--- Testing PoolAllocator (32 byte items) ---\n");
    local o1: *void = pool.alloc(32);
    printf("Alloc item 1: %p\n", o1);

    local o2: *void = pool.alloc(32);
    printf("Alloc item 2: %p\n", o2);

    pool.free(o1);
    printf("Freed item 1\n");

    local o3: *void = pool.alloc(32);
    printf("Alloc item 3: %p (Should be recycled item 1 address)\n", o3);

    pool.destroy();
    printf("Pool destroyed\n\n");

    return 0;
}
