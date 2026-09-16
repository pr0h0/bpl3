frame read(value:int[2]) ret int {return value[1];}
frame read(value:int[3]) ret int {return value[2];}
frame widen(value:long) ret long {return value;}
frame main() ret int {
 local a:int[2];a[1]=20;local b:int[3];b[2]=22;
 return cast<int>(widen(read(a)+read(b)))-42;
}
