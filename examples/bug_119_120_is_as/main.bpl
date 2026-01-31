# BUG-119 & BUG-120: is/as operator bugs
# The is operator returns false when it should return true
# The as operator returns non-null when it should return null

extern printf(fmt: string, ...);

struct Animal {
    name: string,

    frame speak(this: *Animal) {
        printf("Animal speaks\n");
    }
}

struct Dog: Animal {
    breed: string,

    frame speak(this: *Dog) {
        printf("Dog barks\n");
    }
}

struct Cat: Animal {
    indoor: bool,

    frame speak(this: *Cat) {
        printf("Cat meows\n");
    }
}

frame main() {
    local dog: Dog = Dog { name: "Rex", breed: "German Shepherd" };
    local animal: *Animal = cast<*Animal>(&dog);

    printf("=== BUG-119: is operator ===\n");
    printf("Direct check: dog is Dog = ");
    if (dog is Dog) {
        printf("true\n");
    } else {
        printf("false\n");
    }

    printf("Through pointer: *animal is Dog = ");
    if (*animal is Dog) {
        printf("true (correct)\n");
    } else {
        printf("false (BUG!)\n");
    }

    printf("\n=== BUG-120: as operator ===\n");

    local maybeDog: *Dog = animal as *Dog;
    printf("animal as *Dog = %p (should be non-null)\n", maybeDog);

    local maybeCat: *Cat = animal as *Cat;
    printf("animal as *Cat = %p (should be null!)\n", maybeCat);

    if (maybeCat != nullptr) {
        printf("BUG: Cast to Cat succeeded but object is Dog!\n");
    }
}
