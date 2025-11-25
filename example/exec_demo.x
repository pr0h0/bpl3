import printf, sprintf, malloc, free;

frame main() ret u64 {
    call printf("=== Exec Demo ===\n");

    # 1. Simple command execution
    call printf("\n[1] Running 'whoami'...\n");
    local output1: *u8 = call exec("whoami");
    if output1 != NULL {
        call printf("Output: %s", output1);
        call free(output1);
    } else {
        call printf("Failed to execute command.\n");
    }

    # 2. Dynamic command with sprintf
    call printf("\n[2] Running 'ls -la' on current directory...\n");
    
    # Allocate buffer for command string
    local cmd_buffer: *u8 = call malloc(128);
    call sprintf(cmd_buffer, "ls -la %s", ".");
    
    local output2: *u8 = call exec(cmd_buffer);
    if output2 != NULL {
        call printf("Output:\n%s", output2);
        call free(output2);
    }
    
    call free(cmd_buffer);

    # 3. Command with pipes
    call printf("\n[3] Running 'echo \"Hello Pipe\" | tr a-z A-Z'...\n");
    local output3: *u8 = call exec("echo \"Hello Pipe\" | tr a-z A-Z");
    if output3 != NULL {
        call printf("Output: %s", output3);
        call free(output3);
    }

    return 0;
}
