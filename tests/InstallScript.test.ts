import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

const INSTALLER = resolve(import.meta.dir, "../scripts/install.sh");
const hostAsset = (() => {
  const os = { linux: "linux", darwin: "darwin" }[process.platform as string];
  const arch = { x64: "x64", arm64: "arm64" }[process.arch as string];
  return os && arch ? `bpl-${os}-${arch}` : undefined;
})();
const canRun =
  hostAsset !== undefined &&
  spawnSync("sh", ["-c", "command -v curl || command -v wget"]).status === 0;

function withRelease(run: (release: string, installDir: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "bpl-install-"));
  try {
    run(join(root, "release"), join(root, "bin"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function publish(release: string, body: string, sums?: string): void {
  spawnSync("mkdir", ["-p", release]);
  writeFileSync(join(release, hostAsset!), body);
  const digest = createHash("sha256").update(body).digest("hex");
  writeFileSync(
    join(release, "SHA256SUMS"),
    sums ?? `${digest}  ${hostAsset}\n`,
  );
}

function install(release: string, installDir: string) {
  return spawnSync("sh", [INSTALLER], {
    encoding: "utf8",
    env: {
      ...process.env,
      BPL_DOWNLOAD_BASE: `file://${release}`,
      BPL_INSTALL_DIR: installDir,
    },
  });
}

describe.skipIf(!canRun)("scripts/install.sh", () => {
  test("installs the host's executable after checking its SHA-256", () => {
    withRelease((release, installDir) => {
      publish(release, "#!/bin/sh\necho installed bpl\n");
      const result = install(release, installDir);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`Installed bpl to ${installDir}/bpl`);
      const run = spawnSync(join(installDir, "bpl"), { encoding: "utf8" });
      expect(run.stdout).toBe("installed bpl\n");
    });
  });

  test("refuses an executable whose checksum does not match", () => {
    withRelease((release, installDir) => {
      publish(release, "#!/bin/sh\necho real\n");
      writeFileSync(join(release, hostAsset!), "#!/bin/sh\necho tampered\n");
      chmodSync(join(release, hostAsset!), 0o755);
      const result = install(release, installDir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("checksum mismatch");
      expect(existsSync(join(installDir, "bpl"))).toBe(false);
    });
  });

  test("refuses a release whose SHA256SUMS lacks the host's executable", () => {
    withRelease((release, installDir) => {
      publish(release, "#!/bin/sh\n", "0000  bpl-other-platform\n");
      const result = install(release, installDir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        `SHA256SUMS has no entry for ${hostAsset}`,
      );
    });
  });

  test("documents the one-line install command", () => {
    expect(readFileSync(INSTALLER, "utf8")).toContain(
      "curl -fsSL https://raw.githubusercontent.com/pr0h0/bpl3/master/scripts/install.sh | sh",
    );
  });
});
