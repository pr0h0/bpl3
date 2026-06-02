import [printf] from "std/c.bpl";

struct Counter {
    val: int,

    frame increment(this: *Counter) {
        this.val = this.val + 1;
        printf("Counter incremented to: %d\n", this.val);
    }

    frame add(this: *Counter, amount: int) {
        this.val = this.val + amount;
        printf("Counter added %d, new total: %d\n", amount, this.val);
    }
}

struct Greeter {
    name: string,

    frame greet(this: *Greeter) {
        printf("Hello, %s!\n", this.name);
    }
}

frame main() {
    printf("--- Bound Methods Example ---\n");

    # 1. Basic Bound Method
    local c: Counter = Counter { val: 0 };
    local inc: Lambda<void>() = c.increment;

    inc(); # Output: 1
    inc(); # Output: 2

    # 2. Bound Method with Arguments
    local adder: Lambda<void>(int) = c.add;
    adder(5); # Output: 7
    adder(10); # Output: 17

    # 3. Another Instance
    local c2: Counter = Counter { val: 100 };
    local inc2: Lambda<void>() = c2.increment;
    inc2(); # Output: 101

    # c is still independent
    inc(); # Output: 18

    # 4. Different Struct
    local g: Greeter = Greeter { name: "World" };
    local greet: Lambda<void>() = g.greet;
    greet(); # Output: Hello, World!

    printf("--- End ---\n");
}
