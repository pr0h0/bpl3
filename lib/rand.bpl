# Pseudo-random number generator (LCG)

export [Rand];

struct Rand {
    state: u64,
    frame seed(seed: u64) ret Rand {
        local r: Rand;
        r.state = seed;
        return r;
    }

    frame nextInt(this: *Rand) ret int {
        # LCG constants (Numerical Recipes)
        this.state = (this.state * 1664525) + 1013904223;
        # Return lower 32 bits as int
        return cast<int>(this.state & 0xFFFFFFFF);
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

    frame rangeInt(this: *Rand, min: int, max: int) ret int {
        local diff: int = max - min;
        local i: int = this.nextInt();
        if (i < 0) {
            i = -i;
        }
        return min + (i % diff);
    }
}
