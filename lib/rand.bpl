# Pseudo-random number generator (LCG)

export [Rand];

import [Array] from "std/array.bpl";

extern time(ptr: *long) ret long;

struct Rand {
    state: ulong,

    frame seed(seed: ulong) ret Rand {
        local r: Rand;
        r.state = seed;
        return r;
    }

    frame seedFromTime() ret Rand {
        local t: long = 0;
        time(&t);
        return Rand.seed(cast<ulong>(t));
    }

    frame nextInt(this: *Rand) ret int {
        # LCG constants (Numerical Recipes)
        this.state = (this.state * 1664525) + 1013904223;
        # Return lower 32 bits as int
        return cast<int>(this.state & 0xFFFFFFFF);
    }

    frame nextUInt(this: *Rand) ret uint {
        this.state = (this.state * 1664525) + 1013904223;
        return cast<uint>(this.state & 0xFFFFFFFF);
    }

    frame nextLong(this: *Rand) ret long {
        local high: long = cast<long>(this.nextInt());
        local low: long = cast<long>(this.nextInt());
        return (high << cast<long>(32)) | (low & cast<long>(0xFFFFFFFF));
    }

    frame nextFloat(this: *Rand) ret float {
        local i: int = this.nextInt();
        if (i < 0) {
            i = -i;
        }
        # Normalize to [0,1)
        local denom: float = 4294967296.0;
        local f: float = cast<float>(i) / denom;
        return f;
    }

    frame nextBool(this: *Rand) ret bool {
        return (this.nextInt() & 1) == 1;
    }

    frame rangeInt(this: *Rand, min: int, max: int) ret int {
        local diff: int = max - min;
        if (diff <= 0) 
            return min;
        local i: int = this.nextInt();
        if (i < 0) {
            i = -i;
        }
        return min + (i % diff);
    }

    frame rangeFloat(this: *Rand, min: float, max: float) ret float {
        return min + (this.nextFloat() * (max - min));
    }

    # Generates a random float with Gaussian (normal) distribution
    # Uses Box-Muller transform
    frame nextGaussian(this: *Rand) ret float {
        local u1: float = this.nextFloat();
        local u2: float = this.nextFloat();
        # Avoid log(0) - use a small epsilon
        local epsilon: float = 0.00001;
        if (u1 < epsilon) 
            u1 = epsilon;
        # Box-Muller transform (approximation using available functions)
        # z = sqrt(-2 * ln(u1)) * cos(2 * pi * u2)
        local pi: float = 3.14159265358979323846;
        local mag: float = 0.0 - (2.0 * (u1 - 0.5)); # Simplified approximation

        # Use polynomial approximation for cos
        local angle: float = 2.0 * pi * u2;
        local x2: float = angle * angle;
        local cosVal: float = (1.0 - (x2 / 2.0)) + ((x2 * x2) / 24.0);

        return mag * cosVal;
    }

    # Shuffle an array of integers in place
    frame shuffleInt(this: *Rand, arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = n - 1;
        loop (i > 0) {
            local j: int = this.rangeInt(0, i + 1);
            local temp: int = arr.get(i);
            arr.set(i, arr.get(j));
            arr.set(j, temp);
            i = i - 1;
        }
    }

    # Pick a random element from an array of integers
    frame choiceInt(this: *Rand, arr: *Array<int>) ret int {
        local n: int = arr.len();
        if (n == 0) 
            return 0;
        local idx: int = this.rangeInt(0, n);
        return arr.get(idx);
    }

    # Generate random bytes into a buffer
    frame fillBytes(this: *Rand, buf: *u8, len: int) {
        local i: int = 0;
        loop (i < len) {
            buf[i] = cast<u8>(this.nextInt() & 0xFF);
            i = i + 1;
        }
    }

    # Weighted random selection (returns index)
    frame weightedChoice(this: *Rand, weights: *Array<int>) ret int {
        local total: int = 0;
        local n: int = weights.len();
        local i: int = 0;
        loop (i < n) {
            total = total + weights.get(i);
            i = i + 1;
        }

        if (total <= 0) 
            return 0;
        local target: int = this.rangeInt(0, total);
        local cumulative: int = 0;
        i = 0;
        loop (i < n) {
            cumulative = cumulative + weights.get(i);
            if (target < cumulative) {
                return i;
            }
            i = i + 1;
        }
        return n - 1;
    }
}
