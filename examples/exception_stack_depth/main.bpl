frame fail() {throw 7;}
frame recoverOne() ret int {try {fail();}catch(e:int) {return e;}return 0;}
frame main() ret int {
 local count:int=0;
 loop(local i:int=0;i<10010;i++) {
  if(recoverOne()==7)count++;
 }
 if(count!=10010) {return 1;}return 0;
}
