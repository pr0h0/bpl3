export [Vec2];
export [Vec3];

struct Vec2 {
    x: float,
    y: float,
    /#
    # Constructor
    Creates a new Vec2.

    ## Arguments
    - `x`: X coordinate
    - `y`: Y coordinate
    #/
    frame new(x: float, y: float) ret Vec2 {
        local v: Vec2;
        v.x = x;
        v.y = y;
        return v;
    }

    /#
    # Dot Product
    Calculates the dot product of this vector and another.

    ## Arguments
    - `other`: The other vector

    ## Returns
    The dot product (scalar)
    #/
    frame dot(this: Vec2, other: Vec2) ret float {
        return (this.x * other.x) + (this.y * other.y);
    }
}

struct Vec3 {
    x: float,
    y: float,
    z: float,
    /#
    # Magnitude
    Calculates the length of the vector.
    #/
    frame magnitude(this: Vec3) ret float {
        return 0.0; # Placeholder
    }
}
