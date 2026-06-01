import { describe, expect, test } from "bun:test";

import {
  COMMON_TARGET_TRIPLES,
  getBashCompletionScript,
  getZshCompletionScript,
} from "../cli/completions";
import { compileToLLVM } from "./helpers";

const source = `
  frame main() ret int {
    return 0;
  }
`;

describe("Completion target drift guard", () => {
  test("lowers every advertised completion target to LLVM metadata", () => {
    expect(COMMON_TARGET_TRIPLES.length).toBeGreaterThan(0);

    for (const target of COMMON_TARGET_TRIPLES) {
      const ir = compileToLLVM(source, `${target}.bpl`, { target });

      expect(ir).toContain(`target triple = "${target}"`);
      expect(ir).toContain("target datalayout = ");
    }
  });

  test("renders shell completions from the shared target list", () => {
    const targetList = COMMON_TARGET_TRIPLES.join(" ");
    const bash = getBashCompletionScript();
    const zsh = getZshCompletionScript();

    expect(bash).toContain(`local targets="${targetList}"`);
    expect(zsh).toContain(
      `--target[Target triple for clang]:triple:(${targetList})`,
    );
  });
});
