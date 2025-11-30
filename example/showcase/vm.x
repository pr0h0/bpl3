import malloc, free, printf from "./libc.x";

# VM Instructions
# 1: PUSH <val>
# 2: POP
# 3: ADD
# 4: SUB
# 5: MUL
# 6: DIV
# 7: PRINT
# 8: HALT

struct VM {
    stack: *i32,
    sp: u64,
    ip: u64,
    program: *i32,
    program_size: u64,
}

frame vm_create(program: *i32, size: u64) ret *VM {
    local vm: *VM = call malloc(40); # 8+8+8+8+8
    vm.stack = call malloc(1024 * 4); # 1024 i32s
    vm.sp = 0;
    vm.ip = 0;
    vm.program = program;
    vm.program_size = size;
    return vm;
}

frame vm_run(vm: *VM) {
    local running: i32 = 1;
    loop {
        if running == 0 {
            break;
        }
        if vm.ip >= vm.program_size {
            break;
        }

        # Fetch
        local instr: i32 = 0;
        # Pointer arithmetic for array access: program[ip]
        # Since program is *i32, we need to add ip * 4 bytes? 
        # No, BPL pointer arithmetic might be typed? 
        # Let's assume typed pointer arithmetic: ptr + 1 adds sizeof(type).

        local ip_ptr: *i32 = vm.program + vm.ip;
        instr = *ip_ptr;
        vm.ip = vm.ip + 1;

        local b_ptr: *i32 = 0;
        local b: i32 = 0;
        local a_ptr: *i32 = 0;
        local a: i32 = 0;
        local val_ptr: *i32 = 0;
        local val: i32 = 0;

        if instr == 1 { # PUSH
            val_ptr = vm.program + vm.ip;
            val = *val_ptr;
            vm.ip = vm.ip + 1;

            local stack_ptr: *i32 = vm.stack + vm.sp;
            *stack_ptr = val;
            vm.sp = vm.sp + 1;
        } else if instr == 2 { # POP
            vm.sp = vm.sp - 1;
        } else if instr == 3 { # ADD
            vm.sp = vm.sp - 1;
            b_ptr = vm.stack + vm.sp;
            b = *b_ptr;

            vm.sp = vm.sp - 1;
            a_ptr = vm.stack + vm.sp;
            a = *a_ptr;

            *a_ptr = a + b;
            vm.sp = vm.sp + 1;
        } else if instr == 4 { # SUB
            vm.sp = vm.sp - 1;
            b_ptr = vm.stack + vm.sp;
            b = *b_ptr;

            vm.sp = vm.sp - 1;
            a_ptr = vm.stack + vm.sp;
            a = *a_ptr;

            *a_ptr = a - b;
            vm.sp = vm.sp + 1;
        } else if instr == 5 { # MUL
            vm.sp = vm.sp - 1;
            b_ptr = vm.stack + vm.sp;
            b = *b_ptr;

            vm.sp = vm.sp - 1;
            a_ptr = vm.stack + vm.sp;
            a = *a_ptr;

            *a_ptr = a * b;
            vm.sp = vm.sp + 1;
        } else if instr == 6 { # DIV
            vm.sp = vm.sp - 1;
            b_ptr = vm.stack + vm.sp;
            b = *b_ptr;

            vm.sp = vm.sp - 1;
            a_ptr = vm.stack + vm.sp;
            a = *a_ptr;

            # Integer division
            *a_ptr = (a // b);
            vm.sp = vm.sp + 1;
        } else if instr == 7 { # PRINT
            vm.sp = vm.sp - 1;
            val_ptr = vm.stack + vm.sp;
            val = *val_ptr;
            call printf("VM Output: %d\n", val);
        } else if instr == 8 { # HALT
            running = 0;
        } else {
            call printf("Unknown instruction: %d\n", instr);
            running = 0;
        }
    }
}

frame vm_destroy(vm: *VM) {
    call free(vm.stack);
    call free(vm);
}

export [VM];
export vm_create;
export vm_run;
export vm_destroy;
