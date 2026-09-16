import value as renamed from "./bridge.bpl";
import * as constants from "./bridge.bpl";
frame main() ret int {
    local value: int = 5;
    local const pointer: *int = &value;
    *pointer = 8;
    if (renamed != 42 || constants.value != 42) return 1;
    return value - 8;
}
