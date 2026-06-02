# Test enum methods

import [printf] from "std/c.bpl";

enum Color {
    Red,
    Green,
    Blue,

    frame isPrimary(this: Color) ret bool {
        return match (this) {
            Color.Red => true,
            Color.Green => true,
            Color.Blue => true,
        };
    }

    frame toCode(this: Color) ret int {
        return match (this) {
            Color.Red => 1,
            Color.Green => 2,
            Color.Blue => 3,
        };
    }
}

enum Result {
    Ok(int),
    Err(string),

    frame unwrapOr(this: Result, default_val: int) ret int {
        return match (this) {
            Result.Ok(value) => value,
            Result.Err(_) => default_val,
        };
    }
}

frame main() ret int {
    local color: Color = Color.Red;
    local is_primary: bool = color.isPrimary();
    local code: int = color.toCode();

    printf("Color is primary: %d, code: %d\n", is_primary, code);

    local ok_result: Result = Result.Ok(42);
    local err_result: Result = Result.Err("error");

    local ok_val: int = ok_result.unwrapOr(0);
    local err_val: int = err_result.unwrapOr(99);

    printf("Ok value: %d, Err value: %d\n", ok_val, err_val);

    if (code == 1) {
        return 0;
    }
    return code;
}
