# Array<T> standard library implementation

export [Array];

import [Option] from "./option.bpl";
import [IndexOutOfBoundsError], [EmptyError] from "std/errors.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memcpy(dest: *void, src: *void, n: long) ret *void;

struct Array<T> {
    data: *T,
    capacity: int,
    length: int,
    /#
    # Create Array
    Creates a new array with the specified initial capacity.

    ## Arguments
    - `initial_capacity`: The number of elements to reserve memory for.
    #/
    frame new(initial_capacity: int) ret Array<T> {
        local arr: Array<T>;
        arr.capacity = initial_capacity;
        arr.length = 0;
        # Calculate size in bytes: capacity * sizeof(T)
        local size: long = cast<long>(initial_capacity) * sizeof<T>();
        arr.data = cast<*T>(malloc(size));
        return arr;
    }

    /#
    # Destroy Array
    Frees the memory allocated for the array.
    #/
    frame destroy(this: *Array<T>) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.capacity = 0;
        this.length = 0;
    }

    /#
    # Get Length
    Returns the current number of elements in the array.
    #/
    frame len(this: *Array<T>) ret int {
        return this.length;
    }

    /#
    # Get Element (Copy)
    Returns a copy of the element at the specified index.

    ## Note
    For complex types, consider using `getRef()` to avoid copying.
    ##
        because updating copy will not update primitives in original array element
    #/
    frame get(this: *Array<T>, index: int) ret T {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError { index: index, size: this.length };
        }
        return this.data[index];
    }

    /#
        this returns a reference to the element at index
        useful for complex types to avoid copying
        updating the returned reference will update the original array element
    #/
    frame getRef(this: *Array<T>, index: int) ret *T {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError { index: index, size: this.length };
        }
        return &this.data[index];
    }

    /#
        sets the element at index to value
    #/
    frame set(this: *Array<T>, index: int, value: T) {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError { index: index, size: this.length };
        }
        this.data[index] = value;
    }

    frame push(this: *Array<T>, value: T) {
        if (this.length >= this.capacity) {
            # grow
            local new_capacity: int = (this.capacity * 2) + 1;
            local size: long = cast<long>(new_capacity) * sizeof<T>();
            local new_data: *T = cast<*T>(malloc(size));

            # Copy old data
            local old_size: long = cast<long>(this.length) * sizeof<T>();
            if (this.data != nullptr) {
                memcpy(cast<*void>(new_data), cast<*void>(this.data), old_size);
                free(cast<*void>(this.data));
            }
            this.data = new_data;
            this.capacity = new_capacity;
        }
        this.data[this.length] = value;
        this.length = this.length + 1;
    }

    frame pop(this: *Array<T>) ret T {
        if (this.length == 0) {
            # Error: empty array
            throw EmptyError { message: "Pop from empty array" };
        }
        this.length = this.length - 1;
        return this.data[this.length];
    }

    # Removes the element at index by shifting items left.
    frame removeAt(this: *Array<T>, index: int) {
        if ((index < 0) || (index >= this.length)) {
            throw IndexOutOfBoundsError { index: index, size: this.length };
        }
        local i: int = index;
        loop (i < (this.length - 1)) {
            this.data[i] = this.data[i + 1];
            i = i + 1;
        }
        this.length = this.length - 1;
    }

    /#
        Functional methods
    #/

    # Maps elements to a new array using a transformation function
    frame map<U>(this: *Array<T>, transform: Func<U>(T, int)) ret Array<U> {
        local result: Array<U> = Array<U>.new(this.capacity);
        local i: int = 0;
        loop (i < this.length) {
            result.push(transform(this.data[i], i));
            i = i + 1;
        }
        return result;
    }

    # Filters elements based on a predicate function
    frame filter(this: *Array<T>, predicate: Func<bool>(T, int)) ret Array<T> {
        local result: Array<T> = Array<T>.new(this.capacity);
        local i: int = 0;
        loop (i < this.length) {
            if (predicate(this.data[i], i)) {
                result.push(this.data[i]);
            }
            i = i + 1;
        }
        return result;
    }

    # Reduces the array to a single value using a reducer function
    frame reduce<U>(this: *Array<T>, initial: U, reducer: Func<U>(U, T, int)) ret U {
        local accumulator: U = initial;
        local i: int = 0;
        loop (i < this.length) {
            accumulator = reducer(accumulator, this.data[i], i);
            i = i + 1;
        }
        return accumulator;
    }

    # Iterates over each element and applies an action
    frame forEach(this: *Array<T>, action: Func<void>(T, int)) {
        local i: int = 0;
        loop (i < this.length) {
            action(this.data[i], i);
            i = i + 1;
        }
    }

    # Finds the first element matching the predicate
    frame find(this: *Array<T>, predicate: Func<bool>(T)) ret Option<T> {
        local i: int = 0;
        loop (i < this.length) {
            if (predicate(this.data[i])) {
                return Option<T>.Some(this.data[i]);
            }
            i = i + 1;
        }
        return Option<T>.None;
    }

    # Checks if every element matches the predicate
    frame every(this: *Array<T>, predicate: Func<bool>(T)) ret bool {
        local i: int = 0;
        loop (i < this.length) {
            if (!predicate(this.data[i])) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    # Checks if at least one element matches the predicate
    frame some(this: *Array<T>, predicate: Func<bool>(T)) ret bool {
        local i: int = 0;
        loop (i < this.length) {
            if (predicate(this.data[i])) {
                return true;
            }
            i = i + 1;
        }
        return false;
    }

    # Returns the index of the first occurrence of value, or -1 if not found
    frame indexOf(this: *Array<T>, value: T) ret int {
        local i: int = 0;
        loop (i < this.length) {
            if (this.data[i] == value) {
                return i;
            }
            i = i + 1;
        }
        return -1;
    }

    # Checks if the array contains a specific value
    frame contains(this: *Array<T>, value: T) ret bool {
        return this.indexOf(value) != -1;
    }

    # Finds the first element matching the predicate
    frame findIndex(this: *Array<T>, predicate: Func<bool>(T)) ret Option<int> {
        local i: int = 0;
        loop (i < this.length) {
            if (predicate(this.data[i])) {
                return Option<int>.Some(i);
            }
            i = i + 1;
        }
        return Option<int>.None;
    }

    # Operator overloading: Push element with << (left shift)
    # Usage: arr << value
    frame __lshift__(this: *Array<T>, value: T) ret Array<T> {
        this.push(value);
        return *this;
    }

    # Operator overloading: Pop element with >> (right shift)
    # Usage: arr >> destination_ptr
    # This pops an element and stores it at the pointer location
    frame __rshift__(this: *Array<T>, dest: *T) ret Array<T> {
        *dest = this.pop();
        return *this;
    }
}
