# 2D Vector

export [Vec2];

import [Equatable], [Cloneable] from "std/core_specs.bpl";

extern printf(fmt: string, ...) ret int;

struct Vec2: Equatable<Vec2>, Cloneable<Vec2> {
    x: float,
    y: float,
    frame new(x: float, y: float) ret Vec2 {
        local v: Vec2;
        v.x = x;
        v.y = y;
        return v;
    }

    frame __eq__(this: *Vec2, other: *Vec2) ret bool {
        return (this.x == other.x) && (this.y == other.y);
    }

    frame __ne__(this: *Vec2, other: *Vec2) ret bool {
        return !this.__eq__(other);
    }

    frame clone(this: *Vec2) ret Vec2 {
        return Vec2.new(this.x, this.y);
    }

    frame add(this: *Vec2, other: Vec2) ret Vec2 {
        local r: Vec2;
        r.x = this.x + other.x;
        r.y = this.y + other.y;
        return r;
    }

    frame sub(this: *Vec2, other: Vec2) ret Vec2 {
        local r: Vec2;
        r.x = this.x - other.x;
        r.y = this.y - other.y;
        return r;
    }

    frame dot(this: *Vec2, other: Vec2) ret float {
        return (this.x * other.x) + (this.y * other.y);
    }

    frame length(this: *Vec2) ret float {
        local sum: float = (this.x * this.x) + (this.y * this.y);
        # Simple sqrt via Newton (inline)
        if (sum == 0.0) {
            return 0.0;
        }
        local guess: float = sum / 2.0;
        local i: int = 0;
        loop (i < 10) {
            guess = 0.5 * (guess + (sum / guess));
            i = i + 1;
        }
        return guess;
    }

    frame normalize(this: *Vec2) ret Vec2 {
        local len: float = this.length();
        if (len == 0.0) {
            return Vec2.new(0.0, 0.0);
        }
        local r: Vec2;
        r.x = this.x / len;
        r.y = this.y / len;
        return r;
    }

    frame print(this: *Vec2) {
        printf("Vec2(%.2f, %.2f)\n", this.x, this.y);
    }

    # Operator overloading: Vector addition with +
    frame __add__(this: *Vec2, other: Vec2) ret Vec2 {
        return this.add(other);
    }

    # Operator overloading: Vector subtraction with -
    frame __sub__(this: *Vec2, other: Vec2) ret Vec2 {
        return this.sub(other);
    }

    # Operator overloading: Scalar multiplication with *
    frame __mul__(this: *Vec2, scalar: float) ret Vec2 {
        local r: Vec2;
        r.x = this.x * scalar;
        r.y = this.y * scalar;
        return r;
    }

    # Operator overloading: Scalar division with /
    frame __div__(this: *Vec2, scalar: float) ret Vec2 {
        local r: Vec2;
        r.x = this.x / scalar;
        r.y = this.y / scalar;
        return r;
    }

    # Operator overloading: Vector equality with ==
    frame __eq__(this: *Vec2, other: Vec2) ret bool {
        return (this.x == other.x) && (this.y == other.y);
    }

    # Operator overloading: Vector inequality with !=
    frame __ne__(this: *Vec2, other: Vec2) ret bool {
        return (this.x != other.x) || (this.y != other.y);
    }

    # Operator overloading: Unary negation with -
    frame __neg__(this: *Vec2) ret Vec2 {
        local r: Vec2;
        r.x = -this.x;
        r.y = -this.y;
        return r;
    }
}
