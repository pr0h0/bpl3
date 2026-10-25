import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("same-named declarations in different modules remain nominally distinct", () => {
  const dir = mkdtempSync(join(tmpdir(), "bpl-nominal-types-"));
  try {
    writeFileSync(
      join(dir, "a.bpl"),
      `
      export [P];export [Holder];export [Derived]; export accept; export acceptPointer;
      export [E];enum E{First,Second}
      export [Wrap];
      struct Inner<T>{value:T,frame get(this:*Inner<T>)ret T{return this.value;}}
      struct Wrap<T>{inner:Inner<T>}
      struct P { x:int }
      struct Holder { value:P }
      struct Derived:P { y:int }
      frame accept(p:P)ret int{return p.x;}
      frame acceptPointer(p:*P)ret int{return p.x;}
    `,
    );
    writeFileSync(
      join(dir, "b.bpl"),
      "export [P];export [E];struct P{x:float,y:long}enum E{First,Second}",
    );
    const entry = join(dir, "main.bpl");
    const check = (body: string) => {
      writeFileSync(
        entry,
        `import * as a from "./a.bpl";import * as b from "./b.bpl";import * as again from "./a.bpl";
        frame main()ret int{${body}}`,
      );
      return spawnSync("bun", [resolve("index.ts"), "check", entry, "--json"], {
        encoding: "utf8",
        timeout: 30000,
      });
    };
    for (const body of [
      "local value:b.P;return a.accept(value);",
      "local callback:Func<int>(b.P)=a.accept;return 0;",
      "local value:b.E=b.E.First;local target:a.E=value;return 0;",
      "local value:b.P;return a.acceptPointer(&value);",
      "local value:b.P;local target:a.P;target=value;return 0;",
      "local value:b.P;local target:a.Holder=a.Holder{value:value};return 0;",
      "local value:a.Derived;local target:*b.P=&value;return 0;",
    ]) {
      const result = check(body);
      expect(result.status, body + result.stdout + result.stderr).toBe(1);
      expect(JSON.parse(result.stdout).errorCount).toBeGreaterThan(0);
    }
    for (const body of [
      "local values:b.P[2];local target:a.P[2]=cast<a.P[2]>(values);return target[0].x;",
      "local values:b.P[2];local target:a.P[]=cast<a.P[]>(values);return target[0].x;",
      "local values:b.P[2];local target:*a.P=cast<*a.P>(values);return target[0].x;",
      "local values:(b.P,int)[2];local target:(a.P,int)[]=cast<(a.P,int)[]>(values);return target[0].0.x;",
      "local values:Func<b.P>()[2];local target:Func<a.P>()[]=cast<Func<a.P>()[]>(values);return target[0]().x;",
      "local values:Func<int>(b.P)[2];local target:Func<int>(a.P)[]=cast<Func<int>(a.P)[]>(values);local p:a.P;return target[0](p);",
      "local values:a.Wrap<b.P>[2];local target:a.Wrap<a.P>[]=cast<a.Wrap<a.P>[]>(values);return target[0].inner.value.x;",
    ]) {
      const result = check(body);
      expect(result.status, body + result.stdout + result.stderr).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(
        report.files[0].diagnostics.some(
          (error: { code?: string }) => error.code === "BPL_CAST_INVALID",
        ),
        body + result.stdout,
      ).toBe(true);
    }
    for (const body of [
      "local value:a.P;local target:again.P;target=value;return a.accept(target);",
      "local value:a.Derived;return a.acceptPointer(&value);",
      "local value:a.Wrap<int>;return value.inner.get();",
    ]) {
      const result = check(body);
      expect(result.status, result.stdout + result.stderr).toBe(0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
