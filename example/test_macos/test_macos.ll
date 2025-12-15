%ExceptionNode = type { [200 x i8], ptr }

@__exception_stack_top = linkonce_odr global ptr null, align 8
@__current_exception = linkonce_odr global ptr null, align 8
@__current_exception_type_id = linkonce_odr global i32 0, align 8
@.str.0 = private unnamed_addr constant [26 x i8] c"Hello from BPL on macOS!\0A\00", align 1
@.str.1 = private unnamed_addr constant [24 x i8] c"Sum of %d and %d is %d\0A\00", align 1
@.str.2 = private unnamed_addr constant [37 x i8] c"Memory allocated successfully at %p\0A\00", align 1
@.str.3 = private unnamed_addr constant [14 x i8] c"Memory freed\0A\00", align 1
@.str.4 = private unnamed_addr constant [11 x i8] c"Counting: \00", align 1
@.str.5 = private unnamed_addr constant [4 x i8] c"%d \00", align 1
@.str.6 = private unnamed_addr constant [2 x i8] c"\0A\00", align 1
@.str.7 = private unnamed_addr constant [17 x i8] c"Test completed!\0A\00", align 1

declare i32 @setjmp(ptr %env)
declare void @longjmp(ptr %env, i32 %val)
declare ptr @malloc(i64 %size)
declare void @free(ptr %ptr)
declare void @exit(i32 %status)
declare i32 @printf(ptr %format, ...)
define i32 @user_main() {
entry_0:
  %gep_0 = getelementptr [26 x i8], ptr @.str.0, i64 0, i32 0
  call void (ptr, ...) @printf(ptr %gep_0)
  %x_1 = alloca i64
  store i64 10, ptr %x_1
  %y_2 = alloca i64
  store i64 20, ptr %y_2
  %sum_3 = alloca i64
  %load_4 = load i64, ptr %x_1
  %load_5 = load i64, ptr %y_2
  %t_6 = add i64 %load_4, %load_5
  store i64 %t_6, ptr %sum_3
  %gep_7 = getelementptr [24 x i8], ptr @.str.1, i64 0, i32 0
  %load_8 = load i64, ptr %x_1
  %load_9 = load i64, ptr %y_2
  %load_10 = load i64, ptr %sum_3
  call void (ptr, ...) @printf(ptr %gep_7, i64 %load_8, i64 %load_9, i64 %load_10)
  %ptr_11 = alloca ptr
  %call_12 = call ptr @malloc(i64 100)
  store ptr %call_12, ptr %ptr_11
  %load_13 = load ptr, ptr %ptr_11
  %cast_14 = inttoptr i64 0 to ptr
  %t_15 = icmp ne ptr %load_13, %cast_14
  %cast_16 = zext i1 %t_15 to i8
  %t_17 = icmp ne i8 %cast_16, 0
  br i1 %t_17, label %then_1, label %merge_2
then_1:
  %gep_18 = getelementptr [37 x i8], ptr @.str.2, i64 0, i32 0
  %load_19 = load ptr, ptr %ptr_11
  call void (ptr, ...) @printf(ptr %gep_18, ptr %load_19)
  %load_20 = load ptr, ptr %ptr_11
  call void @free(ptr %load_20)
  %gep_21 = getelementptr [14 x i8], ptr @.str.3, i64 0, i32 0
  call void (ptr, ...) @printf(ptr %gep_21)
  br label %merge_2
merge_2:
  %i_22 = alloca i64
  store i64 0, ptr %i_22
  %gep_23 = getelementptr [11 x i8], ptr @.str.4, i64 0, i32 0
  call void (ptr, ...) @printf(ptr %gep_23)
  br label %loop_body_3
loop_body_3:
  %load_24 = load i64, ptr %i_22
  %t_25 = icmp sge i64 %load_24, 5
  %cast_26 = zext i1 %t_25 to i8
  %t_27 = icmp ne i8 %cast_26, 0
  br i1 %t_27, label %then_5, label %merge_6
loop_end_4:
  %gep_32 = getelementptr [2 x i8], ptr @.str.6, i64 0, i32 0
  call void (ptr, ...) @printf(ptr %gep_32)
  %gep_33 = getelementptr [17 x i8], ptr @.str.7, i64 0, i32 0
  call void (ptr, ...) @printf(ptr %gep_33)
  ret i32 0
then_5:
  br label %loop_end_4
  br label %merge_6
merge_6:
  %gep_28 = getelementptr [4 x i8], ptr @.str.5, i64 0, i32 0
  %load_29 = load i64, ptr %i_22
  call void (ptr, ...) @printf(ptr %gep_28, i64 %load_29)
  %load_30 = load i64, ptr %i_22
  %t_31 = add i64 %load_30, 1
  store i64 %t_31, ptr %i_22
  br label %loop_body_3
}

define i32 @main(i32 %argc, ptr %argv, ptr %envp) {
entry_7:
  %call_34 = call i32 @user_main()
  ret i32 %call_34
}

