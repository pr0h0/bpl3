# Parsed (not type-checked) by tests/LinterTypeSafety.test.ts: a lint rule
# must observe every child-bearing node kind written here.
import printf from "std/c.bpl";

extern puts(text: string) ret int;

type Pair = (int, int);
type Callback = Func<int>(int);
type Handler = Lambda<void>(int);

struct Point {
    x: int,
    y: int,
    frame sum(this: *Point) ret int {
        return this.x + this.y;
    }
}

spec Shape {
    frame area(this: *Self) ret int;
}

enum Event {
    Quit,
    Key(int),
    Move { x: int, y: int },
}

@[inline]
frame twice(value: int) ret int {
    return value * 2;
}

frame identity<T>(value: T) ret T {
    return value;
}

frame main() ret int {
    local point: Point = Point { x: 1, y: 2 };
    local values: int[3] = [1, 2, 3];
    local pair: Pair = (1, 2);
    local event: Event = Event.Move { x: 1, y: 2 };
    local total: int = -point.x + values[0];
    local ok: bool = point is Point;
    local alias: Point = point as Point;
    local size: ulong = sizeof(point);
    local kind: int = match<int>(total);
    local name: string = typeof(total);
    local offset: ulong = offsetof(Point, y);
    local id: int = identity<int>(total);
    local add: Lambda<int>(int) = |delta: int| ret int {
        return delta + 1;
    };
    total = (total > 0) ? total : 0;
    printf(`total ${total}\n`);
    if (ok) {
        total = twice(total);
    } else {
        total = cast<int>(size + offset);
    }
    loop (local i: int = 0; i < 3; i = i + 1) {
        total = total + values[i];
    }
    defer {
        puts(name);
    }
    try {
        throw total;
    } catch (error: int) {
        total = error;
    }
    switch (total) {
        case 1:
            total = 2;
            break;
        default:
            break;
    }
    local matched: int = match (event) {
        Event.Quit => 0,
        Event.Key(code) => code,
        Event.Move { x: left, y: _ } => left,
    };
    local described: int = match (pair) {
        (0, second) => second,
        3 => 3,
        _ => 1,
    };
    return total + matched + described + kind + id + add(alias.sum());
}
