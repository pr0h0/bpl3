# Standard Error Types

export [Error];
export [OptionUnwrapError];
export [ResultUnwrapError];
export [IOError];
export [CastError];
export [IndexOutOfBoundsError];
export [EmptyError];
export [NullAccessError];
export [DivisionByZeroError];
export [StackOverflowError];

struct Error {
    message: string,
    code: int,
    frame new(message: string) ret Error {
        local e: Error;
        e.message = message;
        e.code = 0;
        return e;
    }

    frame new(message: string, code: int) ret Error {
        local e: Error;
        e.message = message;
        e.code = code;
        return e;
    }
}

struct OptionUnwrapError: Error {
}

struct ResultUnwrapError: Error {
}

struct IOError: Error {
}

struct CastError: Error {
}

struct IndexOutOfBoundsError: Error {
    index: int,
    size: int,
    frame new(index: int, size: int) ret IndexOutOfBoundsError {
        local e: IndexOutOfBoundsError;
        e.message = "Index out of bounds";
        e.code = 0;
        e.index = index;
        e.size = size;
        return e;
    }

    frame new(message: string) ret IndexOutOfBoundsError {
        local e: IndexOutOfBoundsError;
        e.message = message;
        e.code = 0;
        e.index = 0;
        e.size = 0;
        return e;
    }
}

struct EmptyError: Error {
}

struct NullAccessError: Error {
    function: string,
    expression: string,
    line: int,
    column: int,
}

struct DivisionByZeroError: Error {
}

struct StackOverflowError: Error {
}
