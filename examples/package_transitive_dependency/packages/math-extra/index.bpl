import add, triple from "math-core";
import increment from "./features/increment/index.bpl";

export add;
export doublePlusOne;
export triplePlusOne;

frame doublePlusOne(value: int) ret int {
    return increment(add(value, value));
}

frame triplePlusOne(value: int) ret int {
    return increment(triple(value));
}
