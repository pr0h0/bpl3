# Type-checked by tests/CaptureAnalyzer.test.ts: each `_<Construct>` lambda
# reads a variable of `main` through that construct and must capture it.
extern printf(fmt: string, ...) ret int;

struct Point {
    x: int,
    y: int,
}

enum Shape {
    Dot,
    Line(int),
}

frame id(v: int) ret int {
    return v;
}

frame main() ret int {
    local x: int = 5;
    local p: Point = Point { x: 1, y: 2 };
    local arr: int[3] = [1, 2, 3];
    local shape: Shape = Shape.Line(4);
    local _Identifier: Lambda<int>() = || ret int {
        return x;
    };
    local _Binary: Lambda<int>() = || ret int {
        return x + 1;
    };
    local _Unary: Lambda<int>() = || ret int {
        return -x;
    };
    local _Call: Lambda<int>() = || ret int {
        return id(x);
    };
    local _If: Lambda<int>() = || ret int {
        if (x > 0) {
            return 1;
        }
        return 0;
    };
    local _Loop: Lambda<int>() = || ret int {
        local s: int = 0;
        loop (local i: int = 0; i < x; i = i + 1) {
            s = s + 1;
        }
        return s;
    };
    local _Defer: Lambda<void>() = || ret void {
        defer {
            printf("%d\n", x);
        }
    };
    local _Throw: Lambda<void>() = || ret void {
        throw x;
    };
    local _Try: Lambda<int>() = || ret int {
        local r: int = 0;
        try {
            r = id(1);
        } catch (e: int) {
            r = e + x;
        }
        return r;
    };
    local _Switch: Lambda<int>() = || ret int {
        local r: int = 0;
        switch (x) {
            case 1:
                r = 1;
                break;
            default:
                r = 2;
                break;
        }
        return r;
    };
    local _ExpressionStmt: Lambda<void>() = || ret void {
        id(x);
    };
    local _Assignment: Lambda<int>() = || ret int {
        local r: int = 0;
        r = x;
        return r;
    };
    local _Member: Lambda<int>() = || ret int {
        return p.y;
    };
    local _Index: Lambda<int>() = || ret int {
        return arr[1];
    };
    local _Cast: Lambda<long>() = || ret long {
        return cast<long>(x);
    };
    local _Group: Lambda<int>() = || ret int {
        return (x);
    };
    local _Ternary: Lambda<int>() = || ret int {
        return x > 0 ? 1 : 2;
    };
    local _ArrayLiteral: Lambda<int>() = || ret int {
        local a: int[2] = [x, 1];
        return a[0];
    };
    local _StructLiteral: Lambda<int>() = || ret int {
        local q: Point = Point { x: x, y: 0 };
        return q.y;
    };
    local _TupleLiteral: Lambda<int>() = || ret int {
        local t: (int, int) = (x, 1);
        return t.1;
    };
    local _Sizeof: Lambda<ulong>() = || ret ulong {
        return sizeof(x);
    };
    local _Match: Lambda<int>() = || ret int {
        return match (shape) {
            Shape.Dot => 0,
            Shape.Line(n) => n,
        };
    };
    local _VariableDecl: Lambda<int>() = || ret int {
        local y: int = x;
        return y;
    };
    local _Block: Lambda<int>() = || ret int {
        {
            return x;
        }
    };
    local _LambdaExpression: Lambda<int>() = || ret int {
        local inner: Lambda<int>() = || ret int {
            return x;
        };
        return inner();
    };
    return 0;
}
