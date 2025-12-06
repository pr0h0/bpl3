import printf from "libc";

struct Animal {
    species: *u8,

    frame init(species: *u8) {
        this.species = species;
    }

    frame speak() {
        call printf("The %s makes a sound.\n", this.species);
    }
}

struct Dog: Animal {
    breed: *u8,

    frame initDog(breed: *u8) {
        this.species = "Dog";
        this.breed = breed;
    }

    frame speak() {
        # Overrides Animal.speak

        call printf("The %s (%s) barks: Woof!\n", this.species, this.breed);
    }
}

struct Cat: Animal {
    lives: i32,

    frame initCat() {
        this.species = "Cat";
        this.lives = 9;
    }

    frame speak() {
        # Overrides Animal.speak

        call printf("The %s meows. Lives left: %d\n", this.species, this.lives);
    }
}

frame main() {
    local genericAnimal: Animal;
    call genericAnimal.init("Unknown Animal");
    call genericAnimal.speak();

    local dog: Dog;
    call dog.initDog("Golden Retriever");
    call dog.speak();

    local cat: Cat;
    call cat.initCat();
    call cat.speak();
}
