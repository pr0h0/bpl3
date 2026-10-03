import { runInteropMatrix } from "../tests/helpers/interopMatrix";
runInteropMatrix({
  docker: process.argv.includes("--docker"),
  log: console.log,
});
