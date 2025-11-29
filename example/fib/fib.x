import print from "std";
import scanf, printf from "c";

frame get_input() ret u64 {
  local num: u64;
  call print("Enter a number: ");
  call scanf("%d", &num);
  return num;
}

# Recursive implementation
frame fib_recursive(n: u64) ret u64 {
  if n <= 1 {
    return n;
  }
  return call fib_recursive(n - 1) + call fib_recursive(n - 2);
}

# Iterative implementation
frame fib_iterative(n: u64) {
  local a: u64 = 1;
  local b: u64 = 0;
  local temp: u64 = 0;
  local i: u64 = 0;

  call printf("Iterative Sequence:\n");
  loop {
    if i >= n {
      break;
    }
    temp = a + b;
    a = b;
    b = temp;
    i = i + 1;

    call printf("[%d]: %llu\n", i + 1, b);
  }
}

frame main() ret u8 {
  local n: u64 = call get_input();
  
  call fib_iterative(n);

  n = call get_input();

  call printf("\nRecursive Calculation for %d-th number:\n", n);
  local res: u64 = call fib_recursive(n - 1); # 0-indexed
  call printf("Result: %llu\n", res);

  return 0;
}
