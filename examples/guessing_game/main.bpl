# Number Guessing Game
# A classic game where you try to guess a random number

import [Rand] from "std/rand.bpl";

import [printf] from "std/c.bpl";
import [scanf] from "std/c.bpl";

frame main() ret int {
    # Initialize random number generator
    local rng: Rand = Rand.seedFromTime();

    # Generate secret number between 1 and 100
    local secret: int = rng.range(1, 101);
    local attempts: int = 0;
    local max_attempts: int = 7;
    local won: bool = false;

    printf("\n");
    printf("=================================\n");
    printf("   NUMBER GUESSING GAME\n");
    printf("=================================\n");
    printf("\n");
    printf("I'm thinking of a number between 1 and 100.\n");
    printf("You have %d attempts to guess it!\n", max_attempts);
    printf("\n");

    loop (attempts < max_attempts) {
        attempts = attempts + 1;

        printf("Attempt %d/%d - Enter your guess: ", attempts, max_attempts);

        local guess: int = 0;
        scanf("%d", &guess);

        if (guess == secret) {
            won = true;
            break;
        }
        if (guess < secret) {
            printf("Too LOW! ");
        } else {
            printf("Too HIGH! ");
        }

        # Give hints based on distance
        local diff: int = secret - guess;
        if (diff < 0) {
            diff = -diff;
        }
        if (diff <= 5) {
            printf("(You're VERY close!)\n");
        } else if (diff <= 15) {
            printf("(You're getting warm!)\n");
        } else if (diff <= 30) {
            printf("(You're lukewarm.)\n");
        } else {
            printf("(You're cold!)\n");
        }

        printf("\n");
    }

    printf("\n");
    if (won) {
        printf("*****************************\n");
        printf("  CONGRATULATIONS!\n");
        printf("  You guessed it in %d attempts!\n", attempts);
        printf("*****************************\n");
    } else {
        printf("=============================\n");
        printf("  GAME OVER!\n");
        printf("  The number was: %d\n", secret);
        printf("  Better luck next time!\n");
        printf("=============================\n");
    }

    return 0;
}
