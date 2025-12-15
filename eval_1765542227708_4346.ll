%ExceptionNode = type { [200 x i8], ptr }

@__exception_stack_top = linkonce_odr global ptr null, align 8
@__current_exception = linkonce_odr global ptr null, align 8
@__current_exception_type_id = linkonce_odr global i32 0, align 8

declare i32 @setjmp(ptr %env)
declare void @longjmp(ptr %env, i32 %val)
declare ptr @malloc(i64 %size)
declare void @free(ptr %ptr)
declare void @exit(i32 %status)
declare i32 @printf(ptr %format, ...)
define void @user_main() {
entry_0:
  ret void
}

define i32 @main(i32 %argc, ptr %argv, ptr %envp) {
entry_1:
  call void @user_main()
  ret i32 0
}

