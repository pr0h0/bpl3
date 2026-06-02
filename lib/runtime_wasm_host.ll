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
@.str.null = private unnamed_addr constant [7 x i8] c"(null)\00", align 1

declare void @__bpl_host_write(i32, i8*, i32)
declare void @__bpl_host_exit(i32)
declare i32 @__bpl_host_argc()
declare i32 @__bpl_host_argv_len(i32)
declare void @__bpl_host_argv_copy(i32, i8*)
declare void @__bpl_host_error(i32, i8*, i8*, i32, i32)

declare i8* @malloc(i64)
declare i64 @__bpl_strlen(i8*)
declare void @llvm.va_start(i8*)
declare void @llvm.va_end(i8*)

define i32 @printf(i8* %fmt, ...) {
entry:
  %ap = alloca i8*
  %ap_i8 = bitcast i8** %ap to i8*
  call void @llvm.va_start(i8* %ap_i8)
  %written = call i32 @__bpl_host_vformat(i32 1, i8* %fmt, i8** %ap)
  call void @llvm.va_end(i8* %ap_i8)
  ret i32 %written
}

define i32 @fprintf(%struct._IO_FILE* %stream, i8* %fmt, ...) {
entry:
  %ap = alloca i8*
  %ap_i8 = bitcast i8** %ap to i8*
  call void @llvm.va_start(i8* %ap_i8)
  %written = call i32 @__bpl_host_vformat(i32 2, i8* %fmt, i8** %ap)
  call void @llvm.va_end(i8* %ap_i8)
  ret i32 %written
}

define i32 @dprintf(i32 %fd, i8* %fmt, ...) {
entry:
  %ap = alloca i8*
  %ap_i8 = bitcast i8** %ap to i8*
  call void @llvm.va_start(i8* %ap_i8)
  %written = call i32 @__bpl_host_vformat(i32 %fd, i8* %fmt, i8** %ap)
  call void @llvm.va_end(i8* %ap_i8)
  ret i32 %written
}

define internal i32 @__bpl_host_vformat(i32 %fd, i8* %fmt, i8** %ap) {
entry:
  br label %scan

scan:
  %cursor = phi i8* [ %fmt, %entry ], [ %next_cursor, %literal ], [ %next_segment_start, %format_done ]
  %segment_start = phi i8* [ %fmt, %entry ], [ %segment_start, %literal ], [ %next_segment_start, %format_done ]
  %written = phi i32 [ 0, %entry ], [ %written, %literal ], [ %written_after_format, %format_done ]
  %ch = load i8, i8* %cursor
  %is_end = icmp eq i8 %ch, 0
  br i1 %is_end, label %finish, label %check_percent

check_percent:
  %is_percent = icmp eq i8 %ch, 37
  br i1 %is_percent, label %format_start, label %literal

literal:
  %next_cursor = getelementptr i8, i8* %cursor, i32 1
  br label %scan

finish:
  %tail_len = call i32 @__bpl_host_write_span(i32 %fd, i8* %segment_start, i8* %cursor)
  %written_total = add i32 %written, %tail_len
  ret i32 %written_total

format_start:
  %segment_len = call i32 @__bpl_host_write_span(i32 %fd, i8* %segment_start, i8* %cursor)
  %written_with_segment = add i32 %written, %segment_len
  %spec_ptr = getelementptr i8, i8* %cursor, i32 1
  %spec = load i8, i8* %spec_ptr
  %spec_is_end = icmp eq i8 %spec, 0
  br i1 %spec_is_end, label %dangling_percent, label %dispatch

dangling_percent:
  call void @__bpl_host_write(i32 %fd, i8* %cursor, i32 1)
  %written_dangling = add i32 %written_with_segment, 1
  ret i32 %written_dangling

dispatch:
  switch i8 %spec, label %unsupported [
    i8 37, label %format_percent
    i8 100, label %format_decimal
    i8 102, label %format_float
    i8 115, label %format_string
    i8 99, label %format_char
    i8 46, label %format_precision
  ]

format_percent:
  call void @__bpl_host_write(i32 %fd, i8* %cursor, i32 1)
  %written_percent = add i32 %written_with_segment, 1
  %percent_after = getelementptr i8, i8* %spec_ptr, i32 1
  br label %format_done

format_decimal:
  %decimal_value = call i32 @__bpl_host_next_i32(i8** %ap)
  %decimal_len = call i32 @__bpl_host_write_i32_decimal(i32 %fd, i32 %decimal_value)
  %written_decimal = add i32 %written_with_segment, %decimal_len
  %decimal_after = getelementptr i8, i8* %spec_ptr, i32 1
  br label %format_done

format_string:
  %string_value = call i8* @__bpl_host_next_ptr(i8** %ap)
  %string_len = call i32 @__bpl_host_write_cstr(i32 %fd, i8* %string_value)
  %written_string = add i32 %written_with_segment, %string_len
  %string_after = getelementptr i8, i8* %spec_ptr, i32 1
  br label %format_done

format_char:
  %char_value = call i32 @__bpl_host_next_i32(i8** %ap)
  %char_len = call i32 @__bpl_host_write_char(i32 %fd, i32 %char_value)
  %written_char = add i32 %written_with_segment, %char_len
  %char_after = getelementptr i8, i8* %spec_ptr, i32 1
  br label %format_done

format_float:
  %float_value = call double @__bpl_host_next_f64(i8** %ap)
  %float_len = call i32 @__bpl_host_write_f64_fixed(i32 %fd, double %float_value, i32 6)
  %written_float = add i32 %written_with_segment, %float_len
  %float_after = getelementptr i8, i8* %spec_ptr, i32 1
  br label %format_done

format_precision:
  %precision_digit_ptr = getelementptr i8, i8* %spec_ptr, i32 1
  %precision_digit = load i8, i8* %precision_digit_ptr
  %precision_spec_ptr = getelementptr i8, i8* %precision_digit_ptr, i32 1
  %precision_spec = load i8, i8* %precision_spec_ptr
  %precision_digit_min = icmp uge i8 %precision_digit, 48
  %precision_digit_max = icmp ule i8 %precision_digit, 57
  %precision_is_digit = and i1 %precision_digit_min, %precision_digit_max
  %precision_is_float = icmp eq i8 %precision_spec, 102
  %precision_is_supported = and i1 %precision_is_digit, %precision_is_float
  br i1 %precision_is_supported, label %format_precision_float, label %unsupported

format_precision_float:
  %precision_digit32 = zext i8 %precision_digit to i32
  %precision_value = sub i32 %precision_digit32, 48
  %precision_float_value = call double @__bpl_host_next_f64(i8** %ap)
  %precision_float_len = call i32 @__bpl_host_write_f64_fixed(i32 %fd, double %precision_float_value, i32 %precision_value)
  %written_precision_float = add i32 %written_with_segment, %precision_float_len
  %precision_float_after = getelementptr i8, i8* %precision_spec_ptr, i32 1
  br label %format_done

unsupported:
  %unsupported_after = getelementptr i8, i8* %spec_ptr, i32 1
  %unsupported_len = call i32 @__bpl_host_write_span(i32 %fd, i8* %cursor, i8* %unsupported_after)
  %written_unsupported = add i32 %written_with_segment, %unsupported_len
  br label %format_done

format_done:
  %next_segment_start = phi i8* [ %percent_after, %format_percent ], [ %decimal_after, %format_decimal ], [ %string_after, %format_string ], [ %char_after, %format_char ], [ %float_after, %format_float ], [ %precision_float_after, %format_precision_float ], [ %unsupported_after, %unsupported ]
  %written_after_format = phi i32 [ %written_percent, %format_percent ], [ %written_decimal, %format_decimal ], [ %written_string, %format_string ], [ %written_char, %format_char ], [ %written_float, %format_float ], [ %written_precision_float, %format_precision_float ], [ %written_unsupported, %unsupported ]
  br label %scan
}

define internal i32 @__bpl_host_write_span(i32 %fd, i8* %start, i8* %end) {
entry:
  %start_int = ptrtoint i8* %start to i32
  %end_int = ptrtoint i8* %end to i32
  %len = sub i32 %end_int, %start_int
  %has_bytes = icmp sgt i32 %len, 0
  br i1 %has_bytes, label %write_bytes, label %done

write_bytes:
  call void @__bpl_host_write(i32 %fd, i8* %start, i32 %len)
  br label %done

done:
  %result = phi i32 [ %len, %write_bytes ], [ 0, %entry ]
  ret i32 %result
}

define internal i32 @__bpl_host_write_cstr(i32 %fd, i8* %value) {
entry:
  %is_null = icmp eq i8* %value, null
  br i1 %is_null, label %write_null, label %write_value

write_null:
  %null_ptr = getelementptr inbounds [7 x i8], [7 x i8]* @.str.null, i64 0, i64 0
  call void @__bpl_host_write(i32 %fd, i8* %null_ptr, i32 6)
  ret i32 6

write_value:
  %len64 = call i64 @__bpl_strlen(i8* %value)
  %len32 = trunc i64 %len64 to i32
  call void @__bpl_host_write(i32 %fd, i8* %value, i32 %len32)
  ret i32 %len32
}

define internal i32 @__bpl_host_write_char(i32 %fd, i32 %value) {
entry:
  %slot = alloca i8
  %byte = trunc i32 %value to i8
  store i8 %byte, i8* %slot
  call void @__bpl_host_write(i32 %fd, i8* %slot, i32 1)
  ret i32 1
}

define internal i32 @__bpl_host_write_i32_decimal(i32 %fd, i32 %value) {
entry:
  %buffer = alloca [21 x i8], align 1
  %end = getelementptr inbounds [21 x i8], [21 x i8]* %buffer, i32 0, i32 20
  %value64 = sext i32 %value to i64
  %negative = icmp slt i64 %value64, 0
  br i1 %negative, label %negative_value, label %nonnegative_value

negative_value:
  %negative_magnitude = sub i64 0, %value64
  br label %digits_entry

nonnegative_value:
  br label %digits_entry

digits_entry:
  %magnitude = phi i64 [ %negative_magnitude, %negative_value ], [ %value64, %nonnegative_value ]
  %is_zero = icmp eq i64 %magnitude, 0
  br i1 %is_zero, label %zero_digit, label %digit_loop

zero_digit:
  %zero_ptr = getelementptr i8, i8* %end, i32 -1
  store i8 48, i8* %zero_ptr, align 1
  br label %digits_done

digit_loop:
  %current = phi i64 [ %magnitude, %digits_entry ], [ %quotient, %digit_continue ]
  %cursor = phi i8* [ %end, %digits_entry ], [ %next_digit_ptr, %digit_continue ]
  %quotient = udiv i64 %current, 10
  %remainder = urem i64 %current, 10
  %remainder32 = trunc i64 %remainder to i32
  %digit32 = add i32 %remainder32, 48
  %digit = trunc i32 %digit32 to i8
  %next_digit_ptr = getelementptr i8, i8* %cursor, i32 -1
  store i8 %digit, i8* %next_digit_ptr, align 1
  %has_more_digits = icmp ne i64 %quotient, 0
  br i1 %has_more_digits, label %digit_continue, label %digits_done

digit_continue:
  br label %digit_loop

digits_done:
  %digit_start = phi i8* [ %zero_ptr, %zero_digit ], [ %next_digit_ptr, %digit_loop ]
  br i1 %negative, label %add_minus, label %write_decimal

add_minus:
  %minus_ptr = getelementptr i8, i8* %digit_start, i32 -1
  store i8 45, i8* %minus_ptr, align 1
  br label %write_decimal

write_decimal:
  %start = phi i8* [ %digit_start, %digits_done ], [ %minus_ptr, %add_minus ]
  %start_int = ptrtoint i8* %start to i32
  %end_int = ptrtoint i8* %end to i32
  %len = sub i32 %end_int, %start_int
  call void @__bpl_host_write(i32 %fd, i8* %start, i32 %len)
  ret i32 %len
}

define internal i32 @__bpl_host_write_i32_decimal_padded(i32 %fd, i32 %value, i32 %width) {
entry:
  %buffer = alloca [16 x i8], align 1
  %end = getelementptr inbounds [16 x i8], [16 x i8]* %buffer, i32 0, i32 16
  br label %digit_loop

digit_loop:
  %remaining = phi i32 [ %width, %entry ], [ %remaining_next, %digit_body ]
  %current = phi i32 [ %value, %entry ], [ %quotient, %digit_body ]
  %cursor = phi i8* [ %end, %entry ], [ %next_digit_ptr, %digit_body ]
  %done = icmp eq i32 %remaining, 0
  br i1 %done, label %write_digits, label %digit_body

digit_body:
  %quotient = udiv i32 %current, 10
  %remainder = urem i32 %current, 10
  %digit32 = add i32 %remainder, 48
  %digit = trunc i32 %digit32 to i8
  %next_digit_ptr = getelementptr i8, i8* %cursor, i32 -1
  store i8 %digit, i8* %next_digit_ptr, align 1
  %remaining_next = add i32 %remaining, -1
  br label %digit_loop

write_digits:
  %has_digits = icmp sgt i32 %width, 0
  br i1 %has_digits, label %write_nonempty, label %done_empty

write_nonempty:
  call void @__bpl_host_write(i32 %fd, i8* %cursor, i32 %width)
  ret i32 %width

done_empty:
  ret i32 0
}

define internal i32 @__bpl_host_write_f64_fixed(i32 %fd, double %value, i32 %precision) {
entry:
  %precision_negative = icmp slt i32 %precision, 0
  %precision_nonnegative = select i1 %precision_negative, i32 0, i32 %precision
  %precision_too_high = icmp sgt i32 %precision_nonnegative, 9
  %safe_precision = select i1 %precision_too_high, i32 9, i32 %precision_nonnegative
  %is_negative = fcmp olt double %value, 0.000000e+00
  br i1 %is_negative, label %negative_value, label %nonnegative_value

negative_value:
  %negative_magnitude = fsub double -0.000000e+00, %value
  br label %scale_entry

nonnegative_value:
  br label %scale_entry

scale_entry:
  %magnitude = phi double [ %negative_magnitude, %negative_value ], [ %value, %nonnegative_value ]
  br label %scale_loop

scale_loop:
  %scale = phi i32 [ 1, %scale_entry ], [ %next_scale, %scale_body ]
  %scale_index = phi i32 [ 0, %scale_entry ], [ %next_scale_index, %scale_body ]
  %scale_done = icmp eq i32 %scale_index, %safe_precision
  br i1 %scale_done, label %round_value, label %scale_body

scale_body:
  %next_scale = mul i32 %scale, 10
  %next_scale_index = add i32 %scale_index, 1
  br label %scale_loop

round_value:
  %scale_double = sitofp i32 %scale to double
  %scaled_value = fmul double %magnitude, %scale_double
  %rounded_value = fadd double %scaled_value, 5.000000e-01
  %scaled_integer = fptoui double %rounded_value to i64
  %scale64 = zext i32 %scale to i64
  %integer64 = udiv i64 %scaled_integer, %scale64
  %fraction64 = urem i64 %scaled_integer, %scale64
  %integer32 = trunc i64 %integer64 to i32
  %fraction32 = trunc i64 %fraction64 to i32
  br i1 %is_negative, label %write_minus, label %write_integer

write_minus:
  %minus_len = call i32 @__bpl_host_write_char(i32 %fd, i32 45)
  br label %write_integer

write_integer:
  %sign_len = phi i32 [ 0, %round_value ], [ %minus_len, %write_minus ]
  %integer_len = call i32 @__bpl_host_write_i32_decimal(i32 %fd, i32 %integer32)
  %written_integer = add i32 %sign_len, %integer_len
  %has_fraction = icmp sgt i32 %safe_precision, 0
  br i1 %has_fraction, label %write_fraction, label %done

write_fraction:
  %dot_len = call i32 @__bpl_host_write_char(i32 %fd, i32 46)
  %fraction_len = call i32 @__bpl_host_write_i32_decimal_padded(i32 %fd, i32 %fraction32, i32 %safe_precision)
  %written_with_dot = add i32 %written_integer, %dot_len
  %written_with_fraction = add i32 %written_with_dot, %fraction_len
  ret i32 %written_with_fraction

done:
  ret i32 %written_integer
}

define internal double @__bpl_host_next_f64(i8** %ap) {
entry:
  %cursor = load i8*, i8** %ap, align 4
  %cursor_int = ptrtoint i8* %cursor to i32
  %aligned_plus = add i32 %cursor_int, 7
  %aligned_int = and i32 %aligned_plus, -8
  %aligned = inttoptr i32 %aligned_int to i8*
  %next = getelementptr i8, i8* %aligned, i32 8
  store i8* %next, i8** %ap, align 4
  %value_ptr = bitcast i8* %aligned to double*
  %value = load double, double* %value_ptr, align 8
  ret double %value
}

define internal i32 @__bpl_host_next_i32(i8** %ap) {
entry:
  %cursor = load i8*, i8** %ap, align 4
  %next = getelementptr i8, i8* %cursor, i32 4
  store i8* %next, i8** %ap, align 4
  %value_ptr = bitcast i8* %cursor to i32*
  %value = load i32, i32* %value_ptr, align 4
  ret i32 %value
}

define internal i8* @__bpl_host_next_ptr(i8** %ap) {
entry:
  %cursor = load i8*, i8** %ap, align 4
  %next = getelementptr i8, i8* %cursor, i32 4
  store i8* %next, i8** %ap, align 4
  %value_ptr = bitcast i8* %cursor to i8**
  %value = load i8*, i8** %value_ptr, align 4
  ret i8* %value
}

define i32 @write(i32 %fd, i8* %buf, i32 %count) {
entry:
  call void @__bpl_host_write(i32 %fd, i8* %buf, i32 %count)
  ret i32 %count
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
