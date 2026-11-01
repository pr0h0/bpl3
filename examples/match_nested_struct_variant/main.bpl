import printf from "std/c.bpl";

enum Shade {
    Light,
    Dark(int),
}

enum Shape {
    Circle { radius: int, shade: Shade },
    Rect { width: int, height: int },
}

enum Scene {
    Single { shape: Shape, label: int },
    Pair(Shape, Shape),
    Empty,
}

# Each arm matches inside a struct variant's fields; together they cover
# every value, so the match needs no `_` arm.
frame describe(scene: Scene) ret int {
    return match (scene) {
        Scene.Single { shape: Shape.Circle { radius: r, shade: Shade.Dark(d) }, label: l } => (r * 100) + (d * 10) + l,
        Scene.Single { shape: Shape.Circle { radius: 0, shade: Shade.Light }, label: _ } => -1,
        Scene.Single { shape: Shape.Circle { radius: r, shade: Shade.Light }, label: l } => r + l,
        Scene.Single { shape: Shape.Rect { width: w, height: h }, label: l } if w == h => (w * h) + l,
        Scene.Single { shape: Shape.Rect { width: w, height: _ }, label: _ } => w,
        Scene.Pair(Shape.Rect { width: w, height: h }, Shape.Circle { radius: r, shade: _ }) => w + h + r,
        Scene.Pair(_, _) => 1000,
        Scene.Empty => 0,
    };
}

frame main() ret int {
    printf("%d\n", describe(Scene.Single { shape: Shape.Circle { radius: 3, shade: Shade.Dark(4) }, label: 5 }));
    printf("%d\n", describe(Scene.Single { shape: Shape.Circle { radius: 0, shade: Shade.Light }, label: 8 }));
    printf("%d\n", describe(Scene.Single { shape: Shape.Circle { radius: 7, shade: Shade.Light }, label: 2 }));
    printf("%d\n", describe(Scene.Single { shape: Shape.Rect { width: 4, height: 4 }, label: 1 }));
    printf("%d\n", describe(Scene.Single { shape: Shape.Rect { width: 6, height: 2 }, label: 1 }));
    printf("%d\n", describe(Scene.Pair(Shape.Rect { width: 2, height: 3 }, Shape.Circle { radius: 4, shade: Shade.Light })));
    printf("%d\n", describe(Scene.Pair(Shape.Circle { radius: 1, shade: Shade.Light }, Shape.Rect { width: 1, height: 1 })));
    printf("%d\n", describe(Scene.Empty));

    # Statement-position match with bindings from a nested field pattern.
    local shape: Shape = Shape.Circle { radius: 9, shade: Shade.Dark(2) };
    match (shape) {
        Shape.Circle { radius: r, shade: Shade.Dark(level) } => printf("dark circle %d %d\n", r, level),
        Shape.Circle { radius: r, shade: Shade.Light } => printf("light circle %d\n", r),
        Shape.Rect { width: w, height: h } => printf("rect %d %d\n", w, h),
    };
    return 0;
}
