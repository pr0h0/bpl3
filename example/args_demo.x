import printf;

frame main(argc: u8, argv: **u8) ret u8 {
    call printf("Argc: %d\n", argc);
    
    local i: u8 = 0;
    loop {
        if i >= argc {
            break;
        }
        local arg: *u8 = argv[i];
        call printf("Arg %d: %s\n", i, arg);
        i = i + 1;
    }
    return 0;
}
