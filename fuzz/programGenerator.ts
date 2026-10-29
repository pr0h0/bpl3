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
 * the array length.
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

interface Stmt {
  code(indent: string): string;
  exec(env: Env): Signal;
  /** For `defer`: capture values now, return the code to run at block exit. */
  defer?(env: Env): () => void;
}

/** Run a block; deferred statements run last-in, first-out at its exit. */
function execBlock(statements: Stmt[], env: Env): Signal {
  const deferred: (() => void)[] = [];
  let signal: Signal;
  for (const statement of statements) {
    if (statement.defer) {
      deferred.push(statement.defer(env));
      continue;
    }
    signal = statement.exec(env);
    if (signal) break;
  }
  for (const run of deferred.reverse()) run();
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
}

/** A struct-typed local in main. */
interface Instance {
  name: string;
  struct: StructDef;
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
  /** Disables calls, e.g. inside deferred expressions. */
  private plainOnly = false;
  /** In a function other than main, main's locals are out of reach. */
  private inFunctionBody = false;
  private readonly mutators: Mutator[] = [];
  /** `local bK: Box<T>` locals, whose `.v` is also read through `get()`. */
  private readonly boxes: { name: string; type: IntType }[] = [];
  /** Places visible in the current function, by type name. */
  private scope: Place[] = [];
  /** Enclosing loops, so break/continue are only generated inside one. */
  private loopDepth = 0;

  constructor(
    private readonly rng: () => number,
    private readonly trace = false,
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
    const places = this.scope.filter((place) => place.type.name === type.name);
    if (places.length === 0) return undefined;
    const place = this.pick(places);
    if (place.array) {
      const index = this.expr(INT, 1, false);
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
    const choice = this.int(0, constantOnly ? 5 : this.plainOnly ? 6 : 15);
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
        // Divisor masked into 1..8: never zero, never MIN / -1.
        const left = this.expr(type, depth - 1, constantOnly);
        const right = this.expr(type, depth - 1, constantOnly);
        const op = this.pick(["/", "%"]);
        return {
          type,
          code: `(${left.code}) ${op} (((${right.code}) & 7) + 1)`,
          constant: left.constant && right.constant,
          reads: union(left.reads, right.reads),
          eval: (env) => {
            const a = left.eval(env) as bigint;
            const b = wrap(
              (wrap(right.eval(env) as bigint, type) & 7n) + 1n,
              type,
            );
            return wrap(op === "/" ? a / b : a % b, type);
          },
        };
      }
      case 4: {
        // Shift count masked below the narrowest width.
        const left = this.expr(type, depth - 1, constantOnly);
        const count = this.expr(type, depth - 1, constantOnly);
        const op = this.pick(["<<", ">>"]);
        return {
          type,
          code: `(${left.code}) ${op} ((${count.code}) & 7)`,
          constant: left.constant && count.constant,
          reads: union(left.reads, count.reads),
          eval: (env) => {
            const a = left.eval(env) as bigint;
            const n = wrap(count.eval(env) as bigint, type) & 7n;
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
        return {
          type,
          code: `${helper.name}(${args.map((arg) => arg.code).join(", ")})`,
          constant: false,
          reads: args.reduce(
            (all, arg) => union(all, arg.reads),
            new Set<string>(),
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
        return {
          type,
          code: `${lambda.name}(${arg.code})`,
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
        const viaPointer = form === 2 && pointer !== undefined;
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
        const armEnv = new Map(env);
        arm.bindings.forEach((binding, index) =>
          armEnv.set(binding.name, value.payload[index]!),
        );
        return convert(arm.body.eval(armEnv), type);
      },
    };
  }

  private boolExpr(depth: number, constantOnly: boolean): Expr {
    // The constant folder handles !, casts and literals, not comparisons.
    const choice = this.int(0, constantOnly ? 1 : 4);
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
      // Assignment targets cannot be parenthesized: write `*p`, not `(*p)`.
      const code = place.code.startsWith("(*")
        ? place.code.slice(1, -1)
        : place.code;
      return { code, key: () => place.key, reads: new Set() };
    }
    const index = this.expr(INT, 1, false);
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
    if (this.chance(0.15)) {
      const feature = this.featureStatement();
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
    const choice = this.int(0, 2);
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

  private switchStatement(depth: number): Stmt {
    const subject = this.expr(INT, 2, false);
    const modulus = this.int(2, 5);
    const cases = Array.from({ length: this.int(1, modulus) }, (_, value) => ({
      value,
      body: this.block(depth, this.int(1, 2)),
    }));
    const fallback = this.chance(0.7) ? this.block(depth, 1) : undefined;
    return {
      code: (indent) => {
        const caseIndent = indent + "    ";
        const bodyIndent = caseIndent + "    ";
        const arms = cases.map(
          (arm) =>
            `${caseIndent}case ${arm.value}: {\n${arm.body.map((s) => s.code(bodyIndent)).join("\n")}\n${bodyIndent}break;\n${caseIndent}}`,
        );
        if (fallback) {
          arms.push(
            `${caseIndent}default: {\n${fallback.map((s) => s.code(bodyIndent)).join("\n")}\n${bodyIndent}break;\n${caseIndent}}`,
          );
        }
        return `${indent}switch (((${subject.code}) % ${modulus} + ${modulus}) % ${modulus}) {\n${arms.join("\n")}\n${indent}}`;
      },
      exec: (env) => {
        const raw = subject.eval(env) as bigint;
        const m = BigInt(modulus);
        const selected = wrap(wrap(wrap(raw % m, INT) + m, INT) % m, INT);
        const arm = cases.find(
          (candidate) => BigInt(candidate.value) === selected,
        );
        const signal = execBlock(arm ? arm.body : (fallback ?? []), env);
        // `break` leaves the switch; `continue` reaches the enclosing loop.
        return signal === "break" ? undefined : signal;
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
    return {
      code: (indent) => {
        const inner = indent + "    ";
        return [
          `${indent}local ${counter}: int = 0;`,
          `${indent}loop (${counter} < ${limit}) {`,
          `${inner}${counter} = ${counter} + 1;`,
          ...body.map((s) => s.code(inner)),
          `${indent}}`,
        ].join("\n");
      },
      exec: (env) => {
        for (let i = 1; i <= limit; i++) {
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
      members.push(
        `    frame ${method}(this: *${name}, ${parameter(body)}: int) ret ${returnType.name} {\n        return ${body.code};\n    }`,
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
    return `struct ${name} {\n${members.join("\n")}\n}${freeFunctions}`;
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

  // ---------------------------------------------------------- program ----

  build(): GeneratedProgram {
    const lines: string[] = ["extern printf(fmt: string, ...);"];
    const env: Env = new Map();
    const output: string[] = [];
    this.out = output;
    const printedLambdas: LambdaDef[] = [];
    // Pointer locals that must be used: printed through a call.
    const printedCalls: string[] = [];
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

    for (let index = this.int(0, 2); index > 0; index--) {
      lines.push(this.structDefinition());
    }

    if (this.chance(0.5)) lines.push(this.hierarchyDefinition());

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
        printedCalls.push(pointer);
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
      const body = guard(this.expr(returnType, 2, false));
      this.scope = saved;
      const usedName = body.reads.has(paramName) ? paramName : `_${paramName}`;
      decls.push(
        `    local ${name}: Lambda<${returnType.name}>(${param.name}) = |${usedName}: ${param.name}| ret ${returnType.name} {\n        return ${body.code};\n    };`,
      );
      const lambda = {
        name,
        param,
        paramName,
        returnType,
        body,
        snapshot: new Map(env),
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

    for (const global of this.globals) printed.push(global);

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
      ...this.enumLocals.flatMap((local) => this.printEnum(local, env, output)),
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
  options: { trace?: boolean } = {},
): GeneratedProgram {
  return new ProgramBuilder(rng, options.trace).build();
}

/** The expected stdout recorded in a generated program, if any. */
export function readExpectedStdout(source: string): string | undefined {
  const lines = source
    .split("\n")
    .filter((line) => line.startsWith(EXPECT_MARKER))
    .map((line) => `${line.slice(EXPECT_MARKER.length)}\n`);
  return lines.length > 0 ? lines.join("") : undefined;
}
