import multiply, [Point] from "./lib.x";
import printf from "libc";

extern printf(s: *u8, ...);

frame main() ret u8 {
  local p: Point;
  p.x = 3;
  p.y = 4;

  local res: u32 = call multiply(p.x, p.y);
  call printf("%d\n",res);
  return 0;
}
