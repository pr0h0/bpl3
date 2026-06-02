import [printf] from "std/c.bpl";

struct Animal {
    name: string,
    frame speak(this: *Animal) {
        printf("Animal: %s\n", this.name);
    }
}

struct Dog: Animal {
    breed: string,
    frame speak(this: *Dog) {
        printf("Dog: %s (%s)\n", this.name, this.breed);
    }
}

frame main() {
    local dog: Dog;
    dog.name = "Buddy";
    dog.breed = "Golden Retriever";

    # Test struct slicing - assign child to parent
    local animal: Animal = dog;
    printf("Animal name: %s\n", animal.name);

    # The sliced struct should only have Animal fields
    animal.speak();
}
