# Pseudo-random number generator (LCG)

export [Rand];

import [Array] from "std/array.bpl";
import [Math] from "std/math.bpl";

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
        # Every unsigned 32-bit value maps exactly into [0, 1).
        return cast<float>(this.nextUInt()) / 4294967296.0;
    }

    frame nextBool(this: *Rand) ret bool {
        return (this.nextInt() & 1) == 1;
    }

    frame range(this: *Rand, min: int, max: int) ret int {
        if (max <= min) { return min; }
        local span: ulong = cast<ulong>(cast<long>(max) - cast<long>(min));
        local domain: ulong = cast<ulong>(0x100000000);
        local limit: ulong = domain - (domain % span);
        local value: ulong = cast<ulong>(this.nextUInt());
        loop (value >= limit) { value = cast<ulong>(this.nextUInt()); }
        return cast<int>(cast<long>(min) + cast<long>(value % span));
    }

    frame range(this: *Rand, min: float, max: float) ret float {
        if (max <= min) { return min; }
        local fraction: float = this.nextFloat();
        # A convex combination avoids overflow in max-min for opposite signs.
        return min * (1.0 - fraction) + max * fraction;
    }

    # Box-Muller transform; reject zero instead of clipping the distribution.
    frame nextGaussian(this: *Rand) ret float {
        local u1: float = this.nextFloat();
        loop (u1 == 0.0) { u1 = this.nextFloat(); }
        local u2: float = this.nextFloat();
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(6.283185307179586 * u2);
    }

    # Shuffle an array of integers in place
    frame shuffleInt(this: *Rand, arr: *Array<int>) {
        local n: int = arr.len();
        local i: int = n - 1;
        loop (i > 0) {
            local j: int = this.range(0, i + 1);
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
        local idx: int = this.range(0, n);
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
        local target: int = this.range(0, total);
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
