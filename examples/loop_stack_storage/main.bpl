frame fail() {throw 7;}
frame main() ret int {
 local count:int=0;
 loop(local i:int=0;i<10010;i++) {
  try {fail();}catch(e:int) {if(e==7)count++;}
 }
 if(count!=10010) {return 1;}return 0;
}
