#[repr(C)]
struct Packet { count: i64, score: f64 }
#[link(name = "bpl_interop")]
extern "C" {
    fn interop_add(a: i64, b: i64) -> i64;
    fn interop_rows(rows: *mut [*mut [i64; 2]; 2]) -> i64;
    fn interop_scale(value: f32) -> f32;
    fn interop_update(packet: *mut Packet);
    fn interop_run(callback: extern "C" fn(i64) -> i64, value: i64) -> i64;
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
        let mut first = [10i64, 11];
        let mut second = [31i64, 32];
        let mut rows = [&mut first as *mut [i64; 2], &mut second as *mut [i64; 2]];
        assert_eq!(interop_rows(&mut rows), 42);
        assert_eq!((first[1], second[1]), (11, 84));
    }
    println!("interop-ok");
}
