// Bundles the token grammar and standard library into the compiled `bpl`, so a
// lone copy of the executable can compile programs. Only the Bun CLI imports
// this module; the files are imported as text, which Bun embeds on --compile.
import grammar from "../grammar/grammar.bpl" with { type: "text" };
import { registerEmbeddedResources } from "../compiler/common/EmbeddedHome";

registerEmbeddedResources({
  grammar,
  // Required on first use so runs from source do not read the library early.
  libFiles: () =>
    (
      require("./EmbeddedResources.generated") as typeof import("./EmbeddedResources.generated")
    ).EMBEDDED_LIB_FILES,
});
