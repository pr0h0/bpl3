// Copies the files the packaged extension needs from the repository into
// out/: the grammar the bundled compiler loads (found by searching upward
// from out/compiler/) and the JSON schemas referenced by `jsonValidation` in
// package.json. schemas/ and grammar/ stay the only checked-in copies.
const { copyFileSync, mkdirSync } = require("fs");
const { join } = require("path");

const extensionRoot = join(__dirname, "..");
const repositoryRoot = join(extensionRoot, "..");

const assets = [
  ["grammar/bpl.peggy", "out/grammar/bpl.peggy"],
  ["grammar/grammar.bpl", "out/grammar/grammar.bpl"],
  ["schemas/bpl-format.schema.json", "out/schemas/bpl-format.schema.json"],
  ["schemas/bpl-package.schema.json", "out/schemas/bpl-package.schema.json"],
];

for (const [source, target] of assets) {
  const destination = join(extensionRoot, target);
  mkdirSync(join(destination, ".."), { recursive: true });
  copyFileSync(join(repositoryRoot, source), destination);
}
