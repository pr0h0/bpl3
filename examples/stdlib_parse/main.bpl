import printf from "std/c.bpl";
import [Parse] from "std/parse.bpl";

frame checkInt(text: string) {
    local value: int = -1;
    local ok: bool = Parse.int(text, &value);
    printf("int [%s] -> %d %d\n", text, cast<int>(ok), value);
}

frame checkLong(text: string, base: int) {
    local value: long = -1;
    local ok: bool = Parse.radix(text, base, &value);
    printf("radix %d [%s] -> %d %ld\n", base, text, cast<int>(ok), value);
}

frame checkFloat(text: string) {
    local value: float = -1.0;
    local ok: bool = Parse.float(text, &value);
    printf("float [%s] -> %d %g\n", text, cast<int>(ok), value);
}

frame checkBool(text: string) {
    local value: bool = false;
    local ok: bool = Parse.bool(text, &value);
    printf("bool [%s] -> %d %d\n", text, cast<int>(ok), cast<int>(value));
}

frame main() ret int {
    checkInt("42");
    checkInt("-17");
    checkInt("+8");
    checkInt("2147483647");
    checkInt("-2147483648");
    checkInt("2147483648");
    checkInt("");
    checkInt("-");
    checkInt(" 5");
    checkInt("12a");
    local big: long = 0;
    printf("long max %d %ld\n", cast<int>(Parse.long("9223372036854775807", &big)), big);
    printf("long min %d %ld\n", cast<int>(Parse.long("-9223372036854775808", &big)), big);
    printf("long over %d\n", cast<int>(Parse.long("9223372036854775808", &big)));
    checkLong("ff", 16);
    checkLong("0xFF", 16);
    checkLong("-0b1010", 2);
    checkLong("0o777", 8);
    checkLong("zz", 36);
    checkLong("0x", 16);
    checkLong("12", 2);
    checkLong("7fffffffffffffff", 16);
    checkLong("8000000000000000", 16);
    checkFloat("3.25");
    checkFloat("-1e3");
    checkFloat(".5");
    checkFloat("inf");
    checkFloat("1.5x");
    checkFloat(" 2");
    checkFloat("");
    checkBool("true");
    checkBool("false");
    checkBool("True");
    return 0;
}
