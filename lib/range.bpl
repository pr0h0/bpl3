# Range - Represents a range of integers with start, end, and step

export [Range];

struct Range {
    start: int,
    # Held as long so an inclusive endpoint at the maximum int is
    # representable: its exclusive end is one past that value.
    end: long,
    step: int,
    /#
        Creates a new range from start (inclusive) to end (exclusive) with step
    #/
    frame new(start: int, end: int, step: int) ret Range {
        local r: Range;
        r.start = start;
        r.end = end;
        r.step = step;
        return r;
    }

    /#
        Creates a range from 0 to end (exclusive) with step 1
    #/
    frame until(end: int) ret Range {
        return Range.new(0, end, 1);
    }

    /#
        Creates a range from start to end (exclusive) with step 1
    #/
    frame between(start: int, end: int) ret Range {
        return Range.new(start, end, 1);
    }

    /#
        Creates a range from start to end (inclusive) with step 1
    #/
    frame betweenInclusive(start: int, end: int) ret Range {
        local r: Range;
        r.start = start;
        # Widen before adding: an inclusive maximum int would wrap to the
        # minimum and silently describe an empty range.
        r.end = cast<long>(end) + 1;
        r.step = 1;
        return r;
    }

    /#
        Returns the number of elements in the range
    #/
    frame len(this: *Range) ret int {
        if (this.step == 0) {
            return 0;
        }
        # The distance between the endpoints can exceed int even when the
        # number of elements does not, so the count is computed in long.
        local start: long = cast<long>(this.start);
        local step: long = cast<long>(this.step);
        if (this.step > 0) {
            if (start >= this.end) {
                return 0;
            }
            return cast<int>((((this.end - start) + step) - 1) / step);
        } else {
            if (start <= this.end) {
                return 0;
            }
            return cast<int>(((start - this.end - step) - 1) / -step);
        }
    }

    /#
        Checks if a value is contained in the range
    #/
    frame contains(this: *Range, value: int) ret bool {
        # The offset from the start can exceed int for a wide range.
        local position: long = cast<long>(value);
        local start: long = cast<long>(this.start);
        local step: long = cast<long>(this.step);
        if (this.step > 0) {
            if ((position < start) || (position >= this.end)) {
                return false;
            }
            return ((position - start) % step) == 0;
        } else if (this.step < 0) {
            if ((position > start) || (position <= this.end)) {
                return false;
            }
            return ((start - position) % -step) == 0;
        }
        return false;
    }

    /#
        Returns the element at the given index (0-based)
    #/
    frame get(this: *Range, index: int) ret int {
        return this.start + (index * this.step);
    }

    /#
        Creates a reversed range
    #/
    frame reverse(this: *Range) ret Range {
        # Calculate the last element that would be included
        local len: int = this.len();
        if (len == 0) {
            return *this;
        }
        local last: long = cast<long>(this.start)
            + (cast<long>(len - 1) * cast<long>(this.step));
        local reversed: Range;
        reversed.start = cast<int>(last);
        reversed.end = cast<long>(this.start) - cast<long>(this.step);
        reversed.step = -this.step;
        return reversed;
    }

    # Operator overloading: Index access with []
    frame __get__(this: *Range, index: int) ret int {
        return this.get(index);
    }

    # Operator overloading: Equality comparison
    frame __eq__(this: *Range, other: Range) ret bool {
        return (this.start == other.start) && (this.end == other.end) && (this.step == other.step);
    }

    # Operator overloading: Inequality comparison
    frame __ne__(this: *Range, other: Range) ret bool {
        return !this.__eq__(other);
    }
}
