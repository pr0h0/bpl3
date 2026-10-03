import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { runInteropMatrix } from "./helpers/interopMatrix";

const supported =
  process.platform === "linux" &&
  process.arch === "x64" &&
  [process.env.CC || "clang", process.env.CXX || "clang++", "python3"].every(
    (command) =>
      spawnSync(command, ["--version"], { timeout: 5000 }).status === 0,
  );

test.skipIf(!supported)(
  "native FFI round trips through C, C++, Python and JavaScript at O0/O3",
  () => {
    expect(runInteropMatrix()).toHaveLength(12);
  },
  180000,
);
