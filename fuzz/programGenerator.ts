/**
 * Random well-typed BPL program generator with a built-in oracle.
 *
 * Every expression and statement is built together with a JavaScript
 * evaluator implementing the language's integer semantics (two's-complement
 * wrapping, R-CONV-2 operand conversion, truncating division, low-bit bool
 * casts). The generator executes the program it produced, so each program
 * carries the exact stdout it must print. A mismatch at any optimization
 * level is a miscompile, a wrong constant fold, or a false checker
 * rejection, not just an O0/O3 disagreement.
 *
 * Programs avoid undefined or trapping behavior by construction: divisors and
 * shift counts are masked into safe ranges, and array indices are masked to
 * the array length. Exceptions are thrown only inside a `try` whose clauses
 * catch them (R-EXC-2), so every program exits normally.
 */

export interface IntType {
  kind: "int";
  name: string;
  bits: number;
  signed: boolean;
}

export interface BoolType {
  kind: "bool";
  name: "bool";
}

export interface FloatType {
  kind: "float";
  name: "double" | "f32";
  bits: 64 | 32;
}

export type ScalarType = IntType | BoolType | FloatType;
interface EnumValue {
  tag: number;
  payload: Value[];
}
type Value = bigint | boolean | number | EnumValue;
type Env = Map<string, Value>;

const INT_TYPES: IntType[] = [
  { kind: "int", name: "i8", bits: 8, signed: true },
  { kind: "int", name: "u8", bits: 8, signed: false },
  { kind: "int", name: "i16", bits: 16, signed: true },
  { kind: "int", name: "u16", bits: 16, signed: false },
  { kind: "int", name: "int", bits: 32, signed: true },
  { kind: "int", name: "uint", bits: 32, signed: false },
  { kind: "int", name: "long", bits: 64, signed: true },
  { kind: "int", name: "ulong", bits: 64, signed: false },
];
const INT = INT_TYPES[4]!;
const BOOL: BoolType = { kind: "bool", name: "bool" };
const FLOAT_TYPES: FloatType[] = [
  { kind: "float", name: "double", bits: 64 },
  { kind: "float", name: "f32", bits: 32 },
];
const LONG = INT_TYPES[6]!;
/** How many array subscripts may enclose another array read. */
const MAX_INDEX_NESTING = 2;
/**
 * Source spelling of the pieces of generated strings, and their text or, for
 * a `\\xHH` escape of 0x80 and above, the one byte it stands for.
 */
const STRING_PIECES: readonly (readonly [string, string | number])[] = [
  ["a", "a"],
  ["Z", "Z"],
  ["7", "7"],
  [" ", " "],
  ["%", "%"],
  ["\\n", "\n"],
  ["\\t", "\t"],
  ["\\r", "\r"],
  ["\\\\", "\\"],
  ['\\"', '"'],
  ["\\'", "'"],
  ["\\0", "\0"],
  ["\\x41", "A"],
  ["\\x7e", "~"],
  ["\\x80", 0x80],
  ["\\xC3", 0xc3],
  ["\\xF0", 0xf0],
  ["\\xff", 0xff],
  ["\\u0042", "B"],
  ["\\u00e9", "\u00e9"],
  ["\\u20ac", "\u20ac"],
  ["\u00e9", "\u00e9"],
  ["\u20ac", "\u20ac"],
  ["\u{1f600}", "\u{1f600}"],
];
/** Character literals with their values, used as `match` patterns. */
const CHAR_PATTERNS: readonly (readonly [string, number])[] = [
  ["'a'", 97],
  ["'Z'", 90],
  ["'7'", 55],
  ["' '", 32],
  ["'%'", 37],
  ["'\\n'", 10],
  ["'\\t'", 9],
  ["'\\\\'", 92],
  ["'\\''", 39],
  ["'\"'", 34],
  ["'A'", 65],
  ["'~'", 126],
  ["'\\0'", 0],
];

interface Expr {
  type: ScalarType;
  code: string;
  /** True when built only from literals, unary, binary and casts. */
  constant: boolean;
  /** Names read, so unused parameters can be detected. */
  reads: Set<string>;
  eval(env: Env): Value;
}

/** How a statement left its block: normally, or by break/continue. */
type Signal = "break" | "continue" | undefined;

/** A value thrown by the generated program, unwinding the oracle too. */
class Thrown {
  constructor(
    /** A struct's field values, in order, for a thrown struct. */
    readonly value: Value | Value[],
    readonly type: ThrowType,
  ) {}
}

interface Stmt {
  code(indent: string): string;
  exec(env: Env): Signal;
  /** For `defer`: capture values now, return the code to run at block exit. */
  defer?(env: Env): () => void;
}

/**
 * Run a block; deferred statements run last-in, first-out at its exit,
 * including an exit by a thrown exception (R-DEFER-1).
 */
function execBlock(statements: Stmt[], env: Env): Signal {
  const deferred: (() => void)[] = [];
  let signal: Signal;
  try {
    for (const statement of statements) {
      if (statement.defer) {
        deferred.push(statement.defer(env));
        continue;
      }
      signal = statement.exec(env);
      if (signal) break;
    }
  } finally {
    for (const run of deferred.reverse()) run();
  }
  return signal;
}

/** A storage location: local, global, struct field or array element. */
interface Place {
  type: ScalarType;
  /** Code for a fixed location; arrays build theirs from an index. */
  code: string;
  key: string;
  array?: { base: string; length: number };
  /** Loop counters and parameters are read but never assigned. */
  readonly?: boolean;
}

interface Helper {
  name: string;
  params: { name: string; type: IntType }[];
  returnType: ScalarType;
  body: Expr;
}

interface StructDef {
  name: string;
  fields: ScalarType[];
  /** `frame name(this: *S, d: int) ret T`, reading `this.fK` and `d`. */
  methods: { name: string; returnType: ScalarType; body: Expr }[];
  /** `frame name(this: *S, d: int) { this.fK = ...; }` */
  mutators: { name: string; field: number; body: Expr }[];
  /** `frame name(s: S, d: int) ret T`, taking the struct by value. */
  byValue: { name: string; returnType: ScalarType; body: Expr }[];
  /** `frame mkK(x: int) ret S`, returning a new value (also thrown). */
  maker?: { name: string; fields: Expr[] };
  /** `frame val(this: *S, d: int) ret long`, implementing the spec. */
  specVal?: Expr;
}

/** What a generated program throws: an integer or a struct value. */
type ThrowType = IntType | StructDef;

function isStructType(type: ThrowType): type is StructDef {
  return !("kind" in type);
}

/** A value of the operator struct: its fields `a` and `b`. */
interface OperatorValue {
  code: string;
  reads: Set<string>;
  eval(env: Env): [bigint, bigint];
}

/** A struct-typed local in main. */
interface Instance {
  name: string;
  struct: StructDef;
}

/** `struct HK { f: Func<T>(T), k: T }`: `x + first` or `x ^ second`. */
interface FuncHolder {
  name: string;
  type: IntType;
  firstName: string;
  secondName: string;
  first: bigint;
  second: bigint;
}

/** `curK(a)` returns a closure computing `(a ^ b) + offset`. */
interface Curried {
  name: string;
  applied: string;
  type: IntType;
  offset: bigint;
  /** The `a` captured by `applied`. */
  bound: bigint;
}

/** `struct ZA`, `ZB: ZA` and `ZC: ZB`, and a `*ZA` retargeted among them. */
interface ThreeLevel {
  type: IntType;
  names: readonly [string, string, string];
  locals: string[];
  pointer: string;
  /** Set once the pointer is declared; its initializers cannot use it. */
  ready?: boolean;
}

/** `In { P(T), Q { a, b }, R }` and `Out { W(In), X { i, n }, Y }`. */
interface NestedEnums {
  inner: string;
  outer: string;
  innerDigest: string;
  outerDigest: string;
  type: IntType;
  locals: string[];
  holders: string[];
  holderName: string;
}

/** `Lambda<T>(T)[2]`: `x + captured` and `x ^ constant`, by slot tag. */
interface LambdaArray {
  name: string;
  type: IntType;
  captured: bigint;
  constant: bigint;
}

/** `Rs` prints its id when destroyed; `Own` holds two and destroys itself first. */
interface Resources {
  rs: string;
  own: string;
  make: string;
  guarded: string;
  rsLabel: string;
  ownLabel: string;
}

interface BoundMutator {
  name: string;
  instance: Instance;
  mutator: StructDef["mutators"][number];
}

interface EnumDef {
  name: string;
  /** Payload types per variant; [] is a unit variant. */
  variants: IntType[][];
}

interface Recursive {
  name: string;
  type: IntType;
  /** Reads `n` (int) and `acc` (type). */
  body: Expr;
}

interface LambdaDef {
  name: string;
  param: IntType;
  paramName: string;
  returnType: ScalarType;
  body: Expr;
  /** Locals as they were when the lambda was created (capture by value). */
  snapshot: Env;
  /** A function after main that takes the lambda as an argument. */
  apply?: string;
}

/** A parent struct and a child overriding its virtual method `vf`. */
interface Hierarchy {
  parent: string;
  child: string;
  parentFields: ScalarType[];
  childFields: ScalarType[];
  returnType: ScalarType;
  parentBody: Expr;
  childBody: Expr;
  dispatcher: string;
  /** Locals with their dynamic type; `up` are `*Parent` pointers to a child. */
  locals: { name: string; dynamic: "parent" | "child" }[];
  pointers: { name: string; target: string }[];
  /** `*Parent` pointers tested with `is *Child`, and whether they are. */
  typed: { name: string; child: boolean }[];
}

/** `frame thrK(x: int, limit: int) ret int`: throws when `x > limit`. */
interface Thrower {
  name: string;
  throwType: IntType;
  scale: bigint;
  offset: bigint;
  mask: bigint;
}

/**
 * `frame rlK(x: int) ret int` between main and a thrower: it either runs a
 * deferred print while the exception passes through it, or catches an `int`
 * and rethrows it as a `long`.
 */
interface Relay {
  name: string;
  target: Thrower;
  limit: bigint;
  form: "defer" | "translate";
}

/** `local fpK: Func<R>(P...) = hN;` in main, called like the helper. */
interface FuncPointer {
  name: string;
  helper: Helper;
}

/** `frame ovK(p: T) ret R` declared once per parameter type `T`. */
interface OverloadSet {
  name: string;
  returnType: IntType;
  variants: { paramType: IntType; param: string; body: Expr }[];
}

interface Mutator {
  name: string;
  type: IntType;
  deltaType: IntType;
  op: string;
}

export interface GeneratedProgram {
  source: string;
  expectedStdout: string;
}

export const EXPECT_MARKER = "# fuzz-expect: ";
/** First line of a program that is also run as hosted WebAssembly. */
export const WASM_MARKER = "# fuzz-target: wasm";

function wrap(value: bigint, type: IntType): bigint {
  return type.signed
    ? BigInt.asIntN(type.bits, value)
    : BigInt.asUintN(type.bits, value);
}

/** Convert a value to `to` as an implicit or explicit integer conversion. */
function convert(value: Value, to: ScalarType): Value {
  if (typeof value === "object") return value;
  if (to.kind === "float") {
    const number =
      typeof value === "number"
        ? value
        : typeof value === "boolean"
          ? Number(value)
          : Number(value);
    return to.bits === 32 ? Math.fround(number) : number;
  }
  if (typeof value === "number") {
    // Float to integer truncates and saturates; NaN is 0 (R-CONV-10).
    if (to.kind === "bool") return false;
    if (Number.isNaN(value)) return 0n;
    const min = to.signed ? -(1n << BigInt(to.bits - 1)) : 0n;
    const max = to.signed
      ? (1n << BigInt(to.bits - 1)) - 1n
      : (1n << BigInt(to.bits)) - 1n;
    if (value === Infinity) return max;
    if (value === -Infinity) return min;
    const truncated = BigInt(Math.trunc(value));
    return truncated < min ? min : truncated > max ? max : truncated;
  }
  if (to.kind === "bool") {
    return typeof value === "boolean" ? value : (value & 1n) === 1n;
  }
  const integer = typeof value === "boolean" ? (value ? 1n : 0n) : value;
  return wrap(integer, to);
}

/** IEEE bit pattern as printed by `%llx`/`%x`; every NaN prints as 1. */
function floatBits(value: number, type: FloatType): string {
  if (Number.isNaN(value)) return "1";
  const view = new DataView(new ArrayBuffer(8));
  if (type.bits === 64) {
    view.setFloat64(0, value);
    return view.getBigUint64(0).toString(16);
  }
  view.setFloat32(0, value);
  return view.getUint32(0).toString(16);
}

class ProgramBuilder {
  private counter = 0;
  private readonly globals: Place[] = [];
  private readonly globalDecls: { place: Place; init: Expr }[] = [];
  private readonly helpers: Helper[] = [];
  private readonly structs: StructDef[] = [];
  private readonly instances: Instance[] = [];
  private enumDef: EnumDef | undefined;
  private enumLocals: string[] = [];
  private readonly recursives: Recursive[] = [];
  private readonly lambdas: LambdaDef[] = [];
  private hierarchy: Hierarchy | undefined;
  /** Output produced while executing (deferred prints). */
  private out: string[] = [];
  /** Array indices currently being generated, outermost first. */
  private indexNesting = 0;
  /** Disables calls, e.g. inside deferred expressions. */
  private plainOnly = false;
  /** In a function other than main, main's locals are out of reach. */
  private inFunctionBody = false;
  /** Lambda bodies capture by value, so they must not read through pointers. */
  private inLambdaBody = false;
  private readonly mutators: Mutator[] = [];
  /** `local bK: Box<T>` locals, whose `.v` is also read through `get()`. */
  private readonly boxes: { name: string; type: IntType }[] = [];
  /** Places visible in the current function, by type name. */
  private scope: Place[] = [];
  /** Enclosing loops, so break/continue are only generated inside one. */
  private loopDepth = 0;
  /** Enclosing `try` bodies of main; throws are only generated inside one. */
  private tryDepth = 0;
  private readonly throwers: Thrower[] = [];
  private readonly relays: Relay[] = [];
  private readonly funcPointers: FuncPointer[] = [];
  private readonly overloads: OverloadSet[] = [];
  /**
   * `spec VK { frame val(this: *Self, d: int) ret long; }`, implemented by
   * some structs, and `totK<T: VK>(p: *T, d: int) ret long` calling it.
   */
  private spec: { name: string; total: string } | undefined;
  /** `struct OK { x: T, inner: S, arr: E[4] }` locals and its `mk` fields. */
  private outer:
    | {
        name: string;
        xType: IntType;
        inner: StructDef;
        arrType: IntType;
        /** `OK.mk(k)`: x, inner fields, then the four elements. */
        make: Expr[];
        locals: string[];
      }
    | undefined;
  /**
   * main's `T[4]` array with its helpers: `byValue(xs: T[4], d)` changes
   * its copy, `slice(xs: T[], d)` writes through a view, and `pointer` is a
   * `*T` to element 0 read with pointer arithmetic.
   */
  private mainArray:
    | {
        name: string;
        type: IntType;
        byValue: string;
        slice: string;
        pointer: string;
        /** `vwK: T[]`, a slice local over the array. */
        view?: string;
      }
    | undefined;
  /**
   * `local kK: T` counters in main, changed only by `kK++`/`++kK`/`kK--`/
   * `--kK` inside expressions and printed at the end. Nothing else reads
   * them, so each value depends only on how many times, and in which order,
   * the increments were evaluated.
   */
  private readonly counters: { name: string; type: IntType }[] = [];
  /** Lambdas adding their argument to a counter through a captured pointer. */
  private readonly counterLambdas: {
    name: string;
    counter: { name: string; type: IntType };
  }[] = [];

  /** A struct defining operators as methods, and its locals in main. */
  private operators:
    { name: string; a: IntType; b: IntType; locals: string[] } | undefined;
  /** `Opt<T>` locals in main. */
  private readonly options: { name: string; type: IntType }[] = [];
  /** String constants read by byte; only global ones reach functions. */
  private readonly strings: {
    name: string;
    bytes: number[];
    global: boolean;
  }[] = [];
  /** `saK: S[2]` locals in main. */
  private readonly structArrays: {
    name: string;
    struct: StructDef;
    /** `svK(xs: S[], d)` copying one element over the other. */
    slice?: string;
  }[] = [];
  /** `spK: *S` locals pointing at an element of an array of structs. */
  private readonly elementPointers: {
    name: string;
    target: string;
    struct: StructDef;
  }[] = [];
  /** `bmK: Lambda<R>(int)` locals bound to a struct local's method. */
  private readonly boundMethods: {
    name: string;
    instance: Instance;
    method: StructDef["methods"][number];
  }[] = [];
  private readonly boundMutators: BoundMutator[] = [];
  /** `T[2][2]` locals with their `sum` and `set` helpers. */
  private readonly grids: {
    name: string;
    type: IntType;
    sum: string;
    set: string;
  }[] = [];
  /** `Pr<A, B>` locals, each with a `Pr<B, A>` holding the swapped fields. */
  private readonly pairs: { name: string; swapped: string }[] = [];
  private readonly nestedBoxes: { name: string; type: IntType }[] = [];
  private readonly holders: FuncHolder[] = [];
  private readonly curried: Curried[] = [];
  /** `*V` pointers, or `*V[2]` arrays, to structs implementing the spec. */
  private readonly specObjects: { name: string; targets: Instance[] }[] = [];
  private threeLevel: ThreeLevel | undefined;
  private nestedEnums: NestedEnums | undefined;
  private readonly tupleArrays: {
    name: string;
    first: IntType;
    second: IntType;
  }[] = [];
  private readonly lambdaArrays: LambdaArray[] = [];
  private hasHeapList = false;
  /** `@[auto_destroy]` structs; see `resourceStatement`. */
  private resources: Resources | undefined;

  constructor(
    private readonly rng: () => number,
    private readonly trace = false,
    /** Also run as hosted WebAssembly: adds the target marker. */
    private readonly wasm = false,
  ) {}

  private int(min: number, max: number): number {
    return Math.floor(this.rng() * (max - min + 1)) + min;
  }

  private chance(probability: number): boolean {
    return this.rng() < probability;
  }

  private pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }

  private fresh(prefix: string): string {
    return `${prefix}${this.counter++}`;
  }

  private intType(): IntType {
    return this.pick(INT_TYPES);
  }

  private scalarType(): ScalarType {
    const roll = this.rng();
    if (roll < 0.12) return BOOL;
    if (roll < 0.27) return this.pick(FLOAT_TYPES);
    return this.intType();
  }

  // ------------------------------------------------------------ exprs ----

  private literal(type: ScalarType): Expr {
    if (type.kind === "float") {
      const magnitude = this.pick([
        "0.0",
        "0.5",
        "1.0",
        "1.5",
        "2.25",
        "3.0",
        "0.1",
        "0.3",
        "100.0",
        "1000000.0",
        "123.456",
        "65536.5",
        "4294967296.0",
        "0.0001",
      ]);
      const negative = this.chance(0.3);
      const text = negative ? `(-${magnitude})` : magnitude;
      const value = convert(
        negative ? -Number(magnitude) : Number(magnitude),
        type,
      );
      return {
        type,
        code: type.bits === 64 ? text : `cast<f32>(${text})`,
        constant: true,
        reads: new Set(),
        eval: () => value,
      };
    }
    if (type.kind === "bool") {
      const value = this.chance(0.5);
      return {
        type,
        code: String(value),
        constant: true,
        reads: new Set(),
        eval: () => value,
      };
    }
    const magnitude = this.pick([
      0, 1, 2, 3, 7, 8, 15, 16, 100, 127, 128, 200, 255, 256, 1000, 32767,
      65535, 2147483647,
    ]);
    const negative = this.chance(0.3) && magnitude > 0;
    const raw = BigInt(negative ? -magnitude : magnitude);
    const value = wrap(raw, type);
    // Plain literals are `int`; other types use an explicit cast.
    const text = negative ? `-${magnitude}` : String(magnitude);
    const code =
      type === INT
        ? negative
          ? `(${text})`
          : text
        : `cast<${type.name}>(${text})`;
    return {
      type,
      code,
      constant: true,
      reads: new Set(),
      eval: () => (type === INT ? wrap(raw, INT) : value),
    };
  }

  private read(type: ScalarType): Expr | undefined {
    // An index may read the array again (`a[a[i] & 3]`), but only one level
    // deep: each index restarts the depth budget, so the nesting was
    // otherwise unbounded and could exceed the parser's depth limit.
    const places = this.scope.filter(
      (place) =>
        place.type.name === type.name &&
        (!place.array || this.indexNesting < MAX_INDEX_NESTING),
    );
    if (places.length === 0) return undefined;
    const place = this.pick(places);
    if (place.array) {
      const index = this.indexExpr();
      const mask = place.array.length - 1;
      const array = place.array;
      return {
        type,
        code: `${array.base}[(${index.code}) & ${mask}]`,
        constant: false,
        reads: new Set([...index.reads, array.base]),
        eval: (env) => {
          const slot = Number((index.eval(env) as bigint) & BigInt(mask));
          return env.get(`${array.base}[${slot}]`)!;
        },
      };
    }
    return {
      type,
      code: place.code,
      constant: false,
      reads: new Set([place.code.split(".")[0]!]),
      eval: (env) => env.get(place.key)!,
    };
  }

  /** An expression of `type`; `constantOnly` restricts to foldable forms. */
  expr(type: ScalarType, depth: number, constantOnly: boolean): Expr {
    if (depth <= 0 || this.chance(0.2)) {
      if (!constantOnly && this.chance(0.7)) {
        const read = this.read(type);
        if (read) return read;
      }
      return this.literal(type);
    }
    if (type.kind === "bool") return this.boolExpr(depth, constantOnly);
    if (type.kind === "float") return this.floatExpr(type, depth, constantOnly);
    return this.intExpr(type, depth, constantOnly);
  }

  private floatExpr(
    type: FloatType,
    depth: number,
    constantOnly: boolean,
  ): Expr {
    // The constant folder only negates and casts floats.
    const choice = this.int(0, constantOnly ? 1 : 8);
    // Deferred expressions (plainOnly) must not contain calls.
    if (choice >= 6 && !this.plainOnly) {
      const feature = this.featureExpr(this.pick([9, 11, 12, 13]), type, depth);
      if (feature) return feature;
    }
    switch (choice) {
      case 0: {
        const operand = this.expr(type, depth - 1, constantOnly);
        return {
          type,
          code: `-(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => convert(-(operand.eval(env) as number), type),
        };
      }
      case 1: {
        // Integers up to 32 bits convert exactly to double, so an f32 cast
        // rounds once, as the hardware conversion does.
        const sourceType = this.chance(0.5)
          ? this.pick(
              INT_TYPES.filter(
                (candidate) => type.bits === 64 || candidate.bits <= 32,
              ),
            )
          : this.pick(FLOAT_TYPES);
        const operand = this.expr(sourceType, depth - 1, constantOnly);
        return {
          type,
          code: `cast<${type.name}>(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => convert(operand.eval(env), type),
        };
      }
      case 2:
      case 3:
      case 4: {
        const left = this.expr(type, depth - 1, false);
        const right = this.expr(type, depth - 1, false);
        const op = this.pick(["+", "-", "*", "/"]);
        return {
          type,
          code: `(${left.code}) ${op} (${right.code})`,
          constant: false,
          reads: union(left.reads, right.reads),
          eval: (env) => {
            const a = left.eval(env) as number;
            const b = right.eval(env) as number;
            const result =
              op === "+"
                ? a + b
                : op === "-"
                  ? a - b
                  : op === "*"
                    ? a * b
                    : a / b;
            return convert(result, type);
          },
        };
      }
      case 5: {
        const condition = this.boolExpr(depth - 1, false);
        const yes = this.expr(type, depth - 1, false);
        const no = this.expr(type, depth - 1, false);
        return {
          type,
          code: `((${condition.code}) ? (${yes.code}) : (${no.code}))`,
          constant: false,
          reads: union(condition.reads, union(yes.reads, no.reads)),
          eval: (env) => (condition.eval(env) ? yes.eval(env) : no.eval(env)),
        };
      }
      default:
        return this.read(type) ?? this.literal(type);
    }
  }

  private intExpr(type: IntType, depth: number, constantOnly: boolean): Expr {
    if (!constantOnly && this.canIncrement() && this.chance(0.07)) {
      return this.counterLambdas.length > 0 && this.chance(0.3)
        ? this.counterLambdaCall(type, depth)
        : this.incrementExpr(type);
    }
    // Calls run at block exit in deferred code and could observe later
    // state, so overloads, like other calls, stay out of it.
    if (
      !constantOnly &&
      !this.plainOnly &&
      this.overloads.length > 0 &&
      this.chance(0.05)
    ) {
      return this.overloadCall(type, depth);
    }
    if (!constantOnly && this.chance(0.03)) {
      // `sizeof` of a primitive: a known byte count.
      const [name, size] = this.pick([
        ["bool", 1n],
        ["i8", 1n],
        ["u16", 2n],
        ["int", 4n],
        ["uint", 4n],
        ["long", 8n],
        ["double", 8n],
        ["f32", 4n],
      ] as const);
      return {
        type,
        code: `cast<${type.name}>(sizeof(${name}))`,
        constant: false,
        reads: new Set(),
        eval: () => convert(size, type),
      };
    }
    if (!constantOnly && this.chance(0.05)) {
      const total = this.specCall(type, depth);
      if (total) return total;
    }
    if (!constantOnly && this.canUseArray() && this.chance(0.06)) {
      return this.arrayFeatureExpr(type, depth);
    }
    if (!constantOnly && this.inMainExpression() && this.chance(0.14)) {
      const feature = this.localFeatureExpr(type, depth);
      if (feature) return feature;
    }
    if (!constantOnly && this.indexNesting < 1 && this.chance(0.04)) {
      const read = this.stringExpr(type);
      if (read) return read;
    }
    const choice = this.int(
      0,
      constantOnly ? 5 : this.plainOnly ? 6 : this.canThrow() ? 17 : 15,
    );
    if (choice === 6 && this.chance(0.35)) {
      return this.chance(0.5)
        ? this.intMatchExpr(type, depth)
        : this.richMatchExpr(type, depth);
    }
    if (choice >= 9) {
      const feature = this.featureExpr(choice, type, depth);
      if (feature) return feature;
    }
    switch (choice) {
      case 0: {
        const operand = this.expr(type, depth - 1, constantOnly);
        const op = this.pick(["-", "~"]);
        return {
          type,
          code: `${op}(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => {
            const value = operand.eval(env) as bigint;
            return wrap(op === "-" ? -value : ~value, type);
          },
        };
      }
      case 1:
      case 2: {
        // Right operand of any integer type converts to the left type.
        const left = this.expr(type, depth - 1, constantOnly);
        const right = this.expr(this.intType(), depth - 1, constantOnly);
        const op = this.pick(["+", "-", "*", "&", "|", "^"]);
        return binary(type, op, left, right);
      }
      case 3: {
        // Divisor masked into 1..8, or for signed types sometimes -2..-5:
        // never zero, never MIN / -1. Division truncates toward zero and
        // `%` takes the dividend's sign (R-EXPR-1), as BigInt does.
        const left = this.expr(type, depth - 1, constantOnly);
        const right = this.expr(type, depth - 1, constantOnly);
        const op = this.pick(["/", "%"]);
        const negative = type.signed && this.chance(0.3);
        return {
          type,
          code: negative
            ? `(${left.code}) ${op} (-(((${right.code}) & 3) + 2))`
            : `(${left.code}) ${op} (((${right.code}) & 7) + 1)`,
          constant: left.constant && right.constant,
          reads: union(left.reads, right.reads),
          eval: (env) => {
            const a = left.eval(env) as bigint;
            const masked = wrap(right.eval(env) as bigint, type);
            const b = negative
              ? wrap(-((masked & 3n) + 2n), type)
              : wrap((masked & 7n) + 1n, type);
            return wrap(op === "/" ? a / b : a % b, type);
          },
        };
      }
      case 4: {
        // Shift count masked below the left operand's width (up to 63):
        // `<<` wraps and `>>` is arithmetic on signed values.
        const left = this.expr(type, depth - 1, constantOnly);
        const count = this.expr(type, depth - 1, constantOnly);
        const op = this.pick(["<<", ">>"]);
        const mask = BigInt(type.bits - 1);
        return {
          type,
          code: `(${left.code}) ${op} ((${count.code}) & ${mask})`,
          constant: left.constant && count.constant,
          reads: union(left.reads, count.reads),
          eval: (env) => {
            const a = left.eval(env) as bigint;
            const n = wrap(count.eval(env) as bigint, type) & mask;
            return wrap(op === "<<" ? a << n : a >> n, type);
          },
        };
      }
      case 5: {
        const sourceType = this.scalarType();
        const operand = this.expr(sourceType, depth - 1, constantOnly);
        return {
          type,
          code: `cast<${type.name}>(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => convert(operand.eval(env), type),
        };
      }
      case 6: {
        const condition = this.boolExpr(depth - 1, false);
        const yes = guard(this.expr(type, depth - 1, false));
        const no = guard(this.expr(type, depth - 1, false));
        return {
          type,
          code: `((${condition.code}) ? (${yes.code}) : (${no.code}))`,
          constant: false,
          reads: union(condition.reads, union(yes.reads, no.reads)),
          eval: (env) => (condition.eval(env) ? yes.eval(env) : no.eval(env)),
        };
      }
      case 7: {
        const helper = this.helpers.find(
          (candidate) => candidate.returnType.name === type.name,
        );
        if (!helper) return this.expr(type, depth - 1, false);
        const args = helper.params.map((param) =>
          guard(this.expr(param.type, depth - 1, false)),
        );
        // Through a `Func` local of main, which holds the helper's address.
        const pointer = this.inFunctionBody
          ? undefined
          : this.funcPointers.find((candidate) => candidate.helper === helper);
        const callee = pointer && this.chance(0.5) ? pointer.name : helper.name;
        return {
          type,
          code: `${callee}(${args.map((arg) => arg.code).join(", ")})`,
          constant: false,
          reads: args.reduce(
            (all, arg) => union(all, arg.reads),
            new Set(callee === helper.name ? [] : [callee]),
          ),
          eval: (env) => {
            const callEnv: Env = new Map(
              [...env].filter(([key]) => key.startsWith("g")),
            );
            helper.params.forEach((param, index) =>
              callEnv.set(
                param.name,
                convert(args[index]!.eval(env), param.type),
              ),
            );
            return convert(helper.body.eval(callEnv), helper.returnType);
          },
        };
      }
      default:
        return this.read(type) ?? this.literal(type);
    }
  }

  /** Calls into structs, recursion, lambdas, generics and enum matches. */
  private featureExpr(
    choice: number,
    type: ScalarType,
    depth: number,
  ): Expr | undefined {
    const sub = depth - 1;
    // Struct instances, lambdas, enum locals, boxes and hierarchy locals
    // belong to main.
    if (this.inFunctionBody && [9, 11, 13, 14, 15].includes(choice)) {
      return undefined;
    }
    if (choice >= 16) return this.throwerCall(type, sub);
    switch (choice) {
      case 9: {
        const candidates = this.instances.flatMap((instance) => [
          ...instance.struct.methods
            .filter((method) => method.returnType.name === type.name)
            .map((method) => ({ instance, fn: method, byValue: false })),
          ...instance.struct.byValue
            .filter((fn) => fn.returnType.name === type.name)
            .map((fn) => ({ instance, fn, byValue: true })),
        ]);
        if (candidates.length === 0) return undefined;
        const { instance, fn, byValue } = this.pick(candidates);
        const arg = guard(this.expr(INT, sub, false));
        const prefix = byValue ? "sv" : "this";
        return {
          type,
          code: byValue
            ? `${fn.name}(${instance.name}, ${arg.code})`
            : `${instance.name}.${fn.name}(${arg.code})`,
          constant: false,
          reads: union(arg.reads, new Set([instance.name])),
          eval: (env) => {
            const callEnv = this.callEnv(env);
            instance.struct.fields.forEach((_, field) =>
              callEnv.set(
                `${prefix}.f${field}`,
                env.get(`${instance.name}.f${field}`)!,
              ),
            );
            callEnv.set("d", convert(arg.eval(env), INT));
            return convert(fn.body.eval(callEnv), type);
          },
        };
      }
      case 10: {
        const fn = this.recursives.find(
          (candidate) => candidate.type.name === type.name,
        );
        if (!fn) return undefined;
        const steps = this.expr(INT, sub, false);
        const init = guard(this.expr(type, sub, false));
        return {
          type,
          code: `${fn.name}((${steps.code}) & 7, ${init.code})`,
          constant: false,
          reads: union(steps.reads, init.reads),
          eval: (env) => {
            let n = (steps.eval(env) as bigint) & 7n;
            let acc = convert(init.eval(env), type);
            while (n > 0n) {
              const callEnv = this.callEnv(env);
              callEnv.set("n", n);
              callEnv.set("acc", acc);
              acc = convert(fn.body.eval(callEnv), type);
              n--;
            }
            return acc;
          },
        };
      }
      case 11: {
        const lambda = this.lambdas.find(
          (candidate) => candidate.returnType.name === type.name,
        );
        if (!lambda) return undefined;
        const arg = guard(this.expr(lambda.param, sub, false));
        // Directly, or passed to `applyK(f: Lambda<R>(P), x: P) ret R`.
        const viaApply = lambda.apply !== undefined && this.chance(0.5);
        return {
          type,
          code: viaApply
            ? `${lambda.apply}(${lambda.name}, ${arg.code})`
            : `${lambda.name}(${arg.code})`,
          constant: false,
          reads: union(arg.reads, new Set([lambda.name])),
          eval: (env) => this.callLambda(lambda, env, arg.eval(env)),
        };
      }
      case 12: {
        const operand = guard(this.expr(type, sub, false));
        return {
          type,
          code: `gid<${type.name}>(${operand.code})`,
          constant: false,
          reads: operand.reads,
          eval: (env) => operand.eval(env),
        };
      }
      case 15: {
        const h = this.hierarchy;
        if (!h || h.returnType.name !== type.name || h.locals.length === 0)
          return undefined;
        const arg = guard(this.expr(INT, sub, false));
        // Through the dispatcher, a local's method, or a `*Parent` pointer.
        const form = this.int(0, 2);
        const local = this.pick(h.locals);
        const pointer =
          h.pointers.length > 0 ? this.pick(h.pointers) : undefined;
        const viaPointer =
          form === 2 && pointer !== undefined && !this.inLambdaBody;
        const receiver = viaPointer
          ? h.locals.find((candidate) => candidate.name === pointer.target)!
          : local;
        const code = viaPointer
          ? `${pointer.name}.vf(${arg.code})`
          : form === 0
            ? `${h.dispatcher}(&${local.name}, ${arg.code})`
            : `${local.name}.vf(${arg.code})`;
        return {
          type,
          code,
          constant: false,
          reads: union(
            arg.reads,
            new Set([receiver.name, ...(viaPointer ? [pointer.name] : [])]),
          ),
          eval: (env) => {
            const callEnv = this.callEnv(env);
            const fields =
              receiver.dynamic === "child"
                ? [...h.parentFields, ...h.childFields]
                : h.parentFields;
            fields.forEach((_, field) =>
              callEnv.set(
                `this.f${field}`,
                env.get(`${receiver.name}.f${field}`)!,
              ),
            );
            callEnv.set("d", convert(arg.eval(env), INT));
            const body =
              receiver.dynamic === "child" ? h.childBody : h.parentBody;
            return convert(body.eval(callEnv), type);
          },
        };
      }
      case 13: {
        if (!this.enumDef || this.enumLocals.length === 0) return undefined;
        return this.matchExpr(this.pick(this.enumLocals), type, sub);
      }
      default: {
        const box = this.boxes.find(
          (candidate) => candidate.type.name === type.name,
        );
        if (!box) return undefined;
        return {
          type,
          code: `${box.name}.get()`,
          constant: false,
          reads: new Set([box.name]),
          eval: (env) => env.get(`${box.name}.v`)!,
        };
      }
    }
  }

  /**
   * Whether an expression may throw here: inside a `try` body of main, but
   * not in deferred code, lambdas, functions or array indices, whose
   * evaluation order relative to the stored value is not observable.
   */
  private canThrow(): boolean {
    return (
      this.tryDepth > 0 &&
      this.throwers.length > 0 &&
      !this.plainOnly &&
      !this.inFunctionBody &&
      !this.inLambdaBody &&
      this.indexNesting === 0
    );
  }

  /**
   * The array helpers read main's array as it is now, so they stay out of
   * functions, lambdas (which capture copies) and deferred code.
   */
  private canUseArray(): boolean {
    return (
      this.mainArray !== undefined &&
      !this.plainOnly &&
      !this.inFunctionBody &&
      !this.inLambdaBody
    );
  }

  /** `byValueK(a, d)` or `*(pa + (i & 3))`, converted to `type`. */
  private arrayFeatureExpr(type: IntType, depth: number): Expr {
    const array = this.mainArray!;
    const cast = (code: string) =>
      type === array.type ? code : `cast<${type.name}>(${code})`;
    if (this.chance(0.5)) {
      const arg = guard(this.expr(INT, depth - 1, false));
      return {
        type,
        code: cast(`${array.byValue}(${array.name}, ${arg.code})`),
        constant: false,
        reads: union(arg.reads, new Set([array.name])),
        eval: (env) => {
          const d = convert(arg.eval(env), INT) as bigint;
          // The parameter is a copy: main's array is unchanged.
          const xs = [0, 1, 2, 3].map(
            (slot) => env.get(`${array.name}[${slot}]`) as bigint,
          );
          const j = Number(d & 3n);
          xs[j] = wrap(
            xs[Number(wrap(d + 1n, INT) & 3n)]! ^ xs[2]!,
            array.type,
          );
          return convert(wrap(xs[0]! + xs[j]!, array.type), type);
        },
      };
    }
    const index = this.indexExpr();
    return {
      type,
      code: cast(`*(${array.pointer} + ((${index.code}) & 3))`),
      constant: false,
      reads: union(index.reads, new Set([array.pointer])),
      eval: (env) => {
        const slot = Number((index.eval(env) as bigint) & 3n);
        return convert(env.get(`${array.name}[${slot}]`)!, type);
      },
    };
  }

  /**
   * `totK<S>(&s, d)`: the generic function calls `val` through its spec
   * constraint, on main's struct local as it is now.
   */
  private specCall(type: IntType, depth: number): Expr | undefined {
    if (
      !this.spec ||
      this.plainOnly ||
      this.inFunctionBody ||
      this.inLambdaBody
    ) {
      return undefined;
    }
    const candidates = this.instances.filter(
      (instance) => instance.struct.specVal,
    );
    if (candidates.length === 0) return undefined;
    const instance = this.pick(candidates);
    const arg = guard(this.expr(INT, depth - 1, false));
    const call = `${this.spec.total}<${instance.struct.name}>(&${instance.name}, ${arg.code})`;
    return {
      type,
      code: type === LONG ? call : `cast<${type.name}>(${call})`,
      constant: false,
      reads: union(arg.reads, new Set([instance.name])),
      eval: (env) => {
        const d = convert(arg.eval(env), INT);
        const callEnv = this.callEnv(env);
        instance.struct.fields.forEach((_, field) =>
          callEnv.set(`this.f${field}`, env.get(`${instance.name}.f${field}`)!),
        );
        callEnv.set("d", d);
        const value = convert(instance.struct.specVal!.eval(callEnv), LONG);
        return convert(wrap((value as bigint) + 1n, LONG), type);
      },
    };
  }

  /** Increments run once per evaluation of main's code, never elsewhere. */
  private canIncrement(): boolean {
    return (
      this.counters.length > 0 &&
      !this.plainOnly &&
      !this.inFunctionBody &&
      !this.inLambdaBody &&
      this.indexNesting === 0
    );
  }

  /** `(kK++)`, `(++kK)`, `(kK--)` or `(--kK)`: the old or the new value. */
  private incrementExpr(type: IntType): Expr {
    const counter = this.pick(this.counters);
    const op = this.pick(["++", "--"]);
    const prefix = this.chance(0.5);
    const code = prefix ? `(${op}${counter.name})` : `(${counter.name}${op})`;
    return {
      type,
      code: type === counter.type ? code : `cast<${type.name}>${code}`,
      constant: false,
      reads: new Set(),
      eval: (env) => {
        const old = env.get(counter.name) as bigint;
        const updated = wrap(op === "++" ? old + 1n : old - 1n, counter.type);
        env.set(counter.name, updated);
        return convert(prefix ? updated : old, type);
      },
    };
  }

  /** `cl(d)`: a lambda writes the counter through its captured pointer. */
  private counterLambdaCall(type: IntType, depth: number): Expr {
    const { name, counter } = this.pick(this.counterLambdas);
    const arg = guard(this.expr(counter.type, depth - 1, false));
    const call = `${name}(${arg.code})`;
    return {
      type,
      code: type === counter.type ? call : `cast<${type.name}>(${call})`,
      constant: false,
      reads: union(arg.reads, new Set([name])),
      eval: (env) => {
        const delta = convert(arg.eval(env), counter.type) as bigint;
        const updated = wrap(
          (env.get(counter.name) as bigint) + delta,
          counter.type,
        );
        env.set(counter.name, updated);
        return convert(updated, type);
      },
    };
  }

  /** `ovK(arg)` with an argument whose static type selects one overload. */
  private overloadCall(type: IntType, depth: number): Expr {
    const set = this.pick(this.overloads);
    const variant = this.pick(set.variants);
    const arg = guard(this.expr(variant.paramType, depth - 1, false));
    const call = `${set.name}(${arg.code})`;
    return {
      type,
      code: type === set.returnType ? call : `cast<${type.name}>(${call})`,
      constant: false,
      reads: arg.reads,
      eval: (env) => {
        const callEnv = this.callEnv(env);
        callEnv.set(variant.param, convert(arg.eval(env), variant.paramType));
        return convert(
          convert(variant.body.eval(callEnv), set.returnType),
          type,
        );
      },
    };
  }

  /** `thrK((x) & mask, limit)`, which throws when its argument is too big. */
  private throwerCall(type: ScalarType, depth: number): Expr | undefined {
    if (!this.canThrow() || type.kind !== "int") return undefined;
    const arg = this.expr(INT, depth, false);
    if (this.relays.length > 0 && this.chance(0.4)) {
      const relay = this.pick(this.relays);
      const mask = relay.target.mask;
      const call = `${relay.name}((${arg.code}) & ${mask})`;
      return {
        type,
        code: type === INT ? call : `cast<${type.name}>(${call})`,
        constant: false,
        reads: arg.reads,
        eval: (env) =>
          convert(
            this.callRelay(relay, (arg.eval(env) as bigint) & mask),
            type,
          ),
      };
    }
    const thrower = this.pick(this.throwers);
    const limit = BigInt(this.int(0, Number(thrower.mask)));
    const call = `${thrower.name}((${arg.code}) & ${thrower.mask}, ${limit})`;
    return {
      type,
      code: type === INT ? call : `cast<${type.name}>(${call})`,
      constant: false,
      reads: arg.reads,
      eval: (env) =>
        convert(
          callThrower(thrower, (arg.eval(env) as bigint) & thrower.mask, limit),
          type,
        ),
    };
  }

  /** What a relay returns, throws, and prints from its `defer`. */
  private callRelay(relay: Relay, x: bigint): bigint {
    if (relay.form === "defer") {
      try {
        return wrap(callThrower(relay.target, x, relay.limit) + 1n, INT);
      } finally {
        this.out.push(relay.name);
      }
    }
    try {
      return callThrower(relay.target, x, relay.limit) ^ 3n;
    } catch (error) {
      if (!(error instanceof Thrown) || error.type !== INT) throw error;
      throw new Thrown(wrap((error.value as bigint) * 2n, LONG), LONG);
    }
  }

  /**
   * `match (x) { 3 => a, n if n < k => b, _ => c }` on an integer: literal
   * arms, guarded binding arms, then a catch-all.
   */
  private intMatchExpr(type: IntType, depth: number): Expr {
    const subjectType = this.intType();
    const subject = this.expr(subjectType, depth - 1, false);
    const saved = this.scope;
    const literals = new Set<bigint>();
    const arms: {
      pattern: string;
      binding?: string;
      test: (value: bigint, env: Env) => boolean;
      body: Expr;
      guard?: Expr;
    }[] = [];
    for (let index = this.int(1, 4); index > 0; index--) {
      if (this.chance(0.35)) {
        const binding = this.fresh("n");
        this.scope = [
          ...saved,
          { type: subjectType, code: binding, key: binding, readonly: true },
        ];
        const limit = this.expr(this.intType(), depth - 1, false);
        const op = this.pick(["<", ">", "==", "!="]);
        const condition = `(${binding}) ${op} (${limit.code})`;
        const body = guard(this.expr(type, depth - 1, false));
        this.scope = saved;
        arms.push({
          pattern: `${binding} if ${condition}`,
          binding,
          body,
          guard: limit,
          test: (value, env) => {
            const right = convert(
              limit.eval(env.set(binding, value)),
              subjectType,
            ) as bigint;
            return op === "<"
              ? value < right
              : op === ">"
                ? value > right
                : op === "=="
                  ? value === right
                  : value !== right;
          },
        });
        continue;
      }
      // Negative literal patterns (`-3 =>`) for signed subjects.
      const literal = BigInt(this.int(subjectType.signed ? -8 : 0, 15));
      if (literals.has(literal)) continue;
      literals.add(literal);
      arms.push({
        pattern: String(literal),
        test: (value) => value === literal,
        body: guard(this.expr(type, depth - 1, false)),
      });
    }
    const fallback = guard(this.expr(type, depth - 1, false));
    arms.push({ pattern: "_", test: () => true, body: fallback });
    return {
      type,
      code: `(match (${subject.code}) { ${arms.map((arm) => `${arm.pattern} => ${arm.body.code}`).join(", ")} })`,
      constant: false,
      reads: arms.reduce(
        (all, arm) =>
          union(all, union(arm.body.reads, arm.guard?.reads ?? new Set())),
        subject.reads,
      ),
      eval: (env) => {
        const value = convert(subject.eval(env), subjectType) as bigint;
        for (const arm of arms) {
          const armEnv = arm.binding ? env.set(arm.binding, value) : env;
          if (arm.test(value, armEnv)) {
            return convert(arm.body.eval(armEnv), type);
          }
        }
        throw new Error("unreachable: the match has a catch-all arm");
      },
    };
  }

  /** `match` on a `bool`, a `double`, or an `(int-like, bool)` tuple. */
  private richMatchExpr(type: IntType, depth: number): Expr {
    const sub = depth - 1;
    const form = this.int(0, 2);
    if (form === 0) {
      const subject = this.boolExpr(sub, false);
      const yes = guard(this.expr(type, sub, false));
      const no = guard(this.expr(type, sub, false));
      return {
        type,
        code: this.chance(0.5)
          ? `(match (${subject.code}) { true => ${yes.code}, false => ${no.code} })`
          : `(match (${subject.code}) { false => ${no.code}, true => ${yes.code} })`,
        constant: false,
        reads: union(subject.reads, union(yes.reads, no.reads)),
        eval: (env) => (subject.eval(env) ? yes.eval(env) : no.eval(env)),
      };
    }
    if (form === 1) {
      // Literals compare like `==`: NaN matches none and -0.0 equals 0.0.
      const subject = this.expr(FLOAT_TYPES[0]!, sub, false);
      const pool = ["0.0", "1.0", "2.25", "0.5", "-1.5", "100.0", "-0.5"];
      const literals = [...new Set([this.pick(pool), this.pick(pool)])];
      const bodies = literals.map(() => guard(this.expr(type, sub, false)));
      const fallback = guard(this.expr(type, sub, false));
      return {
        type,
        code: `(match (${subject.code}) { ${literals.map((literal, index) => `${literal} => ${bodies[index]!.code}`).join(", ")}, _ => ${fallback.code} })`,
        constant: false,
        reads: bodies.reduce(
          (all, body) => union(all, body.reads),
          union(subject.reads, fallback.reads),
        ),
        eval: (env) => {
          const value = subject.eval(env) as number;
          const slot = literals.findIndex(
            (literal) => Number(literal) === value,
          );
          return (slot >= 0 ? bodies[slot]! : fallback).eval(env);
        },
      };
    }
    const firstType = this.intType();
    const first = guard(this.expr(firstType, sub, false));
    const second = this.boolExpr(sub, false);
    const literal = BigInt(this.int(0, 15));
    const flag = this.chance(0.5);
    const a = this.fresh("n");
    const b = this.fresh("n");
    const saved = this.scope;
    this.scope = [
      ...saved,
      { type: firstType, code: a, key: a, readonly: true },
      { type: BOOL, code: b, key: b, readonly: true },
    ];
    const guarded = guard(this.expr(type, sub, false));
    this.scope = saved;
    const exact = guard(this.expr(type, sub, false));
    const fallback = guard(this.expr(type, sub, false));
    return {
      type,
      code: `(match ((${first.code}, ${second.code})) { (${literal}, ${flag}) => ${exact.code}, (${a}, ${b}) if (${b}) && ((${a}) != cast<${firstType.name}>(3)) => ${guarded.code}, (_, _) => ${fallback.code} })`,
      constant: false,
      reads: union(
        union(first.reads, second.reads),
        union(exact.reads, union(guarded.reads, fallback.reads)),
      ),
      eval: (env) => {
        const x = convert(first.eval(env), firstType) as bigint;
        const y = second.eval(env) as boolean;
        if (x === literal && y === flag) return exact.eval(env);
        if (y && x !== 3n) {
          env.set(a, x);
          env.set(b, y);
          return guarded.eval(env);
        }
        return fallback.eval(env);
      },
    };
  }

  /** An `int` index expression, with array reads inside it bounded. */
  private indexExpr(): Expr {
    this.indexNesting++;
    try {
      return this.expr(INT, 1, false);
    } finally {
      this.indexNesting--;
    }
  }

  /** Globals stay shared across calls; locals are not visible in callees. */
  private callEnv(env: Env): Env {
    return new Map([...env].filter(([key]) => key.startsWith("g")));
  }

  private callLambda(lambda: LambdaDef, env: Env, arg: Value): Value {
    const callEnv = new Map(lambda.snapshot);
    for (const [key, value] of env)
      if (key.startsWith("g")) callEnv.set(key, value);
    callEnv.set(lambda.paramName, convert(arg, lambda.param));
    return convert(lambda.body.eval(callEnv), lambda.returnType);
  }

  private matchExpr(local: string, type: ScalarType, depth: number): Expr {
    const def = this.enumDef!;
    const saved = this.scope;
    const arms = def.variants.map((payload, tag) => {
      const bindings = payload.map((bindingType) => ({
        name: this.fresh("m"),
        type: bindingType,
      }));
      this.scope = [
        ...saved,
        ...bindings.map((binding) => ({
          type: binding.type,
          code: binding.name,
          key: binding.name,
          readonly: true,
        })),
      ];
      const body = guard(this.expr(type, depth, false));
      const pattern =
        bindings.length > 0
          ? `${def.name}.V${tag}(${bindings.map((binding) => binding.name).join(", ")})`
          : `${def.name}.V${tag}`;
      return { tag, bindings, body, pattern };
    });
    this.scope = saved;
    return {
      type,
      code: `(match (${local}) { ${arms.map((arm) => `${arm.pattern} => ${arm.body.code}`).join(", ")} })`,
      constant: false,
      reads: arms.reduce(
        (all, arm) => union(all, arm.body.reads),
        new Set([local]),
      ),
      eval: (env) => {
        const value = env.get(local) as EnumValue;
        const arm = arms[value.tag]!;
        // Bindings have fresh names, so they go into the shared environment:
        // a copy would drop side effects of the arm (counter increments).
        const armEnv = env;
        arm.bindings.forEach((binding, index) =>
          armEnv.set(binding.name, value.payload[index]!),
        );
        return convert(arm.body.eval(armEnv), type);
      },
    };
  }

  private boolExpr(depth: number, constantOnly: boolean): Expr {
    // The constant folder handles !, casts and literals, not comparisons.
    const choice = this.int(0, constantOnly ? 1 : 5);
    if (choice === 5) {
      const h = this.hierarchy;
      if (h && h.typed.length > 0 && !this.inFunctionBody && this.chance(0.3)) {
        // `p is *Child` tests the pointed-to object's dynamic type.
        const pointer = this.pick(h.typed);
        return {
          type: BOOL,
          code: `(${pointer.name} is *${h.child})`,
          constant: false,
          reads: new Set([pointer.name]),
          eval: () => pointer.child,
        };
      }
      if (
        this.operators &&
        this.operators.locals.length > 0 &&
        this.inMainExpression() &&
        this.chance(0.4)
      ) {
        return this.operatorEquality();
      }
      const equality = this.structEquality();
      if (equality) return equality;
    }
    switch (choice) {
      case 0: {
        const operand = this.expr(BOOL, depth - 1, constantOnly);
        return {
          type: BOOL,
          code: `!(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => !operand.eval(env),
        };
      }
      case 1: {
        const operand = this.expr(this.intType(), depth - 1, constantOnly);
        return {
          type: BOOL,
          code: `cast<bool>(${operand.code})`,
          constant: operand.constant,
          reads: operand.reads,
          eval: (env) => convert(operand.eval(env), BOOL),
        };
      }
      case 2:
      case 3: {
        if (this.chance(0.25)) {
          const floatType = this.pick(FLOAT_TYPES);
          const left = this.expr(floatType, depth - 1, false);
          const right = this.expr(floatType, depth - 1, false);
          const op = this.pick(["==", "!=", "<", "<=", ">", ">="]);
          return {
            type: BOOL,
            code: `(${left.code}) ${op} (${right.code})`,
            constant: false,
            reads: union(left.reads, right.reads),
            eval: (env) => {
              const a = left.eval(env) as number;
              const b = right.eval(env) as number;
              // JavaScript comparisons are ordered like R-TYPE-9.
              switch (op) {
                case "==":
                  return a === b;
                case "!=":
                  return a !== b;
                case "<":
                  return a < b;
                case "<=":
                  return a <= b;
                case ">":
                  return a > b;
                default:
                  return a >= b;
              }
            },
          };
        }
        const leftType = this.intType();
        const left = this.expr(leftType, depth - 1, false);
        const right = this.expr(this.intType(), depth - 1, false);
        const op = this.pick(["==", "!=", "<", "<=", ">", ">="]);
        return {
          type: BOOL,
          code: `(${left.code}) ${op} (${right.code})`,
          constant: false,
          reads: union(left.reads, right.reads),
          eval: (env) => {
            const a = left.eval(env) as bigint;
            const b = convert(right.eval(env), leftType) as bigint;
            switch (op) {
              case "==":
                return a === b;
              case "!=":
                return a !== b;
              case "<":
                return a < b;
              case "<=":
                return a <= b;
              case ">":
                return a > b;
              default:
                return a >= b;
            }
          },
        };
      }
      default: {
        const left = this.boolExpr(depth - 1, false);
        const right = this.boolExpr(depth - 1, false);
        const op = this.pick(["&&", "||"]);
        return {
          type: BOOL,
          code: `(${left.code}) ${op} (${right.code})`,
          constant: false,
          reads: union(left.reads, right.reads),
          eval: (env) =>
            op === "&&"
              ? Boolean(left.eval(env)) && Boolean(right.eval(env))
              : Boolean(left.eval(env)) || Boolean(right.eval(env)),
        };
      }
    }
  }

  /**
   * `(sA == sB)` or `!=` on two locals of one struct: field by field, with
   * floating-point fields compared like `==` (NaN is unequal) (R-EXPR-4).
   */
  private structEquality(): Expr | undefined {
    if (this.inFunctionBody || this.instances.length === 0) return undefined;
    const left = this.pick(this.instances);
    const right = this.pick(
      this.instances.filter((instance) => instance.struct === left.struct),
    );
    const op = this.pick(["==", "!="]);
    return {
      type: BOOL,
      code: `(${left.name} ${op} ${right.name})`,
      constant: false,
      reads: new Set([left.name, right.name]),
      eval: (env) => {
        const equal = left.struct.fields.every(
          (_, field) =>
            env.get(`${left.name}.f${field}`) ===
            env.get(`${right.name}.f${field}`),
        );
        return op === "==" ? equal : !equal;
      },
    };
  }

  // ------------------------------------------------------- statements ----

  private assignableTarget(): Place | undefined {
    const places = this.scope.filter((place) => !place.readonly);
    return places.length > 0 ? this.pick(places) : undefined;
  }

  /** Target code plus a resolver for the env key it writes. */
  private targetOf(place: Place): {
    code: string;
    key: (env: Env) => string;
    reads: Set<string>;
  } {
    if (!place.array) {
      // Parenthesized targets are lvalues too (`(*p) = x`, `(v) += 1`).
      const code =
        place.code.startsWith("(*") || this.chance(0.15)
          ? place.code.startsWith("(")
            ? place.code
            : `(${place.code})`
          : place.code;
      return { code, key: () => place.key, reads: new Set() };
    }
    const index = this.indexExpr();
    const mask = place.array.length - 1;
    const array = place.array;
    return {
      code: `${array.base}[(${index.code}) & ${mask}]`,
      key: (env) =>
        `${array.base}[${Number((index.eval(env) as bigint) & BigInt(mask))}]`,
      reads: index.reads,
    };
  }

  private statement(depth: number): Stmt {
    if (this.loopDepth > 0 && this.chance(0.08)) return this.jump();
    if (this.loopDepth > 0 && this.chance(0.05)) return this.deferStatement();
    if (this.resources && this.loopDepth > 0 && this.chance(0.08)) {
      const resource = this.resourceStatement();
      if (resource) return resource;
    }
    if (
      depth > 0 &&
      this.tryDepth < 2 &&
      this.throwers.length > 0 &&
      this.chance(0.1)
    ) {
      return this.tryStatement(depth);
    }
    if (this.tryDepth > 0 && this.chance(0.06)) return this.throwStatement();
    if (this.chance(0.15)) {
      const feature = this.featureStatement();
      if (feature) return feature;
    }
    if (this.chance(0.15)) {
      const feature = this.localFeatureStatement();
      if (feature) return feature;
    }
    const target = this.assignableTarget();
    const choice = this.int(0, depth > 0 ? 6 : 3);
    if (!target || choice === 6) return this.loop(depth);
    if (choice === 4) return this.ifStatement(depth);
    if (choice === 5) return this.switchStatement(depth);
    const { code, key } = this.targetOf(target);
    const type = target.type;

    if (type.kind === "float")
      return this.floatAssignment(target, code, key, type, choice);
    if (choice === 0 || type.kind === "bool") {
      // Integer values convert implicitly between integer types (R-CONV-1).
      const valueType = type.kind === "bool" ? BOOL : this.intType();
      const value = guard(this.expr(valueType, 3, false));
      return {
        code: (indent) => `${indent}${code} = ${value.code};`,
        exec: (env) => {
          const slot = key(env);
          env.set(slot, convert(value.eval(env), type));
          return undefined;
        },
      };
    }
    if (choice === 1) {
      const op = this.pick(["++", "--"]);
      // `*p++` would increment the pointer; keep `(*p)` for increments.
      const operand = target.array ? code : target.code;
      const prefix = this.chance(0.5);
      return {
        code: (indent) =>
          prefix ? `${indent}${op}${operand};` : `${indent}${operand}${op};`,
        exec: (env) => {
          const slot = key(env);
          const current = env.get(slot) as bigint;
          env.set(slot, wrap(op === "++" ? current + 1n : current - 1n, type));
          return undefined;
        },
      };
    }
    if (choice === 2 && this.chance(0.4)) {
      // `/=` and `%=` with a divisor masked into 1..8.
      const op = this.pick(["/", "%"]);
      const divisor = this.expr(type, 2, false);
      return {
        code: (indent) =>
          `${indent}${code} ${op}= ((${divisor.code}) & 7) + 1;`,
        exec: (env) => {
          const slot = key(env);
          const current = env.get(slot) as bigint;
          const d = wrap(
            (wrap(divisor.eval(env) as bigint, type) & 7n) + 1n,
            type,
          );
          env.set(slot, wrap(op === "/" ? current / d : current % d, type));
          return undefined;
        },
      };
    }
    // Compound assignment: `x op= e` is `x = x op e` in x's type.
    const op = this.pick(["+", "-", "*", "&", "|", "^"]);
    const value = guard(this.expr(this.intType(), 2, false));
    return {
      code: (indent) => `${indent}${code} ${op}= ${value.code};`,
      exec: (env) => {
        const slot = key(env);
        const current = env.get(slot) as bigint;
        const right = convert(value.eval(env), type) as bigint;
        env.set(slot, applyIntOp(op, current, right, type));
        return undefined;
      },
    };
  }

  /** Floats: `=`, `++`/`--`, and `+=`/`-=`/`*=`/`/=` of the same type. */
  private floatAssignment(
    target: Place,
    code: string,
    key: (env: Env) => string,
    type: FloatType,
    choice: number,
  ): Stmt {
    if (choice === 1) {
      const op = this.pick(["++", "--"]);
      const operand = target.array ? code : target.code;
      return {
        code: (indent) => `${indent}${operand}${op};`,
        exec: (env) => {
          const slot = key(env);
          const current = env.get(slot) as number;
          env.set(slot, convert(op === "++" ? current + 1 : current - 1, type));
          return undefined;
        },
      };
    }
    const value = this.expr(type, 3, false);
    const op = choice === 0 ? "" : this.pick(["+", "-", "*", "/"]);
    return {
      code: (indent) => `${indent}${code} ${op}= ${value.code};`,
      exec: (env) => {
        const slot = key(env);
        const current = env.get(slot) as number;
        const right = value.eval(env) as number;
        const result =
          op === ""
            ? right
            : op === "+"
              ? current + right
              : op === "-"
                ? current - right
                : op === "*"
                  ? current * right
                  : current / right;
        env.set(slot, convert(result, type));
        return undefined;
      },
    };
  }

  /** Calls that write through `this`, a pointer, or a new enum value. */
  private featureStatement(): Stmt | undefined {
    const choice = this.int(0, 6);
    if (choice === 6 && this.outer && this.outer.locals.length > 0) {
      // `o = OK.mk(k);` or `o = other;` replaces the whole nested value.
      const outer = this.outer;
      const target = this.pick(outer.locals);
      if (this.chance(0.5) && outer.locals.length > 1) {
        const source = this.pick(
          outer.locals.filter((local) => local !== target),
        );
        return {
          code: (indent) => `${indent}${target} = ${source};`,
          exec: (env) => {
            const values = this.outerKeys(source).map((key) => env.get(key)!);
            this.outerKeys(target).forEach((key, slot) =>
              env.set(key, values[slot]!),
            );
            return undefined;
          },
        };
      }
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) => `${indent}${target} = ${outer.name}.mk(${arg.code});`,
        exec: (env) => {
          const values = this.outerMake(arg.eval(env), env);
          this.outerKeys(target).forEach((key, slot) =>
            env.set(key, values[slot]!),
          );
          return undefined;
        },
      };
    }
    if (choice === 4 && this.canUseArray()) {
      // `sliceK(a, d);` writes through a slice view of main's array.
      const array = this.mainArray!;
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) =>
          `${indent}${array.slice}(${array.name}, ${arg.code});`,
        exec: (env) => {
          const d = convert(arg.eval(env), INT) as bigint;
          const j = `${array.name}[${Number(d & 3n)}]`;
          const k = `${array.name}[${Number(wrap(d + 2n, INT) & 3n)}]`;
          env.set(
            j,
            wrap((env.get(j) as bigint) + (env.get(k) as bigint), array.type),
          );
          return undefined;
        },
      };
    }
    if (choice === 5) {
      // `a = b = v;`: `b = v` yields b's new value, in b's type.
      const targets = this.scope.filter(
        (place) => !place.array && !place.readonly && place.type.kind === "int",
      );
      if (targets.length < 2) return undefined;
      const outer = this.pick(targets);
      const inner = this.pick(targets.filter((place) => place !== outer));
      const value = guard(this.expr(this.intType(), 2, false));
      return {
        code: (indent) =>
          `${indent}${outer.code} = ${inner.code} = ${value.code};`,
        exec: (env) => {
          const innerValue = convert(value.eval(env), inner.type);
          env.set(inner.key, innerValue);
          env.set(outer.key, convert(innerValue, outer.type));
          return undefined;
        },
      };
    }
    if (choice === 3) {
      // `s = mkK(x);` replaces every field of a struct local.
      const candidates = this.instances.filter(
        (instance) => instance.struct.maker,
      );
      if (candidates.length === 0) return undefined;
      const instance = this.pick(candidates);
      const maker = instance.struct.maker!;
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) =>
          `${indent}${instance.name} = ${maker.name}(${arg.code});`,
        exec: (env) => {
          this.makeValues(instance.struct, arg.eval(env), env).forEach(
            (value, field) => env.set(`${instance.name}.f${field}`, value),
          );
          return undefined;
        },
      };
    }
    if (choice === 0) {
      const candidates = this.instances.filter(
        (instance) => instance.struct.mutators.length > 0,
      );
      if (candidates.length === 0) return undefined;
      const instance = this.pick(candidates);
      const mutator = this.pick(instance.struct.mutators);
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) =>
          `${indent}${instance.name}.${mutator.name}(${arg.code});`,
        exec: (env) => {
          const callEnv = this.callEnv(env);
          instance.struct.fields.forEach((_, field) =>
            callEnv.set(
              `this.f${field}`,
              env.get(`${instance.name}.f${field}`)!,
            ),
          );
          callEnv.set("d", convert(arg.eval(env), INT));
          const type = instance.struct.fields[mutator.field]!;
          env.set(
            `${instance.name}.f${mutator.field}`,
            convert(mutator.body.eval(callEnv), type),
          );
          return undefined;
        },
      };
    }
    if (choice === 1) {
      if (this.mutators.length === 0) return undefined;
      const mutator = this.pick(this.mutators);
      const targets = this.scope.filter(
        (place) =>
          !place.array &&
          !place.readonly &&
          place.type.name === mutator.type.name,
      );
      if (targets.length === 0) return undefined;
      const target = this.pick(targets);
      const delta = guard(this.expr(mutator.deltaType, 2, false));
      const address = target.code.startsWith("(*")
        ? target.code.slice(2, -1)
        : `&${target.code}`;
      return {
        code: (indent) =>
          `${indent}${mutator.name}(${address}, ${delta.code});`,
        exec: (env) => {
          const current = env.get(target.key) as bigint;
          const value = convert(delta.eval(env), mutator.deltaType);
          const right = convert(value, mutator.type) as bigint;
          env.set(
            target.key,
            applyIntOp(mutator.op, current, right, mutator.type),
          );
          return undefined;
        },
      };
    }
    if (!this.enumDef || this.enumLocals.length === 0) return undefined;
    const local = this.pick(this.enumLocals);
    const variant = this.variantValue();
    return {
      code: (indent) => `${indent}${local} = ${variant.code};`,
      exec: (env) => {
        env.set(local, variant.eval(env));
        return undefined;
      },
    };
  }

  /**
   * `defer printf(...)` inside a loop body. Deferred code runs against copies
   * of the values it uses (R-DEFER-5), so it reads plain locals only: no
   * globals, pointers or calls, which would observe later state.
   */
  private deferStatement(): Stmt {
    const written = this.scope.filter(
      (place) =>
        !place.array &&
        !place.readonly &&
        place.type.kind === "int" &&
        (place.code.startsWith("(*") || place.key.startsWith("g")),
    );
    if (written.length > 0 && this.chance(0.4)) {
      // `defer { *p += k; }`: pointers and globals are written at block exit,
      // to whatever they hold then (R-DEFER-5 allows these writes).
      const target = this.pick(written);
      const type = target.type as IntType;
      const delta = BigInt(this.int(1, 9));
      return {
        code: (indent) =>
          `${indent}defer {\n${indent}    ${target.code} = ${target.code} + cast<${type.name}>(${delta});\n${indent}}`,
        exec: () => {
          throw new Error("defer statements run through execBlock");
        },
        defer: (env) => () => {
          env.set(
            target.key,
            wrap((env.get(target.key) as bigint) + delta, type),
          );
        },
      };
    }
    const saved = this.scope;
    this.scope = saved.filter(
      (place) =>
        !place.array &&
        !place.key.startsWith("g") &&
        !place.code.startsWith("(*"),
    );
    this.plainOnly = true;
    const type = this.intType();
    const value = this.expr(type, 2, false);
    this.plainOnly = false;
    this.scope = saved;
    const label = this.fresh("df");
    return {
      code: (indent) =>
        type.signed
          ? `${indent}defer printf("${label}=%lld\\n", cast<long>(${value.code}));`
          : `${indent}defer printf("${label}=%llu\\n", cast<ulong>(${value.code}));`,
      exec: () => {
        throw new Error("defer statements run through execBlock");
      },
      defer: (env) => {
        const captured = convert(value.eval(env), type);
        return () => this.out.push(`${label}=${captured}`);
      },
    };
  }

  /** The fields `mkK(x)` returns, evaluated like a call. */
  private makeValues(struct: StructDef, x: Value, env: Env): Value[] {
    const callEnv = this.callEnv(env);
    callEnv.set("x", convert(x, INT));
    return struct.maker!.fields.map((field, index) =>
      convert(field.eval(callEnv), struct.fields[index]!),
    );
  }

  /** Struct types a `throw` may produce. */
  private throwableStructs(): StructDef[] {
    return this.structs.filter((struct) => struct.maker);
  }

  /**
   * `try { ... } catch (e: T) { ... } catch { ... }`. Typed clauses match the
   * thrown type exactly and are tested in order (R-EXC-2); an exception no
   * clause handles reaches the enclosing `try`, so the outermost one always
   * handles both thrown types.
   */
  private tryStatement(depth: number): Stmt {
    const outermost = this.tryDepth === 0;
    this.tryDepth++;
    const body = this.block(depth, this.int(1, 3));
    if (this.chance(0.5)) {
      body.splice(this.int(0, body.length), 0, this.throwStatement());
    }
    this.tryDepth--;
    const thrownTypes: ThrowType[] = [INT, LONG, ...this.throwableStructs()];
    // Struct clauses may name a struct that is never thrown.
    const candidates: ThrowType[] = [INT, LONG, INT_TYPES[1]!, ...this.structs];
    const types: ThrowType[] = [];
    for (let index = this.int(1, 3); index > 0; index--) {
      const type = this.pick(candidates);
      if (!types.includes(type)) types.push(type);
    }
    const covered = thrownTypes.every((type) => types.includes(type));
    const catchAll = (outermost && !covered) || this.chance(0.3);
    const clauses = [
      ...types.map((type) => this.catchClause(depth, type)),
      ...(catchAll ? [this.catchClause(depth, undefined)] : []),
    ];
    return {
      code: (indent) => {
        const inner = indent + "    ";
        const lines = (statements: Stmt[]) =>
          statements.map((statement) => `${statement.code(inner)}\n`).join("");
        let text = `${indent}try {\n${lines(body)}${indent}}`;
        for (const clause of clauses) {
          const head = clause.type
            ? `catch (${clause.variable}: ${clause.type.name})`
            : "catch";
          text += ` ${head} {\n${lines(clause.body)}${indent}}`;
        }
        return text;
      },
      exec: (env) => {
        try {
          return execBlock(body, env);
        } catch (error) {
          if (!(error instanceof Thrown)) throw error;
          const clause = clauses.find(
            (candidate) =>
              !candidate.type || candidate.type.name === error.type.name,
          );
          if (!clause) throw error;
          if (clause.type && isStructType(clause.type)) {
            (error.value as Value[]).forEach((value, field) =>
              env.set(`${clause.variable}.f${field}`, value),
            );
          } else if (clause.type) {
            env.set(clause.variable, error.value as Value);
          }
          return execBlock(clause.body, env);
        }
      },
    };
  }

  /**
   * A catch clause. A typed clause folds its value into an integer place
   * first, so the variable is used; it is `_`-prefixed when there is none.
   */
  private catchClause(
    depth: number,
    type: ThrowType | undefined,
  ): { type?: ThrowType; variable: string; body: Stmt[] } {
    const name = this.fresh("e");
    const saved = this.scope;
    const statements: Stmt[] = [];
    const targets = saved.filter(
      (place) => !place.array && !place.readonly && place.type.kind === "int",
    );
    // The value folded into the target: the variable, or a struct's integer
    // field. Struct fields are readable in the clause body like other locals.
    const intFields =
      type && isStructType(type)
        ? type.fields.flatMap((field, index) =>
            field.kind === "int" ? [index] : [],
          )
        : [];
    const source =
      type === undefined || targets.length === 0
        ? undefined
        : isStructType(type)
          ? intFields.length > 0
            ? `${name}.f${this.pick(intFields)}`
            : undefined
          : name;
    const used = source !== undefined;
    if (used) {
      const target = this.pick(targets);
      const targetType = target.type as IntType;
      statements.push({
        code: (indent) => `${indent}${target.code} ^= ${source};`,
        exec: (env) => {
          const right = convert(env.get(source)!, targetType) as bigint;
          env.set(
            target.key,
            applyIntOp("^", env.get(target.key) as bigint, right, targetType),
          );
          return undefined;
        },
      });
      this.scope = [
        ...saved,
        ...(isStructType(type!)
          ? (type as StructDef).fields.map((fieldType, field) => ({
              type: fieldType,
              code: `${name}.f${field}`,
              key: `${name}.f${field}`,
              readonly: true,
            }))
          : [{ type: type as IntType, code: name, key: name, readonly: true }]),
      ];
    }
    statements.push(...this.block(depth, this.int(0, 2)));
    this.scope = saved;
    return { type, variable: used ? name : `_${name}`, body: statements };
  }

  /**
   * `if (c) { throw v; }` inside a `try`, with an `int` or `long` value or a
   * struct returned by `mkK(x)`.
   */
  private throwStatement(): Stmt {
    const condition = this.boolExpr(2, false);
    const structs = this.throwableStructs();
    if (structs.length > 0 && this.chance(0.35)) {
      const struct = this.pick(structs);
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) =>
          `${indent}if (${condition.code}) {\n${indent}    throw ${struct.maker!.name}(${arg.code});\n${indent}}`,
        exec: (env) => {
          if (condition.eval(env)) {
            throw new Thrown(
              this.makeValues(struct, arg.eval(env), env),
              struct,
            );
          }
          return undefined;
        },
      };
    }
    const type = this.pick([INT, LONG]);
    const value = guard(this.expr(type, 2, false));
    return {
      code: (indent) =>
        `${indent}if (${condition.code}) {\n${indent}    throw ${value.code};\n${indent}}`,
      exec: (env) => {
        if (condition.eval(env)) {
          throw new Thrown(convert(value.eval(env), type) as bigint, type);
        }
        return undefined;
      },
    };
  }

  /** `if (c) { break; }` or `continue`, only inside a loop. */
  private jump(): Stmt {
    const condition = this.boolExpr(2, false);
    const keyword = this.pick(["break", "continue"] as const);
    return {
      code: (indent) =>
        `${indent}if (${condition.code}) {\n${indent}    ${keyword};\n${indent}}`,
      exec: (env) => (condition.eval(env) ? keyword : undefined),
    };
  }

  private block(depth: number, count: number): Stmt[] {
    return Array.from({ length: count }, () => this.statement(depth - 1));
  }

  private ifStatement(depth: number): Stmt {
    const condition = this.boolExpr(2, false);
    const yes = this.block(depth, this.int(1, 3));
    const no = this.chance(0.6) ? this.block(depth, this.int(1, 2)) : undefined;
    return {
      code: (indent) => {
        const inner = indent + "    ";
        let text = `${indent}if (${condition.code}) {\n${yes.map((s) => s.code(inner)).join("\n")}\n${indent}}`;
        if (no)
          text += ` else {\n${no.map((s) => s.code(inner)).join("\n")}\n${indent}}`;
        return text;
      },
      exec: (env) => execBlock(condition.eval(env) ? yes : (no ?? []), env),
    };
  }

  /**
   * `switch` on an integer folded into `0..m-1`, on an enum local (variant
   * labels), or on a string chosen by a condition (string labels).
   */
  private switchStatement(depth: number): Stmt {
    const roll = this.rng();
    let subjectCode: string;
    let selector: (env: Env) => string;
    let labels: string[];
    if (roll < 0.25 && this.enumDef && this.enumLocals.length > 0) {
      const def = this.enumDef;
      const local = this.pick(this.enumLocals);
      subjectCode = local;
      selector = (env) => `${def.name}.V${(env.get(local) as EnumValue).tag}`;
      labels = def.variants.map((_, tag) => `${def.name}.V${tag}`);
    } else if (roll < 0.45) {
      const words = ["", "a", "b", "ab", "zz", "a b"];
      const condition = this.boolExpr(2, false);
      const yes = this.pick(words);
      const no = this.pick(words);
      subjectCode = `((${condition.code}) ? "${yes}" : "${no}")`;
      selector = (env) => JSON.stringify(condition.eval(env) ? yes : no);
      labels = words.map((word) => JSON.stringify(word));
    } else {
      const subject = this.expr(INT, 2, false);
      const modulus = this.int(2, 5);
      subjectCode = `((${subject.code}) % ${modulus} + ${modulus}) % ${modulus}`;
      selector = (env) => {
        const raw = subject.eval(env) as bigint;
        const m = BigInt(modulus);
        return String(wrap(wrap(wrap(raw % m, INT) + m, INT) % m, INT));
      };
      labels = Array.from({ length: modulus }, (_, value) => String(value));
    }
    // A random subset of distinct labels, in random order.
    const chosen: string[] = [];
    for (let index = this.int(1, labels.length); index > 0; index--) {
      const label = this.pick(labels);
      if (!chosen.includes(label)) chosen.push(label);
    }
    // Arms run in order; one ending in `fallthrough` continues with the next
    // (R-CTRL-8). The default arm, when present, is last.
    const arms: { label?: string; body: Stmt[]; fallthrough: boolean }[] =
      chosen.map((label) => ({
        label,
        body: this.block(depth, this.int(1, 2)),
        fallthrough: this.chance(0.25),
      }));
    if (this.chance(0.7)) {
      arms.push({ body: this.block(depth, 1), fallthrough: false });
    } else {
      arms[arms.length - 1]!.fallthrough = false;
    }
    return {
      code: (indent) => {
        const caseIndent = indent + "    ";
        const bodyIndent = caseIndent + "    ";
        const text = arms.map(
          (arm) =>
            `${caseIndent}${arm.label === undefined ? "default" : `case ${arm.label}`}: {\n${arm.body.map((s) => s.code(bodyIndent)).join("\n")}\n${bodyIndent}${arm.fallthrough ? "fallthrough" : "break"};\n${caseIndent}}`,
        );
        return `${indent}switch (${subjectCode}) {\n${text.join("\n")}\n${indent}}`;
      },
      exec: (env) => {
        const selected = selector(env);
        let index = arms.findIndex((arm) => arm.label === selected);
        if (index < 0) {
          index = arms.findIndex((arm) => arm.label === undefined);
        }
        for (; index >= 0 && index < arms.length; index++) {
          const signal = execBlock(arms[index]!.body, env);
          // `break` leaves the switch; `continue` reaches the enclosing loop.
          if (signal) return signal === "break" ? undefined : signal;
          if (!arms[index]!.fallthrough) break;
        }
        return undefined;
      },
    };
  }

  private loop(depth: number): Stmt {
    const counter = this.fresh("i");
    const limit = this.int(1, 6);
    const place: Place = {
      type: INT,
      code: counter,
      key: counter,
      readonly: true,
    };
    // The counter is readable (not writable) inside the body. It is
    // incremented first, so `continue` cannot skip it.
    this.scope.push(place);
    this.loopDepth++;
    const body = depth > 0 ? this.block(depth, this.int(1, 3)) : [];
    this.loopDepth--;
    this.scope.pop();
    // A while loop, a C-style loop (its step also runs on `continue`, and
    // the counter counts from 0), or `loop { }` with an explicit break.
    const form = this.int(0, 2);
    return {
      code: (indent) => {
        const inner = indent + "    ";
        const statements = body.map((s) => s.code(inner));
        if (form === 1) {
          return [
            `${indent}loop (local ${counter}: int = 0; ${counter} < ${limit}; ${counter} = ${counter} + 1) {`,
            ...statements,
            `${indent}}`,
          ].join("\n");
        }
        return [
          `${indent}local ${counter}: int = 0;`,
          form === 0
            ? `${indent}loop (${counter} < ${limit}) {`
            : `${indent}loop {`,
          `${inner}${counter} = ${counter} + 1;`,
          ...(form === 2
            ? [
                `${inner}if (${counter} > ${limit}) {`,
                `${inner}    break;`,
                `${inner}}`,
              ]
            : []),
          ...statements,
          `${indent}}`,
        ].join("\n");
      },
      exec: (env) => {
        const first = form === 1 ? 0 : 1;
        for (let i = first; i < first + limit; i++) {
          env.set(counter, BigInt(i));
          if (execBlock(body, env) === "break") break;
        }
        return undefined;
      },
    };
  }

  // ----------------------------------------------------- declarations ----

  private structDefinition(): string {
    const name = `S${this.fresh("")}`;
    const fields = Array.from({ length: this.int(1, 3) }, () =>
      this.scalarType(),
    );
    const def: StructDef = {
      name,
      fields,
      methods: [],
      mutators: [],
      byValue: [],
    };
    const fieldPlaces = (prefix: string): Place[] =>
      fields.map((type, field) => ({
        type,
        code: `${prefix}.f${field}`,
        key: `${prefix}.f${field}`,
        readonly: true,
      }));
    const bodyScope = (prefix: string): Place[] => [
      ...this.globals,
      ...fieldPlaces(prefix),
      { type: INT, code: "d", key: "d", readonly: true },
    ];
    const parameter = (body: Expr) => (body.reads.has("d") ? "d" : "_d");
    const members: string[] = fields.map(
      (type, field) => `    f${field}: ${type.name},`,
    );

    for (let index = this.int(0, 2); index > 0; index--) {
      const returnType = this.scalarType();
      this.scope = bodyScope("this");
      const body = guard(this.expr(returnType, 2, false));
      const method = this.fresh("m");
      def.methods.push({ name: method, returnType, body });
      const receiver = this.chance(0.3) ? name : `*${name}`;
      members.push(
        `    frame ${method}(this: ${receiver}, ${parameter(body)}: int) ret ${returnType.name} {\n        return ${body.code};\n    }`,
      );
    }
    if (this.chance(0.6)) {
      const field = this.int(0, fields.length - 1);
      this.scope = bodyScope("this");
      const body = guard(this.expr(fields[field]!, 2, false));
      const method = this.fresh("u");
      def.mutators.push({ name: method, field, body });
      members.push(
        `    frame ${method}(this: *${name}, ${parameter(body)}: int) {\n        this.f${field} = ${body.code};\n    }`,
      );
    }
    let header = `struct ${name}`;
    if (this.spec && this.chance(0.7)) {
      this.scope = bodyScope("this");
      const body = guard(this.expr(LONG, 2, false));
      def.specVal = body;
      header += `: ${this.spec.name}`;
      members.push(
        `    frame val(this: *${name}, ${parameter(body)}: int) ret long {\n        return ${body.code};\n    }`,
      );
    }
    let freeFunctions = "";
    if (this.chance(0.5)) {
      const returnType = this.scalarType();
      this.scope = bodyScope("sv");
      const body = guard(this.expr(returnType, 2, false));
      const fn = this.fresh("byval");
      def.byValue.push({ name: fn, returnType, body });
      const structParameter = [...body.reads].some((read) =>
        read.startsWith("sv"),
      )
        ? "sv"
        : "_sv";
      freeFunctions = `\nframe ${fn}(${structParameter}: ${name}, ${parameter(body)}: int) ret ${returnType.name} {\n    return ${body.code};\n}`;
    }
    this.scope = [];
    this.structs.push(def);
    return `${header} {\n${members.join("\n")}\n}${freeFunctions}`;
  }

  /** `struct P { ... frame vf }`, `struct C: P { ... frame vf }`, dispatcher. */
  private hierarchyDefinition(): string {
    const parent = `P${this.fresh("")}`;
    const child = `C${this.fresh("")}`;
    const parentFields = Array.from({ length: this.int(1, 2) }, () =>
      this.scalarType(),
    );
    const childFields = Array.from({ length: this.int(1, 2) }, () =>
      this.scalarType(),
    );
    const returnType = this.scalarType();
    const fieldPlaces = (fields: ScalarType[]): Place[] =>
      fields.map((type, field) => ({
        type,
        code: `this.f${field}`,
        key: `this.f${field}`,
        readonly: true,
      }));
    const d: Place = { type: INT, code: "d", key: "d", readonly: true };
    this.scope = [...this.globals, ...fieldPlaces(parentFields), d];
    const parentBody = guard(this.expr(returnType, 2, false));
    this.scope = [
      ...this.globals,
      ...fieldPlaces([...parentFields, ...childFields]),
      d,
    ];
    const childBody = guard(this.expr(returnType, 2, false));
    this.scope = [];
    const dispatcher = this.fresh("callv");
    this.hierarchy = {
      parent,
      child,
      parentFields,
      childFields,
      returnType,
      parentBody,
      childBody,
      dispatcher,
      locals: [],
      pointers: [],
      typed: [],
    };
    const param = (body: Expr) => (body.reads.has("d") ? "d" : "_d");
    const fields = (types: ScalarType[], offset: number) =>
      types
        .map((type, field) => `    f${field + offset}: ${type.name},`)
        .join("\n");
    return [
      `struct ${parent} {\n${fields(parentFields, 0)}\n    frame vf(this: *${parent}, ${param(parentBody)}: int) ret ${returnType.name} {\n        return ${parentBody.code};\n    }\n}`,
      `struct ${child}: ${parent} {\n${fields(childFields, parentFields.length)}\n    frame vf(this: *${child}, ${param(childBody)}: int) ret ${returnType.name} {\n        return ${childBody.code};\n    }\n}`,
      `frame ${dispatcher}(p: *${parent}, d: int) ret ${returnType.name} {\n    return p.vf(d);\n}`,
    ].join("\n");
  }

  /** Env keys of an outer local, in `mk` order. */
  private outerKeys(name: string): string[] {
    const outer = this.outer!;
    return [
      `${name}.x`,
      ...outer.inner.fields.map((_, field) => `${name}.inner.f${field}`),
      ...[0, 1, 2, 3].map((slot) => `${name}.arr[${slot}]`),
    ];
  }

  private outerSlotType(slot: number): ScalarType {
    const outer = this.outer!;
    if (slot === 0) return outer.xType;
    if (slot <= outer.inner.fields.length) return outer.inner.fields[slot - 1]!;
    return outer.arrType;
  }

  /** The values `OK.mk(k)` returns. */
  private outerMake(k: Value, env: Env): Value[] {
    const callEnv = this.callEnv(env);
    callEnv.set("k", convert(k, INT));
    return this.outer!.make.map((field, slot) =>
      convert(field.eval(callEnv), this.outerSlotType(slot)),
    );
  }

  /**
   * `struct OK { x: T, inner: S, arr: E[4], frame mk(k: int) ret OK }`,
   * nesting one of the program's structs and an array; `mk` is static.
   */
  private outerDefinition(): string {
    const name = `O${this.fresh("")}`;
    const xType = this.intType();
    const inner = this.pick(this.structs);
    const arrType = this.intType();
    this.scope = [
      ...this.globals,
      { type: INT, code: "k", key: "k", readonly: true },
    ];
    this.inFunctionBody = true;
    const make = [
      xType,
      ...inner.fields,
      arrType,
      arrType,
      arrType,
      arrType,
    ].map((type) => guard(this.expr(type, 2, false)));
    this.inFunctionBody = false;
    this.scope = [];
    const param = make.some((field) => field.reads.has("k")) ? "k" : "_k";
    const fieldCount = inner.fields.length;
    const innerLiteral = `${inner.name} { ${inner.fields.map((_, index) => `f${index}: ${make[index + 1]!.code}`).join(", ")} }`;
    const arrayLiteral = `[${make
      .slice(fieldCount + 1)
      .map((element) => element.code)
      .join(", ")}]`;
    this.outer = { name, xType, inner, arrType, make, locals: [] };
    return `struct ${name} {\n    x: ${xType.name},\n    inner: ${inner.name},\n    arr: ${arrType.name}[4],\n    frame mk(${param}: int) ret ${name} {\n        return ${name} { x: ${make[0]!.code}, inner: ${innerLiteral}, arr: ${arrayLiteral} };\n    }\n}`;
  }

  /** A random variant of the program's enum and its value. */
  private variantValue(): {
    code: string;
    eval: (env: Env) => EnumValue;
    reads: Set<string>;
  } {
    const def = this.enumDef!;
    const tag = this.int(0, def.variants.length - 1);
    const payload = def.variants[tag]!.map((type) =>
      guard(this.expr(type, 2, false)),
    );
    return {
      code:
        payload.length > 0
          ? `${def.name}.V${tag}(${payload.map((value) => value.code).join(", ")})`
          : `${def.name}.V${tag}`,
      reads: payload.reduce(
        (all, value) => union(all, value.reads),
        new Set<string>(),
      ),
      eval: (env) => ({
        tag,
        payload: payload.map((value, slot) =>
          convert(value.eval(env), def.variants[tag]![slot]!),
        ),
      }),
    };
  }

  private printValue(
    label: string,
    code: string,
    type: ScalarType,
    value: Value,
    output: string[],
  ): string {
    if (type.kind === "bool") {
      output.push(`${label}=${value ? 1 : 0}`);
      return `    printf("${label}=%d\\n", cast<int>(${code}));`;
    }
    if (type.kind === "float") {
      // Bit patterns are exact; NaN bits differ by platform, so print 1.
      output.push(`${label}=${floatBits(value as number, type)}`);
      if (!/^[A-Za-z_][\w.\[\]]*$|^\(\*\w+\)$/.test(code)) {
        // Not addressable (a call): compare as an integer instead.
        output.pop();
        return this.printValue(
          label,
          `cast<long>(${code})`,
          LONG,
          convert(value, LONG),
          output,
        );
      }
      return type.bits === 64
        ? `    printf("${label}=%llx\\n", ((${code}) != (${code})) ? cast<ulong>(1) : *cast<*ulong>(&${code}));`
        : `    printf("${label}=%x\\n", ((${code}) != (${code})) ? cast<uint>(1) : *cast<*uint>(&${code}));`;
    }
    output.push(`${label}=${value}`);
    return type.signed
      ? `    printf("${label}=%lld\\n", cast<long>(${code}));`
      : `    printf("${label}=%llu\\n", cast<ulong>(${code}));`;
  }

  /** Print an enum local's tag and each payload slot through `match`. */
  private printEnum(local: string, env: Env, output: string[]): string[] {
    const def = this.enumDef!;
    const value = env.get(local) as EnumValue;
    const slots = Math.max(...def.variants.map((payload) => payload.length));
    const arms = (result: (tag: number, names: string[]) => string) =>
      def.variants
        .map((payload, tag) => {
          const names = payload.map((_, slot) => `${local}_${tag}_${slot}`);
          const pattern =
            payload.length > 0
              ? `${def.name}.V${tag}(${names.join(", ")})`
              : `${def.name}.V${tag}`;
          return `${pattern} => ${result(tag, names)}`;
        })
        .join(", ");
    const lines = [
      this.printValue(
        `${local}_tag`,
        `(match (${local}) { ${arms((tag) => `cast<int>(${tag})`)} })`,
        INT,
        BigInt(value.tag),
        output,
      ),
    ];
    const long = INT_TYPES[6]!;
    for (let slot = 0; slot < slots; slot++) {
      const slotValue = value.payload[slot];
      lines.push(
        this.printValue(
          `${local}_${slot}`,
          `(match (${local}) { ${arms((_, names) => (names[slot] ? `cast<long>(${names[slot]})` : "cast<long>(0)"))} })`,
          long,
          slotValue === undefined ? 0n : convert(slotValue, long),
          output,
        ),
      );
    }
    return lines;
  }

  // ---------------------------------------------- operators and locals ----

  /** Reads main's locals directly: not functions, lambdas or deferred code. */
  private inMainExpression(): boolean {
    return !this.plainOnly && !this.inFunctionBody && !this.inLambdaBody;
  }

  /** A value of the operator struct: a local, or operators applied to one. */
  private operatorValue(depth: number): OperatorValue {
    const ops = this.operators!;
    if (depth <= 0 || this.chance(0.35)) {
      const name = this.pick(ops.locals);
      return {
        code: name,
        reads: new Set([name]),
        eval: (env) => [
          env.get(`${name}.a`) as bigint,
          env.get(`${name}.b`) as bigint,
        ],
      };
    }
    const left = this.operatorValue(depth - 1);
    const form = this.int(0, 3);
    if (form === 2) {
      const factor = guard(this.expr(INT, depth - 1, false));
      return {
        code: `(${left.code} * (${factor.code}))`,
        reads: union(left.reads, factor.reads),
        eval: (env) => {
          const [a, b] = left.eval(env);
          const k = convert(factor.eval(env), INT);
          return [
            wrap(a * (convert(k, ops.a) as bigint), ops.a),
            wrap(b * (convert(k, ops.b) as bigint), ops.b),
          ];
        },
      };
    }
    if (form === 3) {
      return {
        code: `(-${left.code})`,
        reads: left.reads,
        eval: (env) => {
          const [a, b] = left.eval(env);
          return [wrap(-a, ops.a), wrap(-b, ops.b)];
        },
      };
    }
    const right = this.operatorValue(depth - 1);
    const sign = form === 0 ? 1n : -1n;
    return {
      code: `(${left.code} ${form === 0 ? "+" : "-"} ${right.code})`,
      reads: union(left.reads, right.reads),
      eval: (env) => {
        const [a, b] = left.eval(env);
        const [c, d] = right.eval(env);
        return [wrap(a + sign * c, ops.a), wrap(b + sign * d, ops.b)];
      },
    };
  }

  /** `(value).a`, `(value).b` or `value[index]` through `__get__`. */
  private operatorRead(type: IntType, depth: number): Expr {
    const ops = this.operators!;
    const value = this.operatorValue(Math.min(depth, 2));
    const form = this.int(0, 2);
    if (form === 2) {
      const index = this.indexExpr();
      return {
        type,
        code: `cast<${type.name}>(${value.code}[${index.code}])`,
        constant: false,
        reads: union(value.reads, index.reads),
        eval: (env) => {
          const [, b] = value.eval(env);
          const i = convert(index.eval(env), ops.b) as bigint;
          return convert(wrap(b + i, ops.b), type);
        },
      };
    }
    return {
      type,
      code: `cast<${type.name}>((${value.code}).${form === 0 ? "a" : "b"})`,
      constant: false,
      reads: value.reads,
      eval: (env) => convert(value.eval(env)[form]!, type),
    };
  }

  /** `value == value` or `!=` through `__eq__` and `__ne__`. */
  private operatorEquality(): Expr {
    const left = this.operatorValue(1);
    const right = this.operatorValue(1);
    const op = this.pick(["==", "!="]);
    return {
      type: BOOL,
      code: `(${left.code} ${op} ${right.code})`,
      constant: false,
      reads: union(left.reads, right.reads),
      eval: (env) => {
        const [a, b] = left.eval(env);
        const [c, d] = right.eval(env);
        const equal = a === c && b === d;
        return op === "==" ? equal : !equal;
      },
    };
  }

  /** `bmK(arg)`: a method bound to a struct local, seeing its current fields. */
  private boundCall(type: IntType, depth: number): Expr | undefined {
    const bound = this.boundMethods.filter(
      (candidate) => candidate.method.returnType.name === type.name,
    );
    if (bound.length === 0) return undefined;
    const { name, instance, method } = this.pick(bound);
    const arg = guard(this.expr(INT, depth - 1, false));
    return {
      type,
      code: `${name}(${arg.code})`,
      constant: false,
      reads: union(arg.reads, new Set([name])),
      eval: (env) =>
        convert(
          method.body.eval(
            this.receiverEnv(
              env,
              instance.name,
              instance.struct,
              arg.eval(env),
            ),
          ),
          type,
        ),
    };
  }

  /** The env of a method body running on the struct stored at `base`. */
  private receiverEnv(
    env: Env,
    base: string,
    struct: StructDef,
    d: Value,
  ): Env {
    const callEnv = this.callEnv(env);
    struct.fields.forEach((_, field) =>
      callEnv.set(`this.f${field}`, env.get(`${base}.f${field}`)!),
    );
    callEnv.set("d", convert(d, INT));
    return callEnv;
  }

  /** `Opt<T>.Some(e)`, `.None`, `.Pair(e, k)` or `mkOpt<T>(e, k & 3)`. */
  private optionValue(type: IntType): {
    code: string;
    eval(env: Env): EnumValue;
  } {
    const name = `Opt<${type.name}>`;
    const value = guard(this.expr(type, 2, false));
    const key = guard(this.expr(INT, 2, false));
    switch (this.int(0, 3)) {
      case 0:
        return {
          code: `${name}.Some(${value.code})`,
          eval: (env) => ({
            tag: 0,
            payload: [convert(value.eval(env), type)],
          }),
        };
      case 1:
        return { code: `${name}.None`, eval: () => ({ tag: 1, payload: [] }) };
      case 2:
        return {
          code: `${name}.Pair(${value.code}, ${key.code})`,
          eval: (env) => ({
            tag: 2,
            payload: [
              convert(value.eval(env), type),
              convert(key.eval(env), INT),
            ],
          }),
        };
      default:
        return {
          code: `mkOpt<${type.name}>(${value.code}, (${key.code}) & 3)`,
          eval: (env) => {
            const v = convert(value.eval(env), type);
            const k = (convert(key.eval(env), INT) as bigint) & 3n;
            if (k === 0n) return { tag: 1, payload: [] };
            if (k === 1n) return { tag: 0, payload: [v] };
            return { tag: 2, payload: [v, k] };
          },
        };
    }
  }

  /** `match` on an `Opt<T>` local; a guarded arm splits `Pair`. */
  private optionMatch(type: IntType): Expr {
    const local = this.pick(this.options);
    const name = `Opt<${local.type.name}>`;
    const value = this.fresh("ov");
    const count = this.fresh("on");
    const none = this.literal(type);
    const guardKey = BigInt(this.int(1, 4));
    const convertTo = (code: string) => `cast<${type.name}>(${code})`;
    return {
      type,
      code: `(match (${local.name}) { ${name}.Some(${value}) => ${convertTo(value)}, ${name}.None => ${convertTo(none.code)}, ${name}.Pair(${value}, ${count}) if (${count} == ${guardKey}) => ${convertTo(value)}, ${name}.Pair(${value}, ${count}) => ${convertTo(value)} ^ ${convertTo(count)} })`,
      constant: false,
      reads: new Set([local.name]),
      eval: (env) => {
        const option = env.get(local.name) as EnumValue;
        if (option.tag === 1) return convert(none.eval(env), type);
        const v = convert(option.payload[0]!, type) as bigint;
        if (option.tag === 0 || option.payload[1] === guardKey) return v;
        return wrap(v ^ (convert(option.payload[1]!, type) as bigint), type);
      },
    };
  }

  /** One byte of a string constant, as the signed `char` it reads as. */
  private charRead():
    { code: string; reads: Set<string>; eval(env: Env): bigint } | undefined {
    const strings = this.strings.filter(
      (candidate) => candidate.global || !this.inFunctionBody,
    );
    if (strings.length === 0) return undefined;
    const { name, bytes } = this.pick(strings);
    const index = this.indexExpr();
    return {
      code: `${name}[((${index.code}) & 1023) % ${bytes.length}]`,
      reads: union(index.reads, new Set([name])),
      eval: (env) => {
        const position =
          ((index.eval(env) as bigint) & 1023n) % BigInt(bytes.length);
        return BigInt.asIntN(8, BigInt(bytes[Number(position)]!));
      },
    };
  }

  /** `cast<T>(s[i])`, a `match` on `s[i]` or a character literal. */
  private stringExpr(type: IntType): Expr | undefined {
    const form = this.int(0, 3);
    if (form === 3) {
      const [code, value] = this.pick(CHAR_PATTERNS);
      return {
        type,
        code: `cast<${type.name}>(${code})`,
        constant: false,
        reads: new Set(),
        eval: () => convert(BigInt(value), type),
      };
    }
    const read = this.charRead();
    if (!read) return undefined;
    if (form < 2) {
      return {
        type,
        code: `cast<${type.name}>(${read.code})`,
        constant: false,
        reads: read.reads,
        eval: (env) => convert(read.eval(env), type),
      };
    }
    const first = this.pick(CHAR_PATTERNS);
    const second = this.pick(
      CHAR_PATTERNS.filter((pattern) => pattern[0] !== first[0]),
    );
    const arms = [this.literal(type), this.literal(type), this.literal(type)];
    const fallback = this.literal(type);
    const binding = this.fresh("ch");
    const result = (arm: Expr) => `cast<${type.name}>(${arm.code})`;
    return {
      type,
      code: `(match (${read.code}) { ${first[0]} => ${result(arms[0]!)}, ${second[0]} => ${result(arms[1]!)}, ${binding} if (${binding} < cast<char>(0)) => ${result(arms[2]!)}, _ => ${result(fallback)} })`,
      constant: false,
      reads: read.reads,
      eval: (env) => {
        const char = read.eval(env);
        const arm =
          char === BigInt(first[1])
            ? arms[0]!
            : char === BigInt(second[1])
              ? arms[1]!
              : char < 0n
                ? arms[2]!
                : fallback;
        return convert(arm.eval(env), type);
      },
    };
  }

  /** `saK[i & 1].fN` or `saK[i & 1].mN(d)` on an array of structs. */
  private structArrayRead(type: IntType, depth: number): Expr | undefined {
    if (this.structArrays.length === 0) return undefined;
    const { name, struct } = this.pick(this.structArrays);
    const index = this.indexExpr();
    const element = `${name}[(${index.code}) & 1]`;
    const slot = (env: Env) => Number((index.eval(env) as bigint) & 1n);
    const methods = struct.methods.filter(
      (method) => method.returnType.name === type.name,
    );
    if (methods.length > 0 && this.chance(0.4)) {
      const method = this.pick(methods);
      const arg = guard(this.expr(INT, depth - 1, false));
      return {
        type,
        code: `${element}.${method.name}(${arg.code})`,
        constant: false,
        reads: union(index.reads, union(arg.reads, new Set([name]))),
        eval: (env) => {
          const base = `${name}[${slot(env)}]`;
          return convert(
            method.body.eval(
              this.receiverEnv(env, base, struct, arg.eval(env)),
            ),
            type,
          );
        },
      };
    }
    const fields = struct.fields.flatMap((field, position) =>
      field.kind === "int" ? [position] : [],
    );
    if (fields.length === 0) return undefined;
    const field = this.pick(fields);
    return {
      type,
      code: `cast<${type.name}>(${element}.f${field})`,
      constant: false,
      reads: union(index.reads, new Set([name])),
      eval: (env) => convert(env.get(`${name}[${slot(env)}].f${field}`)!, type),
    };
  }

  /** The expression forms over main's operator, option and struct locals. */
  private localFeatureExpr(type: IntType, depth: number): Expr | undefined {
    switch (this.int(0, 16)) {
      case 16:
        return this.guardedCall(type, depth);
      case 9:
        return this.specObjectRead(type, depth);
      case 10:
        return this.threeLevelRead(type, depth);
      case 11:
        return this.nestedEnumRead(type);
      case 12:
        return this.tupleArrayRead(type);
      case 13:
        return this.sliceViewRead(type);
      case 14:
        return this.lambdaArrayRead(type, depth);
      case 15:
        return this.heapListRead(type, depth);
      case 4:
        return this.gridRead(type, depth);
      case 5:
        return this.pairRead(type);
      case 6:
        return this.nestedBoxRead(type);
      case 7:
        return this.holderRead(type, depth);
      case 8:
        return this.curriedRead(type, depth);
      case 0:
        return this.operators && this.operators.locals.length > 0
          ? this.operatorRead(type, depth)
          : undefined;
      case 1:
        return this.boundCall(type, depth);
      case 2:
        return this.options.length > 0 ? this.optionMatch(type) : undefined;
      default:
        return this.structArrayRead(type, depth);
    }
  }

  /** `(p, q) = (q, p)` or `(p, q) = (e1, e2)`, right side evaluated first. */
  private tupleAssignment(): Stmt | undefined {
    const places = this.scope.filter(
      (place) => !place.array && !place.readonly,
    );
    if (places.length < 2) return undefined;
    const first = this.pick(places);
    const others = places.filter((place) => place.key !== first.key);
    if (others.length === 0) return undefined;
    const sameType = others.filter(
      (place) => place.type.name === first.type.name,
    );
    if (sameType.length > 0 && this.chance(0.5)) {
      const second = this.pick(sameType);
      return {
        code: (indent) =>
          `${indent}(${first.code}, ${second.code}) = (${second.code}, ${first.code});`,
        exec: (env) => {
          const value = env.get(first.key)!;
          env.set(first.key, env.get(second.key)!);
          env.set(second.key, value);
          return undefined;
        },
      };
    }
    const second = this.pick(others);
    const left = guard(this.expr(first.type, 2, false));
    const right = guard(this.expr(second.type, 2, false));
    return {
      code: (indent) =>
        `${indent}(${first.code}, ${second.code}) = (${left.code}, ${right.code});`,
      exec: (env) => {
        const a = convert(left.eval(env), first.type);
        const b = convert(right.eval(env), second.type);
        env.set(first.key, a);
        env.set(second.key, b);
        return undefined;
      },
    };
  }

  /** `q = value;` or `q[i] = v;` on an operator struct local. */
  private operatorStatement(): Stmt | undefined {
    const ops = this.operators;
    if (!ops || ops.locals.length === 0) return undefined;
    const target = this.pick(ops.locals);
    if (this.chance(0.3)) {
      const index = this.indexExpr();
      const value = guard(this.expr(ops.b, 2, false));
      return {
        code: (indent) => `${indent}${target}[${index.code}] = ${value.code};`,
        exec: (env) => {
          const i = convert(index.eval(env), ops.b) as bigint;
          const v = convert(value.eval(env), ops.b) as bigint;
          env.set(`${target}.b`, wrap(v - i, ops.b));
          return undefined;
        },
      };
    }
    const value = this.operatorValue(2);
    return {
      code: (indent) => `${indent}${target} = ${value.code};`,
      exec: (env) => {
        const [a, b] = value.eval(env);
        env.set(`${target}.a`, a);
        env.set(`${target}.b`, b);
        return undefined;
      },
    };
  }

  /** Writes to arrays of structs, whole elements or through a method. */
  private structArrayStatement(): Stmt | undefined {
    if (this.structArrays.length === 0) return undefined;
    const array = this.pick(this.structArrays);
    const { name, struct } = array;
    const index = this.indexExpr();
    const element = `${name}[(${index.code}) & 1]`;
    const slot = (env: Env) => Number((index.eval(env) as bigint) & 1n);
    const storeFields = (env: Env, values: Value[]) => {
      const base = `${name}[${slot(env)}]`;
      values.forEach((value, field) => env.set(`${base}.f${field}`, value));
    };
    if (struct.mutators.length > 0 && this.chance(0.4)) {
      const mutator = this.pick(struct.mutators);
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) => `${indent}${element}.${mutator.name}(${arg.code});`,
        exec: (env) => {
          const base = `${name}[${slot(env)}]`;
          const type = struct.fields[mutator.field]!;
          env.set(
            `${base}.f${mutator.field}`,
            convert(
              mutator.body.eval(
                this.receiverEnv(env, base, struct, arg.eval(env)),
              ),
              type,
            ),
          );
          return undefined;
        },
      };
    }
    if (struct.maker && this.chance(0.5)) {
      const maker = struct.maker;
      const arg = guard(this.expr(INT, 2, false));
      return {
        code: (indent) => `${indent}${element} = ${maker.name}(${arg.code});`,
        exec: (env) => {
          storeFields(env, this.makeValues(struct, arg.eval(env), env));
          return undefined;
        },
      };
    }
    const instances = this.instances.filter(
      (instance) => instance.struct === struct,
    );
    const source = this.pick(instances);
    return {
      code: (indent) => `${indent}${element} = ${source.name};`,
      exec: (env) => {
        storeFields(
          env,
          struct.fields.map((_, field) => env.get(`${source.name}.f${field}`)!),
        );
        return undefined;
      },
    };
  }

  /** `sK.fN = e;` through a `*S` pointing into an array of structs. */
  private elementPointerStatement(): Stmt | undefined {
    if (this.elementPointers.length === 0) return undefined;
    const { name, target, struct } = this.pick(this.elementPointers);
    const field = this.int(0, struct.fields.length - 1);
    const type = struct.fields[field]!;
    const value = guard(this.expr(type, 2, false));
    return {
      code: (indent) => `${indent}${name}.f${field} = ${value.code};`,
      exec: (env) => {
        env.set(`${target}.f${field}`, convert(value.eval(env), type));
        return undefined;
      },
    };
  }

  /** `buK(arg);`: a bound mutator changing the struct it borrowed. */
  private boundMutatorStatement(): Stmt | undefined {
    if (this.boundMutators.length === 0) return undefined;
    const bound = this.pick(this.boundMutators);
    const arg = guard(this.expr(INT, 2, false));
    return {
      code: (indent) => `${indent}${bound.name}(${arg.code});`,
      exec: (env) => {
        this.runBoundMutator(bound, arg.eval(env), env);
        return undefined;
      },
    };
  }

  private runBoundMutator(bound: BoundMutator, d: Value, env: Env): void {
    const { instance, mutator } = bound;
    const type = instance.struct.fields[mutator.field]!;
    env.set(
      `${instance.name}.f${mutator.field}`,
      convert(
        mutator.body.eval(
          this.receiverEnv(env, instance.name, instance.struct, d),
        ),
        type,
      ),
    );
  }

  private localFeatureStatement(): Stmt | undefined {
    switch (this.int(0, 9)) {
      case 8:
        return this.nestedEnumStatement();
      case 9:
        return this.dispatchStatement();
      case 6:
        return this.gridStatement();
      case 7:
        return this.nestedDataStatement();
      case 0:
        return this.tupleAssignment();
      case 1:
        return this.operatorStatement();
      case 2:
        return this.structArrayStatement();
      case 3:
        return this.elementPointerStatement();
      case 4:
        return this.boundMutatorStatement();
      default: {
        if (this.options.length === 0) return undefined;
        const local = this.pick(this.options);
        const value = this.optionValue(local.type);
        return {
          code: (indent) => `${indent}${local.name} = ${value.code};`,
          exec: (env) => {
            env.set(local.name, value.eval(env));
            return undefined;
          },
        };
      }
    }
  }

  /** The source of a random string and its UTF-8 bytes. */
  private stringConstant(): { literal: string; bytes: number[] } {
    const encoder = new TextEncoder();
    const pieces = Array.from({ length: this.int(1, 12) }, () =>
      this.pick(STRING_PIECES),
    );
    return {
      literal: `"${pieces.map((piece) => piece[0]).join("")}"`,
      bytes: pieces.flatMap(([, value]) =>
        typeof value === "number" ? [value] : [...encoder.encode(value)],
      ),
    };
  }

  /** Definition of the struct whose operators are methods. */
  private operatorDefinition(): string {
    const name = `Q${this.fresh("")}`;
    const a = this.intType();
    const b = this.intType();
    this.operators = { name, a, b, locals: [] };
    const self = (field: string, other: string, op: string) =>
      `this.${field} ${op} ${other}.${field}`;
    const pair = (x: string, y: string) => `${name} { a: ${x}, b: ${y} }`;
    const addReceiver = this.chance(0.5) ? `*${name}` : name;
    const subReceiver = this.chance(0.5) ? `*${name}` : name;
    return [
      `struct ${name} {`,
      `    a: ${a.name},`,
      `    b: ${b.name},`,
      `    frame __add__(this: ${addReceiver}, o: *${name}) ret ${name} {\n        return ${pair(self("a", "o", "+"), self("b", "o", "+"))};\n    }`,
      `    frame __sub__(this: ${subReceiver}, o: ${name}) ret ${name} {\n        return ${pair(self("a", "o", "-"), self("b", "o", "-"))};\n    }`,
      `    frame __mul__(this: *${name}, k: int) ret ${name} {\n        return ${pair(`this.a * cast<${a.name}>(k)`, `this.b * cast<${b.name}>(k)`)};\n    }`,
      `    frame __neg__(this: *${name}) ret ${name} {\n        return ${pair("-this.a", "-this.b")};\n    }`,
      `    frame __eq__(this: *${name}, o: *${name}) ret bool {\n        return this.a == o.a && this.b == o.b;\n    }`,
      `    frame __ne__(this: *${name}, o: *${name}) ret bool {\n        return this.a != o.a || this.b != o.b;\n    }`,
      `    frame __get__(this: *${name}, i: int) ret ${b.name} {\n        return this.b + cast<${b.name}>(i);\n    }`,
      `    frame __set__(this: *${name}, i: int, v: ${b.name}) {\n        this.b = v - cast<${b.name}>(i);\n    }`,
      `}`,
    ].join("\n");
  }

  /** `tag`, value and key of an `Opt<T>` local, each from its own `match`. */
  private printOption(
    local: { name: string; type: IntType },
    env: Env,
    output: string[],
  ): string[] {
    const name = `Opt<${local.type.name}>`;
    const option = env.get(local.name) as EnumValue;
    const arms = (some: string, none: string, pair: string) =>
      `(match (${local.name}) { ${name}.Some(x) => ${some}, ${name}.None => ${none}, ${name}.Pair(x, n) => ${pair} })`;
    const asLong = (code: string) => `cast<long>(${code})`;
    const tag = `(match (${local.name}) { ${name}.Some(_x) => cast<int>(0), ${name}.None => cast<int>(1), ${name}.Pair(_x, _n) => cast<int>(2) })`;
    return [
      this.printValue(
        `${local.name}_tag`,
        tag,
        INT,
        BigInt(option.tag),
        output,
      ),
    ].concat(
      this.printValue(
        `${local.name}_v`,
        arms(asLong("x"), asLong("0"), asLong("x") + " + " + asLong("n")),
        LONG,
        option.tag === 1
          ? 0n
          : wrap(
              (convert(option.payload[0]!, LONG) as bigint) +
                (option.tag === 2 ? (option.payload[1] as bigint) : 0n),
              LONG,
            ),
        output,
      ),
    );
  }

  // ------------------------------------------- nested and generic data ----

  /** `mK[i & 1][j & 1]` or `sumK(mK, d)`, which edits its own copy. */
  private gridRead(type: IntType, depth: number): Expr | undefined {
    if (this.grids.length === 0) return undefined;
    const grid = this.pick(this.grids);
    if (this.chance(0.3)) {
      const arg = guard(this.expr(INT, depth - 1, false));
      return {
        type,
        code: `cast<${type.name}>(${grid.sum}(${grid.name}, ${arg.code}))`,
        constant: false,
        reads: union(arg.reads, new Set([grid.name])),
        eval: (env) => {
          const slot = (convert(arg.eval(env), INT) as bigint) & 1n;
          const read = (i: bigint | number, j: number) =>
            env.get(`${grid.name}[${i}][${j}]`) as bigint;
          // g[d & 1][0] = g[1][1]; return g[0][0] + g[1][0];
          const copied = read(1, 1);
          const first = slot === 0n ? copied : read(0, 0);
          const second = slot === 1n ? copied : read(1, 0);
          return convert(wrap(first + second, grid.type), type);
        },
      };
    }
    const row = this.indexExpr();
    const column = this.indexExpr();
    return {
      type,
      code: `cast<${type.name}>(${grid.name}[(${row.code}) & 1][(${column.code}) & 1])`,
      constant: false,
      reads: union(row.reads, union(column.reads, new Set([grid.name]))),
      eval: (env) => {
        const i = (row.eval(env) as bigint) & 1n;
        const j = (column.eval(env) as bigint) & 1n;
        return convert(env.get(`${grid.name}[${i}][${j}]`)!, type);
      },
    };
  }

  /** `pK.first()`, `pK.swap().a` or `pK.swap().first()` on `Pr<A, B>`. */
  private pairRead(type: IntType): Expr | undefined {
    if (this.pairs.length === 0) return undefined;
    const { name } = this.pick(this.pairs);
    const form = this.int(0, 2);
    const code = [
      `${name}.first()`,
      `${name}.swap().a`,
      `${name}.swap().first()`,
    ][form]!;
    const key = form === 0 ? `${name}.a` : `${name}.b`;
    return {
      type,
      code: `cast<${type.name}>(${code})`,
      constant: false,
      reads: new Set([name]),
      eval: (env) => convert(env.get(key)!, type),
    };
  }

  /** `bbK.get().get()` through a generic struct nested in itself. */
  private nestedBoxRead(type: IntType): Expr | undefined {
    if (this.nestedBoxes.length === 0) return undefined;
    const { name } = this.pick(this.nestedBoxes);
    return {
      type,
      code: `cast<${type.name}>(${name}.get().get())`,
      constant: false,
      reads: new Set([name]),
      eval: (env) => convert(env.get(`${name}.v.v`)!, type),
    };
  }

  /** The value the holder's current function returns for `x`. */
  private holderCall(holder: FuncHolder, x: bigint, env: Env): bigint {
    const usesSecond = env.get(`${holder.name}.fn`) === 1n;
    const operand = usesSecond ? holder.second : holder.first;
    return wrap(usesSecond ? x ^ operand : x + operand, holder.type);
  }

  /** `hK.f(x)` through the stored pointer, or `hK.run(x)` adding `k`. */
  private holderRead(type: IntType, depth: number): Expr | undefined {
    if (this.holders.length === 0) return undefined;
    const holder = this.pick(this.holders);
    const arg = guard(this.expr(holder.type, depth - 1, false));
    const direct = this.chance(0.5);
    return {
      type,
      code: `cast<${type.name}>(${holder.name}.${direct ? "f" : "run"}(${arg.code}))`,
      constant: false,
      reads: union(arg.reads, new Set([holder.name])),
      eval: (env) => {
        const called = this.holderCall(
          holder,
          convert(arg.eval(env), holder.type) as bigint,
          env,
        );
        return convert(
          direct
            ? called
            : wrap(
                called + (env.get(`${holder.name}.k`) as bigint),
                holder.type,
              ),
          type,
        );
      },
    };
  }

  /** The closure `curK(a)` applied to `b`. */
  private curriedValue(curried: Curried, a: bigint, b: bigint): bigint {
    return wrap((a ^ b) + curried.offset, curried.type);
  }

  /** `curK(a)(b)` or `addK(b)`, a closure returned from a closure. */
  private curriedRead(type: IntType, depth: number): Expr | undefined {
    if (this.curried.length === 0) return undefined;
    const curried = this.pick(this.curried);
    const right = guard(this.expr(curried.type, depth - 1, false));
    if (this.chance(0.5)) {
      const left = guard(this.expr(curried.type, depth - 1, false));
      return {
        type,
        code: `cast<${type.name}>(${curried.name}(${left.code})(${right.code}))`,
        constant: false,
        reads: union(left.reads, union(right.reads, new Set([curried.name]))),
        eval: (env) => {
          const a = convert(left.eval(env), curried.type) as bigint;
          const b = convert(right.eval(env), curried.type) as bigint;
          return convert(this.curriedValue(curried, a, b), type);
        },
      };
    }
    return {
      type,
      code: `cast<${type.name}>(${curried.applied}(${right.code}))`,
      constant: false,
      reads: union(right.reads, new Set([curried.applied])),
      eval: (env) => {
        const b = convert(right.eval(env), curried.type) as bigint;
        return convert(this.curriedValue(curried, curried.bound, b), type);
      },
    };
  }

  /** Row copies and `setK(&mK[i], v)` on `T[2][2]` locals. */
  private gridStatement(): Stmt | undefined {
    if (this.grids.length === 0) return undefined;
    const grid = this.pick(this.grids);
    const row = this.indexExpr();
    const slot = (env: Env) => (row.eval(env) as bigint) & 1n;
    if (this.chance(0.5)) {
      const source = this.indexExpr();
      return {
        code: (indent) =>
          `${indent}${grid.name}[(${row.code}) & 1] = ${grid.name}[(${source.code}) & 1];`,
        exec: (env) => {
          const to = slot(env);
          const from = (source.eval(env) as bigint) & 1n;
          const values = [0, 1].map((column) =>
            env.get(`${grid.name}[${from}][${column}]`)!,
          );
          values.forEach((value, column) =>
            env.set(`${grid.name}[${to}][${column}]`, value),
          );
          return undefined;
        },
      };
    }
    const value = guard(this.expr(grid.type, 2, false));
    return {
      code: (indent) =>
        `${indent}${grid.set}(&${grid.name}[(${row.code}) & 1], ${value.code});`,
      exec: (env) => {
        const to = slot(env);
        env.set(`${grid.name}[${to}][1]`, convert(value.eval(env), grid.type));
        return undefined;
      },
    };
  }

  /** `qK = pK.swap();`, or storing the other function in a holder. */
  private nestedDataStatement(): Stmt | undefined {
    if (this.chance(0.5) && this.pairs.length > 0) {
      const { name, swapped } = this.pick(this.pairs);
      return {
        code: (indent) => `${indent}${swapped} = ${name}.swap();`,
        exec: (env) => {
          env.set(`${swapped}.a`, env.get(`${name}.b`)!);
          env.set(`${swapped}.b`, env.get(`${name}.a`)!);
          return undefined;
        },
      };
    }
    if (this.holders.length === 0) return undefined;
    const holder = this.pick(this.holders);
    const useSecond = this.chance(0.5);
    return {
      code: (indent) =>
        `${indent}${holder.name}.f = ${useSecond ? holder.secondName : holder.firstName};`,
      exec: (env) => {
        env.set(`${holder.name}.fn`, useSecond ? 1n : 0n);
        return undefined;
      },
    };
  }

  // ----------------------------------- dispatch, nested enums and heap ----

  /** `voK.val(d)` through a `*V`, or `voaK[i & 1].val(d)` through an array. */
  private specObjectRead(type: IntType, depth: number): Expr | undefined {
    if (this.specObjects.length === 0) return undefined;
    const object = this.pick(this.specObjects);
    const index = object.targets.length > 1 ? this.indexExpr() : undefined;
    const arg = guard(this.expr(INT, depth - 1, false));
    const receiver = index
      ? `${object.name}[(${index.code}) & 1]`
      : object.name;
    return {
      type,
      code: `cast<${type.name}>(${receiver}.val(${arg.code}))`,
      constant: false,
      reads: union(
        index?.reads ?? new Set(),
        union(arg.reads, new Set([object.name])),
      ),
      eval: (env) => {
        const target =
          object.targets[index ? Number((index.eval(env) as bigint) & 1n) : 0]!;
        return convert(
          target.struct.specVal!.eval(
            this.receiverEnv(env, target.name, target.struct, arg.eval(env)),
          ),
          type,
        );
      },
    };
  }

  /** The object a `*ZA` pointer currently refers to. */
  private zTarget(z: ThreeLevel, env: Env): number {
    return Number(env.get(`${z.pointer}.dyn`) as bigint);
  }

  /** `who()`, `val(d)` or `is *ZC` through the pointer's dynamic type. */
  private threeLevelRead(type: IntType, depth: number): Expr | undefined {
    const z = this.threeLevel;
    if (!z?.ready) return undefined;
    const form = this.int(0, 2);
    if (form === 0) {
      return {
        type,
        code: `cast<${type.name}>(${z.pointer}.who())`,
        constant: false,
        reads: new Set([z.pointer]),
        eval: (env) => convert(BigInt(this.zTarget(z, env) + 1), type),
      };
    }
    if (form === 1) {
      return {
        type,
        code: `cast<${type.name}>(${z.pointer} is *${z.names[2]})`,
        constant: false,
        reads: new Set([z.pointer]),
        eval: (env) => convert(this.zTarget(z, env) === 2, type),
      };
    }
    const arg = guard(this.expr(INT, depth - 1, false));
    return {
      type,
      code: `cast<${type.name}>(${z.pointer}.val(${arg.code}))`,
      constant: false,
      reads: union(arg.reads, new Set([z.pointer])),
      eval: (env) => {
        const object = z.locals[this.zTarget(z, env)]!;
        const d = convert(convert(arg.eval(env), INT), z.type) as bigint;
        const x = env.get(`${object}.x`) as bigint;
        return convert(
          this.zTarget(z, env) === 0
            ? wrap(x + d, z.type)
            : wrap(x * (env.get(`${object}.y`) as bigint) + d, z.type),
          type,
        );
      },
    };
  }

  /** A value of the inner enum: `I.P(e)`, `I.Q { a, b }` or `I.R`. */
  private innerEnumValue(nested: NestedEnums): {
    code: string;
    eval(env: Env): EnumValue;
  } {
    const u8 = INT_TYPES[1]!;
    switch (this.int(0, 2)) {
      case 0: {
        const value = guard(this.expr(nested.type, 1, false));
        return {
          code: `${nested.inner}.P(${value.code})`,
          eval: (env) => ({
            tag: 0,
            payload: [convert(value.eval(env), nested.type)],
          }),
        };
      }
      case 1: {
        const a = guard(this.expr(u8, 1, false));
        const b = guard(this.expr(LONG, 1, false));
        return {
          code: `${nested.inner}.Q { a: ${a.code}, b: ${b.code} }`,
          eval: (env) => ({
            tag: 1,
            payload: [convert(a.eval(env), u8), convert(b.eval(env), LONG)],
          }),
        };
      }
      default:
        return {
          code: `${nested.inner}.R`,
          eval: () => ({ tag: 2, payload: [] }),
        };
    }
  }

  private outerEnumValue(nested: NestedEnums): {
    code: string;
    eval(env: Env): EnumValue;
  } {
    const form = this.int(0, 2);
    if (form === 2) {
      return {
        code: `${nested.outer}.Y`,
        eval: () => ({ tag: 2, payload: [] }),
      };
    }
    const inner = this.innerEnumValue(nested);
    if (form === 0) {
      return {
        code: `${nested.outer}.W(${inner.code})`,
        eval: (env) => ({ tag: 0, payload: [inner.eval(env)] }),
      };
    }
    const count = guard(this.expr(INT, 1, false));
    return {
      code: `${nested.outer}.X { i: ${inner.code}, n: ${count.code} }`,
      eval: (env) => ({
        tag: 1,
        payload: [inner.eval(env), convert(count.eval(env), INT)],
      }),
    };
  }

  private innerDigest(value: EnumValue): bigint {
    if (value.tag === 2) return 7n;
    if (value.tag === 0) return convert(value.payload[0]!, LONG) as bigint;
    return wrap(
      (value.payload[0] as bigint) + (value.payload[1] as bigint) * 3n,
      LONG,
    );
  }

  private outerDigest(value: EnumValue): bigint {
    if (value.tag === 2) return -1n;
    const inner = this.innerDigest(value.payload[0] as EnumValue);
    return value.tag === 0
      ? wrap(inner * 2n + 1n, LONG)
      : wrap(inner * 3n + (value.payload[1] as bigint), LONG);
  }

  /** `dgK(ok)` or `diK(h.arr[i & 1])`, matching through nested patterns. */
  private nestedEnumRead(type: IntType): Expr | undefined {
    const nested = this.nestedEnums;
    if (!nested) return undefined;
    if (nested.holders.length > 0 && this.chance(0.4)) {
      const holder = this.pick(nested.holders);
      const index = this.indexExpr();
      return {
        type,
        code: `cast<${type.name}>(${nested.innerDigest}(${holder}.arr[(${index.code}) & 1]))`,
        constant: false,
        reads: union(index.reads, new Set([holder])),
        eval: (env) => {
          const slot = (index.eval(env) as bigint) & 1n;
          return convert(
            this.innerDigest(env.get(`${holder}.arr[${slot}]`) as EnumValue),
            type,
          );
        },
      };
    }
    if (nested.locals.length === 0) return undefined;
    const local = this.pick(nested.locals);
    return {
      type,
      code: `cast<${type.name}>(${nested.outerDigest}(${local}))`,
      constant: false,
      reads: new Set([local]),
      eval: (env) =>
        convert(this.outerDigest(env.get(local) as EnumValue), type),
    };
  }

  private nestedEnumStatement(): Stmt | undefined {
    const nested = this.nestedEnums;
    if (!nested) return undefined;
    if (nested.holders.length > 0 && this.chance(0.5)) {
      const holder = this.pick(nested.holders);
      if (this.chance(0.5)) {
        const index = this.indexExpr();
        return {
          code: (indent) =>
            `${indent}${holder}.arr[(${index.code}) & 1] = ${holder}.e;`,
          exec: (env) => {
            const slot = (index.eval(env) as bigint) & 1n;
            env.set(`${holder}.arr[${slot}]`, env.get(`${holder}.e`)!);
            return undefined;
          },
        };
      }
      const value = this.innerEnumValue(nested);
      return {
        code: (indent) => `${indent}${holder}.e = ${value.code};`,
        exec: (env) => {
          env.set(`${holder}.e`, value.eval(env));
          return undefined;
        },
      };
    }
    if (nested.locals.length === 0) return undefined;
    const local = this.pick(nested.locals);
    const value = this.outerEnumValue(nested);
    return {
      code: (indent) => `${indent}${local} = ${value.code};`,
      exec: (env) => {
        env.set(local, value.eval(env));
        return undefined;
      },
    };
  }

  /** `(match (taK[i & 1]) { (x, y) => ... })` on an array of tuples. */
  private tupleArrayRead(type: IntType): Expr | undefined {
    if (this.tupleArrays.length === 0) return undefined;
    const array = this.pick(this.tupleArrays);
    const index = this.indexExpr();
    const x = this.fresh("tx");
    const y = this.fresh("ty");
    const t = type.name;
    return {
      type,
      code: `(match (${array.name}[(${index.code}) & 1]) { (${x}, ${y}) => cast<${t}>(${x}) ^ cast<${t}>(${y}) })`,
      constant: false,
      reads: union(index.reads, new Set([array.name])),
      eval: (env) => {
        const slot = (index.eval(env) as bigint) & 1n;
        return wrap(
          (convert(env.get(`${array.name}[${slot}].0`)!, type) as bigint) ^
            (convert(env.get(`${array.name}[${slot}].1`)!, type) as bigint),
          type,
        );
      },
    };
  }

  /** `vwK[i & 3]`: a slice over main's array, reading its storage. */
  private sliceViewRead(type: IntType): Expr | undefined {
    const array = this.mainArray;
    if (!array?.view) return undefined;
    const view = array.view;
    const index = this.indexExpr();
    return {
      type,
      code: `cast<${type.name}>(${view}[(${index.code}) & 3])`,
      constant: false,
      reads: union(index.reads, new Set([view])),
      eval: (env) => {
        const slot = (index.eval(env) as bigint) & 3n;
        return convert(env.get(`${array.name}[${slot}]`)!, type);
      },
    };
  }

  /** The value of a slot of a `Lambda` array for argument `x`. */
  private lambdaArrayCall(
    array: LambdaArray,
    slot: bigint,
    x: bigint,
    env: Env,
  ): bigint {
    const first = env.get(`${array.name}[${slot}]`) === 0n;
    return wrap(first ? x + array.captured : x ^ array.constant, array.type);
  }

  /** `lfK[i & 1](arg)`: a closure called straight from an array element. */
  private lambdaArrayRead(type: IntType, depth: number): Expr | undefined {
    if (this.lambdaArrays.length === 0) return undefined;
    const array = this.pick(this.lambdaArrays);
    const index = this.indexExpr();
    const arg = guard(this.expr(array.type, depth - 1, false));
    return {
      type,
      code: `cast<${type.name}>(${array.name}[(${index.code}) & 1](${arg.code}))`,
      constant: false,
      reads: union(index.reads, union(arg.reads, new Set([array.name]))),
      eval: (env) => {
        const slot = (index.eval(env) as bigint) & 1n;
        const x = convert(arg.eval(env), array.type) as bigint;
        return convert(this.lambdaArrayCall(array, slot, x, env), type);
      },
    };
  }

  /** `sumFree(mkList(a & 7, b))`: builds, walks and frees a heap list. */
  private heapListRead(type: IntType, depth: number): Expr | undefined {
    if (!this.hasHeapList) return undefined;
    const count = guard(this.expr(INT, depth - 1, false));
    const seed = guard(this.expr(INT, depth - 1, false));
    return {
      type,
      code: `cast<${type.name}>(sumFree(mkList((${count.code}) & 7, ${seed.code})))`,
      constant: false,
      reads: union(count.reads, seed.reads),
      eval: (env) => {
        const n = (count.eval(env) as bigint) & 7n;
        const start = convert(seed.eval(env), INT) as bigint;
        let sum = 0n;
        for (let i = n - 1n; i >= 0n; i--) {
          sum = wrap(sum * 10n + wrap(i * 3n + start, INT), INT);
        }
        return convert(sum, type);
      },
    };
  }

  /** Writes through a slice, tuple element, closure slot or `*ZA`. */
  private dispatchStatement(): Stmt | undefined {
    switch (this.int(0, 4)) {
      case 0: {
        if (this.tupleArrays.length === 0) return undefined;
        const array = this.pick(this.tupleArrays);
        const index = this.indexExpr();
        const left = guard(this.expr(array.first, 2, false));
        const right = guard(this.expr(array.second, 2, false));
        return {
          code: (indent) =>
            `${indent}${array.name}[(${index.code}) & 1] = (${left.code}, ${right.code});`,
          exec: (env) => {
            const slot = (index.eval(env) as bigint) & 1n;
            const a = convert(left.eval(env), array.first);
            const b = convert(right.eval(env), array.second);
            env.set(`${array.name}[${slot}].0`, a);
            env.set(`${array.name}[${slot}].1`, b);
            return undefined;
          },
        };
      }
      case 1: {
        const array = this.mainArray;
        if (!array?.view) return undefined;
        const view = array.view;
        const index = this.indexExpr();
        const value = guard(this.expr(array.type, 2, false));
        return {
          code: (indent) =>
            `${indent}${view}[(${index.code}) & 3] = ${value.code};`,
          exec: (env) => {
            const slot = (index.eval(env) as bigint) & 3n;
            env.set(
              `${array.name}[${slot}]`,
              convert(value.eval(env), array.type),
            );
            return undefined;
          },
        };
      }
      case 2: {
        const candidates = this.structArrays.filter((entry) => entry.slice);
        if (candidates.length === 0) return undefined;
        const array = this.pick(candidates);
        const arg = guard(this.expr(INT, 2, false));
        return {
          code: (indent) =>
            `${indent}${array.slice}(${array.name}, ${arg.code});`,
          exec: (env) => {
            const d = convert(arg.eval(env), INT) as bigint;
            const to = d & 1n;
            const from = wrap(d + 1n, INT) & 1n;
            array.struct.fields.forEach((_, field) =>
              env.set(
                `${array.name}[${to}].f${field}`,
                env.get(`${array.name}[${from}].f${field}`)!,
              ),
            );
            return undefined;
          },
        };
      }
      case 3: {
        if (this.lambdaArrays.length === 0) return undefined;
        const array = this.pick(this.lambdaArrays);
        const to = this.indexExpr();
        const from = this.indexExpr();
        return {
          code: (indent) =>
            `${indent}${array.name}[(${to.code}) & 1] = ${array.name}[(${from.code}) & 1];`,
          exec: (env) => {
            const target = (to.eval(env) as bigint) & 1n;
            const source = (from.eval(env) as bigint) & 1n;
            env.set(
              `${array.name}[${target}]`,
              env.get(`${array.name}[${source}]`)!,
            );
            return undefined;
          },
        };
      }
      default: {
        const z = this.threeLevel;
        if (!z?.ready) return undefined;
        const target = this.int(0, 2);
        return {
          code: (indent) => `${indent}${z.pointer} = &${z.locals[target]!};`,
          exec: (env) => {
            env.set(`${z.pointer}.dyn`, BigInt(target));
            return undefined;
          },
        };
      }
    }
  }

  /** Output of a destroyed `Rs`. */
  private destroyRs(id: bigint): void {
    this.out.push(`${this.resources!.rsLabel}=${id}`);
  }

  /**
   * A local that owns a destructor. The destructor runs at block exit, in
   * reverse order with `defer`, so the oracle treats it as one.
   *
   * Not generated where a `throw` could leave its scope: a throw from a
   * callee skips automatic destructors (a limit documented in
   * docs/21-constructors-destructors.md), and on a direct throw they run
   * before `defer` blocks instead of interleaving with them.
   */
  private resourceStatement(): Stmt | undefined {
    if (this.tryDepth > 0) return undefined;
    const r = this.resources!;
    const arg = () => guard(this.expr(INT, 2, false));
    const id = (expr: Expr, env: Env) => convert(expr.eval(env), INT) as bigint;
    switch (this.int(0, 3)) {
      case 0: {
        const value = arg();
        const name = this.fresh("_r");
        return {
          code: (indent) =>
            `${indent}local ${name}: ${r.rs} = ${r.rs} { id: ${value.code} };`,
          exec: () => undefined,
          defer: (env) => {
            const captured = id(value, env);
            return () => this.destroyRs(captured);
          },
        };
      }
      case 1: {
        const value = arg();
        const name = this.fresh("_r");
        return {
          code: (indent) =>
            `${indent}local ${name}: ${r.rs} = ${r.make}(${value.code});`,
          exec: () => undefined,
          defer: (env) => {
            const captured = id(value, env);
            return () => this.destroyRs(captured);
          },
        };
      }
      case 2: {
        const [a, b, tag] = [arg(), arg(), arg()];
        const name = this.fresh("_o");
        return {
          code: (indent) =>
            `${indent}local ${name}: ${r.own} = ${r.own} { a: ${r.rs} { id: ${a.code} }, b: ${r.rs} { id: ${b.code} }, tag: ${tag.code} };`,
          exec: () => undefined,
          defer: (env) => {
            const first = id(a, env);
            const second = id(b, env);
            const label = id(tag, env);
            return () => {
              this.out.push(`${r.ownLabel}=${label},${first},${second}`);
              this.destroyRs(second);
              this.destroyRs(first);
            };
          },
        };
      }
      default: {
        const [a, b] = [arg(), arg()];
        const name = this.fresh("_a");
        return {
          code: (indent) =>
            `${indent}local ${name}: ${r.rs}[2] = [${r.rs} { id: ${a.code} }, ${r.rs} { id: ${b.code} }];`,
          exec: () => undefined,
          defer: (env) => {
            const first = id(a, env);
            const second = id(b, env);
            return () => {
              this.destroyRs(second);
              this.destroyRs(first);
            };
          },
        };
      }
    }
  }

  /** `guardK(x)`: returns with destructors and a `defer` still to run. */
  private guardedCall(type: IntType, depth: number): Expr | undefined {
    const r = this.resources;
    if (!r) return undefined;
    const arg = guard(this.expr(INT, depth - 1, false));
    return {
      type,
      code: `cast<${type.name}>(${r.guarded}(${arg.code}))`,
      constant: false,
      reads: arg.reads,
      eval: (env) => {
        const x = convert(arg.eval(env), INT) as bigint;
        if ((x & 1n) === 0n) {
          // The return value is computed before anything is destroyed.
          this.destroyRs(wrap(x + 1n, INT));
          this.out.push(`${r.rsLabel}_df=${x}`);
          this.destroyRs(x);
          return convert(wrap(x * 2n, INT), type);
        }
        this.out.push(`${r.rsLabel}_df=${x}`);
        this.destroyRs(x);
        return convert(wrap(x + 1n, INT), type);
      },
    };
  }

  // ---------------------------------------------------------- program ----

  build(): GeneratedProgram {
    const lines: string[] = [
      ...(this.wasm ? [WASM_MARKER] : []),
      "extern printf(fmt: string, ...);",
    ];
    const env: Env = new Map();
    const output: string[] = [];
    this.out = output;
    const printedLambdas: LambdaDef[] = [];
    // Local strings must be read: printed as their length-independent bytes.
    const printedStrings: { name: string; bytes: number[] }[] = [];
    const printedSpecObjects: { name: string; instance: Instance }[] = [];
    const implicitlyConstructed: {
      name: string;
      structName: string;
      value: bigint;
    }[] = [];
    // Pointer locals that must be used: printed through a call.
    const printedCalls: string[] = [];
    // `*Parent` pointers to parents, printed through `is *Child`.
    const printedTyped: string[] = [];
    // Functions emitted after main (they may be referenced from it).
    const functionsAfterMain: string[] = [];

    for (let index = this.int(0, 3); index > 0; index--) {
      const type = this.scalarType();
      const name = this.fresh("g");
      const init = guard(this.expr(type, 3, true));
      const place = { type, code: name, key: name };
      this.globalDecls.push({ place, init });
      this.globals.push(place);
      lines.push(`global ${name}: ${type.name} = ${init.code};`);
      env.set(name, convert(init.eval(env), type));
    }
    if (this.chance(0.4)) {
      // The `g` prefix keeps the elements visible to functions (callEnv).
      const type = this.intType();
      const name = this.fresh("ga");
      const inits = [0, 1, 2, 3].map(() => this.literal(type));
      lines.push(
        `global ${name}: ${type.name}[4] = [${inits.map((init) => guard(init).code).join(", ")}];`,
      );
      inits.forEach((init, slot) =>
        env.set(`${name}[${slot}]`, convert(init.eval(env), type)),
      );
      this.globals.push({
        type,
        code: name,
        key: name,
        array: { base: name, length: 4 },
      });
    }

    if (this.chance(0.5)) {
      const name = `V${this.fresh("")}`;
      const total = this.fresh("tot");
      this.spec = { name, total };
      lines.push(
        `spec ${name} {\n    frame val(this: *Self, d: int) ret long;\n}`,
        `frame ${total}<T: ${name}>(p: *T, d: int) ret long {\n    return p.val(d) + cast<long>(1);\n}`,
      );
    }
    for (let index = this.int(0, 2); index > 0; index--) {
      lines.push(this.structDefinition());
    }
    // Struct-returning functions: assigned to struct locals and thrown.
    for (const struct of this.structs) {
      if (!this.chance(0.5)) continue;
      const name = this.fresh("mk");
      this.scope = [
        ...this.globals,
        { type: INT, code: "x", key: "x", readonly: true },
      ];
      this.inFunctionBody = true;
      const fields = struct.fields.map((type) =>
        guard(this.expr(type, 2, false)),
      );
      this.inFunctionBody = false;
      this.scope = [];
      const param = fields.some((field) => field.reads.has("x")) ? "x" : "_x";
      lines.push(
        `frame ${name}(${param}: int) ret ${struct.name} {\n    return ${struct.name} { ${fields.map((field, index) => `f${index}: ${field.code}`).join(", ")} };\n}`,
      );
      struct.maker = { name, fields };
    }

    if (this.chance(0.5)) lines.push(this.hierarchyDefinition());

    if (this.chance(0.5)) lines.push(this.operatorDefinition());
    const hasOption = this.chance(0.5);
    if (hasOption) {
      lines.push(
        "enum Opt<T> { Some(T), None, Pair(T, int) }",
        "frame mkOpt<T>(v: T, k: int) ret Opt<T> {\n    if (k == 0) {\n        return Opt<T>.None;\n    }\n    if (k == 1) {\n        return Opt<T>.Some(v);\n    }\n    return Opt<T>.Pair(v, k);\n}",
      );
    }
    for (let index = this.int(0, 1); index > 0; index--) {
      const name = this.fresh("gstr");
      const { literal, bytes } = this.stringConstant();
      lines.push(`global ${name}: string = ${literal};`);
      this.strings.push({ name, bytes, global: true });
    }

    if (this.chance(0.6)) {
      const k = this.fresh("");
      const rs = `Rs${k}`;
      const own = `Own${k}`;
      this.resources = {
        rs,
        own,
        make: `mkRs${k}`,
        guarded: `guardRs${k}`,
        rsLabel: `rs${k}`,
        ownLabel: `own${k}`,
      };
      const r = this.resources;
      lines.push(
        `struct ${rs} {\n    id: int,\n    @[auto_destroy]\n    frame destroy(this: *${rs}) {\n        printf("${r.rsLabel}=%d\\n", this.id);\n    }\n}`,
        `struct ${own} {\n    a: ${rs},\n    b: ${rs},\n    tag: int,\n    @[auto_destroy]\n    frame destroy(this: *${own}) {\n        printf("${r.ownLabel}=%d,%d,%d\\n", this.tag, this.a.id, this.b.id);\n    }\n}`,
        `frame ${r.make}(x: int) ret ${rs} {\n    return ${rs} { id: x };\n}`,
        `frame ${r.guarded}(x: int) ret int {\n    local _r: ${rs} = ${rs} { id: x };\n    defer printf("${r.rsLabel}_df=%d\\n", x);\n    if ((x & 1) == 0) {\n        local _s: ${rs} = ${rs} { id: x + 1 };\n        return x * 2;\n    }\n    return x + 1;\n}`,
      );
    }
    if (this.chance(0.5)) {
      const k = this.fresh("");
      const value = BigInt(this.int(1, 90));
      const name = this.fresh("cn");
      lines.push(
        `struct Cn${k} {\n    v: int,\n    frame new(this: *Cn${k}) {\n        this.v = ${value};\n    }\n}`,
      );
      implicitlyConstructed.push({ name, structName: `Cn${k}`, value });
    }
    if (this.chance(0.5)) {
      this.hasHeapList = true;
      lines.push(
        "extern malloc(n: ulong) ret *void;",
        "extern free(p: *void);",
        "struct Nd {\n    v: int,\n    next: *Nd,\n}",
        "frame mkList(n: int, seed: int) ret *Nd {\n    local head: *Nd = null;\n    local i: int = 0;\n    loop (i < n) {\n        local node: *Nd = cast<*Nd>(malloc(sizeof(Nd)));\n        node.v = i * 3 + seed;\n        node.next = head;\n        head = node;\n        i = i + 1;\n    }\n    return head;\n}",
        "frame sumFree(start: *Nd) ret int {\n    local head: *Nd = start;\n    local sum: int = 0;\n    loop (head != null) {\n        sum = sum * 10 + head.v;\n        local next: *Nd = head.next;\n        free(cast<*void>(head));\n        head = next;\n    }\n    return sum;\n}",
      );
    }
    if (this.chance(0.6)) {
      const type = this.intType();
      const k = this.fresh("");
      const inner = `In${k}`;
      const outer = `Out${k}`;
      const innerDigest = `di${k}`;
      const outerDigest = `dg${k}`;
      const longOf = (code: string) => `cast<long>(${code})`;
      const patterns: [string, string][] = [
        [`${inner}.P(v)`, longOf("v")],
        [`${inner}.Q { a: x, b: y }`, `${longOf("x")} + y * cast<long>(3)`],
        [`${inner}.R`, "cast<long>(7)"],
      ];
      lines.push(
        `enum ${inner} { P(${type.name}), Q { a: u8, b: long }, R }`,
        `enum ${outer} { W(${inner}), X { i: ${inner}, n: int }, Y }`,
        `frame ${innerDigest}(e: ${inner}) ret long {\n    return match (e) { ${patterns.map(([pattern, value]) => `${pattern} => ${value}`).join(", ")} };\n}`,
        `frame ${outerDigest}(o: ${outer}) ret long {\n    return match (o) { ${patterns
          .map(
            ([pattern, value]) =>
              `${outer}.W(${pattern}) => (${value}) * cast<long>(2) + cast<long>(1), ${outer}.X { i: ${pattern}, n: nn } => (${value}) * cast<long>(3) + cast<long>(nn)`,
          )
          .join(", ")}, ${outer}.Y => cast<long>(-1) };\n}`,
      );
      this.nestedEnums = {
        inner,
        outer,
        innerDigest,
        outerDigest,
        type,
        locals: [],
        holders: [],
        holderName: `Hd${k}`,
      };
      lines.push(`struct Hd${k} {\n    e: ${inner},\n    arr: ${inner}[2],\n}`);
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const t = type.name;
      const k = this.fresh("");
      const names = [`ZA${k}`, `ZB${k}`, `ZC${k}`] as const;
      const who = (self: string, value: number) =>
        `    frame who(this: *${self}) ret int {\n        return ${value};\n    }`;
      const val = (self: string, body: string) =>
        `    frame val(this: *${self}, d: int) ret ${t} {\n        return ${body} + cast<${t}>(d);\n    }`;
      lines.push(
        `struct ${names[0]} {\n    x: ${t},\n${who(names[0], 1)}\n${val(names[0], "this.x")}\n}`,
        `struct ${names[1]}: ${names[0]} {\n    y: ${t},\n${who(names[1], 2)}\n${val(names[1], "this.x * this.y")}\n}`,
        `struct ${names[2]}: ${names[1]} {\n    z: ${t},\n${who(names[2], 3)}\n}`,
      );
      this.threeLevel = {
        type,
        names,
        locals: [],
        pointer: this.fresh("zp"),
      };
    }

    lines.push(
      "struct Pr<A, B> {\n    a: A,\n    b: B,\n    frame first(this: *Pr<A, B>) ret A {\n        return this.a;\n    }\n    frame swap(this: *Pr<A, B>) ret Pr<B, A> {\n        return Pr<B, A> { a: this.b, b: this.a };\n    }\n}",
    );

    // Generic code paths: an identity function and a generic struct.
    lines.push("frame gid<T>(x: T) ret T {\n    return x;\n}");
    lines.push(
      "struct Box<T> {\n    v: T,\n    frame get(this: *Box<T>) ret T {\n        return this.v;\n    }\n}",
    );

    if (this.chance(0.6)) {
      const name = `E${this.fresh("")}`;
      const variants = Array.from({ length: this.int(2, 4) }, () =>
        Array.from({ length: this.int(0, 2) }, () => this.intType()),
      );
      this.enumDef = { name, variants };
      lines.push(
        `enum ${name} { ${variants.map((payload, tag) => (payload.length > 0 ? `V${tag}(${payload.map((type) => type.name).join(", ")})` : `V${tag}`)).join(", ")} }`,
      );
    }

    for (let index = this.int(0, 2); index > 0; index--) {
      const type = this.intType();
      const op = this.pick(["+", "-", "*", "^", "|", "&"]);
      const name = this.fresh("mut");
      const deltaType = this.intType();
      this.mutators.push({ name, type, deltaType, op });
      lines.push(
        `frame ${name}(q: *${type.name}, delta: ${deltaType.name}) {\n    *q = *q ${op} delta;\n}`,
      );
    }

    // Overload sets: one declaration per distinct parameter type.
    for (
      let index = this.chance(0.5) ? this.int(1, 2) : 0;
      index > 0;
      index--
    ) {
      const name = this.fresh("ov");
      const returnType = this.intType();
      const set: OverloadSet = { name, returnType, variants: [] };
      for (let count = this.int(2, 3); count > 0; count--) {
        const paramType = this.intType();
        if (set.variants.some((variant) => variant.paramType === paramType)) {
          continue;
        }
        const param = this.fresh("p");
        this.scope = [
          ...this.globals,
          { type: paramType, code: param, key: param, readonly: true },
        ];
        const body = guard(this.expr(returnType, 2, false));
        this.scope = [];
        set.variants.push({ paramType, param, body });
        const used = body.reads.has(param) ? param : `_${param}`;
        lines.push(
          `frame ${name}(${used}: ${paramType.name}) ret ${returnType.name} {\n    return ${body.code};\n}`,
        );
      }
      this.overloads.push(set);
    }

    // Throwing helpers, called from expressions inside `try` bodies. Without
    // them no `try` or `throw` is generated.
    for (
      let index = this.chance(0.6) ? this.int(1, 2) : 0;
      index > 0;
      index--
    ) {
      const throwType = this.pick([INT, LONG]);
      const name = this.fresh("thr");
      const thrower: Thrower = {
        name,
        throwType,
        scale: BigInt(this.int(1, 9)),
        offset: BigInt(this.int(0, 100)),
        mask: this.pick([7n, 15n, 31n]),
      };
      this.throwers.push(thrower);
      const value =
        throwType === INT
          ? `x * ${thrower.scale} + ${thrower.offset}`
          : `cast<long>(x) * cast<long>(${thrower.scale}) + cast<long>(${thrower.offset})`;
      lines.push(
        `frame ${name}(x: int, limit: int) ret int {\n    if (x > limit) {\n        throw ${value};\n    }\n    return x ^ ${thrower.offset};\n}`,
      );
      if (this.chance(0.6)) {
        const relay: Relay = {
          name: this.fresh("rl"),
          target: thrower,
          limit: BigInt(this.int(0, Number(thrower.mask))),
          form: this.chance(0.5) ? "defer" : "translate",
        };
        this.relays.push(relay);
        const call = `${name}(x, ${relay.limit})`;
        lines.push(
          relay.form === "defer"
            ? `frame ${relay.name}(x: int) ret int {\n    defer printf("${relay.name}\\n");\n    return ${call} + 1;\n}`
            : `frame ${relay.name}(x: int) ret int {\n    try {\n        return ${call} ^ 3;\n    } catch (e: int) {\n        throw cast<long>(e) * cast<long>(2);\n    }\n}`,
        );
      }
    }

    for (let index = this.int(0, 3); index > 0; index--) {
      const name = this.fresh("h");
      const params = Array.from({ length: this.int(1, 3) }, () => ({
        name: this.fresh("p"),
        type: this.intType(),
      }));
      const returnType = this.scalarType();
      this.scope = [
        ...this.globals,
        ...params.map((param) => ({
          type: param.type,
          code: param.name,
          key: param.name,
          readonly: true,
        })),
      ];
      const body = guard(this.expr(returnType, 3, false));
      // Unused parameters are errors unless prefixed with `_`.
      const signature = params
        .map(
          (param) =>
            `${body.reads.has(param.name) ? "" : "_"}${param.name}: ${param.type.name}`,
        )
        .join(", ");
      lines.push(
        `frame ${name}(${signature}) ret ${returnType.name} {\n    return ${body.code};\n}`,
      );
      this.helpers.push({ name, params, returnType, body });
    }

    for (let index = this.int(0, 1); index > 0; index--) {
      const type = this.intType();
      const name = this.fresh("rec");
      this.scope = [
        ...this.globals,
        { type: INT, code: "n", key: "n", readonly: true },
        { type, code: "acc", key: "acc", readonly: true },
      ];
      const body = guard(this.expr(type, 2, false));
      lines.push(
        `frame ${name}(n: int, acc: ${type.name}) ret ${type.name} {\n    if (n <= 0) {\n        return acc;\n    }\n    return ${name}(n - 1, ${body.code});\n}`,
      );
      this.recursives.push({ name, type, body });
    }

    // main: locals, a struct, an array, then random statements.
    this.scope = [...this.globals];
    const decls: string[] = [];
    for (
      let index = this.chance(0.6) ? this.int(1, 2) : 0;
      index > 0;
      index--
    ) {
      const type = this.intType();
      const name = this.fresh("k");
      const init = this.literal(type);
      decls.push(`    local ${name}: ${type.name} = ${guard(init).code};`);
      env.set(name, convert(init.eval(env), type));
      this.counters.push({ name, type });
    }
    for (const helper of this.helpers) {
      if (!this.chance(0.4)) continue;
      const name = this.fresh("fp");
      decls.push(
        `    local ${name}: Func<${helper.returnType.name}>(${helper.params.map((param) => param.type.name).join(", ")}) = ${helper.name};`,
      );
      this.funcPointers.push({ name, helper });
    }
    const printed: { code: string; key: string; type: ScalarType }[] = [];
    for (let index = this.int(2, 5); index > 0; index--) {
      const type = this.scalarType();
      const name = this.fresh("v");
      const init = guard(this.expr(type, 3, false));
      decls.push(`    local ${name}: ${type.name} = ${init.code};`);
      env.set(name, convert(init.eval(env), type));
      const place = { type, code: name, key: name };
      this.scope.push(place);
      printed.push(place);
    }
    const addInstance = (name: string, struct: StructDef) => {
      struct.fields.forEach((type, field) => {
        const key = `${name}.f${field}`;
        const place = { type, code: key, key };
        this.scope.push(place);
        printed.push(place);
      });
      this.instances.push({ name, struct });
    };
    for (const struct of this.structs) {
      const name = this.fresh("s");
      const inits = struct.fields.map((type) =>
        guard(this.expr(type, 2, false)),
      );
      decls.push(
        `    local ${name}: ${struct.name} = ${struct.name} { ${inits.map((init, field) => `f${field}: ${init.code}`).join(", ")} };`,
      );
      struct.fields.forEach((type, field) =>
        env.set(`${name}.f${field}`, convert(inits[field]!.eval(env), type)),
      );
      addInstance(name, struct);
      if (this.chance(0.5)) {
        // A copy is independent of the original (value semantics).
        const copy = this.fresh("s");
        decls.push(`    local ${copy}: ${struct.name} = ${name};`);
        struct.fields.forEach((_, field) =>
          env.set(`${copy}.f${field}`, env.get(`${name}.f${field}`)!),
        );
        addInstance(copy, struct);
      }
    }
    if (this.spec) {
      const spec = this.spec.name;
      const objects: { name: string; instance: Instance }[] = [];
      for (const instance of this.instances) {
        if (!instance.struct.specVal || !this.chance(0.5)) continue;
        const name = this.fresh("vo");
        decls.push(`    local ${name}: *${spec} = &${instance.name};`);
        objects.push({ name, instance });
        this.specObjects.push({ name, targets: [instance] });
      }
      if (objects.length >= 2) {
        const first = this.pick(objects);
        const second = this.pick(objects);
        const name = this.fresh("voa");
        decls.push(
          `    local ${name}: *${spec}[2] = [${first.name}, ${second.name}];`,
        );
        this.specObjects.push({
          name,
          targets: [first.instance, second.instance],
        });
        printedSpecObjects.push({
          name: `${name}[1]`,
          instance: second.instance,
        });
      }
      // A pointer that is never called would be an unused local.
      for (const { name, instance } of objects) {
        printedSpecObjects.push({ name, instance });
      }
    }
    for (const { name, structName, value } of implicitlyConstructed) {
      decls.push(`    local ${name}: ${structName};`);
      const key = `${name}.v`;
      env.set(key, value);
      const place = { type: INT, code: key, key };
      this.scope.push(place);
      printed.push(place);
    }
    if (this.threeLevel) {
      const z = this.threeLevel;
      const fields = ["x", "y", "z"];
      z.names.forEach((structName, level) => {
        const local = this.fresh("zo");
        const inits = fields
          .slice(0, level + 1)
          .map(() => guard(this.expr(z.type, 2, false)));
        decls.push(
          `    local ${local}: ${structName} = ${structName} { ${inits.map((init, field) => `${fields[field]}: ${init.code}`).join(", ")} };`,
        );
        inits.forEach((init, field) => {
          const key = `${local}.${fields[field]}`;
          env.set(key, convert(init.eval(env), z.type));
          const place = { type: z.type, code: key, key };
          this.scope.push(place);
          printed.push(place);
        });
        z.locals.push(local);
      });
      const target = this.int(0, 2);
      decls.push(
        `    local ${z.pointer}: *${z.names[0]} = &${z.locals[target]!};`,
      );
      env.set(`${z.pointer}.dyn`, BigInt(target));
      z.ready = true;
    }
    if (this.nestedEnums) {
      const nested = this.nestedEnums;
      for (let index = this.int(1, 2); index > 0; index--) {
        const name = this.fresh("no");
        const value = this.outerEnumValue(nested);
        decls.push(`    local ${name}: ${nested.outer} = ${value.code};`);
        env.set(name, value.eval(env));
        nested.locals.push(name);
      }
      const holder = this.fresh("hd");
      const e = this.innerEnumValue(nested);
      const items = [this.innerEnumValue(nested), this.innerEnumValue(nested)];
      decls.push(
        `    local ${holder}: ${nested.holderName} = ${nested.holderName} { e: ${e.code}, arr: [${items.map((item) => item.code).join(", ")}] };`,
      );
      env.set(`${holder}.e`, e.eval(env));
      items.forEach((item, slot) =>
        env.set(`${holder}.arr[${slot}]`, item.eval(env)),
      );
      nested.holders.push(holder);
    }
    if (this.chance(0.5)) {
      const first = this.intType();
      const second = this.intType();
      const name = this.fresh("ta");
      const values = [0, 1].map(() => [
        guard(this.expr(first, 2, false)),
        guard(this.expr(second, 2, false)),
      ]);
      decls.push(
        `    local ${name}: (${first.name}, ${second.name})[2] = [${values.map(([a, b]) => `(${a!.code}, ${b!.code})`).join(", ")}];`,
      );
      values.forEach(([a, b], slot) => {
        env.set(`${name}[${slot}].0`, convert(a!.eval(env), first));
        env.set(`${name}[${slot}].1`, convert(b!.eval(env), second));
      });
      this.tupleArrays.push({ name, first, second });
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const name = this.fresh("ntf");
      const a = this.fresh("nt");
      const b = this.fresh("nt");
      const c = this.fresh("nt");
      const t = type.name;
      functionsAfterMain.push(
        `frame ${name}(x: ${t}) ret ((${t}, u8), long) {\n    return ((x, cast<u8>(x)), cast<long>(x) + cast<long>(1));\n}`,
      );
      const arg = guard(this.expr(type, 2, false));
      decls.push(
        `    local ((${a}: ${t}, ${b}: u8), ${c}: long) = ${name}(${arg.code});`,
      );
      const x = convert(arg.eval(env), type);
      const u8 = INT_TYPES[1]!;
      for (const [local, localType, value] of [
        [a, type, x],
        [b, u8, convert(x, u8)],
        [c, LONG, wrap((convert(x, LONG) as bigint) + 1n, LONG)],
      ] as const) {
        env.set(local, value);
        const place = { type: localType, code: local, key: local };
        this.scope.push(place);
        printed.push(place);
      }
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const t = type.name;
      const name = this.fresh("lf");
      const captured = this.fresh("lc");
      const init = guard(this.expr(type, 2, false));
      const constant = BigInt(this.int(1, 90));
      const a = this.fresh("la");
      const b = this.fresh("lb");
      decls.push(
        `    local ${captured}: ${t} = ${init.code};`,
        `    local ${name}: Lambda<${t}>(${t})[2] = [|${a}: ${t}| ret ${t} { return ${a} + ${captured}; }, |${b}: ${t}| ret ${t} { return ${b} ^ cast<${t}>(${constant}); }];`,
      );
      const capturedValue = convert(init.eval(env), type) as bigint;
      env.set(`${name}[0]`, 0n);
      env.set(`${name}[1]`, 1n);
      this.lambdaArrays.push({
        name,
        type,
        captured: capturedValue,
        constant: convert(constant, type) as bigint,
      });
    }
    for (const struct of this.structs) {
      if (!this.chance(0.3)) continue;
      // `global gsK: S;` starts zeroed; struct initializers are not constant.
      const name = this.fresh("gs");
      lines.push(`global ${name}: ${struct.name};`);
      struct.fields.forEach((type, field) =>
        env.set(
          `${name}.f${field}`,
          type.kind === "bool" ? false : type.kind === "float" ? 0 : 0n,
        ),
      );
      addInstance(name, struct);
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const alias = `A${this.fresh("")}`;
      lines.push(`type ${alias} = ${type.name};`);
      const name = this.fresh("v");
      const init = guard(this.expr(type, 2, false));
      decls.push(`    local ${name}: ${alias} = ${init.code};`);
      env.set(name, convert(init.eval(env), type));
      const place = { type, code: name, key: name };
      this.scope.push(place);
      printed.push(place);
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const name = this.fresh("c");
      const init = guard(this.expr(type, 2, false));
      decls.push(`    local const ${name}: ${type.name} = ${init.code};`);
      env.set(name, convert(init.eval(env), type));
      const place = { type, code: name, key: name, readonly: true };
      this.scope.push(place);
      printed.push(place);
    }
    if (this.chance(0.6)) {
      const type = this.intType();
      const name = this.fresh("m");
      const sum = this.fresh("sum");
      const set = this.fresh("set");
      const row = `R${this.fresh("")}`;
      const cells = [0, 1].map(() =>
        [0, 1].map(() => guard(this.expr(type, 1, false))),
      );
      lines.push(`type ${row} = ${type.name}[2];`);
      functionsAfterMain.push(
        `frame ${set}(p: *${row}, v: ${type.name}) {\n    (*p)[1] = v;\n}`,
        `frame ${sum}(g: ${type.name}[2][2], d: int) ret ${type.name} {\n    g[d & 1][0] = g[1][1];\n    return g[0][0] + g[1][0];\n}`,
      );
      decls.push(
        `    local ${name}: ${type.name}[2][2] = [${cells.map((cols) => `[${cols.map((cell) => cell.code).join(", ")}]`).join(", ")}];`,
      );
      cells.forEach((cols, i) =>
        cols.forEach((cell, j) =>
          env.set(`${name}[${i}][${j}]`, convert(cell.eval(env), type)),
        ),
      );
      const addGrid = (local: string) => {
        for (const i of [0, 1]) {
          for (const j of [0, 1]) {
            const key = `${local}[${i}][${j}]`;
            const place = { type, code: key, key };
            this.scope.push(place);
            printed.push(place);
          }
        }
        this.grids.push({ name: local, type, sum, set });
      };
      addGrid(name);
      if (this.chance(0.5)) {
        // A copied grid holds its own rows (value semantics).
        const copy = this.fresh("m");
        decls.push(`    local ${copy}: ${type.name}[2][2] = ${name};`);
        for (const i of [0, 1]) {
          for (const j of [0, 1]) {
            env.set(`${copy}[${i}][${j}]`, env.get(`${name}[${i}][${j}]`)!);
          }
        }
        addGrid(copy);
      }
    }
    if (this.chance(0.5)) {
      const a = this.intType();
      const b = this.intType();
      const name = this.fresh("pr");
      const swapped = this.fresh("pr");
      const left = guard(this.expr(a, 2, false));
      const right = guard(this.expr(b, 2, false));
      decls.push(
        `    local ${name}: Pr<${a.name}, ${b.name}> = Pr<${a.name}, ${b.name}> { a: ${left.code}, b: ${right.code} };`,
        `    local ${swapped}: Pr<${b.name}, ${a.name}> = ${name}.swap();`,
      );
      const x = convert(left.eval(env), a);
      const y = convert(right.eval(env), b);
      env.set(`${name}.a`, x);
      env.set(`${name}.b`, y);
      env.set(`${swapped}.a`, y);
      env.set(`${swapped}.b`, x);
      for (const [local, field, type] of [
        [name, "a", a],
        [name, "b", b],
        [swapped, "a", b],
        [swapped, "b", a],
      ] as const) {
        const key = `${local}.${field}`;
        const place = { type, code: key, key };
        this.scope.push(place);
        printed.push(place);
      }
      this.pairs.push({ name, swapped });
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const name = this.fresh("bb");
      const init = guard(this.expr(type, 2, false));
      decls.push(
        `    local ${name}: Box<Box<${type.name}>> = Box<Box<${type.name}>> { v: Box<${type.name}> { v: ${init.code} } };`,
      );
      const key = `${name}.v.v`;
      env.set(key, convert(init.eval(env), type));
      const place = { type, code: key, key };
      this.scope.push(place);
      printed.push(place);
      this.nestedBoxes.push({ name, type });
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const struct = `H${this.fresh("")}`;
      const firstName = this.fresh("hf");
      const secondName = this.fresh("hg");
      const first = BigInt(this.int(1, 90));
      const second = BigInt(this.int(1, 90));
      lines.push(
        `frame ${firstName}(x: ${type.name}) ret ${type.name} {\n    return x + cast<${type.name}>(${first});\n}`,
        `frame ${secondName}(x: ${type.name}) ret ${type.name} {\n    return x ^ cast<${type.name}>(${second});\n}`,
        `struct ${struct} {\n    f: Func<${type.name}>(${type.name}),\n    k: ${type.name},\n    frame run(this: *${struct}, x: ${type.name}) ret ${type.name} {\n        return this.f(x) + this.k;\n    }\n}`,
      );
      const name = this.fresh("h");
      const init = guard(this.expr(type, 2, false));
      decls.push(
        `    local ${name}: ${struct} = ${struct} { f: ${firstName}, k: ${init.code} };`,
      );
      env.set(`${name}.fn`, 0n);
      env.set(`${name}.k`, convert(init.eval(env), type));
      const key = `${name}.k`;
      const place = { type, code: key, key };
      this.scope.push(place);
      printed.push(place);
      this.holders.push({
        name,
        type,
        firstName,
        secondName,
        first: convert(first, type) as bigint,
        second: convert(second, type) as bigint,
      });
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const name = this.fresh("cur");
      const applied = this.fresh("add");
      const offset = BigInt(this.int(0, 50));
      const a = this.fresh("ca");
      const b = this.fresh("cb");
      const t = type.name;
      decls.push(
        `    local ${name}: Lambda<Lambda<${t}>(${t})>(${t}) = |${a}: ${t}| ret Lambda<${t}>(${t}) { return |${b}: ${t}| ret ${t} { return (${a} ^ ${b}) + cast<${t}>(${offset}); }; };`,
      );
      const arg = guard(this.expr(type, 2, false));
      decls.push(
        `    local ${applied}: Lambda<${t}>(${t}) = ${name}(${arg.code});`,
      );
      this.curried.push({
        name,
        applied,
        type,
        offset: convert(offset, type) as bigint,
        bound: convert(arg.eval(env), type) as bigint,
      });
    }
    if (this.operators) {
      const ops = this.operators;
      for (let index = this.int(2, 3); index > 0; index--) {
        const name = this.fresh("q");
        const a = guard(this.expr(ops.a, 2, false));
        const b = guard(this.expr(ops.b, 2, false));
        decls.push(
          `    local ${name}: ${ops.name} = ${ops.name} { a: ${a.code}, b: ${b.code} };`,
        );
        env.set(`${name}.a`, convert(a.eval(env), ops.a));
        env.set(`${name}.b`, convert(b.eval(env), ops.b));
        for (const [field, type] of [
          ["a", ops.a],
          ["b", ops.b],
        ] as const) {
          const key = `${name}.${field}`;
          const place = { type, code: key, key };
          this.scope.push(place);
          printed.push(place);
        }
        ops.locals.push(name);
      }
    }
    if (hasOption) {
      for (let index = this.int(1, 2); index > 0; index--) {
        const type = this.intType();
        const name = this.fresh("ok");
        const value = this.optionValue(type);
        decls.push(`    local ${name}: Opt<${type.name}> = ${value.code};`);
        env.set(name, value.eval(env));
        this.options.push({ name, type });
      }
    }
    for (let index = this.int(0, 2); index > 0; index--) {
      const name = this.fresh("str");
      const { literal, bytes } = this.stringConstant();
      decls.push(`    local ${name}: string = ${literal};`);
      printedStrings.push({ name, bytes });
      this.strings.push({ name, bytes, global: false });
    }
    for (const struct of this.structs) {
      if (!this.chance(0.4)) continue;
      const name = this.fresh("sa");
      const slice = this.fresh("sv");
      functionsAfterMain.push(
        `frame ${slice}(xs: ${struct.name}[], d: int) {\n    xs[d & 1] = xs[(d + 1) & 1];\n}`,
      );
      const elements = [0, 1].map(() =>
        struct.fields.map((type) => guard(this.expr(type, 2, false))),
      );
      const literals = elements.map(
        (inits) =>
          `${struct.name} { ${inits.map((init, field) => `f${field}: ${init.code}`).join(", ")} }`,
      );
      decls.push(
        `    local ${name}: ${struct.name}[2] = [${literals.join(", ")}];`,
      );
      elements.forEach((inits, slot) =>
        inits.forEach((init, field) =>
          env.set(
            `${name}[${slot}].f${field}`,
            convert(init.eval(env), struct.fields[field]!),
          ),
        ),
      );
      const addStructArray = (local: string) => {
        for (const slot of [0, 1]) {
          struct.fields.forEach((type, field) => {
            const key = `${local}[${slot}].f${field}`;
            const place = { type, code: key, key };
            this.scope.push(place);
            printed.push(place);
          });
        }
        this.structArrays.push({ name: local, struct, slice });
      };
      addStructArray(name);
      if (this.chance(0.5)) {
        // A copied array holds its own elements (value semantics).
        const copy = this.fresh("sa");
        decls.push(`    local ${copy}: ${struct.name}[2] = ${name};`);
        for (const slot of [0, 1]) {
          struct.fields.forEach((_, field) =>
            env.set(
              `${copy}[${slot}].f${field}`,
              env.get(`${name}[${slot}].f${field}`)!,
            ),
          );
        }
        addStructArray(copy);
      }
      if (this.chance(0.5)) {
        const pointer = this.fresh("sp");
        const slot = this.int(0, 1);
        decls.push(
          `    local ${pointer}: *${struct.name} = &${name}[${slot}];`,
        );
        this.elementPointers.push({
          name: pointer,
          target: `${name}[${slot}]`,
          struct,
        });
        struct.fields.forEach((type, field) =>
          printed.push({
            type,
            code: `${pointer}.f${field}`,
            key: `${name}[${slot}].f${field}`,
          }),
        );
      }
    }
    for (const instance of this.instances) {
      const { methods, mutators } = instance.struct;
      if (methods.length > 0 && this.chance(0.4)) {
        const method = this.pick(methods);
        const name = this.fresh("bm");
        decls.push(
          `    local ${name}: Lambda<${method.returnType.name}>(int) = ${instance.name}.${method.name};`,
        );
        this.boundMethods.push({ name, instance, method });
      }
      if (mutators.length > 0 && this.chance(0.3)) {
        const mutator = this.pick(mutators);
        const name = this.fresh("bu");
        decls.push(
          `    local ${name}: Lambda<void>(int) = ${instance.name}.${mutator.name};`,
        );
        const bound = { name, instance, mutator };
        this.boundMutators.push(bound);
        // Called once here, so the local is used even if no statement is.
        const arg = guard(this.expr(INT, 2, false));
        decls.push(`    ${name}(${arg.code});`);
        this.runBoundMutator(bound, arg.eval(env), env);
      }
    }
    if (this.structs.length > 0 && this.chance(0.5)) {
      lines.push(this.outerDefinition());
      const outer = this.outer!;
      // Places of one outer local: x, inner.fK and arr (masked index).
      const declareOuter = (name: string, values: Value[]) => {
        const keys = this.outerKeys(name);
        keys.forEach((key, slot) => env.set(key, values[slot]!));
        this.scope.push({
          type: outer.xType,
          code: `${name}.x`,
          key: keys[0]!,
        });
        outer.inner.fields.forEach((type, field) => {
          const key = `${name}.inner.f${field}`;
          this.scope.push({ type, code: key, key });
        });
        this.scope.push({
          type: outer.arrType,
          code: `${name}.arr`,
          key: `${name}.arr`,
          array: { base: `${name}.arr`, length: 4 },
        });
        keys.forEach((key, slot) =>
          printed.push({ type: this.outerSlotType(slot), code: key, key }),
        );
        outer.locals.push(name);
      };
      const first = this.fresh("o");
      const x = guard(this.expr(outer.xType, 2, false));
      const fields = outer.inner.fields.map((type) =>
        guard(this.expr(type, 2, false)),
      );
      const elements = [0, 1, 2, 3].map(() =>
        guard(this.expr(outer.arrType, 1, false)),
      );
      decls.push(
        `    local ${first}: ${outer.name} = ${outer.name} { x: ${x.code}, inner: ${outer.inner.name} { ${fields.map((field, index) => `f${index}: ${field.code}`).join(", ")} }, arr: [${elements.map((element) => element.code).join(", ")}] };`,
      );
      declareOuter(first, [
        convert(x.eval(env), outer.xType),
        ...fields.map((field, index) =>
          convert(field.eval(env), outer.inner.fields[index]!),
        ),
        ...elements.map((element) => convert(element.eval(env), outer.arrType)),
      ]);
      if (this.chance(0.6)) {
        // A copy holds its own inner struct and array (value semantics).
        const copy = this.fresh("o");
        decls.push(`    local ${copy}: ${outer.name} = ${first};`);
        declareOuter(
          copy,
          this.outerKeys(first).map((key) => env.get(key)!),
        );
      }
      if (this.chance(0.5)) {
        const made = this.fresh("o");
        const arg = guard(this.expr(INT, 2, false));
        decls.push(
          `    local ${made}: ${outer.name} = ${outer.name}.mk(${arg.code});`,
        );
        declareOuter(made, this.outerMake(arg.eval(env), env));
      }
    }
    if (this.chance(0.5)) {
      const type = this.intType();
      const name = this.fresh("b");
      const init = guard(this.expr(type, 2, false));
      decls.push(
        `    local ${name}: Box<${type.name}> = Box<${type.name}> { v: ${init.code} };`,
      );
      env.set(`${name}.v`, convert(init.eval(env), type));
      const place = { type, code: `${name}.v`, key: `${name}.v` };
      this.scope.push(place);
      printed.push(place);
      this.boxes.push({ name, type });
    }
    if (this.enumDef) {
      for (let index = this.int(1, 2); index > 0; index--) {
        const name = this.fresh("e");
        const variant = this.variantValue();
        decls.push(
          `    local ${name}: ${this.enumDef.name} = ${variant.code};`,
        );
        env.set(name, variant.eval(env));
        this.enumLocals.push(name);
      }
    }
    if (this.chance(0.7)) {
      const type = this.intType();
      const name = this.fresh("a");
      const length = 4;
      const inits = Array.from({ length }, () =>
        guard(this.expr(type, 1, false)),
      );
      decls.push(
        `    local ${name}: ${type.name}[${length}] = [${inits.map((init) => init.code).join(", ")}];`,
      );
      inits.forEach((init, slot) => {
        const key = `${name}[${slot}]`;
        env.set(key, convert(init.eval(env), type));
        printed.push({ type, code: key, key });
      });
      this.scope.push({
        type,
        code: name,
        key: name,
        array: { base: name, length },
      });
      // Helpers after main: one takes the array by value, one a slice.
      const byValue = this.fresh("av");
      const slice = this.fresh("sl");
      const pointer = this.fresh("pa");
      functionsAfterMain.push(
        `frame ${byValue}(xs: ${type.name}[4], d: int) ret ${type.name} {\n    xs[d & 3] = xs[(d + 1) & 3] ^ xs[2];\n    return xs[0] + xs[d & 3];\n}`,
        `frame ${slice}(xs: ${type.name}[], d: int) {\n    xs[d & 3] = xs[d & 3] + xs[(d + 2) & 3];\n}`,
      );
      decls.push(`    local ${pointer}: *${type.name} = &${name}[0];`);
      this.mainArray = { name, type, byValue, slice, pointer };
      // Used at least once, and checked: reads element 1 through `pointer`.
      printed.push({ type, code: `*(${pointer} + 1)`, key: `${name}[1]` });
      if (this.chance(0.6)) {
        const view = this.fresh("vw");
        decls.push(`    local ${view}: ${type.name}[] = ${name};`);
        this.mainArray.view = view;
        printed.push({ type, code: `${view}[2]`, key: `${name}[2]` });
      }
    }
    if (this.hierarchy) {
      const h = this.hierarchy;
      const all = [...h.parentFields, ...h.childFields];
      const declareLocal = (name: string, dynamic: "parent" | "child") => {
        const types = dynamic === "child" ? all : h.parentFields;
        const typeName = dynamic === "child" ? h.child : h.parent;
        const inits = types.map((type) => guard(this.expr(type, 2, false)));
        decls.push(
          `    local ${name}: ${typeName} = ${typeName} { ${inits.map((init, field) => `f${field}: ${init.code}`).join(", ")} };`,
        );
        types.forEach((type, field) => {
          const key = `${name}.f${field}`;
          env.set(key, convert(inits[field]!.eval(env), type));
          const place = { type, code: key, key };
          this.scope.push(place);
          printed.push(place);
        });
        h.locals.push({ name, dynamic });
      };
      const childLocal = this.fresh("c");
      declareLocal(childLocal, "child");
      if (this.chance(0.7)) declareLocal(this.fresh("pp"), "parent");
      if (this.chance(0.6)) {
        // Struct slicing: a parent copy of the child is a parent (R-CONV-7).
        const sliced = this.fresh("sl");
        decls.push(`    local ${sliced}: ${h.parent} = ${childLocal};`);
        h.parentFields.forEach((type, field) => {
          const key = `${sliced}.f${field}`;
          env.set(key, env.get(`${childLocal}.f${field}`)!);
          const place = { type, code: key, key };
          this.scope.push(place);
          printed.push(place);
        });
        h.locals.push({ name: sliced, dynamic: "parent" });
      }
      if (this.chance(0.6)) {
        const pointer = this.fresh("up");
        decls.push(`    local ${pointer}: *${h.parent} = &${childLocal};`);
        h.pointers.push({ name: pointer, target: childLocal });
        h.typed.push({ name: pointer, child: true });
        printedCalls.push(pointer);
      }
      const parentLocal = h.locals.find((local) => local.dynamic === "parent");
      if (parentLocal && this.chance(0.6)) {
        // A `*Parent` to a parent object: `is *Child` is false.
        const pointer = this.fresh("uq");
        decls.push(
          `    local ${pointer}: *${h.parent} = &${parentLocal.name};`,
        );
        h.typed.push({ name: pointer, child: false });
        printedTyped.push(pointer);
      }
    }

    // Tuples: a function returning two values, destructured into locals.
    if (this.chance(0.5)) {
      const name = this.fresh("tup");
      const param = this.intType();
      const types = [this.scalarType(), this.scalarType()];
      const saved = this.scope;
      this.scope = [
        ...this.globals,
        { type: param, code: "x", key: "x", readonly: true },
      ];
      this.inFunctionBody = true;
      const values = types.map((type) => guard(this.expr(type, 2, false)));
      this.inFunctionBody = false;
      this.scope = saved;
      const used = values.some((value) => value.reads.has("x")) ? "x" : "_x";
      functionsAfterMain.push(
        `frame ${name}(${used}: ${param.name}) ret (${types.map((type) => type.name).join(", ")}) {\n    return (${values.map((value) => value.code).join(", ")});\n}`,
      );
      const arg = guard(this.expr(param, 2, false));
      const locals = types.map(() => this.fresh("t"));
      decls.push(
        `    local (${locals.map((local, slot) => `${local}: ${types[slot]!.name}`).join(", ")}) = ${name}(${arg.code});`,
      );
      const callEnv = this.callEnv(env);
      callEnv.set("x", convert(arg.eval(env), param));
      locals.forEach((local, slot) => {
        env.set(local, convert(values[slot]!.eval(callEnv), types[slot]!));
        const place = { type: types[slot]!, code: local, key: local };
        this.scope.push(place);
        printed.push(place);
      });
    }

    // Each counter may get a lambda writing it through a captured pointer.
    for (const counter of this.counters) {
      if (!this.chance(0.5)) continue;
      const pointer = this.fresh("cp");
      const name = this.fresh("cl");
      const type = counter.type.name;
      decls.push(
        `    local ${pointer}: *${type} = &${counter.name};`,
        `    local ${name}: Lambda<${type}>(${type}) = |d: ${type}| ret ${type} {\n        *${pointer} = *${pointer} + d;\n        return *${pointer};\n    };`,
      );
      // Called once so the local is used even if no expression picks it.
      const callArg = this.literal(counter.type);
      decls.push(`    ${name}(${guard(callArg).code});`);
      env.set(
        counter.name,
        wrap(
          (env.get(counter.name) as bigint) +
            (convert(callArg.eval(env), counter.type) as bigint),
          counter.type,
        ),
      );
      this.counterLambdas.push({ name, counter });
    }

    // Lambdas capture by value, so they only read plain locals and fields.
    for (let index = this.int(0, 2); index > 0; index--) {
      const name = this.fresh("l");
      const param = this.intType();
      const paramName = this.fresh("x");
      const returnType = this.scalarType();
      const saved = this.scope;
      this.scope = [
        ...saved.filter(
          (place) => !place.array && !place.code.startsWith("(*"),
        ),
        { type: param, code: paramName, key: paramName, readonly: true },
      ];
      this.inLambdaBody = true;
      let body: Expr;
      try {
        body = guard(this.expr(returnType, 2, false));
      } finally {
        this.inLambdaBody = false;
      }
      this.scope = saved;
      const usedName = body.reads.has(paramName) ? paramName : `_${paramName}`;
      decls.push(
        `    local ${name}: Lambda<${returnType.name}>(${param.name}) = |${usedName}: ${param.name}| ret ${returnType.name} {\n        return ${body.code};\n    };`,
      );
      let apply: string | undefined;
      if (this.chance(0.5)) {
        apply = this.fresh("apply");
        functionsAfterMain.push(
          `frame ${apply}(f: Lambda<${returnType.name}>(${param.name}), x: ${param.name}) ret ${returnType.name} {\n    return f(x);\n}`,
        );
      }
      const lambda = {
        name,
        param,
        paramName,
        returnType,
        body,
        snapshot: new Map(env),
        apply,
      };
      this.lambdas.push(lambda);
      printedLambdas.push(lambda);
    }

    // Pointers alias a local or field: writes through `*p` change it.
    const aliasable = this.scope.filter(
      (place) =>
        !place.array &&
        !place.readonly &&
        !place.key.startsWith("g") &&
        place.type.kind === "int",
    );
    for (
      let index = this.int(0, 2);
      index > 0 && aliasable.length > 0;
      index--
    ) {
      const target = this.pick(aliasable);
      const name = this.fresh("ptr");
      decls.push(`    local ${name}: *${target.type.name} = &${target.code};`);
      const place = { type: target.type, code: `(*${name})`, key: target.key };
      this.scope.push(place);
      printed.push(place);
    }

    for (const global of this.globals) {
      if (!global.array) {
        printed.push(global);
        continue;
      }
      for (let slot = 0; slot < global.array.length; slot++) {
        const key = `${global.array.base}[${slot}]`;
        printed.push({ type: global.type, code: key, key });
      }
    }
    for (const counter of this.counters) {
      printed.push({
        type: counter.type,
        code: counter.name,
        key: counter.name,
      });
    }

    const statements = Array.from({ length: this.int(3, 12) }, () =>
      this.statement(2),
    );

    const printAll = (): string[] => [
      ...printed.map((place) =>
        this.printValue(
          place.code.replace(/[^A-Za-z0-9_]/g, "_"),
          place.code,
          place.type,
          env.get(place.key)!,
          output,
        ),
      ),
      ...printedLambdas.map((lambda) =>
        this.printValue(
          `${lambda.name}_1`,
          `${lambda.name}(cast<${lambda.param.name}>(1))`,
          lambda.returnType,
          this.callLambda(lambda, env, 1n),
          output,
        ),
      ),
      // Every `Func` local is used at least once: called with all ones.
      ...this.funcPointers.map((pointer) => {
        const { helper } = pointer;
        const callEnv = this.callEnv(env);
        helper.params.forEach((param) =>
          callEnv.set(param.name, convert(1n, param.type)),
        );
        return this.printValue(
          `${pointer.name}_1`,
          `${pointer.name}(${helper.params.map((param) => `cast<${param.type.name}>(1)`).join(", ")})`,
          helper.returnType,
          convert(helper.body.eval(callEnv), helper.returnType),
          output,
        );
      }),
      ...this.enumLocals.flatMap((local) => this.printEnum(local, env, output)),
      ...this.options.flatMap((local) => this.printOption(local, env, output)),
      ...printedStrings.map(({ name, bytes }) =>
        this.printValue(
          `${name}_0`,
          `cast<int>(${name}[0])`,
          INT,
          BigInt.asIntN(8, BigInt(bytes[0] ?? 0)),
          output,
        ),
      ),
      ...printedSpecObjects.map(({ name, instance }) =>
        this.printValue(
          `${name.replace(/\W/g, "_")}_end`,
          `${name}.val(1)`,
          LONG,
          convert(
            instance.struct.specVal!.eval(
              this.receiverEnv(env, instance.name, instance.struct, 1n),
            ),
            LONG,
          ),
          output,
        ),
      ),
      ...(this.threeLevel
        ? [
            this.printValue(
              `${this.threeLevel.pointer}_who`,
              `${this.threeLevel.pointer}.who()`,
              INT,
              BigInt(this.zTarget(this.threeLevel, env) + 1),
              output,
            ),
          ]
        : []),
      ...(this.nestedEnums
        ? [
            ...this.nestedEnums.locals.map((local) =>
              this.printValue(
                local,
                `${this.nestedEnums!.outerDigest}(${local})`,
                LONG,
                this.outerDigest(env.get(local) as EnumValue),
                output,
              ),
            ),
            ...this.nestedEnums.holders.flatMap((holder) =>
              ["e", "arr[0]", "arr[1]"].map((slot) =>
                this.printValue(
                  `${holder}_${slot.replace(/\W/g, "_")}`,
                  `${this.nestedEnums!.innerDigest}(${holder}.${slot})`,
                  LONG,
                  this.innerDigest(env.get(`${holder}.${slot}`) as EnumValue),
                  output,
                ),
              ),
            ),
          ]
        : []),
      ...this.tupleArrays.flatMap((array) =>
        [0, 1].flatMap((slot) =>
          [
            ["0", array.first, "(x, _y)", "x"],
            ["1", array.second, "(_x, y)", "y"],
          ].map(([field, type, pattern, value]) =>
            this.printValue(
              `${array.name}_${slot}_${field as string}`,
              `(match (${array.name}[${slot}]) { ${pattern as string} => ${value as string} })`,
              type as IntType,
              env.get(`${array.name}[${slot}].${field as string}`)!,
              output,
            ),
          ),
        ),
      ),
      ...this.lambdaArrays.flatMap((array) =>
        [0n, 1n].map((slot) =>
          this.printValue(
            `${array.name}_${slot}`,
            `${array.name}[${slot}](cast<${array.type.name}>(1))`,
            array.type,
            this.lambdaArrayCall(array, slot, 1n, env),
            output,
          ),
        ),
      ),
      ...this.holders.map((holder) =>
        this.printValue(
          `${holder.name}_end`,
          `${holder.name}.run(cast<${holder.type.name}>(1))`,
          holder.type,
          wrap(
            this.holderCall(holder, 1n, env) +
              (env.get(`${holder.name}.k`) as bigint),
            holder.type,
          ),
          output,
        ),
      ),
      ...this.curried.map((curried) =>
        this.printValue(
          `${curried.applied}_end`,
          `${curried.applied}(cast<${curried.type.name}>(1))`,
          curried.type,
          this.curriedValue(curried, curried.bound, 1n),
          output,
        ),
      ),
      ...this.boundMethods.map(({ name, instance, method }) =>
        this.printValue(
          `${name}_end`,
          `${name}(1)`,
          method.returnType,
          convert(
            method.body.eval(
              this.receiverEnv(env, instance.name, instance.struct, 1n),
            ),
            method.returnType,
          ),
          output,
        ),
      ),
      ...printedTyped.map((pointer) =>
        this.printValue(
          `${pointer}_is`,
          `cast<int>(${pointer} is *${this.hierarchy!.child})`,
          INT,
          0n,
          output,
        ),
      ),
      ...printedCalls.map((pointer) => {
        const h = this.hierarchy!;
        const target = h.pointers.find(
          (candidate) => candidate.name === pointer,
        )!.target;
        const callEnv = this.callEnv(env);
        [...h.parentFields, ...h.childFields].forEach((_, field) =>
          callEnv.set(`this.f${field}`, env.get(`${target}.f${field}`)!),
        );
        callEnv.set("d", 1n);
        const value = convert(h.childBody.eval(callEnv), h.returnType);
        return this.printValue(
          `${pointer}_vf`,
          `${pointer}.vf(1)`,
          h.returnType,
          value,
          output,
        );
      }),
    ];

    // With `trace`, every top-level statement is followed by a full dump, so
    // the first diverging line points at the statement that miscompiled.
    const body: string[] = [];
    statements.forEach((statement, index) => {
      statement.exec(env);
      body.push(statement.code("    "));
      if (this.trace) {
        output.push(`after statement ${index}`);
        body.push(`    printf("after statement ${index}\\n");`);
        body.push(...printAll());
      }
    });
    const prints = printAll();

    lines.push(
      [
        "frame main() ret int {",
        ...decls,
        ...body,
        ...prints,
        "    return 0;",
        "}",
      ].join("\n"),
      ...functionsAfterMain,
    );
    const expectedStdout = output.map((line) => `${line}\n`).join("");
    lines.push(...output.map((line) => `${EXPECT_MARKER}${line}`));
    return { source: lines.join("\n") + "\n", expectedStdout };
  }
}

/**
 * The checker rejects a literal that does not fit its destination
 * (BPL_INTEGER_LITERAL_OVERFLOW), also inside ternary branches. Values that
 * flow into a typed destination therefore never stay bare `int` literals.
 */
function guard(expr: Expr): Expr {
  // Folded constants count too (`-(3)`); an explicit cast never does.
  return expr.constant && expr.type === INT && !expr.code.startsWith("cast<")
    ? { ...expr, code: `cast<int>(${expr.code})` }
    : expr;
}

/** `thrK(x, limit)`: `x ^ offset`, or throws `x * scale + offset`. */
function callThrower(thrower: Thrower, x: bigint, limit: bigint): bigint {
  if (x > limit) {
    const thrown = convert(x, thrower.throwType) as bigint;
    throw new Thrown(
      wrap(thrown * thrower.scale + thrower.offset, thrower.throwType),
      thrower.throwType,
    );
  }
  return wrap(x ^ thrower.offset, INT);
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a, ...b]);
}

function applyIntOp(op: string, a: bigint, b: bigint, type: IntType): bigint {
  switch (op) {
    case "+":
      return wrap(a + b, type);
    case "-":
      return wrap(a - b, type);
    case "*":
      return wrap(a * b, type);
    case "&":
      return wrap(a & b, type);
    case "|":
      return wrap(a | b, type);
    default:
      return wrap(a ^ b, type);
  }
}

function binary(type: IntType, op: string, left: Expr, right: Expr): Expr {
  return {
    type,
    code: `(${left.code}) ${op} (${right.code})`,
    constant: left.constant && right.constant,
    reads: union(left.reads, right.reads),
    eval: (env) =>
      applyIntOp(
        op,
        left.eval(env) as bigint,
        convert(right.eval(env), type) as bigint,
        type,
      ),
  };
}

/** Generate one program and the stdout it must print. */
export function generateOracleProgram(
  rng: () => number,
  options: { trace?: boolean; wasm?: boolean } = {},
): GeneratedProgram {
  return new ProgramBuilder(rng, options.trace, options.wasm).build();
}

/** The expected stdout recorded in a generated program, if any. */
export function readExpectedStdout(source: string): string | undefined {
  const lines = source
    .split("\n")
    .filter((line) => line.startsWith(EXPECT_MARKER))
    .map((line) => `${line.slice(EXPECT_MARKER.length)}\n`);
  return lines.length > 0 ? lines.join("") : undefined;
}
