import printf, getenv;

frame main(argc: u32, argv: **u8, envp: **u8) ret u8 {
    call printf("--- Environment Variables (from main arg) ---\n");
    
    local i: u32 = 0;
    loop {
        local env_str: *u8 = envp[i];
        if env_str == NULL {
            break;
        }
        # Only print first 5 to avoid spamming
        if i < 5 {
            call printf("Env[%d]: %s\n", i, env_str);
        }
        i = i + 1;
    }
    call printf("... and %d more.\n", i - 5);

    call printf("\n--- Specific Environment Variable (getenv) ---\n");
    local path: *u8 = call getenv("PATH");
    if path != NULL {
        call printf("PATH: %s\n", path);
    } else {
        call printf("PATH not found.\n");
    }

    local user: *u8 = call getenv("USER");
    if user != NULL {
        call printf("USER: %s\n", user);
    }

    return 0;
}
