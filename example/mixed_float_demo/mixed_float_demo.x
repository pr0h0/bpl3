frame main() ret u64 {
  local f: f64 = 10.5;
  local i: u64 = 2;
  
  local res1: f64 = f + i; # 12.5
  local res2: f64 = i + f; # 12.5
  
  local f32_val: f32 = 5.5;
  local res3: f64 = f32_val + i; # 7.5
  
  local f2: f64 = 1.5;
  local res4: f64 = f + f2; # 12.0

  asm {
    extern printf
    section .rodata
    fmt db "res1: %f, res2: %f, res3: %f, res4: %f", 10, 0
    section .text
    lea rdi, [rel fmt]
    movsd xmm0, (res1)
    movsd xmm1, (res2)
    movsd xmm2, (res3)
    movsd xmm3, (res4)
    mov rax, 4
    sub rsp, 4
    call printf WRT ..plt
    add rsp, 4
  }
  
  return 0;
}
