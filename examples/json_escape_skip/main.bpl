import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

struct Data {
    name: string,
    id: int,
}

frame main() ret int {
    IO.log("=== JSON Escape & Skip Test ===");

    # 1. Test Escaping in Stringify
    local d: Data;
    d.name = "Line1\nLine2 \"Quote\"";
    d.id = 1;

    local jsonStr: String = JSON.stringify<Data>(&d);
    printf("Serialized: %s\n", jsonStr.toString());
    # Expected: {"name": "Line1\nLine2 \"Quote\"", "id": 1} 
    # (Note: printf might interpret \n if passed raw, but here we print the JSON string content)

    jsonStr.destroy();

    # 2. Test Skipping Unknown Fields
    # Input: {"unknown_obj": {"a":1}, "name": "Success", "unknown_arr": [1, 2], "id": 42}
    # logic: should skip unknown_obj, parse name, skip unknown_arr, parse id.

    local input: string = "{\"unknown_obj\": {\"a\":1}, \"name\": \"Success\", \"unknown_arr\": [1, 2], \"id\": 42}";

    local parsed: *Data = JSON.parse<Data>(input);
    if (parsed == nullptr) {
        IO.log("Parse failed");
        return 1;
    }
    printf("Parsed Name: %s\n", parsed.name);
    printf("Parsed ID: %d\n", parsed.id);

    JSON.free<Data>(parsed);

    return 0;
}
