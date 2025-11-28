import scanf, printf from "c";

frame get_input() ret u64 {
  local num: u64;
  call print("Enter a number: ");
  call scanf("%d", &num);
  return num;
}

frame fib() {
  local n: u64 = call get_input();
  
  local a: u64 = 1;
  local b: u64 = 0;
  local temp: u64 = 1;

  local c: u64 = 1;

  loop {
    temp = a + b;
    a = b;
    b = temp;

    call printf("[%d]: %llu\n", c, b);

    if c < n {
      c += 1;
    } else {
      break;
    }
  }
}

frame main()ret u8{
  call fib();
  return 0;
}
