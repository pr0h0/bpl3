# Result<T, E> standard library

export [Result];

struct Result<T, E> {
    ok: bool,
    value: T,
    error: E,
    frame Ok(value: T) ret Result<T, E> {
        local r: Result<T, E>;
        r.ok = true;
        r.value = value;
        return r;
    }

    frame Err(error: E) ret Result<T, E> {
        local r: Result<T, E>;
        r.ok = false;
        r.error = error;
        return r;
    }

    frame isOk(this: *Result<T, E>) ret bool {
        if (this.ok) {
            return true;
        }
        return false;
    }

    frame isErr(this: *Result<T, E>) ret bool {
        if (this.ok) {
            return false;
        }
        return true;
    }

    frame unwrap(this: *Result<T, E>) ret T {
        if (this.ok) {
            return this.value;
        }
        # Throw the error object/value for handling by caller
        throw this.error;
    }

    frame unwrapOr(this: *Result<T, E>, defaultValue: T) ret T {
        if (this.ok) {
            return this.value;
        }
        return defaultValue;
    }

    frame unwrapErr(this: *Result<T, E>) ret E {
        return this.error;
    }
}
