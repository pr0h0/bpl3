import printf from "std/c.bpl";
import [Rand] from "std/rand.bpl";
import [Array] from "std/array.bpl";

frame main() ret int {
    # Same seed and length: shuffle<T> gives the same order as shuffleInt.
    local a: Rand = Rand.seed(42);
    local b: Rand = Rand.seed(42);
    local ints: Array<int> = Array<int>.new(0);
    local words: Array<string> = Array<string>.new(0);
    local names: string[8] = ["ann", "bob", "cy", "dee", "eve", "fay", "gus", "hal"];
    loop (local i: int = 0; i < 8; i = i + 1) {
        ints.push(i);
        words.push(names[i]);
    }
    a.shuffleInt(&ints);
    b.shuffle<string>(&words);
    local same: bool = true;
    loop (local i: int = 0; i < 8; i = i + 1) {
        if (words.get(i) != names[ints.get(i)]) {
            same = false;
        }
    }
    printf("same order as shuffleInt: %d\n", cast<int>(same));

    # A shuffle is a permutation: every element appears once.
    local seen: int = 0;
    loop (local i: int = 0; i < 8; i = i + 1) {
        seen = seen | (1 << ints.get(i));
    }
    printf("permutation: %d\n", cast<int>(seen == 255));

    local pick: string = "none";
    printf("choice: %d %d\n", cast<int>(a.choice<string>(&words, &pick)), cast<int>(pick != "none"));
    local empty: Array<string> = Array<string>.new(0);
    local untouched: string = "kept";
    printf("empty choice: %d %s\n", cast<int>(a.choice<string>(&empty, &untouched)), untouched);

    ints.destroy();
    words.destroy();
    empty.destroy();
    return 0;
}
