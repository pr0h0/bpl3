# 2D Vector

export [Vec2];

extern printf(fmt: string, ...) ret int;

struct Vec2 {
    x: float,
    y: float,
    frame new(x: float, y: float) ret Vec2 {
        local v: Vec2;
        v.x = x;
        v.y = y;
        return v;
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
}
