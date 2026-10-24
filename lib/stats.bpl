# Statistical functions for numerical analysis

export [Stats];

import [Math] from "std/math.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Compensated finite summation with optional division before accumulation.
# Signal overflow before its compensation would become an invalid infinity.
frame statsCompensatedSum(data: *float, length: int, divisor: float) ret float {
    local sum: float = 0.0;
    local error: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i) / divisor;
        local next: float = sum + sample;
        if (Math.isInfinite(next)) {
            return next;
        }
        if (Math.abs(sum) >= Math.abs(sample)) {
            error = error + ((sum - next) + sample);
        } else {
            error = error + ((sample - next) + sum);
        }
        sum = next;
    }
    return sum + error;
}

# Internal fallback: normalize finite samples before accumulating deviations.
# Return normalized variance and its scale separately to avoid squaring scale.
frame statsScaledVariance(data: *float, length: int, divisor: int) ret (float, float) {
    local scale: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i);
        if (Math.isNan(sample) || Math.isInfinite(sample)) {
            return (sample - sample, 1.0);
        }
        local magnitude: float = Math.abs(sample);
        if (magnitude > scale) {
            scale = magnitude;
        }
    }
    if (scale == 0.0) {
        return (0.0, 1.0);
    }
    local origin: float = *data;
    local running: float = 0.0;
    local squares: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i);
        local difference: float = sample - origin;
        if (Math.isInfinite(difference)) {
            # Opposite extremes can overflow subtraction; normalized operands
            # remain bounded even when their unscaled difference does not.
            sample = sample / scale - origin / scale;
        } else {
            # Close inputs have an accurately represented difference. Dividing
            # them first would lose that small gap near a large common offset.
            sample = difference / scale;
        }
        local delta: float = sample - running;
        running = running + delta / cast<float>(i + 1);
        squares = squares + delta * (sample - running);
    }
    return (squares / cast<float>(divisor), scale);
}

# Subtract an exactly represented input before updating the mean. This keeps
# a small spread from disappearing when the absolute mean rounds to an input.
frame statsFloatVariance(data: *float, length: int, divisor: int) ret float {
    local origin: float = *data;
    local running: float = 0.0;
    local squares: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i) - origin;
        local delta: float = sample - running;
        running = running + delta / cast<float>(i + 1);
        squares = squares + delta * (sample - running);
    }
    local result: float = squares / cast<float>(divisor);
    if (Math.isNan(result) || Math.isInfinite(result) || result == 0.0) {
        local (normalized: float, scale: float) = statsScaledVariance(data, length, divisor);
        return (normalized * scale) * scale;
    }
    return result;
}

# Internal third/fourth standardized moment and whether a spread exists.
# Keep the deviation and standard deviation in matching normalized units.
frame statsStandardizedMoment(data: *float, length: int, power: int) ret (float, bool) {
    local (variance: float, scale: float) = statsScaledVariance(data, length, length);
    if (variance == 0.0) { return (0.0, false); }
    if (Math.isNan(variance)) { return (variance, true); }
    local origin: float = *data;
    local sum: float = 0.0;
    local error: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i);
        local difference: float = sample - origin;
        local normalized: float = difference / scale;
        if (Math.isInfinite(difference)) {
            normalized = sample / scale - origin / scale;
        }
        local next: float = sum + normalized;
        if (Math.abs(sum) >= Math.abs(normalized)) {
            error = error + ((sum - next) + normalized);
        } else {
            error = error + ((normalized - next) + sum);
        }
        sum = next;
    }
    local count: float = cast<float>(length);
    local mean: float = (sum + error) / count;
    local stddev: float = Math.sqrt(variance);
    sum = 0.0;
    error = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local sample: float = *(data + i);
        local difference: float = sample - origin;
        local normalized: float = difference / scale;
        if (Math.isInfinite(difference)) {
            normalized = sample / scale - origin / scale;
        }
        local standardized: float = (normalized - mean) / stddev;
        local square: float = standardized * standardized;
        local moment: float = square * standardized;
        if (power == 4) { moment = square * square; }
        local next: float = sum + moment;
        if (Math.abs(sum) >= Math.abs(moment)) {
            error = error + ((sum - next) + moment);
        } else {
            error = error + ((moment - next) + sum);
        }
        sum = next;
    }
    return ((sum + error) / count, true);
}

# Error-free subtraction residual, for finite operands and difference.
frame statsDifferenceError(a: float, b: float, difference: float) ret float {
    local virtualB: float = a - difference;
    return (a - (difference + virtualB)) + (virtualB - b);
}

# Product residual for bounded normalized samples/sums. The splitter (2^27+1)
# cannot overflow here, since sums are bounded by twice the int sample count.
frame statsProductError(a: float, b: float, product: float) ret float {
    local splitA: float = 134217729.0 * a;
    local splitB: float = 134217729.0 * b;
    local highA: float = splitA - (splitA - a);
    local highB: float = splitB - (splitB - b);
    local lowA: float = a - highA;
    local lowB: float = b - highB;
    local error1: float = product - highA * highB;
    local error2: float = error1 - lowA * highB;
    local error3: float = error2 - highA * lowB;
    return lowA * lowB - error3;
}

# Retain small raw terms when a large origin or mean would erase them.
frame statsRawCovariance(dataX: *float, dataY: *float, length: int, originX: float, originY: float, scaleX: float, scaleY: float) ret float {
    local sumX: float = 0.0;
    local sumY: float = 0.0;
    local sumProducts: float = 0.0;
    local errorX: float = 0.0;
    local errorY: float = 0.0;
    local errorProducts: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local x: float = *(dataX + i);
        local y: float = *(dataY + i);
        local differenceX: float = x - originX;
        local differenceY: float = y - originY;
        if (Math.isInfinite(differenceX)) {
            x = x / scaleX - originX / scaleX;
        } else {
            x = differenceX / scaleX;
        }
        if (Math.isInfinite(differenceY)) {
            y = y / scaleY - originY / scaleY;
        } else {
            y = differenceY / scaleY;
        }
        local product: float = x * y;
        local nextX: float = sumX + x;
        if (Math.abs(sumX) >= Math.abs(x)) {
            errorX = errorX + ((sumX - nextX) + x);
        } else {
            errorX = errorX + ((x - nextX) + sumX);
        }
        sumX = nextX;
        local nextY: float = sumY + y;
        if (Math.abs(sumY) >= Math.abs(y)) {
            errorY = errorY + ((sumY - nextY) + y);
        } else {
            errorY = errorY + ((y - nextY) + sumY);
        }
        sumY = nextY;
        local nextProduct: float = sumProducts + product;
        if (Math.abs(sumProducts) >= Math.abs(product)) {
            errorProducts = errorProducts + ((sumProducts - nextProduct) + product);
        } else {
            errorProducts = errorProducts + ((product - nextProduct) + sumProducts);
        }
        sumProducts = nextProduct;
        errorProducts = errorProducts + statsProductError(x, y, product);
    }
    local count: float = cast<float>(length);
    local meanProduct: float = sumX * sumY;
    local meanError: float = statsProductError(sumX, sumY, meanProduct)
        + sumX * errorY + errorX * sumY + errorX * errorY;
    local quotient: float = meanProduct / count;
    local rounded: float = quotient * count;
    local quotientError: float = ((meanProduct - rounded)
        - statsProductError(quotient, count, rounded) + meanError) / count;
    local difference: float = sumProducts - quotient;
    local correction: float = statsDifferenceError(sumProducts, quotient, difference)
        + errorProducts - quotientError;
    return (difference + correction) / count;
}

# Internal population moments, normalized independently along both axes.
frame statsScaledMoments(dataX: *float, dataY: *float, length: int) ret (float, float, float, float, float) {
    local scaleX: float = 0.0;
    local scaleY: float = 0.0;
    local invalidX: bool = false;
    local invalidY: bool = false;
    local invalid: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local x: float = *(dataX + i);
        local y: float = *(dataY + i);
        if (Math.isNan(x) || Math.isInfinite(x)) {
            invalidX = true;
            invalid = x - x;
        } else if (Math.abs(x) > scaleX) {
            scaleX = Math.abs(x);
        }
        if (Math.isNan(y) || Math.isInfinite(y)) {
            invalidY = true;
            invalid = y - y;
        } else if (Math.abs(y) > scaleY) {
            scaleY = Math.abs(y);
        }
    }
    if (invalidX || invalidY) {
        # Preserve correlation's zero result when the other finite axis has
        # zero standard deviation, even if this axis contains NaN/infinity.
        local varianceX: float = invalid;
        local varianceY: float = invalid;
        if (!invalidX) {
            local (normalized: float, scale: float) = statsScaledVariance(dataX, length, length);
            if (Math.sqrt(normalized) * scale == 0.0) {
                varianceX = 0.0;
            }
        }
        if (!invalidY) {
            local (normalized: float, scale: float) = statsScaledVariance(dataY, length, length);
            if (Math.sqrt(normalized) * scale == 0.0) {
                varianceY = 0.0;
            }
        }
        return (invalid, varianceX, varianceY, 1.0, 1.0);
    }
    if (scaleX == 0.0) {
        scaleX = 1.0;
    }
    if (scaleY == 0.0) {
        scaleY = 1.0;
    }
    local originX: float = *dataX;
    local originY: float = *dataY;
    local lostOriginX: bool = false;
    local lostOriginY: bool = false;
    local lostCentered: bool = false;
    local meanX: float = 0.0;
    local meanY: float = 0.0;
    local squaresX: float = 0.0;
    local squaresY: float = 0.0;
    local products: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local x: float = *(dataX + i);
        local y: float = *(dataY + i);
        local differenceX: float = x - originX;
        local differenceY: float = y - originY;
        if (Math.isInfinite(differenceX)) {
            x = x / scaleX - originX / scaleX;
        } else {
            if (statsDifferenceError(x, originX, differenceX) != 0.0) {
                lostOriginX = true;
            }
            x = differenceX / scaleX;
        }
        if (Math.isInfinite(differenceY)) {
            y = y / scaleY - originY / scaleY;
        } else {
            if (statsDifferenceError(y, originY, differenceY) != 0.0) {
                lostOriginY = true;
            }
            y = differenceY / scaleY;
        }
        local deltaX: float = x - meanX;
        local deltaY: float = y - meanY;
        local count: float = cast<float>(i + 1);
        meanX = meanX + deltaX / count;
        meanY = meanY + deltaY / count;
        squaresX = squaresX + deltaX * (x - meanX);
        squaresY = squaresY + deltaY * (y - meanY);
    }
    local count: float = cast<float>(length);
    # Recompute the cross moment around the final means. Online updates can
    # leave a tiny residual at exact cancellation, which rescaling amplifies.
    local productError: float = 0.0;
    local residualX: float = 0.0;
    local residualY: float = 0.0;
    local residualErrorX: float = 0.0;
    local residualErrorY: float = 0.0;
    loop (local i: int = 0; i < length; i = i + 1) {
        local x: float = *(dataX + i);
        local y: float = *(dataY + i);
        local differenceX: float = x - originX;
        local differenceY: float = y - originY;
        if (Math.isInfinite(differenceX)) {
            x = x / scaleX - originX / scaleX;
        } else {
            x = differenceX / scaleX;
        }
        if (Math.isInfinite(differenceY)) {
            y = y / scaleY - originY / scaleY;
        } else {
            y = differenceY / scaleY;
        }
        local centeredX: float = x - meanX;
        local centeredY: float = y - meanY;
        if (statsDifferenceError(x, meanX, centeredX) != 0.0
            || statsDifferenceError(y, meanY, centeredY) != 0.0) {
            lostCentered = true;
        }
        local product: float = centeredX * centeredY;
        local nextProduct: float = products + product;
        if (Math.abs(products) >= Math.abs(product)) {
            productError = productError + ((products - nextProduct) + product);
        } else {
            productError = productError + ((product - nextProduct) + products);
        }
        products = nextProduct;
        local nextX: float = residualX + centeredX;
        if (Math.abs(residualX) >= Math.abs(centeredX)) {
            residualErrorX = residualErrorX + ((residualX - nextX) + centeredX);
        } else {
            residualErrorX = residualErrorX + ((centeredX - nextX) + residualX);
        }
        residualX = nextX;
        local nextY: float = residualY + centeredY;
        if (Math.abs(residualY) >= Math.abs(centeredY)) {
            residualErrorY = residualErrorY + ((residualY - nextY) + centeredY);
        } else {
            residualErrorY = residualErrorY + ((centeredY - nextY) + residualY);
        }
        residualY = nextY;
    }
    # Correct for the rounded means using compensated centered residual sums.
    local covariance: float = ((products + productError)
        - (residualX + residualErrorX) * ((residualY + residualErrorY) / count)) / count;
    if (lostOriginX || lostOriginY || lostCentered) {
        local rawOriginX: float = originX;
        local rawOriginY: float = originY;
        if (lostOriginX) {
            rawOriginX = 0.0;
        }
        if (lostOriginY) {
            rawOriginY = 0.0;
        }
        covariance = statsRawCovariance(dataX, dataY, length, rawOriginX, rawOriginY, scaleX, scaleY);
    }
    # Original normalized samples lie in [-1,1], bounding population covariance.
    if (covariance > 1.0) {
        covariance = 1.0;
    }
    if (covariance < -1.0) {
        covariance = -1.0;
    }
    return (covariance, squaresX / count, squaresY / count, scaleX, scaleY);
}

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
        Arithmetic mean with compensated accumulation. Divide samples first
        when their ordinary sum may overflow; normalize only as a last resort
        at the finite limit, retaining small mixed-magnitude terms otherwise.
    #/
    frame mean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local largest: float = 0.0;
        local scan: int = 0;
        loop (scan < length) {
            local magnitude: float = Math.abs(*(data + scan));
            if (magnitude > largest) {
                largest = magnitude;
            }
            scan = scan + 1;
        }

        local count: float = cast<float>(length);
        if (Math.isInfinite(largest)) {
            # Preserve infinite sums and NaN from opposite infinities.
            local sum: float = 0.0;
            local j: int = 0;
            loop (j < length) {
                sum = sum + *(data + j);
                j = j + 1;
            }
            return sum / count;
        }

        local divisor: float = 1.0;
        if (Math.isInfinite(largest * count)) {
            divisor = count;
        }
        local total: float = statsCompensatedSum(data, length, divisor);
        if (!Math.isInfinite(total)) {
            if (divisor == 1.0) { return total / count; }
            return total;
        }

        # Rounded partial sums can overflow even when the exact mean is
        # finite (e.g. three copies of the largest finite value). A normalized
        # sum is bounded by the int count; clamp before restoring the scale.
        local normalized: float = statsCompensatedSum(data, length, largest) / count;
        if (normalized > 1.0) {
            normalized = 1.0;
        } else if (normalized < -1.0) {
            normalized = -1.0;
        }
        return normalized * largest;
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
        local span: long = cast<long>(Stats.max(data, length))
                        - cast<long>(Stats.min(data, length));
        if (span > cast<long>(2147483647)) {
            throw "Stats.range result exceeds int";
        }
        return cast<int>(span);
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
        return statsFloatVariance(data, length, length);
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
        return statsFloatVariance(data, length, length - 1);
    }

    # Calculate the standard deviation of an integer array (population)
    frame stddev(data: *int, length: int) ret float {
        return Math.sqrt(Stats.variance(data, length));
    }

    # Calculate the standard deviation of a float array (population)
    frame stddev(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local variance: float = Stats.variance(data, length);
        # A finite root may survive an overflowing or underflowing variance.
        # Subnormal variance rounding can also distort a representable root.
        if (Math.isInfinite(variance) || variance < Math.pow(2.0, -1022.0)) {
            local (normalized: float, scale: float) = statsScaledVariance(data, length, length);
            return Math.sqrt(normalized) * scale;
        }
        return Math.sqrt(variance);
    }

    # Calculate the sample standard deviation of an integer array
    frame sampleStddev(data: *int, length: int) ret float {
        return Math.sqrt(Stats.sampleVariance(data, length));
    }

    # Calculate the sample standard deviation of a float array
    frame sampleStddev(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 1)) {
            return 0.0;
        }
        local variance: float = Stats.sampleVariance(data, length);
        # A finite root may survive an overflowing or underflowing variance.
        # Subnormal variance rounding can also distort a representable root.
        if (Math.isInfinite(variance) || variance < Math.pow(2.0, -1022.0)) {
            local (normalized: float, scale: float) = statsScaledVariance(data, length, length - 1);
            return Math.sqrt(normalized) * scale;
        }
        return Math.sqrt(variance);
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
            # Leaf nodes have no children. Stop before doubling a leaf index,
            # which can otherwise overflow and turn into a negative offset.
            if (root >= (count / 2)) { return; }
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
            # Leaf nodes have no children. Stop before doubling a leaf index,
            # which can otherwise overflow and turn into a negative offset.
            if (root >= (count / 2)) { return; }
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
        # A NaN percentile has no meaningful rank, even for a singleton.
        if (p != p) { return p; }
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
        local (covariance: float, _varianceX: float, _varianceY: float, scaleX: float, scaleY: float) = statsScaledMoments(dataX, dataY, length);
        # Restore the larger scale first: multiplying a small scale first can
        # erase a result that the larger scale would have kept representable.
        if (scaleX >= scaleY) {
            return (covariance * scaleX) * scaleY;
        }
        return (covariance * scaleY) * scaleX;
    }

    # Calculate the Pearson correlation coefficient between two float arrays
    frame correlation(dataX: *float, dataY: *float, length: int) ret float {
        if ((dataX == nullptr) || (dataY == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local (covariance: float, varianceX: float, varianceY: float, _scaleX: float, _scaleY: float) = statsScaledMoments(dataX, dataY, length);
        if ((varianceX == 0.0) || (varianceY == 0.0)) {
            return 0.0;
        }
        # Units cancel in the normalized domain. Never form a dimensional
        # covariance or product of standard deviations that can overflow.
        local result: float = covariance / Math.sqrt(varianceX) / Math.sqrt(varianceY);
        if (result > 1.0) {
            return 1.0;
        }
        if (result < -1.0) {
            return -1.0;
        }
        return result;
    }

    # Calculate the geometric mean of a float array (all values must be positive)
    frame geometricMean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local logSum: float = 0.0;
        local error: float = 0.0;
        local smallest: float = 0.0;
        local largest: float = 0.0;
        local invalid: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local val: float = *(data + i);
            if (val <= 0.0) {
                return 0.0; # Geometric mean undefined for non-positive values
            }
            if (Math.isNan(val)) {
                invalid = val;
            } else {
                if (val > largest) { largest = val; }
                if (smallest == 0.0 || val < smallest) { smallest = val; }
                # Keep nonfinite classification separate from compensation:
                # an infinite logarithm would form inf - inf in the residual.
                if (!Math.isInfinite(val)) {
                    local term: float = Math.log(val);
                    local next: float = logSum + term;
                    if (Math.abs(logSum) >= Math.abs(term)) {
                        error = error + ((logSum - next) + term);
                    } else {
                        error = error + ((term - next) + logSum);
                    }
                    logSum = next;
                }
            }
            i = i + 1;
        }
        # Preserve the existing priority of nonpositive inputs over NaNs,
        # and NaNs over positive infinity, after examining every sample.
        if (Math.isNan(invalid)) { return invalid; }
        if (Math.isInfinite(largest)) { return largest; }
        if (smallest == largest) { return smallest; }
        local result: float = Math.exp((logSum + error) / cast<float>(length));
        # A finite positive geometric mean lies between its input extremes.
        # Rounding logarithms must not produce infinity or erase a subnormal.
        if (result > largest) { return largest; }
        if (result < smallest) { return smallest; }
        return result;
    }

    # Calculate the harmonic mean of a float array (all values must be positive)
    frame harmonicMean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        # Reciprocals are accumulated relative to the smallest sample, not the
        # largest. Scaling by the largest makes each term largest/sample,
        # which overflows as soon as the samples span a wide range: with
        # 1e-308 and 1e308 that ratio is not representable, and the harmonic
        # mean came out as zero. Against the smallest, every term is at most
        # one and at least one term is exactly one, so the sum is between one
        # and the count.
        local smallest: float = 0.0;
        local scan: int = 0;
        loop (scan < length) {
            local sample: float = *(data + scan);
            if (Math.isNan(sample)) { return sample; }
            if (sample <= 0.0) {
                return 0.0; # Harmonic mean undefined for non-positive values
            }
            if ((smallest == 0.0) || (sample < smallest)) {
                smallest = sample;
            }
            scan = scan + 1;
        }

        # All positive samples are infinite: their reciprocals are zero,
        # so the harmonic mean is positive infinity. Avoid inf/inf below.
        if (Math.isInfinite(smallest)) { return smallest; }

        local scaledSum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            scaledSum = scaledSum + (smallest / *(data + i));
            i = i + 1;
        }

        # Divide before scaling back: the count over the sum is never larger
        # than the count, so this cannot leave the range, while forming
        # count * smallest first could.
        return (cast<float>(length) / scaledSum) * smallest;
    }

    # Calculate the skewness of a float array
    frame skewness(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 2)) {
            return 0.0;
        }
        local (moment: float, _spread: bool) = statsStandardizedMoment(data, length, 3);
        return moment;
    }

    # Calculate the kurtosis of a float array (excess kurtosis)
    frame kurtosis(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 3)) {
            return 0.0;
        }
        local (moment: float, spread: bool) = statsStandardizedMoment(data, length, 4);
        if (!spread) { return 0.0; }
        return moment - 3.0; # Excess kurtosis
    }
}
