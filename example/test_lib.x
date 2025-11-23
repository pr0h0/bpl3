import multiply_xx, printf;

frame main(){
  local res: u8 = call multiply_xx(8, 7);
  call printf("%d\n",res); 
  return 0;
}
