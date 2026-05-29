import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

describe("BPL VS Code snippets", () => {
  const snippets = JSON.parse(
    readFileSync(join(import.meta.dir, "../../snippets/bpl.json"), "utf8"),
  );

  it("includes snippets for type matching and package entry points", () => {
    expect(snippets["Type Match Expression"]).toMatchObject({
      prefix: "match-type",
      description: "Type match expression",
    });
    expect(snippets["Type Match Expression"].body.join("\n")).toContain(
      "match<${1:Type}>(${2:value})",
    );

    expect(snippets["Package Entry Point"]).toMatchObject({
      prefix: "package-main",
      description: "Exported package entry point",
    });
    expect(snippets["Package Entry Point"].body.join("\n")).toContain(
      "export ${1:symbol};",
    );
  });
});
