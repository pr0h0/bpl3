#include <stdint.h>
#include <stdbool.h>
#ifdef __cplusplus
extern "C" {
#endif
struct Pair { int32_t x, y; };
struct Triple { double x, y, z; };
int64_t foreign_add(int64_t a, int64_t b) { return a + b; }
float foreign_scale(float x) { return x * 1.5f; }
int16_t foreign_short(int16_t x) { return x; }
bool foreign_bool(bool x) { return !x; }
struct Pair foreign_pair(struct Pair p) { struct Pair result = {p.y, p.x}; return result; }
struct Triple foreign_triple(struct Triple p) { p.x *= 2; p.y *= 2; p.z *= 2; return p; }
int64_t foreign_callback(int64_t (*callback)(int64_t), int64_t x) { return callback(x) + 1; }
int32_t foreign_signed_probe(int8_t x) { return x; }
int32_t foreign_unsigned_probe(uint8_t x) { return x; }
int32_t foreign_small_callback(int32_t (*callback)(int8_t), int8_t x) { return callback(x); }
int32_t (*foreign_callback_factory(void))(int8_t) { return foreign_signed_probe; }
#ifdef __cplusplus
}
#endif
