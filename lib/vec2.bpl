# 2D Vector

export [Vec2];

import [Equatable], [Cloneable] from "std/core_specs.bpl";
import [Math] from "std/math.bpl";

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

    /#
        Length of the vector. The previous implementation ran ten Newton steps
        from an initial guess of half the sum of squares, which is nowhere near
        the root for large components: a vector of length one million reported
        488281932. The square root is taken directly, with the larger component
        factored out so squaring cannot overflow or underflow on its own.
    #/
    frame length(this: *Vec2) ret float {
        # Classify non-finite components before normalization can form inf/inf.
        if (Math.isInfinite(this.x)) { return Math.abs(this.x); }
        if (Math.isInfinite(this.y)) { return Math.abs(this.y); }
        if (Math.isNan(this.x) || Math.isNan(this.y)) { return this.x + this.y; }
        local larger: float = Math.abs(this.x);
        local smaller: float = Math.abs(this.y);
        if (larger < smaller) {
            local swap: float = larger;
            larger = smaller;
            smaller = swap;
        }
        if (larger == 0.0) {
            return 0.0;
        }
        local ratio: float = smaller / larger;
        return larger * Math.sqrt(1.0 + (ratio * ratio));
    }

    /#
        Unit vector in the same direction. The components are scaled by their
        largest magnitude before the length is taken: a vector whose length
        exceeds the range, such as (1.5e308, 1.5e308), still has a
        representable direction, and dividing by an infinite length gave the
        zero vector instead.
    #/
    frame normalize(this: *Vec2) ret Vec2 {
        # A NaN direction is not the zero vector, even if all other axes are zero.
        if (Math.isNan(this.x) || Math.isNan(this.y)) {
            local invalid: float = this.x + this.y;
            return Vec2.new(invalid, invalid);
        }
        local largest: float = Math.abs(this.x);
        local absY: float = Math.abs(this.y);
        if (largest < absY) {
            largest = absY;
        }
        if (largest == 0.0) {
            return Vec2.new(0.0, 0.0);
        }

        local sx: float = this.x / largest;
        local sy: float = this.y / largest;
        local len: float = Math.sqrt((sx * sx) + (sy * sy));
        if (len == 0.0) {
            return Vec2.new(0.0, 0.0);
        }

        local r: Vec2;
        r.x = sx / len;
        r.y = sy / len;
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
