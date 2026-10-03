#include "bridge.h"
/* These are BPL implementation symbols, not a stable public ABI. Keep the
   exported C adapter signatures scalar/pointer-only. */
extern int64_t bpl_add_i64_i64(int64_t, int64_t);
extern float bpl_scale_f32(float);
extern void bpl_update_Packet_ptr(struct Packet *);
extern int64_t bpl_run_fn_i64_ret_i64_i64(int64_t (*)(int64_t), int64_t);
int64_t interop_add(int64_t a, int64_t b) { return bpl_add_i64_i64(a, b); }
float interop_scale(float value) { return bpl_scale_f32(value); }
void interop_update(struct Packet *packet) { bpl_update_Packet_ptr(packet); }
int64_t interop_run(int64_t (*callback)(int64_t), int64_t value) { return bpl_run_fn_i64_ret_i64_i64(callback, value); }
