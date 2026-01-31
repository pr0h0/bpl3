# Bug Hunt: Is and As Operator Edge Cases
extern printf(fmt: string, ...);

struct Animal {
    name: string,

    frame speak(this: *Animal) {
        printf("Animal %s speaks\n", this.name);
    }
}

struct Dog: Animal {
    breed: string,

    frame speak(this: *Dog) {
        printf("Dog %s barks\n", this.name);
    }

    frame fetch(this: *Dog) {
        printf("%s fetches\n", this.name);
    }
}

struct Cat: Animal {
    indoor: bool,

    frame speak(this: *Cat) {
        printf("Cat %s meows\n", this.name);
    }
}

frame test_is_operator() {
    local dog: Dog = Dog { name: "Rex", breed: "German Shepherd" };
    local animal: *Animal = cast<*Animal>(&dog);

    # Test is operator for type checking
    if (animal is Dog) {
        printf("animal is Dog: true\n");
    } else {
        printf("animal is Dog: false\n");
    }

    if (animal is Cat) {
        printf("animal is Cat: true\n");
    } else {
        printf("animal is Cat: false\n");
    }
}

frame test_as_operator() {
    local dog: Dog = Dog { name: "Rex", breed: "German Shepherd" };
    local animal: *Animal = cast<*Animal>(&dog);

    # Safe downcast with as
    local maybeDog: *Dog = animal as *Dog;
    if (maybeDog != nullptr) {
        printf("Successfully cast to Dog\n");
        maybeDog.fetch();
    } else {
        printf("Cast to Dog failed\n");
    }

    local maybeCat: *Cat = animal as *Cat;
    if (maybeCat != nullptr) {
        printf("Successfully cast to Cat\n");
    } else {
        printf("Cast to Cat failed (expected)\n");
    }
}

# Enum defined at module level
enum Shape {
    Circle(float),
    Rectangle(float, float),
    Square(float),
}

frame test_is_with_enum() {
    local shape: Shape = Shape.Circle(5.0);

    # Can we use is with enum variants?
    match (shape) {
        Shape.Circle(r) => printf("Circle with radius %f\n", r),
        Shape.Rectangle(w, h) => printf("Rectangle %fx%f\n", w, h),
        Shape.Square(s) => printf("Square %f\n", s),
    };
}

frame main() {
    printf("=== Is operator ===\n");
    test_is_operator();

    printf("\n=== As operator ===\n");
    test_as_operator();

    printf("\n=== Is with enum ===\n");
    test_is_with_enum();

    printf("\nAll is/as tests done\n");
}
