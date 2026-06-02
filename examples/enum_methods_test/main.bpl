import [printf] from "std/c.bpl";

enum Status {
    Pending,
    Active,
    Completed,

    frame isActive(this: Status) ret bool {
        return match<Status.Active>(this);
    }

    frame code(this: Status) ret int {
        return match (this) {
            Status.Pending => 0,
            Status.Active => 1,
            Status.Completed => 2,
        };
    }
}

frame main() ret int {
    local s: Status = Status.Active;

    if (s.isActive()) {
        printf("Status is active\n");
    }
    printf("Status code: %d\n", s.code());

    return 0;
}
