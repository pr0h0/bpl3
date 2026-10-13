#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
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
char *foreign_owned_message(void) { char *text = (char *)malloc(6); if (text) memcpy(text, "h\xc3\xa9\xce\xbb", 6); return text; }
void foreign_release_message(char *text) { free(text); }
uint64_t foreign_buffer(uint8_t *data, uint64_t length) {
    uint64_t sum = 0; for (uint64_t i = 0; i < length; ++i) { data[i] ^= 0x5a; sum += data[i]; } return sum;
}
uint8_t *foreign_alloc(uint64_t length) {
    uint8_t *data = (uint8_t *)malloc(length);
    if (data) for (uint64_t i = 0; i < length; ++i) data[i] = (uint8_t)(i + 10);
    return data;
}
void foreign_free(uint8_t *data, uint64_t length) { (void)length; free(data); }
#ifdef __cplusplus
}
#endif
