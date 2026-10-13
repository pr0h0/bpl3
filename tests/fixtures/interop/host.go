package main
/*
#include "bridge.h"
#include <stddef.h>
#include <stdlib.h>
extern int64_t go_twice(int64_t);
static int64_t run_go_callback(void) { return interop_run(go_twice, 20); }
static int check_narrow_callback(void) {return interop_narrow_factory()()==-7;}
static int check_callbacks(void) { return interop_factory()(21) == 42 && interop_checked(NULL, 20) == -7; }
// Keep the pointer graph in C-owned storage for the duration of the call.
static int check_rows(void) {
    int64_t first[2] = {10, 11}, second[2] = {31, 32};
    int64_t (*rows[2])[2] = {&first, &second};
    return interop_rows(&rows) == 42 && first[1] == 11 && second[1] == 84;
}
*/
import "C"
import "fmt"
import "runtime"
import "sync"
import "unsafe"

//export go_twice
func go_twice(value C.int64_t) C.int64_t { return value * 2 }
func main() {
    packet := C.struct_bpl_Packet{count: 35, score: 1.25}
    C.interop_update(&packet)
    if C.interop_add(4294967296, -7) != 4294967289 { panic("int64") }
    if C.interop_scale(2.5) != 3.75 { panic("float32") }
    if packet.count != 42 || packet.score != 2.5 { panic("struct pointer") }
    if C.run_go_callback() != 41 { panic("callback") }
    if C.check_callbacks() != 1 { panic("returned/null callback") }
    if C.check_rows() != 1 { panic("nested array pointers") }
    text := C.CString("héλ")
    if C.interop_text_length(text) != 5 || C.GoString(C.interop_message()) != "héλ" { panic("UTF-8") }
    C.free(unsafe.Pointer(text))
    bytes := []C.uint8_t{0,127,255}
    if C.interop_buffer(&bytes[0],3) != 292 || bytes[0] != 90 || bytes[1] != 37 || bytes[2] != 165 { panic("byte buffer") }
    if C.interop_buffer(nil,0) != 0 { panic("empty buffer") }
    owned := C.interop_alloc(3)
    if owned == nil { panic("allocation") }
    view := unsafe.Slice(owned,3)
    if view[0] != 10 || view[2] != 12 { panic("owned buffer") }
    C.interop_free(owned)
    if int(C.interop_signed_byte()) != -7 || int(C.interop_signed_short()) != -300 || int(C.interop_unsigned_byte()) != 255 || int(C.interop_unsigned_short()) != 65535 || !bool(C.interop_boolean()) {panic("narrow results")}
    if C.check_narrow_callback() != 1 {panic("narrow callback result")}
    var group sync.WaitGroup
    for worker := 1; worker <= 8; worker++ {
        group.Add(1)
        go func(value int) {
            defer group.Done()
            runtime.LockOSThread()
            defer runtime.UnlockOSThread()
            for iteration := 0; iteration < 100; iteration++ {
                if C.interop_threaded(C.int64_t(value)) != C.int64_t(value*10+1) || C.run_go_callback() != 41 {panic("thread state")}
            }
        }(worker)
    }
    group.Wait()
    fmt.Println("interop-ok")
}
