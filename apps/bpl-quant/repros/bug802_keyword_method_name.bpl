# BUG-802: a method named after a reserved word (`global`) is a syntax error,
# but the parser reports "Unexpected syntax" at the start of the struct and
# echoes the struct's source instead of naming the keyword. Contrast with a
# local named `as`, which gets "'as' is a reserved word and cannot be used as
# a name" at the exact token.
struct Registry {
    count: int,
    frame size(this: *Registry) ret int {
        return this.count;
    }
    frame global(this: *Registry) ret int {
        return this.count;
    }
}

frame main() ret int {
    local r: Registry = Registry { count: 1 };
    return r.size();
}
