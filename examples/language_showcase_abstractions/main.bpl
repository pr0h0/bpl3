import [printf] from "std/c.bpl";

type BinaryOp = Func<int>(int, int);
type Mapper = Lambda<int>(int);

enum Maybe<T> {
    Some(T),
    None,
}

struct Box<T> {
    value: T,

    frame get(this: *Box<T>) ret T {
        return this.value;
    }
}

struct Number {
    value: int,

    frame __add__(this: *Number, other: Number) ret Number {
        return Number { value: this.value + other.value };
    }
}

struct Animal {
    name: string,
}

spec Speaker {
    frame speak(this: *Self) ret string;
}

struct Dog: Animal, Speaker {
    frame speak(this: *Dog) ret string {
        return "bark";
    }
}

frame makeBox<T>(value: T) ret Box<T> {
    local box: Box<T>;
    box.value = value;
    return box;
}

frame describeMaybe(value: Maybe<int>) ret string {
    return match (value) {
        Maybe<int>.Some(x) if x > 0 => "positive",
        Maybe<int>.Some(x) if x < 0 => "negative",
        Maybe<int>.Some(_) => "zero",
        Maybe<int>.None => "none",
    };
}

frame multiply(a: int, b: int) ret int {
    return a * b;
}

frame apply(op: BinaryOp, a: int, b: int) ret int {
    return op(a, b);
}

frame main() ret int {
    local maybe: Maybe<int> = Maybe<int>.Some(5);
    printf("enum guard: %s\n", describeMaybe(maybe));

    local box: Box<int> = makeBox<int>(42);
    printf("box value: %d\n", box.get());

    local first: Number = Number { value: 7 };
    local second: Number = Number { value: 8 };
    local combined: Number = first + second;
    printf("operator: %d\n", combined.value);

    local dog: Dog = Dog { name: "Rex" };
    printf("dog says: %s\n", dog.speak());

    local funcResult: int = apply(multiply, 6, 7);
    printf("func pointer: %d\n", funcResult);

    local offset: int = 10;
    local mapper: Mapper = |value: int| ret int {
        return value + offset;
    };
    printf("lambda: %d\n", mapper(11));

    return 0;
}
