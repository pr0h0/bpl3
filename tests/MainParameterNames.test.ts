import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-FN-1
test("main parameters use ABI positions independently of source names at O0/O3", () => {
  expectCorrectnessSuite(
    [
      {
        name: "renamed-main-arguments",
        source: `frame main(count:int,arguments:**char) ret int {
 if(count!=1)return 1;if(arguments[0]==nullptr)return 2;return 0;
}`,
      },
      {
        name: "unused-main-arguments",
        source: "frame main(_count:int,_arguments:**char) ret int {return 0;}",
      },
      {
        name: "swapped-main-argument-names",
        source: `frame main(argv:int,argc:**char) ret int {
 if(argv!=1)return 1;if(argc[0]==nullptr)return 2;
 argv+=1;if(argv!=2)return 3;return 0;
}`,
      },
    ].map((entry) => ({ ...entry, validateLlvm: true, expectedStdout: "" })),
  );
}, 60000);
