# Long struct is implicitly available, but must be explicitly imported to use its methods
# because long primitive doesn't auto-box to Long struct
import [IO], [Long] from "std";

frame main() {
    local x: long = 1234567890123;
    IO.printString(x.toString());

    local y: long = 9876543210987;
    IO.printString(y.toString());

    IO.printString(cast<long>(42).toString());
}
