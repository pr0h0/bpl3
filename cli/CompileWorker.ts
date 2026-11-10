// Worker entry for native builds: compiles one file to LLVM IR and posts the
// clang step back (see compileInWorker in CompilationRunner.ts). It is also a
// `bun build --compile` entry point, so the bundled `bpl` can start it.
import { compileFileForWorker } from "./CompilationRunner";

declare const self: Worker;

self.onmessage = async (event: MessageEvent) => {
  const build = await compileFileForWorker(event.data);
  self.postMessage({ build });
};
