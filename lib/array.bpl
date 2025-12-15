# Array<T> standard library implementation

export [Array];

extern malloc(size: i64) ret *void;
extern free(ptr: *void) ret void;
extern memcpy(dest: *void, src: *void, n: i64) ret *void;

struct Array<T> {
    data: *T,
    capacity: i32,
    length: i32,
    frame new(initial_capacity: i32) ret Array<T> {
        local arr: Array<T>;
        arr.capacity = initial_capacity;
        arr.length = 0;
        # Calculate size in bytes: capacity * sizeof(T)
        local size: i64 = cast<i64>(initial_capacity) * sizeof<T>();
        arr.data = cast<*T>(malloc(size));
        return arr;
    }

    frame destroy(this: *Array<T>) {
        if (this.data != null) {
            free(cast<*void>(this.data));
            this.data = null;
        }
        this.capacity = 0;
        this.length = 0;
    }

    frame len(this: *Array<T>) ret i32 {
        return this.length;
    }

    frame get(this: *Array<T>, index: i32) ret T {
        return this.data[index];
    }

    frame set(this: *Array<T>, index: i32, value: T) {
        this.data[index] = value;
    }

    frame push(this: *Array<T>, value: T) {
        if (this.length >= this.capacity) {
            # grow
            local new_capacity: i32 = (this.capacity * 2) + 1;
            local size: i64 = cast<i64>(new_capacity) * sizeof<T>();
            local new_data: *T = cast<*T>(malloc(size));

            # Copy old data
            local old_size: i64 = cast<i64>(this.length) * sizeof<T>();
            if (this.data != null) {
                memcpy(cast<*void>(new_data), cast<*void>(this.data), old_size);
                free(cast<*void>(this.data));
            }
            this.data = new_data;
            this.capacity = new_capacity;
        }
        this.data[this.length] = value;
        this.length = this.length + 1;
    }
}
