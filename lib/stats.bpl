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
    frame mean(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        local sum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            sum = sum + *(data + i);
            i = i + 1;
        }
        return sum / cast<float>(length);
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
        local mean: float = Stats.mean(data, length);
        local sumSquares: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local diff: float = *(data + i) - mean;
            sumSquares = sumSquares + (diff * diff);
            i = i + 1;
        }
        return sumSquares / cast<float>(length);
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

    # Calculate the median of an integer array (modifies the array - sorts it)
    frame median(data: *int, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        # Simple bubble sort for median calculation
        local i: int = 0;
        loop (i < (length - 1)) {
            local j: int = 0;
            loop (j < (length - i - 1)) {
                if (*(data + j) > *(data + j + 1)) {
                    local temp: int = *(data + j);
                    *(data + j) = *(data + j + 1);
                    *(data + j + 1) = temp;
                }
                j = j + 1;
            }
            i = i + 1;
        }

        if ((length % 2) == 1) {
            return cast<float>(*(data + (length / 2)));
        } else {
            local mid: int = length / 2;
            return cast<float>(*((data + mid) - 1) + *(data + mid)) / 2.0;
        }
    }

    # Calculate the median of a float array (modifies the array - sorts it)
    frame median(data: *float, length: int) ret float {
        if ((data == nullptr) || (length <= 0)) {
            return 0.0;
        }
        # Simple bubble sort for median calculation
        local i: int = 0;
        loop (i < (length - 1)) {
            local j: int = 0;
            loop (j < (length - i - 1)) {
                if (*(data + j) > *(data + j + 1)) {
                    local temp: float = *(data + j);
                    *(data + j) = *(data + j + 1);
                    *(data + j + 1) = temp;
                }
                j = j + 1;
            }
            i = i + 1;
        }

        if ((length % 2) == 1) {
            return *(data + (length / 2));
        } else {
            local mid: int = length / 2;
            return (*((data + mid) - 1) + *(data + mid)) / 2.0;
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
        # Sort the array
        local i: int = 0;
        loop (i < (length - 1)) {
            local j: int = 0;
            loop (j < (length - i - 1)) {
                if (*(data + j) > *(data + j + 1)) {
                    local temp: float = *(data + j);
                    *(data + j) = *(data + j + 1);
                    *(data + j + 1) = temp;
                }
                j = j + 1;
            }
            i = i + 1;
        }

        local index: float = (p / 100.0) * cast<float>(length - 1);
        local lower: int = cast<int>(index);
        local upper: int = lower + 1;
        local fraction: float = index - cast<float>(lower);

        if (upper >= length) {
            return *((data + length) - 1);
        }
        return *(data + lower) + (fraction * (*(data + upper) - *(data + lower)));
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
        local recipSum: float = 0.0;
        local i: int = 0;
        loop (i < length) {
            local val: float = *(data + i);
            if (val <= 0.0) {
                return 0.0; # Harmonic mean undefined for non-positive values
            }
            recipSum = recipSum + (1.0 / val);
            i = i + 1;
        }

        return cast<float>(length) / recipSum;
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
