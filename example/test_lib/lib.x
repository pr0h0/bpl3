frame multiply(a:u32, b:u32) ret u32{
  return a * b;
}

export multiply;


struct Point {
    x: u32,
    y: u32,
}

export [Point];