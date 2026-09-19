# Statistical functions for numerical analysis

export [Stats];

import [Math] from "std/math.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct Stats {
    # Calculate the mean (average) of an integer array
    frame mean(data: *int, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local sum: long = cast<long>(0);
        local i: int = 0;
        loop (i < length) {
            sum = sum + cast<long>(*(data + i));
            i = i + 1;
        }
        return cast<float>(sum) / cast<float>(length);
    }

    # Calculate the mean of a float array
    /#
        Arithmetic mean, accumulated one sample at a time. Summing first and
        dividing afterwards overflows for large samples even when the mean is
        finite: two copies of 1e308 summed to infinity.
    #/
    frame mean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local running: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local count: float = cast<float>(i + 1);
            # Scale both terms before combining them. Taking the difference
            # between the sample and the running mean first overflows for
            # operands of opposite sign near the limit, such as -1e308 and
            # 1e308, whose mean is exactly zero.
            running = (running - (running / count)) + (*(data + i) / count);
            i = i + 1;
        }
        return running;
    }

    # Calculate the sum of an integer array
    frame sum(data: *int, length: int) ret long {
        if ((data == nullptr) || (length <= 0)) {
            return cast<long>(0);
        }
        local sum: long = cast<long>(0);
        local i: int = 0;
        loop (i < length) {
            sum = sum + cast<long>(*(data + i));
            i = i + 1;
        }
        return sum;
    }

    # Calculate the sum of a float array
    frame sum(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local sum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            sum = sum + *(data + i);
            i = i + 1;
        }
        return sum;
    }

    # Calculate the minimum of an integer array
    frame min(data: *int, length: int) ret int {
        if ((data == nullptr) || (length <= 0)) {
            return 0;
        }
        local minVal: int = *data;
        local i: int = 1;
        loop (i < length) {
            if (*(data + i) < minVal) {
                minVal = *(data + i);
            }
            i = i + 1;
        }
        return minVal;
    }

    # Calculate the maximum of an integer array
    frame max(data: *int, length: int) ret int {
        if ((data == nullptr) || (length <= 0)) {
            return 0;
        }
        local maxVal: int = *data;
        local i: int = 1;
        loop (i < length) {
            if (*(data + i) > maxVal) {
                maxVal = *(data + i);
            }
            i = i + 1;
        }
        return maxVal;
    }

    # Calculate the minimum of a float array
    frame min(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local minVal: float = *data;
        local i: int = 1;
        loop (i < length) {
            if (*(data + i) < minVal) {
                minVal = *(data + i);
            }
            i = i + 1;
        }
        return minVal;
    }

    # Calculate the maximum of a float array
    frame max(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local maxVal: float = *data;
        local i: int = 1;
        loop (i < length) {
            if (*(data + i) > maxVal) {
                maxVal = *(data + i);
            }
            i = i + 1;
        }
        return maxVal;
    }

    # Calculate the range (max - min) of an integer array
    frame range(data: *int, length: int) ret int {
        return Stats.max(data, length) - Stats.min(data, length);
    }

    # Calculate the range of a float array
    frame range(data: *float, length: int) ret float {
        return Stats.max(data, length) - Stats.min(data, length);
    }

    # Calculate the variance of an integer array (population variance)
    frame variance(data: *int, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local mean: float = Stats.mean(data, length);
        local sumSquares: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = cast<float>(*(data + i)) - mean;
            sumSquares = sumSquares + (diff * diff);
            i = i + 1;
        }
        return sumSquares / cast<float>(length);
    }

    # Calculate the variance of a float array (population variance)
    frame variance(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        # Welford's method: the mean and the sum of squared deviations are
        # updated together, so neither a large sum nor a large mean times a
        # large count is ever formed.
        local running: float = 0.0;
        local squares: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local sample: float = *(data + i);
            local count: float = cast<float>(i + 1);
            local delta: float = sample - running;
            running = running + (delta / count);
            squares = squares + (delta * (sample - running));
            i = i + 1;
        }
        return squares / cast<float>(length);
    }

    # Calculate the sample variance of an integer array
    frame sampleVariance(data: *int, length: int) ret float {
        if ((data == nullptr) || (length <= 1)) {
            return 0.0;
        }
        local mean: float = Stats.mean(data, length);
        local sumSquares: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = cast<float>(*(data + i)) - mean;
            sumSquares = sumSquares + (diff * diff);
            i = i + 1;
        }
        return sumSquares / cast<float>(length - 1);
    }

    # Calculate the sample variance of a float array
    frame sampleVariance(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 1)) {
            return 0.0;
        }
        local mean: float = Stats.mean(data, length);
        local sumSquares: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = *(data + i) - mean;
            sumSquares = sumSquares + (diff * diff);
            i = i + 1;
        }
        return sumSquares / cast<float>(length - 1);
    }

    # Calculate the standard deviation of an integer array (population)
    frame stddev(data: *int, length: int) ret float {
        return Math.sqrt(Stats.variance(data, length));
    }

    # Calculate the standard deviation of a float array (population)
    frame stddev(data: *float, length: int) ret float {
        return Math.sqrt(Stats.variance(data, length));
    }

    # Calculate the sample standard deviation of an integer array
    frame sampleStddev(data: *int, length: int) ret float {
        return Math.sqrt(Stats.sampleVariance(data, length));
    }

    # Calculate the sample standard deviation of a float array
    frame sampleStddev(data: *float, length: int) ret float {
        return Math.sqrt(Stats.sampleVariance(data, length));
    }

    /#
        Sort an integer array in place with heapsort. The three callers below
        each ran a complete bubble sort, which needs n*(n-1)/2 comparisons
        whatever the input: selecting a median from 100,000 samples cost about
        five billion. Heapsort is O(n log n) in the worst case, sorts in place,
        and leaves the array fully sorted, which callers may rely on.
    #/
    frame sortInPlace(data: *int, length: int) {
        if ((data == nullptr) || (length <= 1)) {
            return;
        }

        # Build a max-heap, then repeatedly move its root to the end.
        local start: int = (length / 2) - 1;
        loop (start >= 0) {
            Stats.siftDown(data, start, length);
            start = start - 1;
        }

        local end: int = length - 1;
        loop (end > 0) {
            local top: int = *data;
            *data = *(data + end);
            *(data + end) = top;
            Stats.siftDown(data, 0, end);
            end = end - 1;
        }
    }

    /# Restore the heap property at root within the first count elements. #/
    frame siftDown(data: *int, root: int, count: int) {
        loop (true) {
            local largest: int = root;
            local left: int = (2 * root) + 1;
            local right: int = left + 1;

            if ((left < count) && (*(data + left) > *(data + largest))) {
                largest = left;
            }
            if ((right < count) && (*(data + right) > *(data + largest))) {
                largest = right;
            }
            if (largest == root) {
                return;
            }

            local swap: int = *(data + root);
            *(data + root) = *(data + largest);
            *(data + largest) = swap;
            root = largest;
        }
    }

    /# Sort a float array in place, as sortInPlace does for integers. #/
    frame sortInPlace(data: *float, length: int) {
        if ((data == nullptr) || (length <= 1)) {
            return;
        }

        local start: int = (length / 2) - 1;
        loop (start >= 0) {
            Stats.siftDownFloat(data, start, length);
            start = start - 1;
        }

        local end: int = length - 1;
        loop (end > 0) {
            local top: float = *data;
            *data = *(data + end);
            *(data + end) = top;
            Stats.siftDownFloat(data, 0, end);
            end = end - 1;
        }
    }

    frame siftDownFloat(data: *float, root: int, count: int) {
        loop (true) {
            local largest: int = root;
            local left: int = (2 * root) + 1;
            local right: int = left + 1;

            if ((left < count) && (*(data + left) > *(data + largest))) {
                largest = left;
            }
            if ((right < count) && (*(data + right) > *(data + largest))) {
                largest = right;
            }
            if (largest == root) {
                return;
            }

            local swap: float = *(data + root);
            *(data + root) = *(data + largest);
            *(data + largest) = swap;
            root = largest;
        }
    }

    # Calculate the median of an integer array (modifies the array - sorts it)
    frame median(data: *int, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        Stats.sortInPlace(data, length);

        if ((length % 2) == 1) {
            return cast<float>(*(data + (length / 2)));
        } else {
            local mid: int = length / 2;
            # Widen each value before adding: the sum of two int medians can
            # exceed int even when the median itself is representable.
            local lower: float = cast<float>(*((data + mid) - 1));
            local upper: float = cast<float>(*(data + mid));
            return (lower + upper) / 2.0;
        }
    }

    # Calculate the median of a float array (modifies the array - sorts it)
    frame median(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        Stats.sortInPlace(data, length);

        if ((length % 2) == 1) {
            return *(data + (length / 2));
        } else {
            local mid: int = length / 2;
            local lower: float = *((data + mid) - 1);
            local upper: float = *(data + mid);
            # Halve after adding where the sum is finite, which keeps the
            # midpoint of two subnormals exact; halving each one first would
            # round both to zero. Fall back to halving first only when the sum
            # itself cannot be represented.
            local total: float = lower + upper;
            if (Math.isInfinite(total)) {
                return (lower / 2.0) + (upper / 2.0);
            }
            return total / 2.0;
        }
    }

    # Calculate the mode of an integer array (returns first mode found)
    # Returns 0 if array is empty
    frame mode(data: *int, length: int) ret int {
        if ((data == nullptr) || (length <= 0)) {
            return 0;
        }
        local maxCount: int = 0;
        local mode: int = *data;

        local i: int = 0;
        loop (i < length) {
            local count: int = 0;
            local j: int = 0;
            loop (j < length) {
                if (*(data + i) == *(data + j)) {
                    count = count + 1;
                }
                j = j + 1;
            }
            if (count > maxCount) {
                maxCount = count;
                mode = *(data + i);
            }
            i = i + 1;
        }

        return mode;
    }

    # Calculate the percentile of a float array (0-100)
    # Note: modifies the array (sorts it)
    frame percentile(data: *float, length: int, p: float) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        if (p < 0.0) {
            p = 0.0;
        }
        if (p > 100.0) {
            p = 100.0;
        }
        Stats.sortInPlace(data, length);

        local index: float = (p / 100.0) * cast<float>(length - 1);
        local lower: int = cast<int>(index);
        local upper: int = lower + 1;
        local fraction: float = index - cast<float>(lower);

        if (upper >= length) {
            return *((data + length) - 1);
        }
        # Weight each endpoint rather than adding a scaled difference, which
        # overflows for opposite-sign extremes and loses the endpoints.
        return Math.lerp(*(data + lower), *(data + upper), fraction);
    }

    # Calculate the covariance between two float arrays
    frame covariance(dataX: *float, dataY: *float, length: int) ret float {
        if ((dataX == nullptr) || (dataY == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local meanX: float = Stats.mean(dataX, length);
        local meanY: float = Stats.mean(dataY, length);

        local sum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            sum = sum + ((*(dataX + i) - meanX) * (*(dataY + i) - meanY));
            i = i + 1;
        }

        return sum / cast<float>(length);
    }

    # Calculate the Pearson correlation coefficient between two float arrays
    frame correlation(dataX: *float, dataY: *float, length: int) ret float {
        if ((dataX == nullptr) || (dataY == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local cov: float = Stats.covariance(dataX, dataY, length);
        local stdX: float = Stats.stddev(dataX, length);
        local stdY: float = Stats.stddev(dataY, length);

        if ((stdX == 0.0) || (stdY == 0.0)) {
            return 0.0;
        }
        return cov / (stdX * stdY);
    }

    # Calculate the geometric mean of a float array (all values must be positive)
    frame geometricMean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local logSum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local val: float = *(data + i);
            if (val <= 0.0) {
                return 0.0; # Geometric mean undefined for non-positive values
            }
            logSum = logSum + Math.log(val);
            i = i + 1;
        }

        return Math.exp(logSum / cast<float>(length));
    }

    # Calculate the harmonic mean of a float array (all values must be positive)
    frame harmonicMean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        # Reciprocals are accumulated relative to the largest sample, so no
        # individual one can overflow: 1/1e-309 is not representable, which
        # made the harmonic mean of that value zero rather than the value
        # itself. Scaling turns each term into largest/sample, which is at
        # least one, and the scale is reapplied at the end.
        local largest: float = 0.0;
        local scan: int = 0;
        loop (scan < length) {
            local sample: float = *(data + scan);
            if (sample <= 0.0) {
                return 0.0; # Harmonic mean undefined for non-positive values
            }
            if (sample > largest) {
                largest = sample;
            }
            scan = scan + 1;
        }

        local scaledSum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            scaledSum = scaledSum + (largest / *(data + i));
            i = i + 1;
        }

        return (cast<float>(length) / scaledSum) * largest;
    }

    # Calculate the skewness of a float array
    frame skewness(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 2)) {
            return 0.0;
        }
        local mean: float = Stats.mean(data, length);
        local stddev: float = Stats.stddev(data, length);

        if (stddev == 0.0) {
            return 0.0;
        }
        local sum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = (*(data + i) - mean) / stddev;
            sum = sum + (diff * diff * diff);
            i = i + 1;
        }

        return sum / cast<float>(length);
    }

    # Calculate the kurtosis of a float array (excess kurtosis)
    frame kurtosis(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 3)) {
            return 0.0;
        }
        local mean: float = Stats.mean(data, length);
        local stddev: float = Stats.stddev(data, length);

        if (stddev == 0.0) {
            return 0.0;
        }
        local sum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = (*(data + i) - mean) / stddev;
            sum = sum + (diff * diff * diff * diff);
            i = i + 1;
        }

        return (sum / cast<float>(length)) - 3.0; # Excess kurtosis
    }
}
