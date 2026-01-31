# Bug Hunt: Is/As Operator Bug Investigation
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

    printf("Testing is operator:\n");

    # Direct struct check
    if (dog is Dog) {
        printf("dog is Dog: true\n");
    } else {
        printf("dog is Dog: false\n");
    }

    # Pointer check
    if (*animal is Dog) {
        printf("*animal is Dog: true\n");
    } else {
        printf("*animal is Dog: false\n");
    }

    printf("\nTesting as operator:\n");

    # as operator on Dog pointer through Animal
    local maybeDog: *Dog = animal as *Dog;
    printf("animal as *Dog: %p\n", maybeDog);

    local maybeCat: *Cat = animal as *Cat;
    printf("animal as *Cat: %p (should be null)\n", maybeCat);

    # If maybeCat is not null, try to access Cat-specific field
    if (maybeCat != nullptr) {
        printf("BUG: Cast succeeded but should have failed!\n");
        # This could corrupt memory:
        # printf("indoor: %d\n", cast<int>(maybeCat.indoor));
    }
}
