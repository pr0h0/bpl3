enum Status {
    Ok,
    Error(int),
}

import [printf] from "std/c.bpl";

frame main() {
    local s: Status = Status.Error(404);

    local msg: string = match (s) {
        Status.Ok => "OK",
        Status.Error(code) => {
            if (code == 404) {
                return "Not Found";
            }
            return "Unknown Error";
        },
    };

    printf("Message: %s\n", msg);

    # Test with another value
    local s2: Status = Status.Error(500);
    local msg2: string = match (s2) {
        Status.Ok => "OK",
        Status.Error(code) => {
            if (code == 404) {
                return "Not Found";
            }
            return "Unknown Error";
        },
    };
    printf("Message 2: %s\n", msg2);
}
