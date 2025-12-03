import printf from "libc";

# Test compile-time cast function
frame main() ret u8 {
    # Test integer casts
    local x: u64 = 1000;
    local y: u8 = cast<u8>(x);
    call printf("u64 %d cast to u8: %d\n", x, y);
    
    # Test float casts
    local f: f64 = 3.14159;
    local i: u64 = cast<u64>(f);
    call printf("f64 %f cast to u64: %d\n", f, i);
    
    # Test pointer casts
    local a: u8 = 42;
    local ptr: *u8 = &a;
    local addr: u64 = cast<u64>(ptr);
    local back: *u8 = cast<*u8>(addr);
    call printf("Pointer %p as u64: %d, back to pointer: %p\n", ptr, addr, back);
    
    # Test float precision casts
    local d: f64 = 1.23456789;
    local s: f32 = cast<f32>(d);
    call printf("f64 %f cast to f32: %f\n", d, s);
    
    return 0;
}
