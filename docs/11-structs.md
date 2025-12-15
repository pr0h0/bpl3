# Structs

Structs (structures) allow you to group related data into a single composite type. This guide covers struct definition, usage, methods, inheritance, and best practices.

## Table of Contents

- [Defining Structs](#defining-structs)
- [Struct Members](#struct-members)
- [Creating Instances](#creating-instances)
- [Accessing Members](#accessing-members)
- [Struct Methods](#struct-methods)
- [Constructors and Destructors](#constructors-and-destructors)
- [Inheritance](#inheritance)
- [Nested Structs](#nested-structs)
- [Pointers to Structs](#pointers-to-structs)
- [Arrays of Structs](#arrays-of-structs)

## Defining Structs

### Basic Syntax

```bpl
struct StructName {
    member1: type1;
    member2: type2;
    # ... more members
}
```

### Simple Example

```bpl
struct Point {
    x: int;
    y: int;
}

struct Person {
    name: string;
    age: int;
    height: float;
}
```

### Empty Structs

```bpl
struct Empty {
    # No members - valid but rarely useful
}
```

## Struct Members

### Data Members

Members are declared with a name and type:

```bpl
struct Rectangle {
    x: int;
    y: int;
    width: int;
    height: int;
}

struct Color {
    red: i8;
    green: i8;
    blue: i8;
    alpha: i8;
}
```

### Supported Member Types

All BPL types can be struct members:

```bpl
struct Complex {
    # Primitives
    id: int;
    value: float;
    flag: bool;
    symbol: char;

    # Pointers
    next: Complex*;
    data: int*;

    # Arrays
    buffer: char[256];
    matrix: int[3][3];

    # Strings
    name: string;

    # Other structs
    position: Point;
}
```

### Member Initialization

Members are not automatically initialized:

```bpl
local p: Point;
# p.x and p.y contain garbage values!
```

You must initialize manually:

```bpl
local p: Point;
p.x = 0;
p.y = 0;
```

Or use an initialization function/constructor:

```bpl
frame initPoint(p: Point*) ret void {
    p->x = 0;
    p->y = 0;
}

local p: Point;
initPoint(&p);
```

## Creating Instances

### Stack Allocation

```bpl
# Declare variable
local p: Point;

# Initialize members
p.x = 10;
p.y = 20;
```

### Heap Allocation

```bpl
# Allocate memory
local p: Point* = cast<Point*>(malloc(sizeof(Point)));

# Initialize members
p->x = 10;
p->y = 20;

# Remember to free
free(p);
```

### Array of Structs

```bpl
# Stack array
local points: Point[10];
loop (local i: int = 0; i < 10; i++) {
    points[i].x = i;
    points[i].y = i * i;
}

# Heap array
local points: Point* = cast<Point*>(malloc(10 * sizeof(Point)));
loop (local i: int = 0; i < 10; i++) {
    points[i].x = i;
    points[i].y = i * i;
}
free(points);
```

## Accessing Members

### Dot Operator

Use `.` for direct struct access:

```bpl
local p: Point;
p.x = 10;
p.y = 20;

local sum: int = p.x + p.y;

printf("Point: (%d, %d)\n", p.x, p.y);
```

### Arrow Operator

Use `->` for pointer-to-struct access:

```bpl
local p: Point*= cast<Point*>(malloc(sizeof(Point)));
p->x = 10;
p->y = 20;

printf("Point: (%d, %d)\n", p->x, p->y);

# Equivalent to:
(*p).x = 10;
(*p).y = 20;
```

### Nested Member Access

```bpl
struct Line {
    start: Point;
    end: Point;
}

local line: Line;
line.start.x = 0;
line.start.y = 0;
line.end.x = 100;
line.end.y = 100;

# With pointers
local line_ptr: Line* = &line;
line_ptr->start.x = 5;
line_ptr->end.y = 50;
```

## Struct Methods

BPL supports methods - functions that belong to a struct:

### Defining Methods

```bpl
struct Point {
    x: int;
    y: int;

    # Method declaration inside struct
    frame print() ret void {
        printf("(%d, %d)\n", this.x, this.y);
    }

    frame distance(other: Point*) ret float {
        local dx: int = this.x - other->x;
        local dy: int = this.y - other->y;
        return sqrt(cast<float>(dx * dx + dy * dy));
    }

    frame move(dx: int, dy: int) ret void {
        this.x += dx;
        this.y += dy;
    }
}
```

### The `this` Keyword

Inside methods, `this` refers to the current instance:

```bpl
struct Counter {
    count: int;

    frame increment() ret void {
        this.count++;  # Access member through this
    }

    frame reset() ret void {
        this.count = 0;
    }

    frame getValue() ret int {
        return this.count;
    }
}
```

### Calling Methods

```bpl
local p: Point;
p.x = 10;
p.y = 20;
p.print();  # Calls p's print method

local p2: Point;
p2.x = 15;
p2.y = 25;

local dist: float = p.distance(&p2);

p.move(5, -5);
p.print();  # Now at (15, 15)
```

### Methods with Pointers

```bpl
local p: Point* = cast<Point*>(malloc(sizeof(Point)));
p->x = 10;
p->y = 20;
p->print();  # Works with pointers too
p->move(5, 5);
```

## Constructors and Destructors

BPL doesn't have automatic constructors/destructors, but you can use special methods:

### Constructor Pattern

```bpl
struct Person {
    name: string;
    age: int;

    frame init(n: string, a: int) ret void {
        this.name = n;
        this.age = a;
    }

    frame print() ret void {
        printf("%s, age %d\n", this.name, this.age);
    }
}

# Usage
local p: Person;
p.init("Alice", 30);
p.print();
```

### Destructor Pattern

```bpl
struct Buffer {
    data: char*;
    size: int;

    frame init(s: int) ret void {
        this.data = cast<char*>(malloc(s));
        this.size = s;
    }

    frame cleanup() ret void {
        if (this.data != null) {
            free(this.data);
            this.data = null;
            this.size = 0;
        }
    }
}

# Usage
local buf: Buffer;
buf.init(1024);
# ... use buffer ...
buf.cleanup();  # Must call manually!
```

### Factory Functions

Alternative to constructors:

```bpl
frame createPoint(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;
}

# Usage
local p: Point = createPoint(10, 20);
```

## Inheritance

BPL supports single inheritance using the `extends` keyword:

### Basic Inheritance

```bpl
struct Animal {
    name: string;
    age: int;

    frame speak() ret void {
        printf("%s makes a sound\n", this.name);
    }
}

struct Dog extends Animal {
    breed: string;

    # Override speak
    frame speak() ret void {
        printf("%s barks\n", this.name);
    }

    # New method
    frame fetch() ret void {
        printf("%s fetches the ball\n", this.name);
    }
}
```

### Using Inherited Members

```bpl
local dog: Dog;
dog.name = "Buddy";  # Inherited from Animal
dog.age = 3;         # Inherited from Animal
dog.breed = "Golden Retriever";  # Dog's own member

dog.speak();  # Calls Dog's speak: "Buddy barks"
dog.fetch();  # Calls Dog's fetch
```

### Method Override

Derived structs can override base methods:

```bpl
struct Shape {
    x: int;
    y: int;

    frame area() ret float {
        return 0.0;  # Default implementation
    }
}

struct Circle extends Shape {
    radius: float;

    frame area() ret float {
        return 3.14159 * this.radius * this.radius;
    }
}

struct Rectangle extends Shape {
    width: float;
    height: float;

    frame area() ret float {
        return this.width * this.height;
    }
}
```

### Multi-Level Inheritance

```bpl
struct Vehicle {
    speed: int;

    frame move() ret void {
        printf("Moving at %d mph\n", this.speed);
    }
}

struct Car extends Vehicle {
    doors: int;
}

struct SportsCar extends Car {
    turbo: bool;

    frame boost() ret void {
        if (this.turbo) {
            this.speed += 20;
        }
    }
}

# SportsCar has: speed (from Vehicle), doors (from Car), turbo (own)
local car: SportsCar;
car.speed = 100;  # From Vehicle
car.doors = 2;    # From Car
car.turbo = true; # Own member
car.move();       # From Vehicle
car.boost();      # Own method
```

## Nested Structs

Structs can contain other structs as members:

### Composition

```bpl
struct Point {
    x: int;
    y: int;
}

struct Line {
    start: Point;
    end: Point;

    frame length() ret float {
        local dx: int = this.end.x - this.start.x;
        local dy: int = this.end.y - this.start.y;
        return sqrt(cast<float>(dx * dx + dy * dy));
    }
}

local line: Line;
line.start.x = 0;
line.start.y = 0;
line.end.x = 3;
line.end.y = 4;
printf("Length: %f\n", line.length());  # 5.0
```

### Deeply Nested Structs

```bpl
struct Address {
    street: string;
    city: string;
    zip: string;
}

struct Contact {
    phone: string;
    email: string;
    address: Address;
}

struct Person {
    name: string;
    contact: Contact;
}

local person: Person;
person.name = "Alice";
person.contact.phone = "555-1234";
person.contact.email = "alice@example.com";
person.contact.address.street = "123 Main St";
person.contact.address.city = "Springfield";
person.contact.address.zip = "12345";
```

## Pointers to Structs

### Basic Pointer Usage

```bpl
local p: Point;
p.x = 10;
p.y = 20;

local ptr: Point* = &p;
printf("(%d, %d)\n", ptr->x, ptr->y);

ptr->x = 30;
printf("(%d, %d)\n", p.x, p.y);  # Now (30, 20)
```

### Dynamic Allocation

```bpl
local p: Point* = cast<Point*>(malloc(sizeof(Point)));
if (p == null) {
    printf("Allocation failed\n");
    return 1;
}

p->x = 10;
p->y = 20;

# Use the struct...

free(p);
```

### Linked Structures

```bpl
struct Node {
    data: int;
    next: Node*;

    frame append(value: int) ret void {
        if (this.next == null) {
            this.next = cast<Node*>(malloc(sizeof(Node)));
            this.next->data = value;
            this.next->next = null;
        } else {
            this.next->append(value);
        }
    }
}

local head: Node;
head.data = 1;
head.next = null;
head.append(2);
head.append(3);
```

## Arrays of Structs

### Stack-Allocated Array

```bpl
local points: Point[3];
points[0].x = 0;
points[0].y = 0;
points[1].x = 10;
points[1].y = 10;
points[2].x = 20;
points[2].y = 20;

loop (local i: int = 0; i < 3; i++) {
    printf("Point %d: (%d, %d)\n", i, points[i].x, points[i].y);
}
```

### Heap-Allocated Array

```bpl
local size: int = 10;
local points: Point* = cast<Point*>(malloc(size * sizeof(Point)));

loop (local i: int = 0; i < size; i++) {
    points[i].x = i;
    points[i].y = i * i;
}

free(points);
```

### Multi-Dimensional Arrays

```bpl
struct Cell {
    value: int;
    visited: bool;
}

local grid: Cell[10][10];
loop (local i: int = 0; i < 10; i++) {
    loop (local j: int = 0; j < 10; j++) {
        grid[i][j].value = i * 10 + j;
        grid[i][j].visited = false;
    }
}
```

## Struct Alignment and Size

### sizeof Operator

```bpl
struct Compact {
    a: i8;
    b: i8;
}

struct Padded {
    a: i8;
    b: int;
}

printf("Compact: %d bytes\n", sizeof(Compact));  # 2
printf("Padded: %d bytes\n", sizeof(Padded));    # 8 (due to alignment)
```

### Memory Layout

Struct members are laid out in declaration order, but may include padding for alignment:

```bpl
struct Example {
    a: i8;    # Offset 0
    # 3 bytes padding
    b: int;   # Offset 4
    c: i16;   # Offset 8
    # 2 bytes padding
    d: i64;   # Offset 12 (aligned to 8 bytes)
}
# Total size: 20 bytes (16 + 4 bytes trailing padding)
```

## Common Patterns

### Option/Result Types

```bpl
struct Option<T> {
    hasValue: bool;
    value: T;

    frame isSome() ret bool {
        return this.hasValue;
    }

    frame isNone() ret bool {
        return !this.hasValue;
    }
}

frame divide(a: int, b: int) ret Option<int> {
    local result: Option<int>;
    if (b == 0) {
        result.hasValue = false;
        return result;
    }
    result.hasValue = true;
    result.value = a / b;
    return result;
}
```

### Builder Pattern

```bpl
struct Config {
    width: int;
    height: int;
    fullscreen: bool;
    vsync: bool;

    frame setWidth(w: int) ret Config* {
        this.width = w;
        return &this;
    }

    frame setHeight(h: int) ret Config* {
        this.height = h;
        return &this;
    }

    frame setFullscreen(f: bool) ret Config* {
        this.fullscreen = f;
        return &this;
    }
}

# Usage
local cfg: Config;
cfg.setWidth(1920)->setHeight(1080)->setFullscreen(true);
```

## Best Practices

1. **Initialize all members** - Don't leave members with garbage values
2. **Use constructors** - Create `init()` methods for complex initialization
3. **Use destructors** - Create `cleanup()` methods for resource management
4. **Small structs by value, large by pointer** - Pass small structs (<16 bytes) by value
5. **Consistent naming** - Use PascalCase for struct names, camelCase for members
6. **Group related data** - Only combine data that logically belongs together
7. **Limit struct size** - Huge structs suggest poor design
8. **Prefer composition over inheritance** - Use inheritance sparingly
9. **Document complex structs** - Add comments explaining purpose and invariants
10. **Check allocations** - Always verify malloc succeeded

## Next Steps

- [Methods and This](12-methods-this.md) - Deep dive into struct methods
- [Inheritance](13-inheritance.md) - Advanced inheritance patterns
- [Memory Management](14-memory.md) - Managing struct lifetimes
- [Pointers](15-pointers.md) - Pointer operations with structs
