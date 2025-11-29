import printf, free, malloc from "libc";

extern printf(fmt: string, ...);
extern malloc(size: u64) ret *u8;
extern free(ptr: *u8);

frame sum(count: u64, ...:u64) ret u64 {
  local total: u64 = 0;
  local i: u64 = 0;
  
  loop {
     if (i >= count) { break; }
     total = total + args[i];
     i = i + 1;
  }
  return total;
}

frame concat_strings(count: u64, dest: *u8, ...:u64) {
  local offset: u64 = 0;
  local i: u64 = 0;

  loop {
    if (i >= count) { break; }
    local src: *u8 = args[i];

    loop {
       local ch: u8 = *src;
       if (ch == 0) { break; }

       (dest + offset) = ch;
       offset = offset + 1;
       src = src + 0x1;
    }
    i = i + 1;
  }
  (dest + offset -1) = 0;
}

frame main() ret u64 {
  local sumRes: u64 = call sum(5, 10, 20, 30, 40, 50);
  call printf("Sum result: %d\n", sumRes);

  local res3: *u8 = call malloc(128);
  # call printf("Allocated memory for concatenated string at: %p\n", res3);

  call concat_strings(4, res3, "Hello, ", "variadic ", "world!", "\n");
  call printf("Final string: %s\n", res3);
  call free(res3);
  
  return 0;
}




