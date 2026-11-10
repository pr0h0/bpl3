import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("combines Option and Result values", () => {
  expectCorrectnessSuite([
    {
      name: "option and result combinators",
      validateLlvm: true,
      expectedStdout:
        "filter 4 T\nor 7 4 9\nxor 4 T T\npredicates T F T F\nmapOr 12 -5\ninspect 4 take 1 emptied T replace T 5\nandThen 2 odd\norElse 100 unwrapOrElse 42\nisOkAnd T F isErrAnd T mapOr 3 T\n",
      source: `import [Option] from "std/option.bpl";
import [Result] from "std/result.bpl";
extern printf(fmt: string, ...);
frame b(v: bool) ret string { if (v) { return "T"; } return "F"; }
frame half(x: int) ret Result<int, string> {
    if ((x % 2) != 0) { return Result<int, string>.Err("odd"); }
    return Result<int, string>.Ok(x / 2);
}
frame main() ret int {
    local some: Option<int> = Option<int>.Some(4);
    local none: Option<int> = Option<int>.None;
    local even: Lambda<bool>(int) = |x: int| ret bool { return (x % 2) == 0; };
    printf("filter %d %s\\n", some.filter(even).unwrapOr(-1), b(some.filter(|x: int| ret bool { return x > 10; }).isNone()));
    printf("or %d %d %d\\n", none.or(Option<int>.Some(7)).unwrap(), some.or(Option<int>.Some(7)).unwrap(), none.orElse(|| ret Option<int> { return Option<int>.Some(9); }).unwrap());
    printf("xor %d %s %s\\n", none.xor(some).unwrap(), b(some.xor(some).isNone()), b(none.xor(none).isNone()));
    printf("predicates %s %s %s %s\\n", b(some.isSomeAnd(even)), b(none.isSomeAnd(even)), b(none.isNoneOr(even)), b(some.isNoneOr(|x: int| ret bool { return x < 0; })));
    printf("mapOr %d %d\\n", some.mapOr<int>(0, |x: int| ret int { return x * 3; }), none.mapOr<int>(-5, |x: int| ret int { return x; }));
    local seen: int = 0; local seenPtr: *int = &seen;
    some.inspect(|x: int| { *seenPtr = x; });
    local slot: Option<int> = Option<int>.Some(1);
    local taken: Option<int> = slot.take();
    local emptied: bool = slot.isNone();
    local previous: Option<int> = slot.replace(5);
    printf("inspect %d take %d emptied %s replace %s %d\\n", seen, taken.unwrap(), b(emptied), b(previous.isNone()), slot.unwrap());
    local chained: Result<int, string> = half(8).andThen<int>(half);
    local failed: Result<int, string> = half(6).andThen<int>(half);
    printf("andThen %d %s\\n", chained.unwrap(), failed.err().unwrap());
    local recovered: Result<int, int> = failed.orElse<int>(|e: string| ret Result<int, int> { return Result<int, int>.Ok(100); });
    printf("orElse %d unwrapOrElse %d\\n", recovered.unwrap(), failed.unwrapOrElse(|e: string| ret int { return 42; }));
    printf("isOkAnd %s %s isErrAnd %s mapOr %d %s\\n", b(chained.isOkAnd(|x: int| ret bool { return x == 2; })), b(failed.isOkAnd(|x: int| ret bool { return true; })), b(failed.isErrAnd(|e: string| ret bool { return true; })), chained.mapOr<int>(0, |x: int| ret int { return x + 1; }), b(chained.err().isNone()));
    return 0;
}
`,
    },
  ]);
}, 120000);
