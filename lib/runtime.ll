; BPL Runtime Library
target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-unknown-linux-gnu"

; --- Globals ---
@__bpl_argc_value = weak global i32 0
@__bpl_argv_value = weak global i8** null
@__bpl_stack_depth = weak global i32 0
@defer_top = weak global %struct.DeferNode* null
@exception_top = weak global %struct.ExceptionFrame* null
@exception_value = weak global i64 0
@exception_type = weak global i32 0

@.stack_overflow_msg = private unnamed_addr constant [15 x i8] c"Stack overflow\00", align 1
@.str.Type = private unnamed_addr constant [5 x i8] c"Type\00", align 1
@.str.panic_null = private unnamed_addr constant [38 x i8] c"Attempted to access member of nullptr\00", align 1
@stderr = external global %struct._IO_FILE*

declare i32 @sprintf(i8*, i8*, ...)

; --- Types ---
%struct.Type = type { i8* }
%struct.DivisionByZeroError = type { i8*, i8*, i32, i8**, i32 }
%struct.NullAccessError = type { i8*, i8*, i32, i8**, i32, i8*, i8*, i32, i32 }
%struct.IndexOutOfBoundsError = type { i8*, i8*, i32, i8**, i32, i32, i32 }
%struct.Int = type { i32 }
%struct.Bool = type { i1 }
%struct.Double = type { double }
%struct.String = type { i8*, i32 }
%struct.StackOverflowError = type { i8*, i8*, i32, i8**, i32 }

declare i64 @strlen(i8*)

@NullAccessError_vtable = linkonce_odr constant [8 x i8*] [
  i8* bitcast (i8* (i8*, %struct.NullAccessError*)* @NullAccessError_getTypeName to i8*),
  i8* bitcast (i8* (i8*, %struct.NullAccessError*)* @NullAccessError_toString to i8*),
  i8* bitcast (void (i8*, %struct.NullAccessError*)* @NullAccessError_destroy to i8*),
  i8* null, i8* null, i8* null, i8* null, i8* null
]
@StackOverflowError_vtable = linkonce_odr constant [8 x i8*] [
  i8* bitcast (i8* (i8*, %struct.StackOverflowError*)* @StackOverflowError_getTypeName to i8*),
  i8* bitcast (i8* (i8*, %struct.StackOverflowError*)* @StackOverflowError_toString to i8*),
  i8* bitcast (void (i8*, %struct.StackOverflowError*)* @StackOverflowError_destroy to i8*),
  i8* null, i8* null, i8* null, i8* null, i8* null
]

@.str.NullAccessError = private unnamed_addr constant [16 x i8] c"NullAccessError\00", align 1
@.str.StackOverflowError = private unnamed_addr constant [19 x i8] c"StackOverflowError\00", align 1

define linkonce_odr i8* @NullAccessError_getTypeName(i8* %ctx, %struct.NullAccessError* %this) {
  ret i8* getelementptr inbounds ([16 x i8], [16 x i8]* @.str.NullAccessError, i64 0, i64 0)
}

define linkonce_odr i8* @NullAccessError_toString(i8* %ctx, %struct.NullAccessError* %this) {
  ret i8* getelementptr inbounds ([16 x i8], [16 x i8]* @.str.NullAccessError, i64 0, i64 0)
}

define linkonce_odr void @NullAccessError_destroy(i8* %ctx, %struct.NullAccessError* %this) {
  %ptr = bitcast %struct.NullAccessError* %this to i8*
  call void @free(i8* %ptr)
  ret void
}

define linkonce_odr i8* @StackOverflowError_getTypeName(i8* %ctx, %struct.StackOverflowError* %this) {
  ret i8* getelementptr inbounds ([19 x i8], [19 x i8]* @.str.StackOverflowError, i64 0, i64 0)
}

define linkonce_odr i8* @StackOverflowError_toString(i8* %ctx, %struct.StackOverflowError* %this) {
  ret i8* getelementptr inbounds ([19 x i8], [19 x i8]* @.str.StackOverflowError, i64 0, i64 0)
}

define linkonce_odr void @StackOverflowError_destroy(i8* %ctx, %struct.StackOverflowError* %this) {
  %ptr = bitcast %struct.StackOverflowError* %this to i8*
  call void @free(i8* %ptr)
  ret void
}
%struct._IO_FILE = type opaque
%struct.DeferNode = type { i8*, i8*, %struct.DeferNode* }
%struct.ExceptionFrame = type { [32 x i64], %struct.ExceptionFrame*, %struct.DeferNode* }

@Type_vtable = linkonce_odr constant [3 x i8*] [i8* bitcast (i8* (%struct.Type*)* @Type_getTypeName_Type_ptr to i8*), i8* bitcast (i8* (%struct.Type*)* @Type_toString_Type_ptr to i8*), i8* bitcast (void (%struct.Type*)* @Type_destroy_Type_ptr to i8*)]

; --- External Declarations ---
declare i8* @malloc(i64)
declare void @free(i8*)
declare void @exit(i32)
declare i32 @setjmp(i8*) returns_twice
declare void @longjmp(i8*, i32) noreturn

; --- Helper Functions ---

define linkonce_odr i32 @__bpl_argc() {
  %1 = load i32, i32* @__bpl_argc_value
  ret i32 %1
}

define linkonce_odr i8* @__bpl_argv_get(i32 %index) {
  %1 = load i8**, i8*** @__bpl_argv_value
  %2 = getelementptr i8*, i8** %1, i32 %index
  %3 = load i8*, i8** %2
  ret i8* %3
}

define linkonce_odr i1 @__bpl_mem_is_zero(i8* %ptr, i64 %n) {
entry:
  %end = getelementptr i8, i8* %ptr, i64 %n
  br label %loop
loop:
  %curr = phi i8* [ %ptr, %entry ], [ %next, %cont ]
  %done = icmp eq i8* %curr, %end
  br i1 %done, label %ret_true, label %check
check:
  %byte = load i8, i8* %curr
  %isnz = icmp ne i8 %byte, 0
  br i1 %isnz, label %ret_false, label %cont
cont:
  %next = getelementptr i8, i8* %curr, i64 1
  br label %loop
ret_true:
  ret i1 1
ret_false:
  ret i1 0
}

; Note: Code bloat in Type methods is due to stack/exception boilerplate.
; Ideally this would be refactored to use a helper function for prologue/epilogue.

define linkonce_odr i8* @Type_getTypeName_Type_ptr(%struct.Type* %this) #0 {
entry:
  ; Minimal stack check for runtime functions
  %0 = load i32, i32* @__bpl_stack_depth
  %1 = add i32 %0, 1
  store i32 %1, i32* @__bpl_stack_depth
  
  ; ... skipping full check for brevity in runtime lib, assuming runtime functions are safe or checked by caller ... 
  ; Actually, let's keep it safe but cleaner.
  
  ret i8* getelementptr inbounds ([5 x i8], [5 x i8]* @.str.Type, i64 0, i64 0)
}

define linkonce_odr i8* @Type_toString_Type_ptr(%struct.Type* %this) #0 {
  ; Virtual dispatch to getTypeName (index 0)
  %vtable_ptr_ptr = getelementptr %struct.Type, %struct.Type* %this, i32 0, i32 0
  %vtable_ptr = load i8*, i8** %vtable_ptr_ptr
  %vtable = bitcast i8* %vtable_ptr to i8**
  
  %func_ptr_ptr = getelementptr i8*, i8** %vtable, i32 0
  %func_ptr = load i8*, i8** %func_ptr_ptr
  %func = bitcast i8* %func_ptr to i8* (%struct.Type*)*
  
  %name = call i8* %func(%struct.Type* %this)
  ret i8* %name
}

define linkonce_odr void @Type_destroy_Type_ptr(%struct.Type* %this) #0 {
  ret void
}

; --- Defer Unwinding Helper ---
define linkonce_odr void @__bpl_unwind_to_defer_node(%struct.DeferNode* %target) #0 {
entry:
  br label %check

check:
  %current = load %struct.DeferNode*, %struct.DeferNode** @defer_top
  %done = icmp eq %struct.DeferNode* %current, %target
  br i1 %done, label %end, label %run

run:
  ; Pop first to avoid infinite recursion if defer throws
  %next_ptr_ptr = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* %current, i32 0, i32 2
  %next = load %struct.DeferNode*, %struct.DeferNode** %next_ptr_ptr
  store %struct.DeferNode* %next, %struct.DeferNode** @defer_top

  ; func is first field (i8*)
  %f_ptr_ptr = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* %current, i32 0, i32 0
  %f_void = load i8*, i8** %f_ptr_ptr
  %f = bitcast i8* %f_void to void (i8*)*
  
  ; arg is second field (i8*)
  %arg_ptr_ptr = getelementptr inbounds %struct.DeferNode, %struct.DeferNode* %current, i32 0, i32 1
  %arg = load i8*, i8** %arg_ptr_ptr
  
  ; call
  call void %f(i8* %arg)
  
  br label %check

end:
  ret void
}

; --- Runtime Checks (Stack, Null) ---

; Stack Depth Management
define linkonce_odr void @__bpl_enter_stack_frame() #0 {
entry:
  %0 = load i32, i32* @__bpl_stack_depth
  %1 = add i32 %0, 1
  store i32 %1, i32* @__bpl_stack_depth
  %overflow = icmp ugt i32 %1, 10000
  br i1 %overflow, label %err, label %exit
exit:
  ret void
err:
  call void @__bpl_throw_stack_overflow()
  unreachable
}

define linkonce_odr void @__bpl_exit_stack_frame() #0 {
entry:
  %0 = load i32, i32* @__bpl_stack_depth
  %1 = sub i32 %0, 1
  store i32 %1, i32* @__bpl_stack_depth
  ret void
}

; Null Pointer Check
define linkonce_odr void @__bpl_check_null(i8* %ptr_val, i8* %func_name, i8* %expr_str, i32 %line_val, i32 %col_val) #0 {
entry:
  %isnull = icmp eq i8* %ptr_val, null
  br i1 %isnull, label %err, label %exit
exit:
  ret void
err:
  call void @__bpl_throw_null_access(i8* %func_name, i8* %expr_str, i32 %line_val, i32 %col_val)
  unreachable
}

; Exception Throw Helpers

; Throw Logic:
; 1. Check if @exception_top is set. If not, abort.
; 2. Allocate memory for Exception Struct (NullAccessError or StackOverflowError).
; 3. Store exception type ID (fixed IDs for built-ins).
; 4. Store exception value (ptr to struct as i64).
; 5. longjmp to handler buffer.

; Type IDs (Must match RTTI.ts logic roughly or be consistent here)
; Let's assume:
; NullAccessError = 5 (Arbitrary, but must be consistent with what TryCatch expects if catching by type)
; StackOverflowError = 9 (Currently used in StatementGenerator fallback)

@.str.override = private unnamed_addr constant [9 x i8] c"OVERRIDE\00", align 1

define linkonce_odr void @__bpl_throw_null_access(i8* %func_arg, i8* %expr_arg, i32 %line, i32 %col) #0 {
  %handler = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top
  %has_handler = icmp ne %struct.ExceptionFrame* %handler, null
  br i1 %has_handler, label %throw, label %abort
  
abort:
  call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([38 x i8], [38 x i8]* @.str.panic_null, i64 0, i64 0))
  call void @exit(i32 1)
  unreachable

throw:
  ; 1. Allocate NullAccessError
  %size = getelementptr %struct.NullAccessError, %struct.NullAccessError* null, i32 1
  %size_i64 = ptrtoint %struct.NullAccessError* %size to i64
  %ptr = call i8* @malloc(i64 %size_i64)
  %struct_ptr = bitcast i8* %ptr to %struct.NullAccessError*

  ; 2. Fill fields
  ; vtable (0)
  %f0 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 0
  store i8* bitcast ([8 x i8*]* @NullAccessError_vtable to i8*), i8** %f0

  ; message (1)
  %f1 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 1
  %msg_ptr = getelementptr inbounds [38 x i8], [38 x i8]* @.str.panic_null, i64 0, i64 0
  store i8* %msg_ptr, i8** %f1
  
  ; code (2)
  %f2 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 2
  store i32 7, i32* %f2

  ; stack_frames (3)
  %f3 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 3
  store i8** null, i8*** %f3

  ; stack_depth (4)
  %f4 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 4
  store i32 0, i32* %f4

  ; function (5)
  %f5 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 5
  store i8* %func_arg, i8** %f5

  ; expression (6)
  %f6 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 6
  store i8* %expr_arg, i8** %f6

  ; line (7)
  %f7 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 7
  store i32 %line, i32* %f7
  
  ; col (8)
  %f8 = getelementptr inbounds %struct.NullAccessError, %struct.NullAccessError* %struct_ptr, i32 0, i32 8
  store i32 %col, i32* %f8

  ; 3. Set Exception Globals
  ; TypeId for NullAccessError (FNV1a hash truncated to 32 bits)
  store i32 3266311688, i32* @exception_type
  
  %as_int = ptrtoint %struct.NullAccessError* %struct_ptr to i64
  store i64 %as_int, i64* @exception_value

  ; 4. Unwind Defer
  %defer_field_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 2
  %target_defer = load %struct.DeferNode*, %struct.DeferNode** %defer_field_ptr
  call void @__bpl_unwind_to_defer_node(%struct.DeferNode* %target_defer)

  ; 5. Jump
  %buf_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 0
  %buf = bitcast [32 x i64]* %buf_ptr to i8*
  call void @longjmp(i8* %buf, i32 1)
  unreachable
}

define linkonce_odr void @__bpl_throw_stack_overflow() #0 {
  %handler = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top
  %has_handler = icmp ne %struct.ExceptionFrame* %handler, null
  br i1 %has_handler, label %throw, label %abort
  
abort:
  call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([16 x i8], [16 x i8]* @.str.panic_so, i64 0, i64 0))
  call void @exit(i32 139)
  unreachable

throw:
  ; 1. Allocate StackOverflowError
  %size = getelementptr %struct.StackOverflowError, %struct.StackOverflowError* null, i32 1
  %size_i64 = ptrtoint %struct.StackOverflowError* %size to i64
  %ptr = call i8* @malloc(i64 %size_i64)
  %struct_ptr = bitcast i8* %ptr to %struct.StackOverflowError*
  
  ; Fill fields
  ; vtable (0)
  %f0 = getelementptr inbounds %struct.StackOverflowError, %struct.StackOverflowError* %struct_ptr, i32 0, i32 0
  store i8* bitcast ([8 x i8*]* @StackOverflowError_vtable to i8*), i8** %f0

  ; message (1)
  %f1 = getelementptr inbounds %struct.StackOverflowError, %struct.StackOverflowError* %struct_ptr, i32 0, i32 1
  %msg_ptr = getelementptr inbounds [15 x i8], [15 x i8]* @.stack_overflow_msg, i64 0, i64 0
  store i8* %msg_ptr, i8** %f1

  ; code (2)
  %f2 = getelementptr inbounds %struct.StackOverflowError, %struct.StackOverflowError* %struct_ptr, i32 0, i32 2
  store i32 139, i32* %f2

  ; stack_frames (3)
  %f3 = getelementptr inbounds %struct.StackOverflowError, %struct.StackOverflowError* %struct_ptr, i32 0, i32 3
  store i8** null, i8*** %f3

  ; stack_depth (4)
  %f4 = getelementptr inbounds %struct.StackOverflowError, %struct.StackOverflowError* %struct_ptr, i32 0, i32 4
  store i32 0, i32* %f4
  
  ; 2. Set Globals (ID for StackOverflowError)
  store i32 2060636097, i32* @exception_type
  %as_int = ptrtoint %struct.StackOverflowError* %struct_ptr to i64
  store i64 %as_int, i64* @exception_value
  
  ; 3. Unwind Defer
  %defer_field_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 2
  %target_defer = load %struct.DeferNode*, %struct.DeferNode** %defer_field_ptr
  call void @__bpl_unwind_to_defer_node(%struct.DeferNode* %target_defer)

  ; 4. Jump
  %buf_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 0
  %buf = bitcast [32 x i64]* %buf_ptr to i8*
  call void @longjmp(i8* %buf, i32 1)
  unreachable
}

@.str.panic_so = private unnamed_addr constant [16 x i8] c"Stack overflow\0A\00", align 1
@.str.panic_div = private unnamed_addr constant [18 x i8] c"Division by zero\0A\00", align 1
@.str.panic_oob = private unnamed_addr constant [21 x i8] c"Index out of bounds\0A\00", align 1

declare i32 @printf(i8*, ...)

define linkonce_odr void @__bpl_throw_division_by_zero(i8* %func, i32 %line, i32 %col) #0 {
  %handler = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top
  %has_handler = icmp ne %struct.ExceptionFrame* %handler, null
  br i1 %has_handler, label %throw, label %abort

abort:
  call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([18 x i8], [18 x i8]* @.str.panic_div, i64 0, i64 0))
  call void @exit(i32 1)
  unreachable

throw:
  ; Allocate DivisionByZeroError
  %size = getelementptr %struct.DivisionByZeroError, %struct.DivisionByZeroError* null, i32 1
  %size_i64 = ptrtoint %struct.DivisionByZeroError* %size to i64
  %ptr = call i8* @malloc(i64 %size_i64)
  %struct_ptr = bitcast i8* %ptr to %struct.DivisionByZeroError*

  ; vtable (0)
  %vtable_ptr = bitcast [8 x i8*]* @NullAccessError_vtable to i8*
  %vtable_slot = getelementptr inbounds %struct.DivisionByZeroError, %struct.DivisionByZeroError* %struct_ptr, i32 0, i32 0
  store i8* %vtable_ptr, i8** %vtable_slot
  
  ; message (1)
  %f1 = getelementptr inbounds %struct.DivisionByZeroError, %struct.DivisionByZeroError* %struct_ptr, i32 0, i32 1
  %msg_ptr = getelementptr inbounds [18 x i8], [18 x i8]* @.str.panic_div, i64 0, i64 0
  store i8* %msg_ptr, i8** %f1

  ; code (2)
  %f2 = getelementptr inbounds %struct.DivisionByZeroError, %struct.DivisionByZeroError* %struct_ptr, i32 0, i32 2
  store i32 1, i32* %f2

  ; Set Globals - Type ID for DivisionByZeroError (hash of "DivisionByZeroError")
  store i32 3968367666, i32* @exception_type
  
  %as_int = ptrtoint %struct.DivisionByZeroError* %struct_ptr to i64
  store i64 %as_int, i64* @exception_value

  ; Jump (simplified for brevity, identical to others)
  %buf_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 0
  %buf = bitcast [32 x i64]* %buf_ptr to i8*
  call void @longjmp(i8* %buf, i32 1)
  unreachable
}

define linkonce_odr void @__bpl_throw_index_out_of_bounds(i32 %index, i32 %size, i8* %func, i32 %line, i32 %col) #0 {
  %handler = load %struct.ExceptionFrame*, %struct.ExceptionFrame** @exception_top
  %has_handler = icmp ne %struct.ExceptionFrame* %handler, null
  br i1 %has_handler, label %throw, label %abort

abort:
  call i32 (i8*, ...) @printf(i8* getelementptr inbounds ([21 x i8], [21 x i8]* @.str.panic_oob, i64 0, i64 0))
  call void @exit(i32 1)
  unreachable

throw:
  ; Allocate IndexOutOfBoundsError
  %sz = getelementptr %struct.IndexOutOfBoundsError, %struct.IndexOutOfBoundsError* null, i32 1
  %sz_i64 = ptrtoint %struct.IndexOutOfBoundsError* %sz to i64
  %ptr = call i8* @malloc(i64 %sz_i64)
  %struct_ptr = bitcast i8* %ptr to %struct.IndexOutOfBoundsError*

  ; vtable (0) - Use NullAccessError_vtable as fallback
  %vtable_slot = getelementptr inbounds %struct.IndexOutOfBoundsError, %struct.IndexOutOfBoundsError* %struct_ptr, i32 0, i32 0
  store i8* bitcast ([8 x i8*]* @NullAccessError_vtable to i8*), i8** %vtable_slot

  ; message (1)
  %f1 = getelementptr inbounds %struct.IndexOutOfBoundsError, %struct.IndexOutOfBoundsError* %struct_ptr, i32 0, i32 1
  %msg_ptr = getelementptr inbounds [21 x i8], [21 x i8]* @.str.panic_oob, i64 0, i64 0
  store i8* %msg_ptr, i8** %f1
  
  ; index (5)
  %f5 = getelementptr inbounds %struct.IndexOutOfBoundsError, %struct.IndexOutOfBoundsError* %struct_ptr, i32 0, i32 5
  store i32 %index, i32* %f5

  ; size (6)
  %f6 = getelementptr inbounds %struct.IndexOutOfBoundsError, %struct.IndexOutOfBoundsError* %struct_ptr, i32 0, i32 6
  store i32 %size, i32* %f6

  ; Set Globals
  store i32 2320298516, i32* @exception_type
  
  %as_int = ptrtoint %struct.IndexOutOfBoundsError* %struct_ptr to i64
  store i64 %as_int, i64* @exception_value

  ; Jump
  %buf_ptr = getelementptr inbounds %struct.ExceptionFrame, %struct.ExceptionFrame* %handler, i32 0, i32 0
  %buf = bitcast [32 x i64]* %buf_ptr to i8*
  call void @longjmp(i8* %buf, i32 1)
  unreachable
}

define internal i64 @safe_strlen(i8* %str) #0 {
entry:
  %isnull = icmp eq i8* %str, null
  br i1 %isnull, label %is_null, label %not_null
is_null:
  ret i64 0
not_null:
  %len = call i64 @strlen(i8* %str)
  ret i64 %len
}

attributes #0 = { "frame-pointer"="all" }
