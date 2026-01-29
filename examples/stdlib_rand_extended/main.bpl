# Extended Random Library Test

import [Rand], [Array] from "std/std.bpl";

extern printf(fmt: string, ...) ret int;

frame main() ret int {
    printf("=== Extended Random Library Test ===\n\n");

    # Create seeded random generator
    local rng: Rand = Rand.seed(12345);

    # Test basic random generation
    printf("--- Basic Random Generation ---\n");
    printf("nextInt(): %d\n", rng.nextInt());
    printf("nextInt(): %d\n", rng.nextInt());
    printf("nextUInt(): %u\n", rng.nextUInt());
    printf("nextFloat(): %f\n", rng.nextFloat());
    printf("nextFloat(): %f\n", rng.nextFloat());
    printf("nextBool(): %d\n", cast<int>(rng.nextBool()));
    printf("nextBool(): %d\n", cast<int>(rng.nextBool()));

    # Test range functions
    printf("\n--- Range Functions ---\n");
    local i: int = 0;
    printf("range(1, 10): ");
    loop (i < 5) {
        printf("%d ", rng.range(1, 10));
        i = i + 1;
    }
    printf("\n");

    printf("range(0.0, 1.0): ");
    i = 0;
    loop (i < 3) {
        printf("%.3f ", rng.range(0.0, 1.0));
        i = i + 1;
    }
    printf("\n");

    # Test shuffle
    printf("\n--- Shuffle Test ---\n");
    local arr: Array<int> = Array<int>.new(10);
    i = 0;
    loop (i < 10) {
        arr.push(i);
        i = i + 1;
    }

    printf("Before shuffle: ");
    i = 0;
    loop (i < arr.len()) {
        printf("%d ", arr.get(i));
        i = i + 1;
    }
    printf("\n");

    rng.shuffleInt(&arr);

    printf("After shuffle:  ");
    i = 0;
    loop (i < arr.len()) {
        printf("%d ", arr.get(i));
        i = i + 1;
    }
    printf("\n");

    # Test choice
    printf("\n--- Choice Test ---\n");
    printf("Random choices: ");
    i = 0;
    loop (i < 5) {
        printf("%d ", rng.choiceInt(&arr));
        i = i + 1;
    }
    printf("\n");

    # Test weighted choice
    printf("\n--- Weighted Choice Test ---\n");
    local weights: Array<int> = Array<int>.new(3);
    weights.push(10); # 10/15 = 66% chance for index 0
    weights.push(4); # 4/15 = 27% chance for index 1
    weights.push(1); # 1/15 = 7% chance for index 2

    local counts: int[3] = [0, 0, 0];
    i = 0;
    loop (i < 100) {
        local idx: int = rng.weightedChoice(&weights);
        counts[idx] = counts[idx] + 1;
        i = i + 1;
    }
    printf("Weighted choice distribution (100 samples):\n");
    printf("  Index 0 (weight 10): %d times\n", counts[0]);
    printf("  Index 1 (weight 4): %d times\n", counts[1]);
    printf("  Index 2 (weight 1): %d times\n", counts[2]);

    # Test fill bytes
    printf("\n--- Fill Bytes Test ---\n");
    local bytes: u8[8];
    rng.fillBytes(&bytes[0], 8);
    printf("Random bytes: ");
    i = 0;
    loop (i < 8) {
        printf("%02x ", cast<int>(bytes[i]));
        i = i + 1;
    }
    printf("\n");

    # Test seed from time
    printf("\n--- Seed From Time ---\n");
    local timeRng: Rand = Rand.seedFromTime();
    printf("Time-seeded random: %d\n", timeRng.nextInt());

    arr.destroy();
    weights.destroy();

    printf("\n=== All Random Tests Completed! ===\n");
    return 0;
}
