frame multiply(a:u8, b:u8) ret u8{
  return a * b;
}

export multiply;


struct Point {
    x: u32,
    y: u32,
}

export [Point];