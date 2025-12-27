import [String] from "std";
extern printf(fmt: string, ...);

frame main() ret int {
    local name: string = "BPL";
    local version: int = 1;

    # Basic interpolation
    local s1: String = `Hello ${name} v${version}!`;
    printf("%s\n", s1.toString());

    # Expression interpolation
    local a: int = 10;
    local b: int = 20;
    local s2: String = `${a} + ${b} = ${a + b}`;
    printf("%s\n", s2.toString());

    # Escaping interpolation
    local s3: String = `Use \${variable} to interpolate`;
    printf("%s\n", s3.toString());

    # Cleanup
    s1.destroy();
    s2.destroy();
    s3.destroy();

    return 0;
}
