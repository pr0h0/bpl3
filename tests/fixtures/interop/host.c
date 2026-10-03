#include "bridge.h"
#include <stdio.h>
static int64_t twice(int64_t value) { return value * 2; }
int main(void) {
    struct Packet packet = {35, 1.25};
    interop_update(&packet);
    if (interop_add(INT64_C(4294967296), -7) != INT64_C(4294967289)) return 1;
    if (interop_scale(2.5f) != 3.75f) return 2;
    if (packet.count != 42 || packet.score != 2.5) return 3;
    if (interop_run(twice, 20) != 41) return 4;
    puts("interop-ok");
    return 0;
}
