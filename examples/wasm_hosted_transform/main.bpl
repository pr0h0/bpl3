import [String] from "std/string.bpl";

extern __bpl_argc() ret int;
extern __bpl_argv_get(index: int) ret string;
extern dprintf(fd: int, fmt: string, ...) ret int;
import [printf] from "std/c.bpl";
import [puts] from "std/c.bpl";

struct Box<T> {
    value: T,
}

enum Transform {
    Add(int),
    Mul(int),
    Keep,
}

frame applyTransform(step: Transform, value: int) ret int {
    return match (step) {
        Transform.Add(amount) => value + amount,
        Transform.Mul(factor) => value * factor,
        Transform.Keep => value,
    };
}

frame main() ret int {
    if (__bpl_argc() != 3) {
        dprintf(2, "bad argc\n");
        return 10;
    }

    local first: String = String.new(__bpl_argv_get(1));
    local second: String = String.new(__bpl_argv_get(2));

    if (first.length != 5) {
        first.destroy();
        second.destroy();
        return 20;
    }
    if (second.length != 7) {
        first.destroy();
        second.destroy();
        return 30;
    }
    if (!first.includes("elt")) {
        first.destroy();
        second.destroy();
        return 40;
    }

    local bonus: int = first.length;
    local bump: Lambda<int>(int) = |value: int| ret int {
        return value + bonus;
    };

    local base: int = first.length + second.length;
    local boxed: Box<int> = Box<int> {
        value: applyTransform(Transform.Add(second.length), bump(base)),
    };
    local score: int = applyTransform(Transform.Keep, boxed.value);
    score = applyTransform(Transform.Mul(1), score);

    if (score != 24) {
        first.destroy();
        second.destroy();
        return score;
    }

    printf(first.toString());
    printf(":");
    puts("7");
    printf("score:");
    puts("24");
    dprintf(2, "checked hosted transform\n");

    first.destroy();
    second.destroy();
    return 0;
}
