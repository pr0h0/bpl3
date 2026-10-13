#include "bridge.h"
#include <stdio.h>
#include <string.h>
#include <pthread.h>
static int64_t twice(int64_t value) { return value * 2; }
static void *worker(void *arg) {
    int64_t value = (intptr_t)arg;
    for (int i = 0; i < 100; i++) {
        if (interop_threaded(value) != value * 10 + 1 || interop_run(twice, 20) != 41)
            return (void *)(intptr_t)1;
    }
    return NULL;
}
int main(void) {
    struct bpl_Packet packet = {35, 1.25};
    interop_update(&packet);
    if (interop_add(INT64_C(4294967296), -7) != INT64_C(4294967289)) return 1;
    if (interop_scale(2.5f) != 3.75f) return 2;
    if (packet.count != 42 || packet.score != 2.5) return 3;
    if (interop_run(twice, 20) != 41) return 4;
    if (interop_factory()(21) != 42 || interop_checked(NULL, 20) != -7) return 6;
    int64_t first[2] = {10, 11}, second[2] = {31, 32};
    int64_t (*rows[2])[2] = {&first, &second};
    if (interop_rows(&rows) != 42 || first[1] != 11 || second[1] != 84) return 5;
    char text[] = "h\xc3\xa9\xce\xbb";
    if (interop_text_length(text) != 5 || strcmp(interop_message(), "h\xc3\xa9\xce\xbb") != 0) return 7;
    uint8_t bytes[3] = {0, 127, 255};
    if (interop_buffer(bytes, 3) != 292 || bytes[0] != 90 || bytes[1] != 37 || bytes[2] != 165) return 8;
    if (interop_buffer(NULL, 0) != 0) return 9;
    uint8_t *owned = interop_alloc(3);
    if (!owned || owned[0] != 10 || owned[2] != 12) return 10;
    interop_free(owned);
    if (interop_signed_byte()!=-7 || interop_signed_short()!=-300 || interop_unsigned_byte()!=255 || interop_unsigned_short()!=65535 || !interop_boolean()) return 13;
    if (interop_narrow_factory()()!=-7) return 14;
    pthread_t workers[8];
    for (int i = 0; i < 8; i++) if (pthread_create(&workers[i], NULL, worker, (void *)(intptr_t)(i+1))) return 11;
    for (int i = 0; i < 8; i++) { void *result = NULL; if (pthread_join(workers[i], &result) || result) return 12; }
    puts("interop-ok");
    return 0;
}
