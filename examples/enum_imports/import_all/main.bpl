# Test import all enums

import [Color], [Status] from "../enums.bpl";

frame main() ret int {
    local c: Color = Color.Green;
    local s: Status = Status.Busy;

    local color_code: int = match (c) {
        Color.Red => 1,
        Color.Green => 2,
        Color.Blue => 3,
    };

    local status_code: int = match (s) {
        Status.Ready => 10,
        Status.Busy => 20,
        Status.Error => 30,
    };

    # Should return 2 + 20 = 22
    return color_code + status_code;
}
