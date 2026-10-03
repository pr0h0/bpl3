package main
/*
#include <stdint.h>
#include <stdbool.h>
struct Pair { int32_t x, y; };
struct Triple { double x, y, z; };
typedef int64_t (*Callback)(int64_t);
static int64_t invoke(Callback cb, int64_t x) { return cb(x); }
*/
import "C"

//export foreign_add
func foreign_add(a, b C.int64_t) C.int64_t { return a + b }
//export foreign_scale
func foreign_scale(x C.float) C.float { return x * 1.5 }
//export foreign_short
func foreign_short(x C.int16_t) C.int16_t { return x }
//export foreign_bool
func foreign_bool(x C.bool) C.bool { return !x }
//export foreign_pair
func foreign_pair(p C.struct_Pair) C.struct_Pair { p.x, p.y = p.y, p.x; return p }
//export foreign_triple
func foreign_triple(p C.struct_Triple) C.struct_Triple { p.x *= 2; p.y *= 2; p.z *= 2; return p }
//export foreign_callback
func foreign_callback(cb C.Callback, x C.int64_t) C.int64_t { return C.invoke(cb, x) + 1 }
func main() {}
