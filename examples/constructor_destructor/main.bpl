extern printf(fmt: string, ...);
extern malloc(size: uint) ret *i8;
extern free(ptr: *i8);
struct Resource {
    id: int,
    data: *int,
    # Constructor
    frame new(resourceId: int) ret Resource {
        local res: Resource;
        res.id = resourceId;
        res.data = cast<*int>(malloc(cast<uint>(sizeof(int) * 10)));
        printf("Resource %d constructed (allocated memory)\n", res.id);
        # Initialize data
        local i: int = 0;
        loop (i < 10) {
            res.data[i] = i * res.id;
            ++i;
        }
        return res;
    }
    # Destructor
    frame destroy(this: *Resource) {
        printf("Resource %d destructed (freeing memory)\n", this.id);
        if (this.data != nullptr) {
            free(cast<*i8>(this.data));
            # this.data = nullptr;
        }
    }
    frame print(this: *Resource) {
        printf("Resource %d data: ", this.id);
        local i: int = 0;
        loop (i < 10) {
            printf("%d ", this.data[i]);
            ++i;
        }
        printf("\n");
    }
    frame updateData(this: *Resource, index: int, value: int) {
        if ((index >= 0) && (index < 10)) {
            this.data[index] = value;
        }
    }
}
struct Counter {
    count: int,
    frame new(initial: int) ret Counter {
        local cnt: Counter;
        cnt.count = initial;
        printf("Counter constructed with value: %d\n", cnt.count);
        return cnt;
    }
    frame destroy(this: *Counter) {
        printf("Counter destructed with final value: %d\n", this.count);
    }
    frame increment(this: *Counter) {
        ++this.count;
    }
    frame decrement(this: *Counter) {
        #--this.count;
        this.count = this.count - 1;
    }
    frame getValue(this: *Counter) ret int {
        return this.count;
    }
}
struct Manager {
    name: string,
    resource: Resource,
    counter: Counter,
    frame new(managerName: string, resId: int, initialCount: int) ret Manager {
        local mgr: Manager;
        mgr.name = managerName;
        printf("Manager '%s' constructed\n", mgr.name);
        # Construct nested structs
        mgr.resource = Resource.new(resId);
        mgr.counter = Counter.new(initialCount);
        return mgr;
    }
    frame destroy(this: *Manager) {
        printf("Manager '%s' destructed\n", this.name);
        # Destruct nested structs
        this.counter.destroy();
        this.resource.destroy();
    }
    frame process(this: *Manager) {
        printf("Manager '%s' processing...\n", this.name);
        this.resource.print();
        this.counter.increment();
        printf("Counter after increment: %d\n", this.counter.getValue());
    }
}
frame testBasicConstructorDestructor() {
    printf("=== Test Basic Constructor/Destructor ===\n");
    local res: Resource = Resource.new(1);
    res.print();
    res.updateData(5, 999);
    res.print();
    res.destroy();
    printf("\n");
}
frame testMultipleObjects() {
    printf("=== Test Multiple Objects ===\n");
    local res1: Resource = Resource.new(10);
    local res2: Resource = Resource.new(20);
    res1.print();
    res2.print();
    res2.destroy();
    res1.destroy();
    printf("\n");
}
frame testNestedStructs() {
    printf("=== Test Nested Structs ===\n");
    local mgr: Manager = Manager.new("MainManager", 5, 100);
    mgr.process();
    mgr.process();
    mgr.destroy();
    printf("\n");
}
frame testCounterLifecycle() {
    printf("=== Test Counter Lifecycle ===\n");
    local cnt: Counter = Counter.new(0);
    local i: int = 0;
    loop (i < 5) {
        cnt.increment();
        printf("Counter value: %d\n", cnt.getValue());
        ++i;
    }
    cnt.decrement();
    printf("After decrement: %d\n", cnt.getValue());
    cnt.destroy();
    printf("\n");
}
frame testScopeAndLifetime() {
    printf("=== Test Scope and Lifetime ===\n");
    # Create resource in outer scope
    local outer: Resource = Resource.new(100);
    # Simulate inner scope with controlled destruction
    local inner: Resource = Resource.new(200);
    inner.print();
    inner.destroy();
    # Outer still valid
    outer.print();
    outer.destroy();
    printf("\n");
}
frame main() ret int {
    printf("Starting Constructor/Destructor Tests\n\n");
    testBasicConstructorDestructor();
    testMultipleObjects();
    testNestedStructs();
    testCounterLifecycle();
    testScopeAndLifetime();
    printf("All tests completed\n");
    return 0;
}
