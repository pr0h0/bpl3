#ifndef BPL_INTEROP_H
#define BPL_INTEROP_H
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
struct Packet { int64_t count; double score; };
int64_t interop_add(int64_t a, int64_t b);
float interop_scale(float value);
void interop_update(struct Packet *packet);
int64_t interop_run(int64_t (*callback)(int64_t), int64_t value);
#ifdef __cplusplus
}
#endif
#endif
