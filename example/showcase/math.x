import malloc, printf from "./libc.x";

# Vector3 struct
struct Vector3 {
    x: f64,
    y: f64,
    z: f64,
}

# Generic-like math functions (simulated with specific types for now as generics might be limited to structs or specific usage)

frame vec3_create(x: f64, y: f64, z: f64) ret *Vector3 {
    local v: *Vector3 = call malloc(24); # 3 * 8 bytes
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
}

frame vec3_add(a: *Vector3, b: *Vector3) ret *Vector3 {
    return call vec3_create(a.x + b.x, a.y + b.y, a.z + b.z);
}

frame vec3_dot(a: *Vector3, b: *Vector3) ret f64 {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

# Using inline assembly for sqrt
frame sqrt(val: f64) ret f64 {
    local res: f64 = 0.0;
    asm {
        movsd xmm0, [(val)]
        sqrtsd xmm0, xmm0
        movsd [(res)], xmm0
    }
    return res;
}

frame vec3_length(v: *Vector3) ret f64 {
    local sum_sq: f64 = call vec3_dot(v, v);
    return call sqrt(sum_sq);
}

frame vec3_normalize(v: *Vector3) {
    local len: f64 = call vec3_length(v);
    if len > 0.0 {
        # Demonstrate float division
        v.x = v.x / len;
        v.y = v.y / len;
        v.z = v.z / len;
    }
}

# Integer math demonstration
frame gcd(a: i32, b: i32) ret i32 {
    local temp: i32 = 0;
    local div: i32 = 0;
    local rem: i32 = 0;
    loop {
        if b == 0 {
            break;
        }
        temp = b;
        # Demonstrate integer division/modulo usage (modulo via assembly or logic)

        div = (a // b);
        rem = a - b * div;

        b = rem;
        a = temp;
    }
    return a;
}

frame factorial(n: i32) ret i32 {
    if n <= 1 {
        return 1;
    }
    return n * call factorial(n - 1);
}

export [Vector3];
export vec3_create;
export vec3_add;
export vec3_dot;
export vec3_length;
export vec3_normalize;
export sqrt;
export gcd;
export factorial;
