import twice from "./helper.bpl";
export quad;

frame quad(x: int) ret int {
    return twice(twice(x));
}
