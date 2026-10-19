import [String] from "std/string.bpl";

import [printf] from "std/c.bpl";

struct Point {
    value: int, # Value owned by this point.

    frame read(this: *Point) ret int {
        return this.value;
    }
}

frame add(
    left: int, # First operand.
    right: int
) ret int {
    return left + right;
}

frame main() ret int {
    local values: int[2] = [
        1, # First element.
        2
    ];
    local point: Point = Point {
        value: add(
            20, # First argument.
            22
        )
    };
    local message: String = `answer ${point.read() /# Preserve this expression comment. #/ + 0}`;
    printf("%s %d\n", message.data, values[0] + values[1]);
    message.destroy();
    return 0;
}
