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

    # This option when it holds a value satisfying `predicate`, else None.
    frame filter(this: Option<T>, predicate: Lambda<bool>(T)) ret Option<T> {
        return match (this) {
            Option.Some(val) => Option<T>.filterValue(val, predicate(val)),
            Option.None => Option<T>.None,
        };
    }

    frame filterValue(value: T, keep: bool) ret Option<T> {
        if (keep) {
            return Option<T>.Some(value);
        }
        return Option<T>.None;
    }

    # This option when it has a value, otherwise `other`.
    frame or(this: Option<T>, other: Option<T>) ret Option<T> {
        return match (this) {
            Option.Some(_) => this,
            Option.None => other,
        };
    }

    # This option when it has a value, otherwise `fallback()`.
    frame orElse(this: Option<T>, fallback: Lambda<Option<T>>()) ret Option<T> {
        return match (this) {
            Option.Some(_) => this,
            Option.None => fallback(),
        };
    }

    # The one option that has a value, or None when both or neither do.
    frame xor(this: Option<T>, other: Option<T>) ret Option<T> {
        if (this.isSome() && other.isNone()) {
            return this;
        }
        if (this.isNone() && other.isSome()) {
            return other;
        }
        return Option<T>.None;
    }

    # True when there is a value and it satisfies `predicate`.
    frame isSomeAnd(this: Option<T>, predicate: Lambda<bool>(T)) ret bool {
        return match (this) {
            Option.Some(val) => predicate(val),
            Option.None => false,
        };
    }

    # True when there is no value or it satisfies `predicate`.
    frame isNoneOr(this: Option<T>, predicate: Lambda<bool>(T)) ret bool {
        return match (this) {
            Option.Some(val) => predicate(val),
            Option.None => true,
        };
    }

    # `transform(value)`, or `defaultValue` when there is none.
    frame mapOr<U>(this: Option<T>, defaultValue: U, transform: Lambda<U>(T)) ret U {
        return match (this) {
            Option.Some(val) => transform(val),
            Option.None => defaultValue,
        };
    }

    # Calls `action` with the value, if any, and returns the option.
    frame inspect(this: Option<T>, action: Lambda<void>(T)) ret Option<T> {
        if (this.isSome()) {
            action(this.unwrap());
        }
        return this;
    }

    # Takes the value out of the option it points to, leaving None.
    frame take(this: *Option<T>) ret Option<T> {
        local value: Option<T> = *this;
        *this = Option<T>.None;
        return value;
    }

    # Stores `value` and returns the previous contents.
    frame replace(this: *Option<T>, value: T) ret Option<T> {
        local previous: Option<T> = *this;
        *this = Option<T>.Some(value);
        return previous;
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
