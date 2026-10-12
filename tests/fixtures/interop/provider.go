package main
/*
#include <stdint.h>
#include <stdbool.h>
struct Pair { int32_t x, y; };
struct Triple { double x, y, z; };
typedef int64_t (*Callback)(int64_t);
static int64_t invoke(Callback cb, int64_t x) { return cb(x); }
typedef int32_t (*SmallCallback)(int8_t);
extern int32_t foreign_signed_probe(int8_t);
static int32_t invoke_small(SmallCallback cb, int8_t x) { return cb(x); }
static SmallCallback small_callback(void) { return foreign_signed_probe; }
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
//export foreign_signed_probe
func foreign_signed_probe(x C.int8_t) C.int32_t { return C.int32_t(x) }
//export foreign_unsigned_probe
func foreign_unsigned_probe(x C.uint8_t) C.int32_t { return C.int32_t(x) }
//export foreign_small_callback
func foreign_small_callback(cb C.SmallCallback, x C.int8_t) C.int32_t { return C.invoke_small(cb, x) }
//export foreign_callback_factory
func foreign_callback_factory() C.SmallCallback { return C.small_callback() }
func main() {}
