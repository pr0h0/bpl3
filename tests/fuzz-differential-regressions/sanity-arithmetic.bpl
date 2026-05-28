extern printf(fmt: string, ...);

frame main() ret int {
  local total: int = 7;
  local i: int = 0;

  loop (i < 5) {
    if ((i % 2) == 0) {
      total = total + (i * 3);
    } else {
      total = total - i;
    }

    i = i + 1;
  }

  printf("diff-regression total=%d\n", total);
  return 0;
}
