import { runInteropMatrix } from "./interopMatrix";
runInteropMatrix({
  docker: process.argv.includes("--docker"),
  log: console.log,
});
