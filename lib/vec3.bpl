# 3D Vector

export [Vec3];

extern printf(fmt: string, ...) ret int;

struct Vec3 {
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
}
