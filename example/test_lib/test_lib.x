import multiply, [Point] from "./lib.x";
import printf from "libc";

frame main(){
  local p: Point;
  p.x = 3;
  p.y = 4;

  local res: u8 = call multiply(p.x, p.y);
  call printf("%d\n",res);
  return 0;
}
