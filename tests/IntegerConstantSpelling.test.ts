import { test } from "bun:test";
import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

test("grouping and digit separators cannot bypass narrow integer initializer checks", () => {
  expectCleanFailureSuite(
    ["3_00", "(300)", "((3_00))", "-(1_29)"].map((value, index) => ({
      name: `integer-spelling-overflow-${index}`,
      source: `frame main()ret int{local value:${index === 3 ? "i8" : "u8"}=${value};return cast<int>(value);}`,
      expectedMessage: "Integer overflow:",
    })),
  );
}, 60000);

test("grouped separated integer constants remain valid within their target range", () => {
  expectCorrectnessSuite([
    {
      name: "integer-spelling-in-range",
      validateLlvm: true,
      source: `frame main()ret int{local small:u8=(2_55);local negative:i8=-(1_28);if(small!=cast<u8>(255)||negative!=cast<i8>(-128)){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
