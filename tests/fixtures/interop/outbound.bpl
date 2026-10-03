struct Pair { x: int, y: int, }
struct Triple { x: double, y: double, z: double, }
extern foreign_add(a: long, b: long) ret long;
extern foreign_scale(x: f32) ret f32;
extern foreign_short(x: short) ret short;
extern foreign_bool(x: bool) ret bool;
extern foreign_pair(p: Pair) ret Pair;
extern foreign_triple(p: Triple) ret Triple;
extern foreign_callback(callback: Func<long>(long), x: long) ret long;
extern puts(s: string) ret int;
frame twice(x: long) ret long { return x * 2; }
frame main() ret int {
    if (foreign_add(cast<long>(4294967296), -7) != cast<long>(4294967289)) { return 1; }
    if (foreign_scale(cast<f32>(2.5)) != cast<f32>(3.75)) { return 2; }
    if (foreign_short(cast<short>(-32768)) != cast<short>(-32768)) { return 3; }
    if (foreign_bool(true) || !foreign_bool(false)) { return 4; }
    local p: Pair = foreign_pair(Pair { x: 7, y: 11 });
    if (p.x != 11 || p.y != 7) { return 5; }
    local t: Triple = foreign_triple(Triple { x: 1.25, y: -2.5, z: 3.0 });
    if (t.x != 2.5 || t.y != -5.0 || t.z != 6.0) { return 6; }
    if (foreign_callback(twice, 20) != 41) { return 7; }
    puts("interop-ok");
    return 0;
}
