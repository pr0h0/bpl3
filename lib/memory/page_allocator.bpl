export [PageAllocator];

import [Allocator] from "./allocator.bpl";

extern __bpl_memory_map(size: ulong) ret *void;
extern __bpl_memory_unmap(ptr: *void, size: ulong);
extern __bpl_memory_page_size() ret ulong;

struct PageHeader {
    base: *void,
    size: ulong,
}

/# Page Allocator
   Allocates memory directly from the OS in native page-sized chunks.
   Returned storage is page-aligned. A separate leading page stores metadata.
   Individual allocations must be returned to the same allocator with free. #/
struct PageAllocator: Allocator {
    # Return nullptr for zero bytes, unsupported sizes, or mapping failure.
    frame alloc(this: *PageAllocator, size: ulong) ret *void {
        local page: ulong = __bpl_memory_page_size();
        local max: ulong = cast<ulong>(0x7fffffffffffffff);
        if ((size == 0) || (page < sizeof(PageHeader)) || (page > max / 2)) return nullptr;
        if (size > max - page - (page - 1)) return nullptr;
        local payload: ulong = ((size + page - 1) / page) * page;
        local total: ulong = payload + page;
        local base: *void = __bpl_memory_map(total);
        if (base == nullptr) return nullptr;
        local data: *void = cast<*void>(cast<ulong>(base) + page);
        local header: *PageHeader = cast<*PageHeader>(cast<ulong>(data) - sizeof(PageHeader));
        *header = PageHeader { base: base, size: total };
        return data;
    }

    # Accept nullptr or an allocation returned by alloc that has not been freed.
    frame free(this: *PageAllocator, ptr: *void) {
        if (ptr == nullptr) return;
        local header: *PageHeader = cast<*PageHeader>(cast<ulong>(ptr) - sizeof(PageHeader));
        __bpl_memory_unmap(header.base, header.size);
    }

    # No-op: this allocator does not track its outstanding allocations.
    frame reset(this: *PageAllocator) {
    }
}
