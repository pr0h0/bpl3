import print from "std";
import scanf, printf from "c";

frame get_input() ret u64 {
  local n: u64;
  call print("Enter the number: ");
  call scanf("%d", &n);
  return n;
}

frame collatz() {
  local n: u64 = call get_input();
  local c: u64 = 0;

  call printf("[0]: %d\n", n);

  loop {
    if (n < 2){
      break;
    }

    if n % 2 == 0 {
      n /= 2;
    } else {
      n = n * 3 + 1;
    }

    c += 1;
    call printf("[%d]: %llu\n", c, n);
  }

  call printf("Found solution in %d steps\n", c);
}

frame main() ret u8 {
  call collatz();
  return 0;
}
