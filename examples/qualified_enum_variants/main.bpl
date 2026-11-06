import printf from "std/c.bpl";
import * as shapes from "./shapes.bpl";

frame level(value: shapes.Shade) ret int {
    return match (value) {
        shapes.Shade.Dark(n) => n,
        shapes.Shade.Light => 0,
    };
}

frame size(value: shapes.Shape) ret int {
    return match (value) {
        shapes.Shape.Circle { radius: r, shade: shapes.Shade.Dark(d) } => r + d,
        shapes.Shape.Circle { radius: r, shade: shapes.Shade.Light } => r,
        shapes.Shape.Square(side) => side * side,
    };
}

frame name(value: shapes.Shade) ret string {
    switch (value) {
        case shapes.Shade.Light:
            return "light";
        default:
            return "dark";
    }
}

frame main() ret int {
    printf("%d %d\n", level(shapes.Shade.Dark(4)), level(shapes.Shade.Light));
    printf("%d %d %d\n", size(shapes.Shape.Circle { radius: 2, shade: shapes.Shade.Dark(5) }), size(shapes.Shape.Circle { radius: 3, shade: shapes.Shade.Light }), size(shapes.Shape.Square(4)));
    printf("%s %s\n", name(shapes.Shade.Light), name(shapes.Shade.Dark(1)));
    return 0;
}
