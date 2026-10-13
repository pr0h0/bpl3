#ifndef BPL_INTEROP_H
#define BPL_INTEROP_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
struct Packet { int64_t count; double score; };
int64_t interop_add(int64_t a, int64_t b);
int64_t interop_rows(int64_t (*(*rows)[2])[2]);
float interop_scale(float value);
void interop_update(struct Packet *packet);
int64_t interop_run(int64_t (*callback)(int64_t), int64_t value);
int64_t (*interop_factory(void))(int64_t);
int64_t interop_checked(int64_t (*callback)(int64_t), int64_t value);
uint64_t interop_text_length(const char *text);
const char *interop_message(void);
uint64_t interop_buffer(uint8_t *data, uint64_t length);
uint8_t *interop_alloc(uint64_t length);
void interop_free(uint8_t *data);
#ifdef __cplusplus
}
#endif
#endif
