# Statistics Test Example

import [Stats] from "std/std.bpl";

import [printf] from "std/c.bpl";

frame main() ret int {
    printf("=== Statistics Test ===\n\n");

    # Integer data
    printf("--- Integer Statistics ---\n");
    local intData: int[10];
    intData[0] = 10;
    intData[1] = 20;
    intData[2] = 30;
    intData[3] = 40;
    intData[4] = 50;
    intData[5] = 60;
    intData[6] = 70;
    intData[7] = 80;
    intData[8] = 90;
    intData[9] = 100;

    printf("Data: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100\n");
    printf("Sum: %ld\n", Stats.sum(&intData[0], 10));
    printf("Mean: %.2f\n", Stats.mean(&intData[0], 10));
    printf("Min: %d\n", Stats.min(&intData[0], 10));
    printf("Max: %d\n", Stats.max(&intData[0], 10));
    printf("Range: %d\n", Stats.range(&intData[0], 10));
    printf("Variance: %.2f\n", Stats.variance(&intData[0], 10));
    printf("Stddev: %.2f\n", Stats.stddev(&intData[0], 10));

    # Float data
    printf("\n--- Float Statistics ---\n");
    local floatData: float[5];
    floatData[0] = 1.5;
    floatData[1] = 2.5;
    floatData[2] = 3.5;
    floatData[3] = 4.5;
    floatData[4] = 5.5;

    printf("Data: 1.5, 2.5, 3.5, 4.5, 5.5\n");
    printf("Sum: %.2f\n", Stats.sum(&floatData[0], 5));
    printf("Mean: %.2f\n", Stats.mean(&floatData[0], 5));
    printf("Min: %.2f\n", Stats.min(&floatData[0], 5));
    printf("Max: %.2f\n", Stats.max(&floatData[0], 5));
    printf("Variance: %.2f\n", Stats.variance(&floatData[0], 5));
    printf("Stddev: %.4f\n", Stats.stddev(&floatData[0], 5));

    # Median test
    printf("\n--- Median Tests ---\n");
    local medianData: int[5];
    medianData[0] = 5;
    medianData[1] = 1;
    medianData[2] = 9;
    medianData[3] = 3;
    medianData[4] = 7;
    printf("Data: 5, 1, 9, 3, 7\n");
    printf("Median (odd count): %.2f\n", Stats.median(&medianData[0], 5));

    local medianData2: int[4];
    medianData2[0] = 1;
    medianData2[1] = 2;
    medianData2[2] = 3;
    medianData2[3] = 4;
    printf("Data: 1, 2, 3, 4\n");
    printf("Median (even count): %.2f\n", Stats.median(&medianData2[0], 4));

    # Mode test
    printf("\n--- Mode Test ---\n");
    local modeData: int[7];
    modeData[0] = 1;
    modeData[1] = 2;
    modeData[2] = 2;
    modeData[3] = 3;
    modeData[4] = 2;
    modeData[5] = 4;
    modeData[6] = 5;
    printf("Data: 1, 2, 2, 3, 2, 4, 5\n");
    printf("Mode: %d\n", Stats.mode(&modeData[0], 7));

    # Percentile test
    printf("\n--- Percentile Test ---\n");
    local percData: float[10];
    percData[0] = 1.0;
    percData[1] = 2.0;
    percData[2] = 3.0;
    percData[3] = 4.0;
    percData[4] = 5.0;
    percData[5] = 6.0;
    percData[6] = 7.0;
    percData[7] = 8.0;
    percData[8] = 9.0;
    percData[9] = 10.0;
    printf("Data: 1-10\n");
    printf("25th percentile: %.2f\n", Stats.percentile(&percData[0], 10, 25.0));
    # Reset for next calc
    percData[0] = 1.0;
    percData[1] = 2.0;
    percData[2] = 3.0;
    percData[3] = 4.0;
    percData[4] = 5.0;
    percData[5] = 6.0;
    percData[6] = 7.0;
    percData[7] = 8.0;
    percData[8] = 9.0;
    percData[9] = 10.0;
    printf("50th percentile: %.2f\n", Stats.percentile(&percData[0], 10, 50.0));
    percData[0] = 1.0;
    percData[1] = 2.0;
    percData[2] = 3.0;
    percData[3] = 4.0;
    percData[4] = 5.0;
    percData[5] = 6.0;
    percData[6] = 7.0;
    percData[7] = 8.0;
    percData[8] = 9.0;
    percData[9] = 10.0;
    printf("75th percentile: %.2f\n", Stats.percentile(&percData[0], 10, 75.0));

    # Correlation test
    printf("\n--- Correlation Test ---\n");
    local dataX: float[5];
    local dataY: float[5];
    dataX[0] = 1.0;
    dataX[1] = 2.0;
    dataX[2] = 3.0;
    dataX[3] = 4.0;
    dataX[4] = 5.0;
    dataY[0] = 2.0;
    dataY[1] = 4.0;
    dataY[2] = 6.0;
    dataY[3] = 8.0;
    dataY[4] = 10.0;
    printf("X: 1, 2, 3, 4, 5\n");
    printf("Y: 2, 4, 6, 8, 10 (perfect linear)\n");
    printf("Correlation: %.4f\n", Stats.correlation(&dataX[0], &dataY[0], 5));
    printf("Covariance: %.4f\n", Stats.covariance(&dataX[0], &dataY[0], 5));

    # Geometric and Harmonic means
    printf("\n--- Special Means ---\n");
    local posData: float[4];
    posData[0] = 1.0;
    posData[1] = 2.0;
    posData[2] = 4.0;
    posData[3] = 8.0;
    printf("Data: 1, 2, 4, 8\n");
    printf("Arithmetic mean: %.4f\n", Stats.mean(&posData[0], 4));
    printf("Geometric mean: %.4f\n", Stats.geometricMean(&posData[0], 4));
    printf("Harmonic mean: %.4f\n", Stats.harmonicMean(&posData[0], 4));

    printf("\n=== Statistics Test Complete ===\n");
    return 0;
}
