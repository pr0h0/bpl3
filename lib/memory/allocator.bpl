export [Allocator];

spec Allocator {
    frame alloc(this: *Self, size: ulong) ret *void;
    frame free(this: *Self, ptr: *void);
    frame reset(this: *Self);
}
