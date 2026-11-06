import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { native } from "./helpers/webPackages";
import { checkBplSanitizerSupport } from "./helpers/compilerCorrectness";
import { makeRepoTempDir } from "./helpers/repoTempDir";

const flags = checkBplSanitizerSupport().supported
  ? [
      "--clang-flag=-fsanitize=address,undefined",
      "--clang-flag=-fno-sanitize-recover=all",
    ]
  : [];

test("template interpolation closing markers respect quoted strings and expression braces", () => {
  const dir = makeRepoTempDir("web-template-interpolation-");
  try {
    const views = join(dir, "views"),
      output = join(dir, "output"),
      exe = join(dir, "templ");
    mkdirSync(views);
    writeFileSync(
      join(views, "sample.bte"),
      String.raw`@args value: int
@import consume from "./support.bpl"
@import [String] from "std/string.bpl"
<p>{{ "}}" }}</p>
{{ ! "}}" }}
{{ "a\"}}b" }}
{{ match(value){0=>"zero",_=>"other",}}}
` +
        "{{ consume(`literal }}`) }}\n" +
        "{{ consume(`outer ${consume(`inner }}`)} }}`) }}\n",
    );
    const build = spawnSync(
      "bun",
      [
        resolve("index.ts"),
        "build",
        resolve("packages/bpl-templ/src/cli.bpl"),
        "-o",
        exe,
        ...flags,
      ],
      { encoding: "utf8", timeout: 60000 },
    );
    expect(build.status, build.stdout + build.stderr).toBe(0);
    const generated = spawnSync(exe, ["generate", views, "-o", output], {
      encoding: "utf8",
      timeout: 10000,
    });
    expect(generated.status, generated.stdout + generated.stderr).toBe(0);
    writeFileSync(
      join(output, "support.bpl"),
      'import [String] from "std/string.bpl";frame consume(value:String)ret string{value.destroy();return "backtick";}export consume;',
    );
    native(
      `import [Sample] from "${output}/sample.bpl";
extern strstr(a:string,b:string)ret string;
frame main()ret int{
 local html:string=Sample.render(0);
 local ok:bool=(strstr(html,"<p>}}</p>")!=nullptr)&&(strstr(html,"a&quot;}}b")!=nullptr)&&(strstr(html,"zero")!=nullptr)&&(strstr(html,"backtick")!=nullptr);
 Sample.free(html);if(!ok){return 1;}
 html=Sample.render(1);ok=strstr(html,"other")!=nullptr;Sample.free(html);if(!ok){return 2;}return 0;
}`,
      flags,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
