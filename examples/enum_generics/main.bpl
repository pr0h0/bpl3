# Generic enum demonstration
# Showcases generic enums with type-safe pattern matching
# Option<T> is instantiated as Option<int> with proper type substitution

import [Option] from "std/option.bpl";

frame main() ret int {
    local x: Option<int> = Option<int>.Some(42);
    local res: int = match (x) {
        Option<int>.Some(v) => v,
        Option<int>.None => 0,
    };

    return res;
}
