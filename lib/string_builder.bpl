# StringBuilder - Efficient string building with dynamic buffer

export [StringBuilder];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memcpy(dest: *void, src: *void, n: long) ret *void;
extern strlen(s: string) ret int;
extern strcpy(dst: string, src: string) ret string;
extern strcat(dst: string, src: string) ret string;

import [String] from "std/string.bpl";

struct StringBuilder {
    buffer: string,
    length: int,
    capacity: int,
    /#
        Creates a new StringBuilder with specified initial capacity
    #/
    frame new(initial_capacity: int) ret StringBuilder {
        local sb: StringBuilder;
        sb.capacity = initial_capacity;
        sb.length = 0;
        sb.buffer = cast<string>(malloc(cast<long>(initial_capacity + 1)));
        sb.buffer[0] = cast<char>(0); # Null terminator
        return sb;
    }

    /#
        Creates a new StringBuilder with default capacity of 256
    #/
    frame newDefault() ret StringBuilder {
        return StringBuilder.new(256);
    }

    /#
        Destroys the StringBuilder and frees memory
    #/
    frame destroy(this: *StringBuilder) {
        if (this.buffer != nullptr) {
            free(cast<*void>(this.buffer));
            this.buffer = nullptr;
        }
        this.length = 0;
        this.capacity = 0;
    }

    /#
        Ensures the buffer has enough capacity for additional bytes
    #/
    frame ensureCapacity(this: *StringBuilder, additional: int) {
        local needed: int = this.length + additional;
        if (needed >= this.capacity) {
            # Grow to at least double the current capacity or needed size
            local new_capacity: int = this.capacity * 2;
            if (new_capacity < needed) {
                new_capacity = needed + 1;
            }
            local new_buffer: string = cast<string>(malloc(cast<long>(new_capacity + 1)));

            # Copy old content
            if (this.buffer != nullptr) {
                memcpy(cast<*void>(new_buffer), cast<*void>(this.buffer), cast<long>(this.length));
                free(cast<*void>(this.buffer));
            }
            this.buffer = new_buffer;
            this.capacity = new_capacity;
            this.buffer[this.length] = cast<char>(0); # Null terminator
        }
    }

    /#
        Appends a C-string to the builder
    #/
    frame append(this: *StringBuilder, str: string) {
        if (str == nullptr) {
            return;
        }
        local str_len: int = strlen(str);
        this.ensureCapacity(str_len);

        # Copy the string
        local i: int = 0;
        loop (i < str_len) {
            this.buffer[this.length + i] = str[i];
            i = i + 1;
        }

        this.length = this.length + str_len;
        this.buffer[this.length] = cast<char>(0); # Null terminator
    }

    /#
        Appends a String object to the builder
    #/
    frame appendString(this: *StringBuilder, str: String) {
        this.append(str.toString());
    }

    /#
        Appends a single character to the builder
    #/
    frame appendChar(this: *StringBuilder, ch: char) {
        this.ensureCapacity(1);
        this.buffer[this.length] = ch;
        this.length = this.length + 1;
        this.buffer[this.length] = cast<char>(0); # Null terminator
    }

    /#
        Appends an integer to the builder
    #/
    frame appendInt(this: *StringBuilder, value: int) {
        # Convert int to string manually
        # Handle negative numbers
        local is_negative: bool = false;
        local abs_value: int = value;

        if (value < 0) {
            is_negative = true;
            abs_value = -value;
        }
        # Count digits
        local temp: int = abs_value;
        local digit_count: int = 0;
        if (temp == 0) {
            digit_count = 1;
        } else {
            loop (temp > 0) {
                digit_count = digit_count + 1;
                temp = temp / 10;
            }
        }

        # Add space for minus sign if needed
        local total_len: int = digit_count;
        if (is_negative) {
            total_len = total_len + 1;
        }
        this.ensureCapacity(total_len);

        # Write minus sign
        if (is_negative) {
            this.buffer[this.length] = cast<char>(45); # '-'
            this.length = this.length + 1;
        }
        # Write digits in reverse order
        local pos: int = (this.length + digit_count) - 1;
        local val: int = abs_value;
        if (val == 0) {
            this.buffer[this.length] = cast<char>(48); # '0'
            this.length = this.length + 1;
        } else {
            loop (val > 0) {
                local digit: int = val % 10;
                this.buffer[pos] = cast<char>(48 + digit); # '0' + digit
                pos = pos - 1;
                val = val / 10;
            }
            this.length = this.length + digit_count;
        }

        this.buffer[this.length] = cast<char>(0); # Null terminator
    }

    /#
        Clears the builder without freeing memory
    #/
    frame clear(this: *StringBuilder) {
        this.length = 0;
        if (this.buffer != nullptr) {
            this.buffer[0] = cast<char>(0);
        }
    }

    /#
        Returns the current length
    #/
    frame len(this: *StringBuilder) ret int {
        return this.length;
    }

    /#
        Builds and returns a String object (caller must destroy)
    #/
    frame toString(this: *StringBuilder) ret string {
        return this.buffer;
    }

    # Operator overloading: Append with << operator
    frame __lshift__(this: *StringBuilder, str: string) ret StringBuilder {
        this.append(str);
        return *this;
    }
}
