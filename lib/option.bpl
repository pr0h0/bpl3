# Option<T> standard library

import [OptionUnwrapError] from "std/errors.bpl";

export [Option];

enum Option<T> {
    Some(T),
    None,

    frame isSome(this: Option<T>) ret bool {
        return match<Option.Some>(this);
    }

    frame isNone(this: Option<T>) ret bool {
        return match<Option.None>(this);
    }

    frame panic() ret T {
        throw OptionUnwrapError { message: "Called unwrap on None" };
    }

    frame unwrap(this: Option<T>) ret T {
        return match (this) {
            Option.Some(val) => val,
            Option.None => Option<T>.panic(),
        };
    }

    # The value, or a thrown `OptionUnwrapError` with `message` when there is
    # none, so a failure says what was missing.
    frame expect(this: Option<T>, message: string) ret T {
        return match (this) {
            Option.Some(val) => val,
            Option.None => Option<T>.expectFailed(message),
        };
    }

    frame expectFailed(message: string) ret T {
        throw OptionUnwrapError { message: message };
    }

    # The value, or the result of `fallback` (called only when there is none).
    frame unwrapOrElse(this: Option<T>, fallback: Lambda<T>()) ret T {
        return match (this) {
            Option.Some(val) => val,
            Option.None => fallback(),
        };
    }

    # `Some(transform(value))`, or `None`.
    frame map<U>(this: Option<T>, transform: Lambda<U>(T)) ret Option<U> {
        return match (this) {
            Option.Some(val) => Option<U>.Some(transform(val)),
            Option.None => Option<U>.None,
        };
    }

    # `next(value)`, which may itself be `None`, or `None`.
    frame andThen<U>(this: Option<T>, next: Lambda<Option<U>>(T)) ret Option<U> {
        return match (this) {
            Option.Some(val) => next(val),
            Option.None => Option<U>.None,
        };
    }

    frame unwrapOr(this: Option<T>, defaultValue: T) ret T {
        return match (this) {
            Option.Some(val) => val,
            Option.None => defaultValue,
        };
    }

    frame __eq__(this: *Option<T>, other: *Option<T>) ret bool {
        return match (*this) {
            Option.Some(v1) => match (*other) {
                Option.Some(v2) => v1 == v2,
                Option.None => false,
            },
            Option.None => match (*other) {
                Option.Some(_) => false,
                Option.None => true,
            },
        };
    }

    frame __ne__(this: *Option<T>, other: *Option<T>) ret bool {
        return !this.__eq__(other);
    }

    frame clone(this: *Option<T>) ret Option<T> {
        return match (*this) {
            Option.Some(v) => Option<T>.Some(v),
            Option.None => Option<T>.None,
        };
    }
}

export [Option];
