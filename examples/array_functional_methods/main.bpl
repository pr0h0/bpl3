import [Array], [Option] from "std";
import [printf] from "std/c.bpl";

frame main() ret int {
    local arr: Array<int> = Array<int>.new(10);
    arr.push(1);
    arr.push(2);
    arr.push(3);
    arr.push(4);
    arr.push(5);

    # Map: double the values
    local doubled: Array<int> = arr.map<int>(|x: int, _: int| ret int {
        return x * 2;
    });
    printf("Doubled: ");
    doubled.forEach(|x: int, _: int| {
        printf("%d ", x);
    });
    printf("\n");

    # Filter: keep even numbers
    local evens: Array<int> = arr.filter(|x: int, _: int| ret bool {
        return (x % 2) == 0;
    });
    printf("Evens: ");
    evens.forEach(|x: int, _: int| {
        printf("%d ", x);
    });
    printf("\n");

    # Reduce: sum
    local sum: int = arr.reduce<int>(0, |acc: int, x: int, _: int| ret int {
        return acc + x;
    });
    printf("Sum: %d\n", sum);

    # Find: find first value > 3
    local found: Option<int> = arr.find(|x: int| ret bool {
        return x > 3;
    });
    if (found.isSome()) {
        printf("Found > 3: %d\n", found.unwrap());
    } else {
        printf("Not found > 3\n");
    }

    # Every: are all positive?
    local allPos: bool = arr.every(|x: int| ret bool {
        return x > 0;
    });
    printf("All positive: %s\n", allPos ? "true" : "false");

    # Some: is there any value > 10?
    local anyBig: bool = arr.some(|x: int| ret bool {
        return x > 10;
    });
    printf("Any > 10: %s\n", anyBig ? "true" : "false");

    # IndexOf: find index of 3
    local idx: int = arr.indexOf(3);
    printf("Index of 3: %d\n", idx);

    # Contains: does it contain 5?
    local has5: bool = arr.contains(5);
    printf("Contains 5: %s\n", has5 ? "true" : "false");

    # FindIndex: find index of first value > 3
    local foundIdx: Option<int> = arr.findIndex(|x: int| ret bool {
        return x > 3;
    });
    if (foundIdx.isSome()) {
        printf("Found index > 3: %d\n", foundIdx.unwrap());
    } else {
        printf("Not found index > 3\n");
    }

    arr.destroy();
    doubled.destroy();
    evens.destroy();

    return 0;
}
