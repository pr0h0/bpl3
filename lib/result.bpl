# Result<T, E> standard library

export [Result];

import [ResultUnwrapError] from "std/errors.bpl";
import [Equatable], [Cloneable] from "std/core_specs.bpl";

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
