import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, definitions, create, access] of [
  ["tuple", "", "local aggregate:(int[],int)=(values,7);", "aggregate.0"],
  [
    "aliased tuple",
    "type Pair=(int[],int);",
    "local aggregate:Pair=(values,7);",
    "aggregate.0",
  ],
  [
    "aliased field",
    "type Borrowed=int[];struct View { values:Borrowed, }",
    "local aggregate:View=View{values:values};",
    "aggregate.values",
  ],
  [
    "generic field",
    "struct View<T> { values:T[], }",
    "local aggregate:View<int>=View<int>{values:values};",
    "aggregate.values",
  ],
  [
    "struct",
    "struct View { values:int[], }",
    "local aggregate:View=View{values:values};",
    "aggregate.values",
  ],
]) {
  test(`existing array storage remains borrowed in ${name} literals at O0/O3`, () => {
    expectCorrectnessSuite([
      {
        name: `aggregate-slice-${name}`,
        validateLlvm: true,
        source: `
        import printf from "std/c.bpl";
        ${definitions}
        frame main()ret int{
          local values:int[2]=[1,2];
          ${create}
          ${access}[1]=9;
          printf("%d\\n",values[1]);
          return 0;
        }`,
        expectedStdout: "9\n",
      },
    ]);
  }, 60000);
}

test("aggregate borrowing evaluates storage selection and rvalue arrays once at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-slice-evaluation",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      global calls:int=0;
      struct Store { values:int[2], }
      struct Nested { pair:(int[],int), }
      frame select(store:*Store)ret *Store{calls=calls+1;return store;}
      frame index()ret int{calls=calls+1;return 1;}
      frame make()ret int[2]{calls=calls+1;return [4,5];}
      frame main()ret int{
        local store:Store=Store{values:[1,2]};
        local selected:(int[],int)=(select(&store).values,7);
        selected.0[1]=9;
        local rows:int[2][2]=[[1,2],[3,4]];
        local row:(int[],int)=(rows[index()],7);
        row.0[1]=10;
        local temporary:(int[],int)=(make(),7);
        local nested:Nested=Nested{pair:(store.values,7)};
        nested.pair.0[0]=11;
        printf("%d %d %d %d %d\\n",store.values[0],store.values[1],rows[1][1],temporary.0[1],calls);
        return 0;
      }`,
      expectedStdout: "11 9 10 5 3\n",
    },
  ]);
}, 60000);

test("aggregate fields apply checked scalar and callback conversions at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-field-conversions",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      struct Fields { wide:long, real:double, callback:Lambda<int>(int), }
      frame increment(value:int)ret int{return value+1;}
      frame main()ret int{
        local fields:Fields=Fields{wide:cast<u8>(255),real:cast<double>(cast<f32>(1.5)),callback:increment};
        printf("%ld %.1f %d\\n",fields.wide,fields.real,fields.callback(4));
        return 0;
      }`,
      expectedStdout: "255 1.5 5\n",
    },
  ]);
}, 60000);

test("overloaded indexing creates aggregate slice values by evaluating the getter once at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-overloaded-index",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      global calls:int=0;
      struct Source {
        values:int[2],
        frame __get__(this:*Source,_index:int)ret int[2]{calls=calls+1;return this.values;}
      }
      struct View { values:int[], }
      frame main()ret int{
        local source:Source=Source{values:[1,2]};
        local tuple:(int[],int)=(source[0],7);
        local view:View=View{values:source[0]};
        tuple.0[1]=9;
        view.values[0]=8;
        printf("%d %d %d %d %d\\n",tuple.0[1],view.values[0],source.values[0],source.values[1],calls);
        return 0;
      }`,
      expectedStdout: "9 8 1 2 2\n",
    },
  ]);
}, 60000);

test("overloaded dereferencing creates aggregate slice values by evaluating the getter once at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-overloaded-dereference",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      global calls:int=0;
      struct Source {
        values:int[2],
        frame __mul__(this:*Source)ret int[2]{calls=calls+1;return this.values;}
      }
      struct View { values:int[], }
      frame main()ret int{
        local source:Source=Source{values:[1,2]};
        local tuple:(int[],int)=((*source),7);
        local view:View=View{values:(*source)};
        tuple.0[1]=9;
        view.values[0]=8;
        printf("%d %d %d %d %d\\n",tuple.0[1],view.values[0],source.values[0],source.values[1],calls);
        return 0;
      }`,
      expectedStdout: "9 8 1 2 2\n",
    },
  ]);
}, 60000);
