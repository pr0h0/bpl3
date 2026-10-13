#[repr(C)]
pub struct Pair { x: i32, y: i32 }
#[repr(C)]
pub struct Triple { x: f64, y: f64, z: f64 }
#[no_mangle] pub extern "C" fn foreign_add(a: i64, b: i64) -> i64 { a + b }
#[no_mangle] pub extern "C" fn foreign_scale(x: f32) -> f32 { x * 1.5 }
#[no_mangle] pub extern "C" fn foreign_short(x: i16) -> i16 { x }
#[no_mangle] pub extern "C" fn foreign_bool(x: bool) -> bool { !x }
#[no_mangle] pub extern "C" fn foreign_pair(p: Pair) -> Pair { Pair { x: p.y, y: p.x } }
#[no_mangle] pub extern "C" fn foreign_mixed_signed(value: i8, p: Pair) -> i32 { value as i32 + p.x + p.y }
#[no_mangle] pub extern "C" fn foreign_mixed_unsigned(value: u8, p: Pair) -> i32 { value as i32 + p.x + p.y }
#[no_mangle] pub extern "C" fn foreign_triple(p: Triple) -> Triple { Triple { x: p.x * 2.0, y: p.y * 2.0, z: p.z * 2.0 } }
#[no_mangle] pub extern "C" fn foreign_callback(callback: extern "C" fn(i64) -> i64, x: i64) -> i64 { callback(x) + 1 }
#[no_mangle] pub extern "C" fn foreign_signed_probe(x: i8) -> i32 { x as i32 }
#[no_mangle] pub extern "C" fn foreign_unsigned_probe(x: u8) -> i32 { x as i32 }
#[no_mangle] pub extern "C" fn foreign_small_callback(callback: extern "C" fn(i8) -> i32, x: i8) -> i32 { callback(x) }
#[no_mangle] pub extern "C" fn foreign_callback_factory() -> extern "C" fn(i8) -> i32 { foreign_signed_probe }
#[no_mangle] pub extern "C" fn foreign_owned_message() -> *mut std::ffi::c_char {
    std::ffi::CString::new("héλ").unwrap().into_raw()
}
#[no_mangle] pub unsafe extern "C" fn foreign_release_message(text: *mut std::ffi::c_char) {
    if !text.is_null() { drop(std::ffi::CString::from_raw(text)); }
}
#[no_mangle] pub unsafe extern "C" fn foreign_buffer(data: *mut u8, length: u64) -> u64 {
    if length == 0 { return 0; }
    let bytes = std::slice::from_raw_parts_mut(data, length as usize);
    let mut sum = 0; for byte in bytes { *byte ^= 0x5a; sum += *byte as u64; } sum
}
#[no_mangle] pub extern "C" fn foreign_alloc(length: u64) -> *mut u8 {
    let bytes = (0..length).map(|i| (i + 10) as u8).collect::<Vec<_>>().into_boxed_slice();
    Box::into_raw(bytes) as *mut u8
}
#[no_mangle] pub unsafe extern "C" fn foreign_free(data: *mut u8, length: u64) {
    if !data.is_null() { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(data, length as usize))); }
}
