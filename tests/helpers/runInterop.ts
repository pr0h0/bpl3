import { runInteropMatrix } from "./interopMatrix";
runInteropMatrix({
  docker: process.argv.includes("--docker"),
  csharp: process.argv.includes("--csharp"),
  log: console.log,
});
