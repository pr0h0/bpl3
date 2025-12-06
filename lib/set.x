import malloc, realloc from 'libc';
import [Array] from './array.x';

struct Set<T> {
    items: Array<T>,

    frame add(value: T) {
        # Check if value already exists
        if call this.has(value) {
            return;  # Value already in set, don't add
        }
        call this.items.push(value);
    }

    frame has(value: T) ret u8 {
        local i: u64 = 0;
        loop {
            if i >= this.items.length {
                break;
            }
            # Direct comparison with array element
            if this.items.data[i] == value {
                return 1;
            }
            i = i + 1;
        }
        return 0;
    }

    frame delete(value: T) ret u8 {
        local i: u64 = 0;
        loop {
            if i >= this.items.length {
                break;
            }
            if this.items.data[i] == value {
                # Found the item, remove it by shifting remaining elements
                local j: u64 = i;
                loop {
                    if j >= this.items.length - 1 {
                        break;
                    }
                    this.items.data[j] = this.items.data[j + 1];
                    j = j + 1;
                }
                this.items.length = this.items.length - 1;
                return 1;  # Successfully deleted
            }
            i = i + 1;
        }
        return 0;  # Item not found
    }

    frame size() ret u64 {
        return call this.items.len();
    }

    frame clear() {
        call this.items.clear();
    }

    frame values() ret *Array<T> {
        return &this.items;
    }
}


export [Set];
