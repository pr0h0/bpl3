import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";

struct Data {
    id: int,
}

import [printf] from "std/c.bpl";

frame main() ret int {
    IO.log("=== JSON Error Test ===");

    # Invalid JSON: Missing brace
    local input: string = "{\n  \"id\": 123";

    local d: *Data = JSON.parse<Data>(input);
    if (d == nullptr) {
        IO.log("Parse failed as expected");
    } else {
        IO.log("Parse unexpectedly succeeded");
        JSON.free<Data>(d);
    }

    # Invalid JSON: trailing comma or bad char
    # Missing closing ] for array value of unknown field
    local input2: string = "{\n  \"id\": 123,\n  \"extra\": [ 1, 2\n}";
    local d2: *Data = JSON.parse<Data>(input2);
    if (d2 == nullptr) {
        IO.log("Parse failed as expected (2)");
    } else {
        IO.log("Parse unexpectedly succeeded (2)");
        JSON.free<Data>(d2);
    }

    # Invalid Type: parsing int but found identifier or other type
    local input3: string = "{\"id\": invalid}";
    local d3: *Data = JSON.parse<Data>(input3);
    if (d3 == nullptr) {
        IO.log("Parse failed as expected (3)");
    } else {
        IO.log("Parse unexpectedly succeeded (3)");
        JSON.free<Data>(d3);
    }

    return 0;
}
