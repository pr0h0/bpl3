import [printf] from "std/c.bpl";

struct Animal {
    name: string,
    frame speak(this: *Animal) {
        printf("Animal speaks\n");
    }
}

struct Dog: Animal {
    breed: string,
    frame speak(this: *Dog) {
        Animal.speak(this);
        printf("Dog barks\n");
    }
}

frame makeSpeak(a: *Animal) {
    a.speak();
}

frame main() ret int {
    local d: Dog;
    d.name = "Rex";
    d.breed = "German Shepherd";

    # Call directly
    d.speak();

    # Call parent method explicitly (like super.speak())
    Animal.speak(&d);

    # Call via parent pointer (polymorphism)
    makeSpeak(&d);

    return 0;
}
