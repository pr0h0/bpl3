extern printf(fmt: string, ...) ret int;
struct Pair { x: int, y: int, }
struct Vec3 { x: double, y: double, z: double, }
struct Mixed { id: long, score: double, }
struct Tiny { a: char, b: char, c: char, }
struct Inner { a: int, b: f32, }
struct Outer { inner: Inner, tag: char[3], ok: bool, }
struct Big { a: long, b: long, c: long, d: long, }
enum Color { Red, Green, Blue }
struct Float5 {values:f32[5],}
struct FloatBytes {value:f32,bytes:i8[2],}
struct CharWord {bytes:char[4],word:long,}
extern float_bytes(input:FloatBytes) ret FloatBytes;
extern char_word(input:CharWord) ret CharWord;
extern increase_floats(input:Float5) ret Float5;
extern sum_pair(p: Pair) ret int;
extern swap_pair(p: Pair) ret Pair;
extern scale(v: Vec3, k: double) ret Vec3;
extern bump(m: Mixed) ret Mixed;
extern tiny(t: Tiny) ret Tiny;
extern outer(o: Outer) ret Outer;
extern big(a: long, b: long, c: long, d: long, e: long, p1: Pair, x: Big, p2: Pair) ret Big;
extern next_color(c: Color) ret Color;
frame call_it(f: Func<int>(Pair), p: Pair) ret int { return f(p); }
frame main() ret int {
    local p: Pair = Pair { x: 7, y: 11 };
    printf("%d\n", sum_pair(p));
    local s: Pair = swap_pair(p);
    printf("%d %d\n", s.x, s.y);
    local v: Vec3 = scale(Vec3 { x: 1.0, y: 2.0, z: 3.0 }, 1.5);
    printf("%.1f %.1f %.1f\n", v.x, v.y, v.z);
    local m: Mixed = bump(Mixed { id: 41, score: 2.25 });
    printf("%ld %.2f\n", m.id, m.score);
    local t: Tiny = tiny(Tiny { a: cast<char>(65), b: cast<char>(66), c: cast<char>(67) });
    printf("%c%c%c\n", t.a, t.b, t.c);
    local o: Outer;
    o.inner.a = 4; o.inner.b = cast<f32>(1.0); o.tag[0] = cast<char>(65); o.tag[1] = cast<char>(66); o.tag[2] = cast<char>(67); o.ok = false;
    local r: Outer = outer(o);
    printf("%d %.1f %c%c%c %d\n", r.inner.a, r.inner.b, r.tag[0], r.tag[1], r.tag[2], r.ok);
    local b: Big = big(1, 2, 3, 4, 5, Pair { x: 6, y: 7 }, Big { a: 100, b: 200, c: 300, d: 400 }, Pair { x: 8, y: 9 });
    printf("%ld %ld %ld %ld\n", b.a, b.b, b.c, b.d);
    local c: Color = next_color(Color.Blue);
    match (c) { Color.Red => printf("red\n"), _ => printf("other\n"), }
    printf("%d\n", call_it(sum_pair, Pair { x: 20, y: 22 }));
    local floats: Float5;
    loop (local i:int=0; i<5; i++) {floats.values[i]=(i+1) as f32;}
    local increased: Float5 = increase_floats(floats);
    printf("%.1f %.1f\n", increased.values[0], increased.values[4]);
    local fb: FloatBytes;
    fb.value=1.5 as f32; fb.bytes[0]=127 as i8; fb.bytes[1]=-128 as i8;
    local changed: FloatBytes = float_bytes(fb);
    printf("%.1f %d %d\n", changed.value, changed.bytes[0], changed.bytes[1]);
    local cw: CharWord;
    loop (local i:int=0; i<4; i++) {cw.bytes[i]=(87+i) as char;}
    cw.word=7;
    local flipped: CharWord = char_word(cw);
    printf("%c%c%c%c %ld\n", flipped.bytes[0], flipped.bytes[1], flipped.bytes[2], flipped.bytes[3], flipped.word);
    return 0;
}
