package main
/*
#include "bridge.h"
extern int64_t go_twice(int64_t);
static int64_t run_go_callback(void) { return interop_run(go_twice, 20); }
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
    fmt.Println("interop-ok")
}
