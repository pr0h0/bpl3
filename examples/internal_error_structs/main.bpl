import [Option] from "std/option.bpl";
import [Result] from "std/result.bpl";
import [FS] from "std/fs.bpl";
import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [OptionUnwrapError], [ResultUnwrapError], [IOError], [IndexOutOfBoundsError], [EmptyError], [NullAccessError], [DivisionByZeroError] from "std/errors.bpl";
extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    # Test OptionUnwrapError
    try {
        local opt: Option<int> = Option<int>.None;
        local _val: int = opt.unwrap();
    } catch (e: OptionUnwrapError) {
        printf("Caught OptionUnwrapError: %s\n", e.message);
    }
    # Test ResultUnwrapError
    try {
        local res: Result<int, int> = Result<int, int>.Ok(42);
        local _val: int = res.unwrapErr();
    } catch (e: ResultUnwrapError) {
        printf("Caught ResultUnwrapError: %s\n", e.message);
    }
    # Test IOError
    try {
        local _content: String = FS.readFile("non_existent_file.txt");
    } catch (e: IOError) {
        printf("Caught IOError: %s (code: %d)\n", e.message, e.code);
    }
    # Test Array IndexOutOfBoundsError
    try {
        local arr: Array<int> = Array<int>.new(5);
        arr.push(1);

        # Manually throw to test different constructors
        if (true) {
            # Test constructor with message only
            throw IndexOutOfBoundsError.new("Custom index error message");
        }
        # Should throw (but we threw above)
        local _val: int = arr.get(10);
    } catch (e: IndexOutOfBoundsError) {
        printf("Caught IndexOutOfBoundsError: %s (index %d, size %d)\n", e.message, e.index, e.size);
    }
    # Test explicit initialization
    try {
        throw IndexOutOfBoundsError { message: "Explicit init error", code: 123, index: 99, size: 10 };
    } catch (e: IndexOutOfBoundsError) {
        printf("Caught explicit IndexOutOfBoundsError: %s (index %d, size %d)\n", e.message, e.index, e.size);
    }
    # Test Array EmptyError
    try {
        local arr: Array<int> = Array<int>.new(5);
        arr.pop(); # Should throw
    } catch (e: EmptyError) {
        printf("Caught EmptyError: %s\n", e.message);
    }
    # Test NullAccessError
    try {
        local p: *Point = nullptr;
        local _val: int = p.x;
    } catch (e: NullAccessError) {
        printf("Caught NullAccessError: %s\n", e.message);
    } catchOther {
        printf("Caught unknown error in NullAccessError test\n");
    }

    # Test DivisionByZeroError
    try {
        local a: int = 10;
        local b: int = 0;
        local _c: int = a / b;
    } catch (e: DivisionByZeroError) {
        printf("Caught DivisionByZeroError\n");
    }
    return 0;
}
