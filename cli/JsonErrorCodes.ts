import { BUILD_JSON_ERROR_CODES } from "./CompilationRunner";
import { BINDGEN_JSON_ERROR_CODES } from "./commands/BindgenContracts";
import { CODEGEN_JSON_ERROR_CODES } from "../compiler/backend/CodeGenerator";
import { CHECK_JSON_ERROR_CODES } from "./commands/check";
import { CLEAN_JSON_ERROR_CODES } from "./commands/CleanContracts";
import { COMPLETION_SHELL_UNSUPPORTED_CODE } from "./commands/completion";
import { DOCS_JSON_ERROR_CODES } from "./commands/docs";
import {
  DOCTOR_SCOPE_UNKNOWN_CODE,
  WASM_LINKER_UNAVAILABLE_CODE,
} from "./commands/DoctorContracts";
import { FORMAT_JSON_ERROR_CODES } from "./commands/format";
import { LINT_JSON_ERROR_CODES } from "./commands/lint";
import { NEW_PROJECT_JSON_ERROR_CODES } from "./commands/new";
import { RUN_SCRIPT_JSON_ERROR_CODES } from "./commands/runScript";
import { SANITIZER_RUNTIME_UNAVAILABLE_CODE } from "../compiler/common/SanitizerSupport";
import { IMPORT_HANDLER_FAILURE_CODES } from "../compiler/middleend/ImportHandler";
import { MODULE_RESOLUTION_FAILURE_CODES } from "../compiler/middleend/ModuleResolver";
import { TYPE_CHECKER_FAILURE_CODES } from "../compiler/middleend/TypeCheckerBase";
import {
  PACKAGE_ARCHIVE_JSON_ERROR_CODES,
  PACKAGE_CACHE_JSON_ERROR_CODES,
  PACKAGE_INIT_JSON_ERROR_CODES,
  PACKAGE_INSTALL_JSON_ERROR_CODES,
  PACKAGE_LIST_JSON_ERROR_CODES,
  PACKAGE_MANIFEST_JSON_ERROR_CODES,
  PACKAGE_UNINSTALL_JSON_ERROR_CODES,
} from "../compiler/middleend/PackageManager";
import { PACKAGE_RESOLUTION_FAILURE_CODES } from "../compiler/middleend/PackageResolver";

export interface CliJsonErrorCodeList {
  name: string;
  codes: readonly string[];
}

export const CLI_JSON_ERROR_CODE_LISTS = [
  { name: "bindgen", codes: BINDGEN_JSON_ERROR_CODES },
  { name: "build", codes: BUILD_JSON_ERROR_CODES },
  { name: "codegen", codes: CODEGEN_JSON_ERROR_CODES },
  { name: "check", codes: CHECK_JSON_ERROR_CODES },
  { name: "clean", codes: CLEAN_JSON_ERROR_CODES },
  { name: "completion", codes: [COMPLETION_SHELL_UNSUPPORTED_CODE] },
  { name: "docs", codes: DOCS_JSON_ERROR_CODES },
  { name: "doctor", codes: [DOCTOR_SCOPE_UNKNOWN_CODE] },
  { name: "format", codes: FORMAT_JSON_ERROR_CODES },
  { name: "lint", codes: LINT_JSON_ERROR_CODES },
  { name: "project-new", codes: NEW_PROJECT_JSON_ERROR_CODES },
  { name: "package-init", codes: PACKAGE_INIT_JSON_ERROR_CODES },
  { name: "package-uninstall", codes: PACKAGE_UNINSTALL_JSON_ERROR_CODES },
  { name: "package-cache", codes: PACKAGE_CACHE_JSON_ERROR_CODES },
  { name: "package-install", codes: PACKAGE_INSTALL_JSON_ERROR_CODES },
  { name: "package-list", codes: PACKAGE_LIST_JSON_ERROR_CODES },
  { name: "package-archive", codes: PACKAGE_ARCHIVE_JSON_ERROR_CODES },
  { name: "package-manifest", codes: PACKAGE_MANIFEST_JSON_ERROR_CODES },
  { name: "package-resolver", codes: PACKAGE_RESOLUTION_FAILURE_CODES },
  { name: "module-resolver", codes: MODULE_RESOLUTION_FAILURE_CODES },
  { name: "import-handler", codes: IMPORT_HANDLER_FAILURE_CODES },
  { name: "type-checker", codes: TYPE_CHECKER_FAILURE_CODES },
  { name: "run-script", codes: RUN_SCRIPT_JSON_ERROR_CODES },
  { name: "sanitizer-runtime", codes: [SANITIZER_RUNTIME_UNAVAILABLE_CODE] },
  { name: "wasm-linker", codes: [WASM_LINKER_UNAVAILABLE_CODE] },
] as const satisfies readonly CliJsonErrorCodeList[];

export const CLI_JSON_ERROR_CODES: readonly string[] = [
  ...new Set(CLI_JSON_ERROR_CODE_LISTS.flatMap((list) => list.codes)),
];
