import [JSON] from "std/json.bpl";
import [IO] from "std/io.bpl";
import [String] from "std/string.bpl";

extern printf(fmt: string, ...) ret int;

enum Status {
    Pending,
    Active,
    Closed,
}

struct Task {
    id: int,
    status: Status,
}

frame main() ret int {
    IO.log("=== JSON Enum Test ===");

    # 1. Serialize Enum
    local t: Task;
    t.id = 101;
    t.status = Status.Active;

    local json: String = JSON.stringify<Task>(&t);
    printf("Serialized: %s\n", json.toString());

    # 2. Parse Enum
    local input: string = "{\"id\": 202, \"status\": \"Closed\"}";
    local t2: *Task = JSON.parse<Task>(input);

    printf("Parsed ID: %d\n", t2.id);

    if (t2.status == Status.Closed) {
        IO.log("Status: Closed (Correct)");
    } else {
        IO.log("Status: Error");
    }

    JSON.free<Task>(t2);
    json.destroy();

    return 0;
}
