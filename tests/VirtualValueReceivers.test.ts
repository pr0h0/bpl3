import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("virtual value receivers copy the concrete derived layout through base pointers", () => {
  expectCorrectnessSuite([
    {
      name: "virtual-value-receiver-layout",
      validateLlvm: true,
      source: `struct Base {
      tag:int,
      frame total(this:Base)ret long{return cast<long>(this.tag);}
    }
    struct Derived:Base {
      a:long,b:long,c:long,
      frame total(this:Derived)ret long {
        this.tag=1000;return cast<long>(this.tag)+this.a+this.b+this.c;
      }
    }
    frame invoke(base:*Base)ret long{return base.total();}
    frame main()ret int {
      local derived:Derived;
      derived.tag=3;derived.a=5;derived.b=7;derived.c=11;
      if(derived.total()!=1023||derived.tag!=3){return 1;}
      if(invoke(&derived)!=1023||derived.tag!=3){return 2;}
      return 0;
    }`,
      expectedStdout: "",
    },
  ]);
}, 60000);
