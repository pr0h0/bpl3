frame main() {
    local i: u64 = 0;
    local unused: u64 = 10;
    loop {
        if i > 10 {
            break;
        }
        i = i + 1;
    }
}
