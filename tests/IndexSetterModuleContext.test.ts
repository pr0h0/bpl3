import { test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("imported setter signatures resolve private module aliases", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-setter-module-"));
  try {
    const file = join(root, "box.bpl");
    writeFileSync(
      file,
      `type Key=long;
    struct Box{value:int,
      frame __get__(this:*Box,index:int)ret int{return this.value+index;}
      frame __set__(this:*Box,index:Key,value:Key){this.value=cast<int>(index+value);}
    }
    export Box;`,
    );
    expectCorrectnessSuite([
      {
        name: "module-setter-signature",
        validateLlvm: true,
        source: `import [Box] from ${JSON.stringify(file)};
      frame main()ret int{local box:Box=Box{value:0};box[-1]=7;return box.value-6;}`,
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
