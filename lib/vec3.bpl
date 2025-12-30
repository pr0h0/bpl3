# 3D Vector

export [Vec3];

import [Equatable], [Cloneable] from "std/core_specs.bpl";

extern printf(fmt: string, ...) ret int;

struct Vec3: Equatable<Vec3>, Cloneable<Vec3> {
    x: float,
    y: float,
    z: float,
    frame new(x: float, y: float, z: float) ret Vec3 {
        local v: Vec3;
        v.x = x;
        v.y = y;
        v.z = z;
        return v;
    }

    frame __eq__(this: *Vec3, other: *Vec3) ret bool {
        return (this.x == other.x) && (this.y == other.y) && (this.z == other.z);
    }

    frame __ne__(this: *Vec3, other: *Vec3) ret bool {
        return !this.__eq__(other);
    }

    frame clone(this: *Vec3) ret Vec3 {
        return Vec3.new(this.x, this.y, this.z);
    }

    frame add(this: *Vec3, other: Vec3) ret Vec3 {
        local r: Vec3;
        r.x = this.x + other.x;
        r.y = this.y + other.y;
        r.z = this.z + other.z;
        return r;
    }

    frame sub(this: *Vec3, other: Vec3) ret Vec3 {
        local r: Vec3;
        r.x = this.x - other.x;
        r.y = this.y - other.y;
        r.z = this.z - other.z;
        return r;
    }

    frame dot(this: *Vec3, other: Vec3) ret float {
        return (this.x * other.x) + (this.y * other.y) + (this.z * other.z);
    }

    frame cross(this: *Vec3, other: Vec3) ret Vec3 {
        local r: Vec3;
        r.x = (this.y * other.z) - (this.z * other.y);
        r.y = (this.z * other.x) - (this.x * other.z);
        r.z = (this.x * other.y) - (this.y * other.x);
        return r;
    }

    frame length(this: *Vec3) ret float {
        local sum: float = (this.x * this.x) + (this.y * this.y) + (this.z * this.z);
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

    frame normalize(this: *Vec3) ret Vec3 {
        local len: float = this.length();
        if (len == 0.0) {
            return Vec3.new(0.0, 0.0, 0.0);
        }
        local r: Vec3;
        r.x = this.x / len;
        r.y = this.y / len;
        r.z = this.z / len;
        return r;
    }

    frame print(this: *Vec3) {
        printf("Vec3(%.2f, %.2f, %.2f)\n", this.x, this.y, this.z);
    }

    # Operator overloading: Vector addition with +
    frame __add__(this: *Vec3, other: Vec3) ret Vec3 {
        return this.add(other);
    }

    # Operator overloading: Vector subtraction with -
    frame __sub__(this: *Vec3, other: Vec3) ret Vec3 {
        return this.sub(other);
    }

    # Operator overloading: Scalar multiplication with *
    frame __mul__(this: *Vec3, scalar: float) ret Vec3 {
        local r: Vec3;
        r.x = this.x * scalar;
        r.y = this.y * scalar;
        r.z = this.z * scalar;
        return r;
    }

    # Operator overloading: Scalar division with /
    frame __div__(this: *Vec3, scalar: float) ret Vec3 {
        local r: Vec3;
        r.x = this.x / scalar;
        r.y = this.y / scalar;
        r.z = this.z / scalar;
        return r;
    }

    # Operator overloading: Vector equality with ==
    frame __eq__(this: *Vec3, other: Vec3) ret bool {
        return (this.x == other.x) && (this.y == other.y) && (this.z == other.z);
    }

    # Operator overloading: Vector inequality with !=
    frame __ne__(this: *Vec3, other: Vec3) ret bool {
        return (this.x != other.x) || (this.y != other.y) || (this.z != other.z);
    }

    # Operator overloading: Unary negation with -
    frame __neg__(this: *Vec3) ret Vec3 {
        local r: Vec3;
        r.x = -this.x;
        r.y = -this.y;
        r.z = -this.z;
        return r;
    }
}
