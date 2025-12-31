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

import frameaddress from "std/intrinsics.bpl";
import [Dl_info], dladdr from "std/intrinsics.bpl";

extern snprintf(str: *i8, size: long, format: *i8, ...) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void);
extern printf(fmt: string, ...) ret int;

struct Error {
    message: string,
    code: int,
    stack_frames: **void,
    stack_depth: int,
    frame new(message: string) ret Error {
        local e: Error;
        e.message = message;
        e.code = 0;
        e.captureStack();
        return e;
    }

    frame new(message: string, code: int) ret Error {
        local e: Error;
        e.message = message;
        e.code = code;
        e.captureStack();
        return e;
    }

    frame captureStack(this: *Error) {
        local max_frames: int = 32;
        this.stack_frames = cast<**void>(malloc(cast<long>(max_frames * 8)));

        local count: int = 0;
        local rbp: *void = frameaddress(0);

        # Skip current frame (captureStack)
        if (cast<long>(rbp) != 0) {
            local rbp_ptr: **void = cast<**void>(rbp);
            rbp = rbp_ptr[0];
        }
        loop (count < max_frames) {
            if (rbp == nullptr) {
                break;
            }
            if (cast<long>(rbp) == 0) {
                break;
            }
            local rbp_ptr: **void = cast<**void>(rbp);

            # RA is at RBP + 8 (index 1 of **void)
            local ra: *void = rbp_ptr[1];

            this.stack_frames[count] = ra;
            count = count + 1;

            # Previous RBP is at *RBP (index 0)
            local next_rbp: *void = rbp_ptr[0];

            # Stop if next_rbp is 0 or not higher than current (stack grows down)
            if (cast<long>(next_rbp) == 0) {
                break;
            }
            if (cast<long>(next_rbp) <= cast<long>(rbp)) {
                break;
            }
            rbp = next_rbp;
        }

        this.stack_depth = count;
    }

    frame getStackTrace(this: *Error) ret string {
        # Allocate a large buffer for the stack trace string (e.g., 4KB)
        local buf_size: long = 4096;
        local buffer: *i8 = cast<*i8>(malloc(buf_size));
        local offset: int = 0;

        # Header
        local written: int = snprintf(buffer, buf_size, "Stack Trace for Error '%s':\n", this.message);
        offset = offset + written;

        local i: int = 0;
        local info: Dl_info;

        loop (i < this.stack_depth) {
            if (offset >= (cast<int>(buf_size) - 100)) {
                break; # Prevent overflow
            }
            local addr: *void = this.stack_frames[i];
            local current_ptr: *i8 = cast<*i8>(cast<long>(buffer) + cast<long>(offset));
            local remaining: long = buf_size - cast<long>(offset);

            if (dladdr(addr, &info) != 0) {
                if (info.dli_sname != nullptr) {
                    written = snprintf(current_ptr, remaining, "  [%d] %p %s\n", i, addr, info.dli_sname);
                } else {
                    written = snprintf(current_ptr, remaining, "  [%d] %p <unknown>\n", i, addr);
                }
            } else {
                written = snprintf(current_ptr, remaining, "  [%d] %p\n", i, addr);
            }

            offset = offset + written;
            i = i + 1;
        }

        return buffer;
    }

    frame toString(this: *Error) ret string {
        return this.getStackTrace();
    }

    frame printStack(this: *Error) {
        extern printf(fmt: string, ...) ret int;
        local trace: string = this.getStackTrace();
        printf("%s", trace);
        free(cast<*void>(trace));
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
