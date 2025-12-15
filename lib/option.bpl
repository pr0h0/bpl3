# Option<T> standard library

export [Option];

struct Option<T> {
    has: bool,
    value: T,
    frame some(value: T) ret Option<T> {
        local o: Option<T>;
        o.has = true;
        o.value = value;
        return o;
    }

    frame none() ret Option<T> {
        local o: Option<T>;
        o.has = false;
        return o;
    }

    frame isSome(this: *Option<T>) ret bool {
        if (this.has) {
            return true;
        }
        return false;
    }

    frame isNone(this: *Option<T>) ret bool {
        if (this.has) {
            return false;
        }
        return true;
    }

    frame unwrap(this: *Option<T>) ret T {
        if (this.has) {
            return this.value;
        }
        # Using error code 100 for unwrap on None
        throw 100;
    }

    frame unwrapOr(this: *Option<T>, defaultValue: T) ret T {
        if (this.has) {
            return this.value;
        }
        return defaultValue;
    }
}
