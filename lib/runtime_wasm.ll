; BPL WebAssembly Runtime Library
;
; This runtime intentionally avoids libc and WASI dependencies. It provides the
; small symbol surface emitted by the compiler so `wasm32-unknown-unknown`
; builds can produce standalone `.wasm` artifacts.

target datalayout = "e-m:e-p:32:32-i64:64-n32:64-S128"
target triple = "wasm32-unknown-unknown"

%struct.Type = type { i8* }
%struct._IO_FILE = type opaque
%struct.DeferNode = type { i8*, i8*, %struct.DeferNode* }
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

; The WebAssembly linker defines __heap_base after static data, stack, and
; runtime segments. Start the bump allocator there instead of guessing a fixed
; address; small standalone modules may have less than 1 MiB of initial memory.
@__bpl_heap_cursor = internal global i32 0

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

define i8* @malloc(i64 %size) {
entry:
  %size32 = trunc i64 %size to i32
  %plus_align = add i32 %size32, 7
  %aligned = and i32 %plus_align, -8
  %cursor = load i32, i32* @__bpl_heap_cursor
  %needs_init = icmp eq i32 %cursor, 0
  %heap_base = ptrtoint i8* @__heap_base to i32
  %old = select i1 %needs_init, i32 %heap_base, i32 %cursor
  %new = add i32 %old, %aligned
  store i32 %new, i32* @__bpl_heap_cursor
  %ptr = inttoptr i32 %old to i8*
  ret i8* %ptr
}

define void @free(i8* %ptr) {
entry:
  ret void
}

define void @exit(i32 %code) {
entry:
  unreachable
}

define i32 @fprintf(%struct._IO_FILE* %stream, i8* %fmt, ...) {
entry:
  ret i32 0
}

define i32 @setjmp(i8* %buf) {
entry:
  ret i32 0
}

define void @longjmp(i8* %buf, i32 %value) {
entry:
  unreachable
}

define i32 @__bpl_argc() {
entry:
  %argc = load i32, i32* @__bpl_argc_value
  ret i32 %argc
}

define i8* @__bpl_argv_get(i32 %index) {
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

define i64 @strlen(i8* %ptr) {
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

define void @__bpl_enter_stack_frame() {
entry:
  %depth = load i32, i32* @__bpl_stack_depth
  %next = add i32 %depth, 1
  store i32 %next, i32* @__bpl_stack_depth
  %overflow = icmp sgt i32 %next, 1048576
  br i1 %overflow, label %trap, label %ok

trap:
  unreachable

ok:
  ret void
}

define void @__bpl_exit_stack_frame() {
entry:
  %depth = load i32, i32* @__bpl_stack_depth
  %next = sub i32 %depth, 1
  store i32 %next, i32* @__bpl_stack_depth
  ret void
}

define void @__bpl_check_null(i8* %ptr, i8* %expr, i8* %func, i32 %line, i32 %col) {
entry:
  %is_null = icmp eq i8* %ptr, null
  br i1 %is_null, label %trap, label %ok

trap:
  unreachable

ok:
  ret void
}

define void @__bpl_throw_stack_overflow() {
entry:
  unreachable
}

define void @__bpl_throw_null_access(i8* %expr, i8* %func, i32 %line, i32 %col) {
entry:
  unreachable
}

define void @__bpl_throw_division_by_zero(i8* %func, i32 %line, i32 %col) {
entry:
  unreachable
}

define void @__bpl_throw_integer_overflow(i8* %func, i32 %line, i32 %col) {
entry:
  unreachable
}

define void @__bpl_throw_index_out_of_bounds(i32 %index, i32 %size, i8* %func, i32 %line, i32 %col) {
entry:
  unreachable
}
