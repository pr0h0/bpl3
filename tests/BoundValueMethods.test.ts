import { test } from "bun:test";
import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

test("bound value receivers use an adapter for scalar, void and aggregate results", () => {
  expectCorrectnessSuite([
    {
      name: "bound-value-method-abi",
      validateLlvm: true,
      source: `global result:int=0;global evaluations:int=0;
      struct Value {
        number:int,
        frame read(this:Value)ret int{return this.number;}
        frame add(this:Value,increment:u8)ret u8 {this.number=this.number+cast<int>(increment);return cast<u8>(this.number);}
        frame consume(this:Value,increment:int){result=this.number+increment;}
        frame copy(this:Value)ret Value{return this;}
      }
      struct Big {
        a:long,b:long,c:long,d:long,
        frame copy(this:Big)ret Big{return this;}
      }
      enum Mode {
        Ready,
        frame ready(this:Mode)ret bool{return match(this){Mode.Ready=>true,};}
      }
      type ValueRef = *Value;
      frame make()ret Value{evaluations=evaluations+1;return Value{number:42};}
      frame main()ret int {
        local const value:Value=Value{number:7};
        local read:Lambda<int>()=value.read;
        local add:Lambda<u8>(u8)=value.add;
        local consume:Lambda<void>(int)=value.consume;
        local copy:Lambda<Value>()=value.copy;
        if(read()!=7||add(250)!=cast<u8>(257)||value.number!=7){return 1;}
        consume(5);if(result!=12){return 2;}
        local snapshot:Value=copy();if(snapshot.number!=7){return 3;}
        local temporary:Lambda<int>()=make().read;
        if(evaluations!=1||temporary()!=42||temporary()!=42||evaluations!=1){return 4;}
        local mutable:Value=Value{number:9};local current:Lambda<int>()=mutable.read;
        mutable.number=11;if(current()!=11){return 5;}
        local pointer:ValueRef=&mutable;local viaPointer:Lambda<int>()=pointer.read;
        pointer=nullptr;if(viaPointer()!=11){return 8;}
        local caught:bool=false;
        try {local invalid:Lambda<int>()=pointer.read;invalid();}
        catch(_error:NullAccessError){caught=true;}
        if(!caught){return 9;}
        local big:Big=Big{a:1,b:2,c:3,d:4};local bigCopy:Lambda<Big>()=big.copy;
        local copied:Big=bigCopy();if(copied.a+copied.b+copied.c+copied.d!=10){return 6;}
        local mode:Mode=Mode.Ready;local ready:Lambda<bool>()=mode.ready;
        if(!ready()){return 7;}
        return 0;
      }`,
      expectedStdout: "",
    },
  ]);
}, 60000);

test("variadic value-receiver methods are rejected at declaration", () => {
  expectCleanFailureSuite([
    {
      name: "bound-variadic-value-receiver",
      source: `struct Value {
        number:int,
        frame sum(this:Value,args:...int,count:int)ret int {
          return this.number+count+args[0];
        }
      }
      frame main()ret int {
        local value:Value=Value{number:1};
        local callback:Lambda<int>(int,int)=value.sum;
        return callback(1,0);
      }`,
      expectedMessage: "cannot have a native variadic parameter",
    },
  ]);
}, 30000);
