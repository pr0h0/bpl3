# Math helpers

import sqrt, sin, cos, pow, exp, log, floor, ceil, round, fabs, minnum, maxnum, copysign from "./intrinsics.bpl";

export [Math];

/#
# Math Utilities
Provides common mathematical functions for integers and floating-point numbers.
#/
struct Math {
    /#
    # Absolute Value (Int)
    Returns the absolute value of an integer.
    #/
    frame absInt(x: int) ret int {
        if (x < 0) {
            return -x;
        }
        return x;
    }

    /#
    # Absolute Value (Float)
    Returns the absolute value of a float.
    #/
    frame absFloat(x: float) ret float {
        return fabs(x);
    }

    /#
    # Minimum (Int)
    Returns the smaller of two integers.
    #/
    frame minInt(a: int, b: int) ret int {
        if (a < b) {
            return a;
        }
        return b;
    }

    /#
    # Maximum (Int)
    Returns the larger of two integers.
    #/
    frame maxInt(a: int, b: int) ret int {
        if (a > b) {
            return a;
        }
        return b;
    }

    /#
    # Minimum (Float)
    Returns the smaller of two floats.
    #/
    frame minFloat(a: float, b: float) ret float {
        return minnum(a, b);
    }

    /#
    # Maximum (Float)
    Returns the larger of two floats.
    #/
    frame maxFloat(a: float, b: float) ret float {
        return maxnum(a, b);
    }

    /#
    # Square Root
    Calculates the square root of a float.
    #/
    frame sqrtFloat(x: float) ret float {
        return sqrt(x);
    }

    frame sin(x: float) ret float {
        return sin(x);
    }
    frame cos(x: float) ret float {
        return cos(x);
    }
    frame pow(x: float, y: float) ret float {
        return pow(x, y);
    }
    frame exp(x: float) ret float {
        return exp(x);
    }
    frame log(x: float) ret float {
        return log(x);
    }
    frame floor(x: float) ret float {
        return floor(x);
    }
    frame ceil(x: float) ret float {
        return ceil(x);
    }
    frame round(x: float) ret float {
        return round(x);
    }
    frame copysign(x: float, y: float) ret float {
        return copysign(x, y);
    }
}
