import [Error] from "std/errors.bpl";

struct MyError: Error {
    frame new(msg: string) ret MyError {
        local e: MyError;
        e.message = msg;
        e.captureStack();
        return e;
    }
}

frame funcC() {
    throw MyError.new("Something went wrong in funcC (Uncaught)");
}

frame funcB() {
    funcC();
}

frame funcA() {
    funcB();
}

frame main() {
    funcA();
}
