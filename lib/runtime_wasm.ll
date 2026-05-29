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

@.str.Type = private unnamed_addr constant [5 x i8] c"Type\00", align 1

; Conservative bump allocator start. The linker creates linear memory and data
; segments below this address for the small standalone programs BPL currently
; supports on wasm32-unknown-unknown.
@__bpl_heap_cursor = internal global i32 1048576

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
  %old = load i32, i32* @__bpl_heap_cursor
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
