extern printf(fmt: string, ...);
# Object-oriented example showcasing structs, methods, and inheritance
struct Animal {
    name: string,
    age: int,
    frame new(name: string, age: int) ret Animal {
        local a: Animal;
        a.name = name;
        a.age = age;
        return a;
    }
    frame speak(this: Animal) {
        printf("%s makes a sound\n", this.name);
    }
    frame get_info(this: Animal) {
        printf("Animal: %s, Age: %d\n", this.name, this.age);
    }
}
struct Dog : Animal {
    breed: string,
    frame new(name: string, age: int, breed: string) ret Dog {
        local d: Dog;
        d.name = name;
        d.age = age;
        d.breed = breed;
        return d;
    }
    frame speak(this: Dog) {
        printf("%s barks: Woof! Woof!\n", this.name);
    }
    frame get_info(this: Dog) {
        printf("Dog: %s, Age: %d, Breed: %s\n", this.name, this.age, this.breed);
    }
}
struct Cat : Animal {
    color: string,
    frame new(name: string, age: int, color: string) ret Cat {
        local c: Cat;
        c.name = name;
        c.age = age;
        c.color = color;
        return c;
    }
    frame speak(this: Cat) {
        printf("%s meows: Meow!\n", this.name);
    }
    frame get_info(this: Cat) {
        printf("Cat: %s, Age: %d, Color: %s\n", this.name, this.age, this.color);
    }
}
frame main() ret int {
    local dog: Dog = Dog.new("Buddy", 3, "Golden Retriever");
    local cat: Cat = Cat.new("Whiskers", 2, "Orange");
    printf("=== Animal Information ===\n");
    dog.get_info();
    cat.get_info();
    printf("\n=== Animal Sounds ===\n");
    dog.speak();
    cat.speak();
    return 0;
}
