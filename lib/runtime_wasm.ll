; BPL WebAssembly Runtime Library
;
; This runtime intentionally avoids libc and WASI dependencies. It provides the
; small symbol surface emitted by the compiler so `wasm32-unknown-unknown`
; builds can produce standalone `.wasm` artifacts.

target datalayout = "e-m:e-p:32:32-i64:64-n32:64-S128"
target triple = "wasm32-unknown-unknown"

%struct.Type = type { i8* }
%struct._IO_FILE = type opaque
%struct.Dl_info = type { i8*, i8*, i8*, i8* }
%struct.DeferNode = type { i8*, i8*, %struct.DeferNode*, i64 }
%struct.ExceptionFrame = type { [32 x i64], %struct.ExceptionFrame*, %struct.DeferNode* }

@__bpl_argc_value = weak global i32 0
@__bpl_argv_value = weak global i8** null
@__bpl_stack_depth = weak global i32 0
@defer_top = weak global %struct.DeferNode* null
@exception_top = weak global %struct.ExceptionFrame* null
@exception_value = weak global i64 0
@exception_type = weak global i32 0
@stderr = weak global %struct._IO_FILE* null
@__heap_base = external global i8

@.str.Type = private unnamed_addr constant [5 x i8] c"Type\00", align 1


define linkonce_odr i8* @Type_getTypeName_Type_ptr(%struct.Type* %this) {
entry:
  ret i8* getelementptr inbounds ([5 x i8], [5 x i8]* @.str.Type, i64 0, i64 0)
}

define linkonce_odr i8* @Type_toString_Type_ptr(%struct.Type* %this) {
entry:
  %vtable_ptr_ptr = getelementptr %struct.Type, %struct.Type* %this, i32 0, i32 0
  %vtable_ptr = load i8*, i8** %vtable_ptr_ptr
  %vtable = bitcast i8* %vtable_ptr to i8**
  %func_ptr_ptr = getelementptr i8*, i8** %vtable, i32 0
  %func_ptr = load i8*, i8** %func_ptr_ptr
  %func = bitcast i8* %func_ptr to i8* (%struct.Type*)*
  %name = call i8* %func(%struct.Type* %this)
  ret i8* %name
}

define linkonce_odr void @Type_destroy_Type_ptr(%struct.Type* %this) {
entry:
  ret void
}

; The WebAssembly linker defines __heap_base after static data, stack, and
; runtime segments, so the heap starts there.
; Heap allocator. Each block has an 8-byte header before its payload: the
; payload capacity (i32) and a state word (i32) that tells allocated blocks from
; freed ones, so a double free or a pointer that never came from malloc is
; ignored rather than corrupting the free lists. Requests up to 64 KiB are
; rounded to a power of two (16 B .. 64 KiB, 13 classes) and reuse freed blocks
; of their class; larger blocks keep their size and are reused first-fit. New
; blocks come from a bump cursor that starts at __heap_base and grows linear
; memory with memory.grow; malloc returns null when memory cannot grow.
@__bpl_heap_cursor = internal global i32 0
@__bpl_heap_small_free = internal global [13 x i32] zeroinitializer
@__bpl_heap_large_free = internal global i32 0

declare i32 @llvm.wasm.memory.size.i32(i32)
declare i32 @llvm.wasm.memory.grow.i32(i32, i32)
declare i32 @llvm.ctlz.i32(i32, i1)

define internal i32 @__bpl_heap_class(i32 %capacity) {
entry:
  %minus_one = sub i32 %capacity, 1
  %leading = call i32 @llvm.ctlz.i32(i32 %minus_one, i1 false)
  %class = sub i32 28, %leading
  ret i32 %class
}

define i8* @malloc(i64 %size) {
entry:
  %too_big = icmp ugt i64 %size, 2147483392
  br i1 %too_big, label %fail, label %sized

sized:
  %size32 = trunc i64 %size to i32
  %plus_align = add i32 %size32, 7
  %aligned = and i32 %plus_align, -8
  %tiny = icmp ult i32 %aligned, 16
  %need = select i1 %tiny, i32 16, i32 %aligned
  %small = icmp ule i32 %need, 65536
  br i1 %small, label %small_class, label %large_search

small_class:
  %class = call i32 @__bpl_heap_class(i32 %need)
  %class_cap = shl i32 16, %class
  %head_ptr = getelementptr [13 x i32], [13 x i32]* @__bpl_heap_small_free, i32 0, i32 %class
  %head = load i32, i32* %head_ptr
  %has_head = icmp ne i32 %head, 0
  br i1 %has_head, label %small_reuse, label %bump

small_reuse:
  %head_next_ptr = inttoptr i32 %head to i32*
  %head_next = load i32, i32* %head_next_ptr
  store i32 %head_next, i32* %head_ptr
  br label %reuse

large_search:
  %first = load i32, i32* @__bpl_heap_large_free
  br label %large_loop

large_loop:
  %prev = phi i32 [ 0, %large_search ], [ %cur, %large_next ]
  %cur = phi i32 [ %first, %large_search ], [ %next, %large_next ]
  %at_end = icmp eq i32 %cur, 0
  br i1 %at_end, label %bump, label %large_check

large_check:
  %cur_cap_addr = sub i32 %cur, 8
  %cur_cap_ptr = inttoptr i32 %cur_cap_addr to i32*
  %cur_cap = load i32, i32* %cur_cap_ptr
  %next_ptr = inttoptr i32 %cur to i32*
  %next = load i32, i32* %next_ptr
  %fits = icmp uge i32 %cur_cap, %need
  br i1 %fits, label %large_unlink, label %large_next

large_next:
  br label %large_loop

large_unlink:
  %unlink_head = icmp eq i32 %prev, 0
  %prev_link = inttoptr i32 %prev to i32*
  %link = select i1 %unlink_head, i32* @__bpl_heap_large_free, i32* %prev_link
  store i32 %next, i32* %link
  br label %reuse

reuse:
  %block = phi i32 [ %head, %small_reuse ], [ %cur, %large_unlink ]
  %state_addr = sub i32 %block, 4
  %state_ptr = inttoptr i32 %state_addr to i32*
  store i32 -1180626676, i32* %state_ptr
  %reused = inttoptr i32 %block to i8*
  ret i8* %reused

bump:
  %capacity = phi i32 [ %class_cap, %small_class ], [ %need, %large_loop ]
  %cursor = load i32, i32* @__bpl_heap_cursor
  %needs_init = icmp eq i32 %cursor, 0
  %heap_base = ptrtoint i8* @__heap_base to i32
  %raw_start = select i1 %needs_init, i32 %heap_base, i32 %cursor
  %start_plus = add i32 %raw_start, 7
  %start = and i32 %start_plus, -8
  %start64 = zext i32 %start to i64
  %capacity64 = zext i32 %capacity to i64
  %payload64 = add i64 %start64, 8
  %end64 = add i64 %payload64, %capacity64
  %beyond_address_space = icmp ugt i64 %end64, 4294967296
  br i1 %beyond_address_space, label %fail, label %check_memory

check_memory:
  %pages = call i32 @llvm.wasm.memory.size.i32(i32 0)
  %pages64 = zext i32 %pages to i64
  %memory_end = shl i64 %pages64, 16
  %needs_growth = icmp ugt i64 %end64, %memory_end
  br i1 %needs_growth, label %grow, label %commit

grow:
  %missing = sub i64 %end64, %memory_end
  %missing_round = add i64 %missing, 65535
  %missing_pages64 = lshr i64 %missing_round, 16
  %missing_pages = trunc i64 %missing_pages64 to i32
  %grown = call i32 @llvm.wasm.memory.grow.i32(i32 0, i32 %missing_pages)
  %grow_failed = icmp eq i32 %grown, -1
  br i1 %grow_failed, label %fail, label %commit

commit:
  %end = trunc i64 %end64 to i32
  store i32 %end, i32* @__bpl_heap_cursor
  %cap_ptr = inttoptr i32 %start to i32*
  store i32 %capacity, i32* %cap_ptr
  %payload = trunc i64 %payload64 to i32
  %new_state_addr = add i32 %start, 4
  %new_state_ptr = inttoptr i32 %new_state_addr to i32*
  store i32 -1180626676, i32* %new_state_ptr
  %fresh = inttoptr i32 %payload to i8*
  ret i8* %fresh

fail:
  ret i8* null
}

define void @free(i8* %ptr) {
entry:
  %addr = ptrtoint i8* %ptr to i32
  %heap_base = ptrtoint i8* @__heap_base to i32
  %lowest = add i32 %heap_base, 8
  %below = icmp ult i32 %addr, %lowest
  %cursor = load i32, i32* @__bpl_heap_cursor
  %above = icmp uge i32 %addr, %cursor
  %outside = or i1 %below, %above
  %misaligned_bits = and i32 %addr, 7
  %misaligned = icmp ne i32 %misaligned_bits, 0
  %reject = or i1 %outside, %misaligned
  br i1 %reject, label %done, label %check_state

check_state:
  %state_addr = sub i32 %addr, 4
  %state_ptr = inttoptr i32 %state_addr to i32*
  %state = load i32, i32* %state_ptr
  %allocated = icmp eq i32 %state, -1180626676
  br i1 %allocated, label %release, label %done

release:
  store i32 -1180610322, i32* %state_ptr
  %cap_addr = sub i32 %addr, 8
  %cap_ptr = inttoptr i32 %cap_addr to i32*
  %capacity = load i32, i32* %cap_ptr
  %next_ptr = inttoptr i32 %addr to i32*
  %small = icmp ule i32 %capacity, 65536
  br i1 %small, label %release_small, label %release_large

release_small:
  %class = call i32 @__bpl_heap_class(i32 %capacity)
  %head_ptr = getelementptr [13 x i32], [13 x i32]* @__bpl_heap_small_free, i32 0, i32 %class
  %head = load i32, i32* %head_ptr
  store i32 %head, i32* %next_ptr
  store i32 %addr, i32* %head_ptr
  br label %done

release_large:
  %large_head = load i32, i32* @__bpl_heap_large_free
  store i32 %large_head, i32* %next_ptr
  store i32 %addr, i32* @__bpl_heap_large_free
  br label %done

done:
  ret void
}

define weak void @exit(i32 %code) {
entry:
  unreachable
}

define weak i32 @fprintf(%struct._IO_FILE* %stream, i8* %fmt, ...) {
entry:
  ret i32 0
}

define weak i32 @printf(i8* %fmt, ...) {
entry:
  ret i32 0
}

define weak i32 @dprintf(i32 %fd, i8* %fmt, ...) {
entry:
  ret i32 0
}

define weak i32 @sprintf(i8* %dest, i8* %fmt, ...) {
entry:
  %has_dest = icmp ne i8* %dest, null
  br i1 %has_dest, label %write_nul, label %end

write_nul:
  store i8 0, i8* %dest
  br label %end

end:
  ret i32 0
}

define weak i32 @snprintf(i8* %dest, i64 %size, i8* %fmt, ...) {
entry:
  %has_dest = icmp ne i8* %dest, null
  %has_space = icmp ugt i64 %size, 0
  %can_write = and i1 %has_dest, %has_space
  br i1 %can_write, label %write_nul, label %end

write_nul:
  store i8 0, i8* %dest
  br label %end

end:
  ret i32 0
}

define weak i32 @dladdr(i8* %addr, %struct.Dl_info* %info) {
entry:
  ret i32 0
}

; Exceptions use setjmp/longjmp. With clang 19 or newer, builds pass `-mllvm
; -wasm-enable-sjlj`, which rewrites those calls to the three `__wasm_*`
; functions below and WebAssembly exception handling (the `__c_longjmp` tag).
; Older clang uses an API that needs a 32-bit malloc, so it gets no lowering and
; these stubs run instead: `setjmp` records that exceptions are unavailable.
@__bpl_wasm_no_sjlj = internal global i1 false

define weak i32 @setjmp(i8* %buf) {
entry:
  store i1 true, i1* @__bpl_wasm_no_sjlj
  ret i32 0
}

define weak void @longjmp(i8* %buf, i32 %value) {
entry:
  unreachable
}

%struct.__bpl_wasm_jmp_buf = type { i8*, i32, i8*, i32 }

declare void @llvm.wasm.throw(i32 immarg, i8*)

define void @__wasm_setjmp(i8* %env, i32 %label, i8* %func_invocation_id) {
entry:
  %jb = bitcast i8* %env to %struct.__bpl_wasm_jmp_buf*
  %id_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 0
  store i8* %func_invocation_id, i8** %id_slot
  %label_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 1
  store i32 %label, i32* %label_slot
  ret void
}

define i32 @__wasm_setjmp_test(i8* %env, i8* %func_invocation_id) {
entry:
  %jb = bitcast i8* %env to %struct.__bpl_wasm_jmp_buf*
  %id_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 0
  %id = load i8*, i8** %id_slot
  %same_call = icmp eq i8* %id, %func_invocation_id
  br i1 %same_call, label %found, label %not_found

found:
  %label_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 1
  %label = load i32, i32* %label_slot
  ret i32 %label

not_found:
  ret i32 0
}

define void @__wasm_longjmp(i8* %env, i32 %value) {
entry:
  %jb = bitcast i8* %env to %struct.__bpl_wasm_jmp_buf*
  %env_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 2
  store i8* %env, i8** %env_slot
  %value_slot = getelementptr inbounds %struct.__bpl_wasm_jmp_buf, %struct.__bpl_wasm_jmp_buf* %jb, i32 0, i32 3
  %is_zero = icmp eq i32 %value, 0
  %thrown = select i1 %is_zero, i32 1, i32 %value
  store i32 %thrown, i32* %value_slot
  %arg = bitcast i8** %env_slot to i8*
  call void @llvm.wasm.throw(i32 1, i8* %arg)
  unreachable
}

define weak i32 @__bpl_argc() {
entry:
  %argc = load i32, i32* @__bpl_argc_value
  ret i32 %argc
}

define weak i8* @__bpl_argv_get(i32 %index) {
entry:
  %argv = load i8**, i8*** @__bpl_argv_value
  %has_argv = icmp ne i8** %argv, null
  br i1 %has_argv, label %load_arg, label %missing

load_arg:
  %slot = getelementptr i8*, i8** %argv, i32 %index
  %arg = load i8*, i8** %slot
  ret i8* %arg

missing:
  ret i8* null
}

define i1 @__bpl_mem_is_zero(i8* %ptr, i64 %n) {
entry:
  %end = getelementptr i8, i8* %ptr, i64 %n
  br label %loop

loop:
  %curr = phi i8* [ %ptr, %entry ], [ %next, %cont ]
  %done = icmp eq i8* %curr, %end
  br i1 %done, label %ret_true, label %check

check:
  %byte = load i8, i8* %curr
  %is_nonzero = icmp ne i8 %byte, 0
  br i1 %is_nonzero, label %ret_false, label %cont

cont:
  %next = getelementptr i8, i8* %curr, i64 1
  br label %loop

ret_true:
  ret i1 1

ret_false:
  ret i1 0
}

define i8* @memcpy(i8* %dest, i8* %src, i32 %n) {
entry:
  br label %loop

loop:
  %i = phi i32 [ 0, %entry ], [ %next, %copy ]
  %done = icmp eq i32 %i, %n
  br i1 %done, label %end, label %copy

copy:
  %src_ptr = getelementptr i8, i8* %src, i32 %i
  %dest_ptr = getelementptr i8, i8* %dest, i32 %i
  %byte = load i8, i8* %src_ptr
  store i8 %byte, i8* %dest_ptr
  %next = add i32 %i, 1
  br label %loop

end:
  ret i8* %dest
}

define i8* @memmove(i8* %dest, i8* %src, i32 %n) {
entry:
  %dest_addr = ptrtoint i8* %dest to i32
  %src_addr = ptrtoint i8* %src to i32
  %src_end = add i32 %src_addr, %n
  %dest_before_src = icmp ult i32 %dest_addr, %src_addr
  %dest_after_src = icmp uge i32 %dest_addr, %src_end
  %copy_forward = or i1 %dest_before_src, %dest_after_src
  br i1 %copy_forward, label %forward_loop, label %backward_loop

forward_loop:
  %forward_i = phi i32 [ 0, %entry ], [ %forward_next, %forward_copy ]
  %forward_done = icmp eq i32 %forward_i, %n
  br i1 %forward_done, label %end, label %forward_copy

forward_copy:
  %forward_src_ptr = getelementptr i8, i8* %src, i32 %forward_i
  %forward_dest_ptr = getelementptr i8, i8* %dest, i32 %forward_i
  %forward_byte = load i8, i8* %forward_src_ptr
  store i8 %forward_byte, i8* %forward_dest_ptr
  %forward_next = add i32 %forward_i, 1
  br label %forward_loop

backward_loop:
  %backward_i = phi i32 [ %n, %entry ], [ %backward_next, %backward_copy ]
  %backward_done = icmp eq i32 %backward_i, 0
  br i1 %backward_done, label %end, label %backward_copy

backward_copy:
  %backward_next = sub i32 %backward_i, 1
  %backward_src_ptr = getelementptr i8, i8* %src, i32 %backward_next
  %backward_dest_ptr = getelementptr i8, i8* %dest, i32 %backward_next
  %backward_byte = load i8, i8* %backward_src_ptr
  store i8 %backward_byte, i8* %backward_dest_ptr
  br label %backward_loop

end:
  ret i8* %dest
}

define i8* @memset(i8* %dest, i32 %value, i32 %n) {
entry:
  %byte = trunc i32 %value to i8
  br label %loop

loop:
  %i = phi i32 [ 0, %entry ], [ %next, %store ]
  %done = icmp eq i32 %i, %n
  br i1 %done, label %end, label %store

store:
  %dest_ptr = getelementptr i8, i8* %dest, i32 %i
  store i8 %byte, i8* %dest_ptr
  %next = add i32 %i, 1
  br label %loop

end:
  ret i8* %dest
}

define i32 @memcmp(i8* %left, i8* %right, i64 %n) {
entry:
  br label %loop

loop:
  %i = phi i64 [ 0, %entry ], [ %next, %same ]
  %done = icmp eq i64 %i, %n
  br i1 %done, label %equal, label %compare

compare:
  %left_ptr = getelementptr i8, i8* %left, i64 %i
  %right_ptr = getelementptr i8, i8* %right, i64 %i
  %left_byte = load i8, i8* %left_ptr
  %right_byte = load i8, i8* %right_ptr
  %differs = icmp ne i8 %left_byte, %right_byte
  br i1 %differs, label %different, label %same

same:
  %next = add i64 %i, 1
  br label %loop

different:
  %left_ext = zext i8 %left_byte to i32
  %right_ext = zext i8 %right_byte to i32
  %diff = sub i32 %left_ext, %right_ext
  ret i32 %diff

equal:
  ret i32 0
}

define i32 @strcmp(i8* %left, i8* %right) {
entry:
  br label %loop

loop:
  %i = phi i32 [ 0, %entry ], [ %next, %same ]
  %left_ptr = getelementptr i8, i8* %left, i32 %i
  %right_ptr = getelementptr i8, i8* %right, i32 %i
  %left_byte = load i8, i8* %left_ptr
  %right_byte = load i8, i8* %right_ptr
  %differs = icmp ne i8 %left_byte, %right_byte
  br i1 %differs, label %different, label %check_end

check_end:
  %done = icmp eq i8 %left_byte, 0
  br i1 %done, label %equal, label %same

same:
  %next = add i32 %i, 1
  br label %loop

different:
  %left_ext = zext i8 %left_byte to i32
  %right_ext = zext i8 %right_byte to i32
  %diff = sub i32 %left_ext, %right_ext
  ret i32 %diff

equal:
  ret i32 0
}

define i32 @strncmp(i8* %left, i8* %right, i64 %n) {
entry:
  %is_empty = icmp eq i64 %n, 0
  br i1 %is_empty, label %equal, label %loop

loop:
  %i = phi i64 [ 0, %entry ], [ %next, %same ]
  %left_ptr = getelementptr i8, i8* %left, i64 %i
  %right_ptr = getelementptr i8, i8* %right, i64 %i
  %left_byte = load i8, i8* %left_ptr
  %right_byte = load i8, i8* %right_ptr
  %differs = icmp ne i8 %left_byte, %right_byte
  br i1 %differs, label %different, label %check_end

check_end:
  %done_string = icmp eq i8 %left_byte, 0
  br i1 %done_string, label %equal, label %same

same:
  %next = add i64 %i, 1
  %done_count = icmp eq i64 %next, %n
  br i1 %done_count, label %equal, label %loop

different:
  %left_ext = zext i8 %left_byte to i32
  %right_ext = zext i8 %right_byte to i32
  %diff = sub i32 %left_ext, %right_ext
  ret i32 %diff

equal:
  ret i32 0
}

define i64 @__bpl_strlen(i8* %ptr) {
entry:
  br label %loop

loop:
  %i = phi i64 [ 0, %entry ], [ %next, %cont ]
  %curr = getelementptr i8, i8* %ptr, i64 %i
  %byte = load i8, i8* %curr
  %done = icmp eq i8 %byte, 0
  br i1 %done, label %end, label %cont

cont:
  %next = add i64 %i, 1
  br label %loop

end:
  ret i64 %i
}

define i32 @strlen(i8* %ptr) {
entry:
  %len = call i64 @__bpl_strlen(i8* %ptr)
  %len32 = trunc i64 %len to i32
  ret i32 %len32
}

define i8* @strcpy(i8* %dest, i8* %src) {
entry:
  br label %loop

loop:
  %i = phi i64 [ 0, %entry ], [ %next, %continue ]
  %src_ptr = getelementptr i8, i8* %src, i64 %i
  %dest_ptr = getelementptr i8, i8* %dest, i64 %i
  %byte = load i8, i8* %src_ptr
  store i8 %byte, i8* %dest_ptr
  %done = icmp eq i8 %byte, 0
  br i1 %done, label %end, label %continue

continue:
  %next = add i64 %i, 1
  br label %loop

end:
  ret i8* %dest
}

define i8* @strcat(i8* %dest, i8* %src) {
entry:
  br label %find_end

find_end:
  %dest_index = phi i64 [ 0, %entry ], [ %next_dest_index, %find_next ]
  %dest_ptr = getelementptr i8, i8* %dest, i64 %dest_index
  %dest_byte = load i8, i8* %dest_ptr
  %at_end = icmp eq i8 %dest_byte, 0
  br i1 %at_end, label %copy_loop, label %find_next

find_next:
  %next_dest_index = add i64 %dest_index, 1
  br label %find_end

copy_loop:
  %src_index = phi i64 [ 0, %find_end ], [ %next_src_index, %copy_next ]
  %offset = add i64 %dest_index, %src_index
  %copy_dest_ptr = getelementptr i8, i8* %dest, i64 %offset
  %src_ptr = getelementptr i8, i8* %src, i64 %src_index
  %byte = load i8, i8* %src_ptr
  store i8 %byte, i8* %copy_dest_ptr
  %done = icmp eq i8 %byte, 0
  br i1 %done, label %end, label %copy_next

copy_next:
  %next_src_index = add i64 %src_index, 1
  br label %copy_loop

end:
  ret i8* %dest
}

define i32 @atoi(i8* %str) {
entry:
  br label %skip_ws

skip_ws:
  %ws_index = phi i64 [ 0, %entry ], [ %next_ws_index, %skip_next ]
  %ws_ptr = getelementptr i8, i8* %str, i64 %ws_index
  %ws_byte = load i8, i8* %ws_ptr
  %is_space = icmp eq i8 %ws_byte, 32
  %is_tab = icmp eq i8 %ws_byte, 9
  %is_lf = icmp eq i8 %ws_byte, 10
  %is_cr = icmp eq i8 %ws_byte, 13
  %is_vtab = icmp eq i8 %ws_byte, 11
  %is_form_feed = icmp eq i8 %ws_byte, 12
  %ws_a = or i1 %is_space, %is_tab
  %ws_b = or i1 %is_lf, %is_cr
  %ws_c = or i1 %is_vtab, %is_form_feed
  %ws_ab = or i1 %ws_a, %ws_b
  %is_ws = or i1 %ws_ab, %ws_c
  br i1 %is_ws, label %skip_next, label %sign

skip_next:
  %next_ws_index = add i64 %ws_index, 1
  br label %skip_ws

sign:
  %is_minus = icmp eq i8 %ws_byte, 45
  br i1 %is_minus, label %minus, label %plus_check

minus:
  %minus_start = add i64 %ws_index, 1
  br label %parse

plus_check:
  %is_plus = icmp eq i8 %ws_byte, 43
  br i1 %is_plus, label %plus, label %parse

plus:
  %plus_start = add i64 %ws_index, 1
  br label %parse

parse:
  %index = phi i64 [ %minus_start, %minus ], [ %plus_start, %plus ], [ %ws_index, %plus_check ]
  %sign_value = phi i32 [ -1, %minus ], [ 1, %plus ], [ 1, %plus_check ]
  br label %digits

digits:
  %digit_index = phi i64 [ %index, %parse ], [ %next_digit_index, %accumulate ]
  %acc = phi i32 [ 0, %parse ], [ %next_acc, %accumulate ]
  %digit_ptr = getelementptr i8, i8* %str, i64 %digit_index
  %digit_byte = load i8, i8* %digit_ptr
  %at_least_zero = icmp uge i8 %digit_byte, 48
  %at_most_nine = icmp ule i8 %digit_byte, 57
  %is_digit = and i1 %at_least_zero, %at_most_nine
  br i1 %is_digit, label %accumulate, label %done

accumulate:
  %digit_raw = sub i8 %digit_byte, 48
  %digit_value = zext i8 %digit_raw to i32
  %times_ten = mul i32 %acc, 10
  %next_acc = add i32 %times_ten, %digit_value
  %next_digit_index = add i64 %digit_index, 1
  br label %digits

done:
  %result = mul i32 %acc, %sign_value
  ret i32 %result
}

; Returns 1 when the call would exceed the depth limit; generated code then
; calls the BPL throw helper from lib/errors.bpl.
define i1 @__bpl_enter_stack_frame() {
entry:
  %depth = load i32, i32* @__bpl_stack_depth
  %next = add i32 %depth, 1
  store i32 %next, i32* @__bpl_stack_depth
  %overflow = icmp sgt i32 %next, 1048576
  ret i1 %overflow
}

define void @__bpl_exit_stack_frame() {
entry:
  %depth = load i32, i32* @__bpl_stack_depth
  %next = sub i32 %depth, 1
  store i32 %next, i32* @__bpl_stack_depth
  ret void
}

define weak void @__bpl_report_error(i32 %code, i8* %detail, i8* %func, i32 %line, i32 %col) {
entry:
  ret void
}

; With a handler active, runtime checks throw instead of reporting and trapping,
; unless the `setjmp` stub above ran because exceptions are unavailable.
define i1 @__bpl_has_exception_handler() {
entry:
  %top = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top
  %has_top = icmp ne %struct.ExceptionFrame* %top, null
  %no_sjlj = load i1, i1* @__bpl_wasm_no_sjlj
  %has_sjlj = xor i1 %no_sjlj, true
  %has_handler = and i1 %has_top, %has_sjlj
  ret i1 %has_handler
}

define void @__bpl_panic_null_access(i8* %func, i8* %expr, i32 %line, i32 %col) {
entry:
  call void @__bpl_report_error(i32 2, i8* %expr, i8* %func, i32 %line, i32 %col)
  unreachable
}

define void @__bpl_panic_index_out_of_bounds(i32 %index, i32 %size, i8* %func, i32 %line, i32 %col) {
entry:
  call void @__bpl_report_error(i32 5, i8* null, i8* %func, i32 %line, i32 %col)
  unreachable
}

define void @__bpl_panic_division_by_zero(i8* %func, i32 %line, i32 %col) {
entry:
  call void @__bpl_report_error(i32 3, i8* null, i8* %func, i32 %line, i32 %col)
  unreachable
}

define void @__bpl_panic_stack_overflow() {
entry:
  call void @__bpl_report_error(i32 1, i8* null, i8* null, i32 0, i32 0)
  unreachable
}

define void @__bpl_throw_integer_overflow(i8* %func, i32 %line, i32 %col) {
entry:
  call void @__bpl_report_error(i32 4, i8* null, i8* %func, i32 %line, i32 %col)
  unreachable
}

; Freestanding builds have no output host. Hosted builds override this writer.
define weak void @__bpl_write_stderr(i8* %message) {
entry:
  ret void
}
