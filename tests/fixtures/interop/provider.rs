#[repr(C)]
pub struct Pair { x: i32, y: i32 }
#[repr(C)]
pub struct Triple { x: f64, y: f64, z: f64 }
#[no_mangle] pub extern "C" fn foreign_add(a: i64, b: i64) -> i64 { a + b }
#[no_mangle] pub extern "C" fn foreign_scale(x: f32) -> f32 { x * 1.5 }
#[no_mangle] pub extern "C" fn foreign_short(x: i16) -> i16 { x }
#[no_mangle] pub extern "C" fn foreign_bool(x: bool) -> bool { !x }
#[no_mangle] pub extern "C" fn foreign_pair(p: Pair) -> Pair { Pair { x: p.y, y: p.x } }
#[no_mangle] pub extern "C" fn foreign_triple(p: Triple) -> Triple { Triple { x: p.x * 2.0, y: p.y * 2.0, z: p.z * 2.0 } }
#[no_mangle] pub extern "C" fn foreign_callback(callback: extern "C" fn(i64) -> i64, x: i64) -> i64 { callback(x) + 1 }
