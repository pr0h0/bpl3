#[repr(C)]
struct Packet { count: i64, score: f64 }
#[link(name = "bpl_interop")]
extern "C" {
    fn interop_add(a: i64, b: i64) -> i64;
    fn interop_rows(rows: *mut [*mut [i64; 2]; 2]) -> i64;
    fn interop_scale(value: f32) -> f32;
    fn interop_update(packet: *mut Packet);
    fn interop_run(callback: extern "C" fn(i64) -> i64, value: i64) -> i64;
    fn interop_factory() -> extern "C" fn(i64) -> i64;
    fn interop_checked(callback: Option<extern "C" fn(i64) -> i64>, value: i64) -> i64;
    fn interop_text_length(text: *const std::ffi::c_char) -> u64;
    fn interop_message() -> *const std::ffi::c_char;
    fn interop_buffer(data: *mut u8, length: u64) -> u64;
    fn interop_alloc(length: u64) -> *mut u8;
    fn interop_free(data: *mut u8);
    fn interop_threaded(value: i64) -> i64;
    fn interop_signed_byte() -> i8;
    fn interop_signed_short() -> i16;
    fn interop_unsigned_byte() -> u8;
    fn interop_unsigned_short() -> u16;
    fn interop_boolean() -> bool;
    fn interop_narrow_factory() -> extern "C" fn() -> i8;
}
extern "C" fn twice(value: i64) -> i64 { value * 2 }
fn main() {
    unsafe {
        let mut packet = Packet { count: 35, score: 1.25 };
        interop_update(&mut packet);
        assert_eq!(interop_add(4294967296, -7), 4294967289);
        assert_eq!(interop_scale(2.5), 3.75);
        assert_eq!((packet.count, packet.score), (42, 2.5));
        assert_eq!(interop_run(twice, 20), 41);
        assert_eq!(interop_factory()(21), 42);
        assert_eq!(interop_checked(None, 20), -7);
        let mut first = [10i64, 11];
        let mut second = [31i64, 32];
        let mut rows = [&mut first as *mut [i64; 2], &mut second as *mut [i64; 2]];
        assert_eq!(interop_rows(&mut rows), 42);
        assert_eq!((first[1], second[1]), (11, 84));
        let text = std::ffi::CString::new("héλ").unwrap();
        assert_eq!(interop_text_length(text.as_ptr()), 5);
        assert_eq!(std::ffi::CStr::from_ptr(interop_message()).to_str().unwrap(), "héλ");
        let mut bytes = [0u8, 127, 255];
        assert_eq!(interop_buffer(bytes.as_mut_ptr(), 3), 292);
        assert_eq!(bytes, [90, 37, 165]);
        assert_eq!(interop_buffer(std::ptr::null_mut(), 0), 0);
        let owned = interop_alloc(3);
        assert!(!owned.is_null());
        assert_eq!(std::slice::from_raw_parts(owned, 3), &[10, 11, 12]);
        interop_free(owned);
        assert_eq!((interop_signed_byte() as i32,interop_signed_short() as i32),(-7,-300));
        assert_eq!((interop_unsigned_byte() as u32,interop_unsigned_short() as u32),(255,65535));
        assert!(interop_boolean());
        assert_eq!(interop_narrow_factory()() as i32,-7);
    }
    std::thread::scope(|scope| {
        for value in 1..=8i64 {
            scope.spawn(move || unsafe {
                for _ in 0..100 {
                    assert_eq!(interop_threaded(value), value * 10 + 1);
                    assert_eq!(interop_run(twice, 20), 41);
                }
            });
        }
    });
    println!("interop-ok");
}
