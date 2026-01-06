extern printf(f: string, ...);

frame main() {
    local title_s: string = "Hello";
    printf("%s", titles); # Should trigger: Undefined symbol 'titles'
}
