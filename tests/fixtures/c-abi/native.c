#include <stdbool.h>
struct Pair { int x, y; };
struct Vec3 { double x, y, z; };
struct Mixed { long long id; double score; };
struct Tiny { char a, b, c; };
struct Inner { int a; float b; };
struct Outer { struct Inner in; char tag[3]; bool ok; };
struct Big { long long a, b, c, d; };
enum Color { RED, GREEN, BLUE };
int sum_pair(struct Pair p) { return p.x + p.y; }
struct Pair swap_pair(struct Pair p) { struct Pair r = { p.y, p.x }; return r; }
struct Vec3 scale(struct Vec3 v, double k) { struct Vec3 r = { v.x*k, v.y*k, v.z*k }; return r; }
struct Mixed bump(struct Mixed m) { m.id += 1; m.score *= 2; return m; }
struct Tiny tiny(struct Tiny t) { struct Tiny r = { t.c, t.b, t.a }; return r; }
struct Outer outer(struct Outer o) { o.in.a *= 10; o.in.b += 0.5f; o.tag[0] = 'Z'; o.ok = !o.ok; return o; }
struct Big big(long long a, long long b, long long c, long long d, long long e, struct Pair p1, struct Big x, struct Pair p2) {
  struct Big r = { x.a + a + b, x.b + c + d, x.c + e + p1.x + p1.y, x.d + p2.x * p2.y }; return r; }
enum Color next_color(enum Color c) { return (enum Color)((c + 1) % 3); }
