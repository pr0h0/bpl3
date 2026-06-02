import [printf] from "std/c.bpl";
import [String] from "std";

frame main() ret int {
    local s1: String = String.new("Hello");
    local s2: String = String.new(" World");
    local s3: String = s1 + s2;

    printf("%s\n", s3.toString());

    s1.destroy();
    s2.destroy();
    s3.destroy();
    return 0;
}
