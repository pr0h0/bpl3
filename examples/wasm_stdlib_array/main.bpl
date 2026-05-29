import [Array] from "std/array.bpl";

frame main() ret int {
    local values: Array<int> = Array<int>.new(1);
    values.push(3);
    values.push(5);
    values.push(8);

    local mapped: Array<int> = values.map<int>(|value: int, index: int| ret int {
        return value + index;
    });

    local total: int = mapped.reduce<int>(0, |acc: int, value: int, index: int| ret int {
        return acc + value + index;
    });

    if (values.len() != 3) {
        values.destroy();
        mapped.destroy();
        return 1;
    }
    if (total != 22) {
        values.destroy();
        mapped.destroy();
        return 2;
    }

    values.destroy();
    mapped.destroy();
    return 0;
}
