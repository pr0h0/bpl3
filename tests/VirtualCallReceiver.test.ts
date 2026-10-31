import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

// Virtual calls take an addressable receiver's address directly and evaluate
// any other receiver exactly once (BUG-474 follow-up, #133).
describe("virtual call receivers", () => {
  it("evaluates a temporary receiver once and dispatches on stored values", () => {
    const output = compileAndRun(`
import printf from "std/c.bpl";

global calls: int = 0;

struct Counter {
    value: int,
    frame get(this: *Counter) ret int {
        return this.value;
    }
}

struct Holder {
    inner: Counter,
}

frame make() ret Counter {
    calls = calls + 1;
    return Counter { value: 7 };
}

frame holder() ret Holder {
    calls = calls + 1;
    return Holder { inner: Counter { value: 9 } };
}

frame main() ret int {
    local first: int = make().get();
    local second: int = holder().inner.get();
    local stored: Holder = Holder { inner: Counter { value: 4 } };
    local items: Counter[2] = [Counter { value: 5 }, Counter { value: 6 }];
    printf("%d %d %d %d %d\\n", first, second, stored.inner.get(), items[1].get(), calls);
    return 0;
}
`);
    expect(output.trim()).toBe("7 9 4 6 2");
  });
});
