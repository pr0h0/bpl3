global const SYS_EXIT: u8 = 1;
global counter : u32 = 12;

frame main () {
  call print("Hello, World!\n");
  call exit(counter + SYS_EXIT);
}
