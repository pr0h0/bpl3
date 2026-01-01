import [IO] from "std/io.bpl";

struct Animal {
    age: int,
}

struct Dog: Animal {
    breed: int,
}

frame main() {
    local dog: Dog = Dog { age: 5, breed: 1 };

    if (match<Animal>(dog)) {
        IO.print("Dog is an Animal\n");
    } else {
        IO.print("Dog is NOT an Animal\n");
    }

    if (match<Dog>(dog)) {
        IO.print("Dog is a Dog\n");
    }
}
