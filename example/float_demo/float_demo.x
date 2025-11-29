import printf from "libc";

struct Point {
  x: f64,
  y: f64
}

struct Vector3 {
  x: f32,
  y: f32,
  z: f32
}

frame add_f64(a: f64, b: f64) ret f64 {
  return a + b;
}

frame sub_f32(a: f32, b: f32) ret f32 {
  return a - b;
}

frame print_point(p: Point) {
  call printf("Point(%f, %f)\n", p.x, p.y);
}

frame print_bool(b: u64) {
    if b { call printf("true\n"); } else { call printf("false\n"); }
}

frame test_arithmetic() {
    call printf("--- Arithmetic & Assignments ---\n");
    local a: f64 = 10.0;
    a += 5.0; # 15.0
    call printf("10.0 += 5.0 -> %f\n", a);
    a -= 2.5; # 12.5
    call printf("15.0 -= 2.5 -> %f\n", a);
    a *= 2.0; # 25.0
    call printf("12.5 *= 2.0 -> %f\n", a);
    a /= 5.0; # 5.0
    call printf("25.0 /= 5.0 -> %f\n", a);
}

frame test_mixed_types() {
    call printf("\n--- Mixed Types ---\n");
    local f: f64 = 2.5;
    local i: u64 = 10;
    local res1: f64 = f + i; # 12.5
    local res2: f64 = i + f; # 12.5
    call printf("2.5 + 10 = %f\n", res1);
    call printf("10 + 2.5 = %f\n", res2);
    
    local f32_val: f32 = 1.5;
    local res3: f64 = f32_val + f; # 4.0
    call printf("1.5 (f32) + 2.5 (f64) = %f\n", res3);
}

frame test_comparisons() {
    call printf("\n--- Comparisons ---\n");
    local a: f64 = 10.5;
    local b: f64 = 10.5;
    local c: f64 = 20.0;
    
    call printf("10.5 == 10.5: ");
    call print_bool(a == b);
    
    call printf("10.5 != 20.0: ");
    call print_bool(a != c);
    
    call printf("10.5 < 20.0: ");
    call print_bool(a < c);
    
    call printf("20.0 > 10.5: ");
    call print_bool(c > a);
}

frame many_floats(f1: f64, f2: f64, f3: f64, f4: f64, f5: f64, f6: f64, f7: f64, f8: f64) {
    call printf("\n--- Many Arguments (Registers) ---\n");
    call printf("Sum: %f\n", f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8);
}

frame test_edge_cases() {
    call printf("\n--- Edge Cases ---\n");
    local z: f64 = 0.0;
    local nz: f64 = -0.0;
    call printf("0.0: %f, -0.0: %f\n", z, nz);
    
    local inf: f64 = 1.0 / 0.0;
    call printf("1.0 / 0.0 = %f\n", inf);
    
    local nan: f64 = 0.0 / 0.0;
    call printf("0.0 / 0.0 = %f\n", nan);
    
    local p1: f64 = 0.1;
    local p2: f64 = 0.2;
    local p3: f64 = p1 + p2;
    call printf("0.1 + 0.2 = %.17f\n", p3);
}

frame main() ret u64 {
  call printf("--- Basic Operations ---\n");
  local a: f64 = 3.14;
  local b: f64 = 2.0;
  local c: f64 = a * b;
  local div_res: f64 = a / b;
  
  local d: f32 = 1.5;
  local e: f32 = 2.5;
  local f: f32 = d + e;
  local sub_res: f32 = call sub_f32(e, d);

  call printf("f64 mul: %f, div: %f\n", c, div_res);
  call printf("f32 add: %f, sub: %f\n", f, sub_res);

  call printf("\n--- Function Calls ---\n");
  local sum: f64 = call add_f64(10.5, 20.5);
  call printf("add_f64(10.5, 20.5): %f\n", sum);

  call printf("\n--- Arrays ---\n");
  local arr: f64[3];
  arr[0] = 1.1;
  arr[1] = 2.2;
  arr[2] = 3.3;
  call printf("Array: [%f, %f, %f]\n", arr[0], arr[1], arr[2]);

  call printf("\n--- Structs ---\n");
  local p: Point;
  p.x = 5.0;
  p.y = 10.0;
  call print_point(p);

  local v: Vector3;
  v.x = 1.0;
  v.y = 2.0;
  v.z = 3.0;
  call printf("Vector3: (%f, %f, %f)\n", v.x, v.y, v.z);

  call printf("\n--- Complex Calculation ---\n");
  local dist_sq: f64 = (p.x * p.x) + (p.y * p.y);
  call printf("Point distance squared: %f\n", dist_sq);

  call test_arithmetic();
  call test_mixed_types();
  call test_comparisons();
  call many_floats(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0);

  call printf("\n--- Negative Numbers ---\n");
  local neg: f64 = -5.5;
  call printf("Negative: %f\n", neg);
  call printf("Abs val check: ");
  if neg < 0.0 { call printf("is negative\n"); }

  call test_edge_cases();

  return 0;
}
