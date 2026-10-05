package main
/*
#include "bridge.h"
extern int64_t go_twice(int64_t);
static int64_t run_go_callback(void) { return interop_run(go_twice, 20); }
// Keep the pointer graph in C-owned storage for the duration of the call.
static int check_rows(void) {
    int64_t first[2] = {10, 11}, second[2] = {31, 32};
    int64_t (*rows[2])[2] = {&first, &second};
    return interop_rows(&rows) == 42 && first[1] == 11 && second[1] == 84;
}
*/
import "C"
import "fmt"

//export go_twice
func go_twice(value C.int64_t) C.int64_t { return value * 2 }
func main() {
    packet := C.struct_Packet{count: 35, score: 1.25}
    C.interop_update(&packet)
    if C.interop_add(4294967296, -7) != 4294967289 { panic("int64") }
    if C.interop_scale(2.5) != 3.75 { panic("float32") }
    if packet.count != 42 || packet.score != 2.5 { panic("struct pointer") }
    if C.run_go_callback() != 41 { panic("callback") }
    if C.check_rows() != 1 { panic("nested array pointers") }
    fmt.Println("interop-ok")
}
