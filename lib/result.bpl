# Result<T, E> standard library

export [Result];

import [ResultUnwrapError] from "std/errors.bpl";
import [Option] from "std/option.bpl";

enum Result<T, E> {
    Ok(T),
    Err(E),

    frame isOk(this: Result<T, E>) ret bool {
        return match<Result.Ok>(this);
    }

    frame isErr(this: Result<T, E>) ret bool {
        return match<Result.Err>(this);
    }

    frame unwrap(this: Result<T, E>) ret T {
        return match (this) {
            Result.Ok(val) => val,
            Result.Err(err) => {
                throw err;
            },
        };
    }

    # The success value, or a thrown `ResultUnwrapError` with `message` for an
    # error.
    frame expect(this: Result<T, E>, message: string) ret T {
        return match (this) {
            Result.Ok(val) => val,
            Result.Err(_) => Result<T, E>.expectFailed(message),
        };
    }

    frame expectFailed(message: string) ret T {
        throw ResultUnwrapError { message: message };
    }

    # `Ok(transform(value))`, or the same error.
    frame map<U>(this: Result<T, E>, transform: Lambda<U>(T)) ret Result<U, E> {
        return match (this) {
            Result.Ok(val) => Result<U, E>.Ok(transform(val)),
            Result.Err(err) => Result<U, E>.Err(err),
        };
    }

    # The same success value, or `Err(transform(error))`.
    frame mapErr<F>(this: Result<T, E>, transform: Lambda<F>(E)) ret Result<T, F> {
        return match (this) {
            Result.Ok(val) => Result<T, F>.Ok(val),
            Result.Err(err) => Result<T, F>.Err(transform(err)),
        };
    }

    # `Some(value)` for success, `None` for an error (which is dropped).
    frame ok(this: Result<T, E>) ret Option<T> {
        return match (this) {
            Result.Ok(val) => Option<T>.Some(val),
            Result.Err(_) => Option<T>.None,
        };
    }

    frame unwrapOr(this: Result<T, E>, defaultValue: T) ret T {
        return match (this) {
            Result.Ok(val) => val,
            Result.Err(_) => defaultValue,
        };
    }

    frame unwrapErr(this: Result<T, E>) ret E {
        return match (this) {
            Result.Ok(_) => {
                throw ResultUnwrapError { message: "Called unwrapErr on Ok" };
            },
            Result.Err(err) => err,
        };
    }

    frame __eq__(this: *Result<T, E>, other: *Result<T, E>) ret bool {
        if (this.isOk()) {
            if (other.isOk()) {
                return this.unwrap() == other.unwrap();
            } else {
                return false;
            }
        } else {
            if (other.isErr()) {
                return this.unwrapErr() == other.unwrapErr();
            } else {
                return false;
            }
        }
    }

    frame __ne__(this: *Result<T, E>, other: *Result<T, E>) ret bool {
        return !this.__eq__(other);
    }

    frame clone(this: *Result<T, E>) ret Result<T, E> {
        return match (*this) {
            Result.Ok(v) => Result<T, E>.Ok(v),
            Result.Err(e) => Result<T, E>.Err(e),
        };
    }
}
