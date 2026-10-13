struct Pair { x: int, y: int, }
struct Triple { x: double, y: double, z: double, }
extern foreign_add(a: long, b: long) ret long;
extern foreign_scale(x: f32) ret f32;
extern foreign_short(x: short) ret short;
extern foreign_byte() ret i8;
extern foreign_ushort() ret ushort;
extern foreign_narrow_callback(callback:Func<i8>()) ret int;
extern foreign_narrow_factory() ret Func<i8>();
extern foreign_bool(x: bool) ret bool;
extern foreign_pair(p: Pair) ret Pair;
extern foreign_mixed_signed(value: char, p: Pair) ret int;
extern foreign_mixed_unsigned(value: uchar, p: Pair) ret int;
extern foreign_triple(p: Triple) ret Triple;
extern foreign_callback(callback: Func<long>(long), x: long) ret long;
extern foreign_thread_callback(callback: Func<long>(long), x: long) ret long;
extern foreign_signed_probe(x: char) ret int;
extern foreign_unsigned_probe(x: uchar) ret int;
extern foreign_small_callback(callback: Func<int>(char), x: char) ret int;
extern foreign_callback_factory() ret Func<int>(char);
extern foreign_owned_message() ret string;
extern foreign_release_message(text: string);
extern foreign_buffer(data: *uchar, length: ulong) ret ulong;
extern foreign_alloc(length: ulong) ret *uchar;
extern foreign_free(data: *uchar, length: ulong);
extern strlen(text: string) ret ulong;
extern strcmp(a: string, b: string) ret int;
extern puts(s: string) ret int;
frame doubled(x: long) ret long { return x * 2; }
@[noinline]
frame twice(x: long) ret long { return doubled(x); }
frame narrow_result() ret i8 {return cast<i8>(-7);}
frame signed_value(x: char) ret int { return cast<int>(x); }
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
    if (foreign_signed_probe(cast<char>(-128)) != -128 || foreign_unsigned_probe(cast<uchar>(255)) != 255) { return 8; }
    if (foreign_small_callback(signed_value, cast<char>(-128)) != -128) { return 9; }
    if (foreign_callback_factory()(cast<char>(-128)) != -128) { return 10; }
    local message: string = foreign_owned_message();
    if(strlen(message) != cast<ulong>(5) || strcmp(message, "héλ") != 0) { return 11; }
    foreign_release_message(message);
    local bytes: uchar[3] = [cast<uchar>(0), cast<uchar>(127), cast<uchar>(255)];
    if(foreign_buffer(bytes, cast<ulong>(3)) != cast<ulong>(292)) { return 12; }
    if(bytes[0] != cast<uchar>(90) || bytes[1] != cast<uchar>(37) || bytes[2] != cast<uchar>(165)) { return 13; }
    local owned: *uchar = foreign_alloc(cast<ulong>(3));
    if(owned == nullptr) { return 14; }
    if(owned[0] != cast<uchar>(10) || owned[2] != cast<uchar>(12)) { return 15; }
    foreign_free(owned, cast<ulong>(3));
    local empty: *uchar = nullptr;
    if(foreign_buffer(empty, cast<ulong>(0)) != cast<ulong>(0)) { return 16; }
    if(foreign_mixed_signed(cast<char>(-128), Pair {x:1,y:2}) != -125) { return 17; }
    if(foreign_mixed_unsigned(cast<uchar>(255), Pair {x:1,y:2}) != 258) { return 18; }
    if(foreign_thread_callback(twice, 20) != 41) {return 19;}
    if(foreign_byte()!=cast<i8>(-7) || foreign_ushort()!=cast<ushort>(65535)) {return 20;}
    if(foreign_narrow_callback(narrow_result)!=-7 || foreign_narrow_factory()()!=cast<i8>(-7)) {return 21;}
    puts("interop-ok");
    return 0;
}
