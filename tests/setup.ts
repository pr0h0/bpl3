import { realpathSync } from "fs";
import { tmpdir } from "os";

if (process.platform === "darwin") {
  const canonicalTmpDir = realpathSync(tmpdir());
  process.env.TMPDIR = canonicalTmpDir;
  process.env.TMP = canonicalTmpDir;
  process.env.TEMP = canonicalTmpDir;
}
