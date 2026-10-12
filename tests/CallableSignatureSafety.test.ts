import { test } from "bun:test";
import { expectCheckDiagnostics } from "./helpers/languageSpec";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const badCalls = [
  [
    "parameter-width",
    `frame narrow(x:int) ret int {return x;}
    frame accept(f:Func<int>(long)) ret int {return f(1);}
    frame main() ret int {return accept(narrow);}`,
  ],
  [
    "return-width",
    `frame narrow(x:int) ret int {return x;}
    frame accept(f:Func<long>(int)) ret long {return f(1);}
    frame main() ret int {return accept(narrow) as int;}`,
  ],
  [
    "nested-callback",
    `frame use(f:Func<int>(int)) ret int {return f(1);}
    frame wide(x:long) ret long {return x;}
    frame accept(f:Func<int>(Func<long>(long))) ret int {return f(wide);}
    frame main() ret int {return accept(use);}`,
  ],
  [
    "extern-variadic",
    `extern variadic(x:int,...) ret int;
    frame accept(f:Func<int>(int)) ret int {return f(1);}
    frame main() ret int {return accept(variadic);}`,
  ],
  [
    "closure-width",
    `frame accept(f:Lambda<long>(long)) ret long {return f(1);}
    frame main() ret int {local offset:int=1;
      local f:Lambda<int>(int)=|x:int| ret int {return offset+x;};
      return accept(f) as int;}`,
  ],
  [
    "generic-alias-width",
    `type Callback<T>=Func<T>(T);
    frame narrow(x:int) ret int {return x;}
    frame accept(f:Callback<long>) ret long {return f(1);}
    frame main() ret int {return accept(narrow) as int;}`,
  ],
] as const;

for (const [name, source] of badCalls) {
  test(`rejects incompatible callback ABI: ${name}`, () => {
    expectCheckDiagnostics([
      { name, source, code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH" },
    ]);
  });
}

test("callback signature aliases remain compatible and scalar calls can widen", () => {
  expectCorrectnessSuite([
    {
      name: "callback-signature-aliases",
      validateLlvm: true,
      source: `
    type Value=int;type Callback<T>=Func<T>(T);
    frame increment(x:i32) ret i32 {return x+1;}
    frame accept(f:Callback<Value>, x:i8) ret int {return f(x);}
    frame main() ret int {
      local f:Func<int>(Value)=increment;
      if(accept(f,41 as i8)!=42) return 1;
      return 0;
    }
  `,
    },
  ]);
}, 60000);

test("incompatible callback signatures are rejected in value transfers", () => {
  expectCheckDiagnostics([
    {
      name: "callback-initializer",
      code: "E001",
      source: `
      frame narrow(x:int) ret int {return x;}
      frame main() ret int {local f:Func<long>(long)=narrow;return f(1) as int;}
    `,
    },
    {
      name: "callback-assignment",
      code: "BPL_ASSIGNMENT_TYPE_MISMATCH",
      source: `
      frame narrow(x:int) ret int {return x;}
      frame main() ret int {local f:Func<long>(long);f=narrow;return f(1) as int;}
    `,
    },
    {
      name: "callback-return",
      code: "BPL_RETURN_TYPE_MISMATCH",
      source: `
      frame narrow(x:int) ret int {return x;}
      frame factory() ret Func<long>(long) {return narrow;}
    `,
    },
  ]);
});
