; BPL WebAssembly host adapter.
;
; Link this in addition to runtime_wasm.ll when the module should talk to a
; browser, WASI-style, or test harness host through simple imported hooks.

target datalayout = "e-m:e-p:32:32-i64:64-n32:64-S128"
target triple = "wasm32-unknown-unknown"

%struct._IO_FILE = type opaque

@__bpl_argc_value = external global i32
@__bpl_argv_value = external global i8**
@.str.newline = private unnamed_addr constant [2 x i8] c"\0A\00", align 1

declare void @__bpl_host_write(i32, i8*, i32)
declare void @__bpl_host_exit(i32)
declare i32 @__bpl_host_argc()
declare i32 @__bpl_host_argv_len(i32)
declare void @__bpl_host_argv_copy(i32, i8*)
declare void @__bpl_host_error(i32, i8*, i8*, i32, i32)

declare i8* @malloc(i64)
declare i64 @__bpl_strlen(i8*)

define i32 @printf(i8* %fmt, ...) {
entry:
  %len64 = call i64 @__bpl_strlen(i8* %fmt)
  %len32 = trunc i64 %len64 to i32
  call void @__bpl_host_write(i32 1, i8* %fmt, i32 %len32)
  ret i32 %len32
}

define i32 @fprintf(%struct._IO_FILE* %stream, i8* %fmt, ...) {
entry:
  %len64 = call i64 @__bpl_strlen(i8* %fmt)
  %len32 = trunc i64 %len64 to i32
  call void @__bpl_host_write(i32 2, i8* %fmt, i32 %len32)
  ret i32 %len32
}

define i32 @puts(i8* %value) {
entry:
  %len64 = call i64 @__bpl_strlen(i8* %value)
  %len32 = trunc i64 %len64 to i32
  call void @__bpl_host_write(i32 1, i8* %value, i32 %len32)
  call void @__bpl_host_write(i32 1, i8* getelementptr inbounds ([2 x i8], [2 x i8]* @.str.newline, i64 0, i64 0), i32 1)
  ret i32 0
}

define i32 @putchar(i32 %value) {
entry:
  %slot = alloca i8
  %byte = trunc i32 %value to i8
  store i8 %byte, i8* %slot
  call void @__bpl_host_write(i32 1, i8* %slot, i32 1)
  ret i32 %value
}

define void @exit(i32 %code) {
entry:
  call void @__bpl_host_exit(i32 %code)
  unreachable
}

define i32 @__bpl_argc() {
entry:
  %stored = load i32, i32* @__bpl_argc_value
  %has_stored = icmp sgt i32 %stored, 0
  br i1 %has_stored, label %use_stored, label %use_host

use_stored:
  ret i32 %stored

use_host:
  %argc = call i32 @__bpl_host_argc()
  ret i32 %argc
}

define i8* @__bpl_argv_get(i32 %index) {
entry:
  %argv = load i8**, i8*** @__bpl_argv_value
  %has_argv = icmp ne i8** %argv, null
  br i1 %has_argv, label %load_arg, label %load_host_arg

load_arg:
  %slot = getelementptr i8*, i8** %argv, i32 %index
  %arg = load i8*, i8** %slot
  ret i8* %arg

load_host_arg:
  %len = call i32 @__bpl_host_argv_len(i32 %index)
  %missing = icmp slt i32 %len, 0
  br i1 %missing, label %missing_arg, label %copy_arg

copy_arg:
  %len_plus_nul = add i32 %len, 1
  %alloc_size = zext i32 %len_plus_nul to i64
  %buffer = call i8* @malloc(i64 %alloc_size)
  call void @__bpl_host_argv_copy(i32 %index, i8* %buffer)
  %nul_ptr = getelementptr i8, i8* %buffer, i32 %len
  store i8 0, i8* %nul_ptr
  ret i8* %buffer

missing_arg:
  ret i8* null
}

define void @__bpl_report_error(i32 %code, i8* %detail, i8* %func, i32 %line, i32 %col) {
entry:
  call void @__bpl_host_error(i32 %code, i8* %detail, i8* %func, i32 %line, i32 %col)
  ret void
}
