# Edge cases for struct methods implementation

import printf from "libc";

# Test 1: Method with no parameters
struct Counter {
    value: i32,

    frame increment() {
        this.value = this.value + 1;
    }

    frame decrement() {
        this.value = this.value - 1;
    }

    frame reset() {
        this.value = 0;
    }

    frame get() ret i32 {
        return this.value;
    }
}

# Test 2: Method with multiple parameters
struct Rectangle {
    width: i32,
    height: i32,

    frame resize(newWidth: i32, newHeight: i32) {
        this.width = newWidth;
        this.height = newHeight;
    }

    frame area() ret i32 {
        return this.width * this.height;
    }

    frame perimeter() ret i32 {
        local sum: i32 = this.width + this.height;
        return sum + sum;
    }
}

# Test 3: Method accessing pointer fields
struct StringHolder {
    text: *u8,
    length: i32,

    frame setText(newText: *u8) {
        this.text = newText;
    }

    frame print() {
        call printf("Text: %s, Length: %d\n", this.text, this.length);
    }
}

# Test 4: Nested struct with methods
struct Point {
    x: i32,
    y: i32,

    frame moveTo(newX: i32, newY: i32) {
        this.x = newX;
        this.y = newY;
    }

    frame moveBy(dx: i32, dy: i32) {
        this.x = this.x + dx;
        this.y = this.y + dy;
    }

    frame distanceFromOrigin() ret i32 {
        # Simplified: just return sum of absolute values
        local absX: i32 = this.x;
        local absY: i32 = this.y;
        if absX < 0 {
            absX = 0 - absX;
        }
        if absY < 0 {
            absY = 0 - absY;
        }
        return absX + absY;
    }
}

# Test 5: Method returning pointer
struct Node {
    value: i32,
    next: *Node,

    frame getValue() ret i32 {
        return this.value;
    }

    frame getNext() ret *Node {
        return this.next;
    }

    frame setNext(n: *Node) {
        this.next = n;
    }
}

# Test 6: Method with conditional logic
struct Account {
    balance: i32,

    frame deposit(amount: i32) {
        if amount > 0 {
            this.balance = this.balance + amount;
        }
    }

    frame withdraw(amount: i32) ret i8 {
        if amount <= 0 {
            return 0;
        }
        if this.balance >= amount {
            this.balance = this.balance - amount;
            return 1;
        }
        return 0;
    }

    frame getBalance() ret i32 {
        return this.balance;
    }
}

# Test 7: Method calling another method
struct Calculator {
    result: i32,

    frame add(value: i32) {
        this.result = this.result + value;
    }

    frame subtract(value: i32) {
        this.result = this.result - value;
    }

    frame addTwice(value: i32) {
        call this.add(value);
        call this.add(value);
    }

    frame clear() {
        this.result = 0;
    }
}

# Test 8: Array field in struct with methods
struct IntArray {
    data: i32[5],
    size: i32,

    frame set(index: i32, value: i32) {
        if index >= 0 {
            if index < 5 {
                this.data[index] = value;
            }
        }
    }

    frame get(index: i32) ret i32 {
        if index >= 0 {
            if index < 5 {
                return this.data[index];
            }
        }
        return 0;
    }

    frame sum() ret i32 {
        local total: i32 = 0;
        local i: i32 = 0;
        loop {
            if i >= 5 {
                break;
            }
            total = total + this.data[i];
            i = i + 1;
        }
        return total;
    }
}

frame main() ret i32 {
    # Test 1: Counter
    call printf("=== Test 1: Counter ===\n");
    local c: Counter;
    c.value = 10;
    call c.increment();
    call c.increment();
    local cval1: i32 = call c.get();
    call printf("After 2 increments: %d\n", cval1);
    call c.decrement();
    local cval2: i32 = call c.get();
    call printf("After 1 decrement: %d\n", cval2);
    call c.reset();
    local cval3: i32 = call c.get();
    call printf("After reset: %d\n", cval3);

    # Test 2: Rectangle
    call printf("\n=== Test 2: Rectangle ===\n");
    local rect: Rectangle;
    rect.width = 10;
    rect.height = 20;
    local rectArea1: i32 = call rect.area();
    call printf("Area: %d\n", rectArea1);
    local rectPerim: i32 = call rect.perimeter();
    call printf("Perimeter: %d\n", rectPerim);
    call rect.resize(5, 15);
    local rectArea2: i32 = call rect.area();
    call printf("After resize - Area: %d\n", rectArea2);

    # Test 3: StringHolder
    call printf("\n=== Test 3: StringHolder ===\n");
    local sh: StringHolder = {text: "Hello", length: 5};
    call sh.print();
    call sh.setText("World");
    sh.length = 5;
    call sh.print();

    # Test 4: Point
    call printf("\n=== Test 4: Point ===\n");
    local p: Point;
    p.x = 3;
    p.y = 4;
    local pdist: i32 = call p.distanceFromOrigin();
    call printf("Distance from origin: %d\n", pdist);
    call p.moveTo(10, 20);
    call printf("After moveTo(10,20): x=%d, y=%d\n", p.x, p.y);
    call p.moveBy(5, -10);
    call printf("After moveBy(5,-10): x=%d, y=%d\n", p.x, p.y);

    # Test 5: Node (linked structure)
    call printf("\n=== Test 5: Node ===\n");
    local n1: Node;
    n1.value = 100;
    n1.next = NULL;
    local nval: i32 = call n1.getValue();
    call printf("Node value: %d\n", nval);

    # Test 6: Account
    call printf("\n=== Test 6: Account ===\n");
    local acc: Account;
    acc.balance = 1000;
    call acc.deposit(500);
    local bal1: i32 = call acc.getBalance();
    call printf("After deposit 500: %d\n", bal1);
    local success: i8 = call acc.withdraw(300);
    local bal2: i32 = call acc.getBalance();
    call printf("Withdraw 300 success: %d, Balance: %d\n", success, bal2);
    success = (call acc.withdraw(2000));
    local bal3: i32 = call acc.getBalance();
    call printf("Withdraw 2000 success: %d, Balance: %d\n", success, bal3);

    # Test 7: Calculator (method calling method)
    call printf("\n=== Test 7: Calculator ===\n");
    local calc: Calculator;
    calc.result = 10;
    call calc.addTwice(5);
    call printf("After addTwice(5): %d\n", calc.result);
    call calc.subtract(3);
    call printf("After subtract(3): %d\n", calc.result);
    call calc.clear();
    call printf("After clear: %d\n", calc.result);

    # Test 8: IntArray
    call printf("\n=== Test 8: IntArray ===\n");
    local arr: IntArray;
    arr.size = 5;
    call arr.set(0, 10);
    call arr.set(1, 20);
    call arr.set(2, 30);
    call arr.set(3, 40);
    call arr.set(4, 50);
    local val2: i32 = call arr.get(2);
    call printf("arr[2] = %d\n", val2);
    local arrSum: i32 = call arr.sum();
    call printf("Sum of array: %d\n", arrSum);

    call printf("\n=== All tests completed ===\n");
    return 0;
}
