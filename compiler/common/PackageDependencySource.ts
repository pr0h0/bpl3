import * as path from "path";

export const PACKAGE_NAME_PATTERN = /^[a-z0-9-]+$/;
export const PACKAGE_VERSION_SOURCE =
  "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
export const PACKAGE_VERSION_CAPTURE_SOURCE =
  "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)";
export const PACKAGE_VERSION_PATTERN = new RegExp(
  `^${PACKAGE_VERSION_SOURCE}$`,
);
export const PACKAGE_VERSION_CAPTURE_PATTERN = new RegExp(
  `^${PACKAGE_VERSION_CAPTURE_SOURCE}$`,
);
export const PACKAGE_VERSION_RANGE_PATTERN = new RegExp(
  `^[~^]${PACKAGE_VERSION_SOURCE}$`,
);
export const PACKAGE_VERSION_COMPARATOR_PATTERN = new RegExp(
  `^(>=|>|<=|<|=)${PACKAGE_VERSION_SOURCE}$`,
);
export const PACKAGE_VERSION_COMPARATOR_LIST_PATTERN = new RegExp(
  `^(>=|>|<=|<|=)?${PACKAGE_VERSION_SOURCE}(\\s+(>=|>|<=|<|=)?${PACKAGE_VERSION_SOURCE})+$`,
);
export const PACKAGE_VERSION_COMPARATOR_CAPTURE_PATTERN = new RegExp(
  `^(>=|>|<=|<|=)?(${PACKAGE_VERSION_SOURCE})$`,
);

export function isValidPackageName(name: string): boolean {
  return PACKAGE_NAME_PATTERN.test(name);
}

export function isValidPackageVersion(version: string): boolean {
  return PACKAGE_VERSION_PATTERN.test(version);
}

export function isVersionSelectorSpec(value: string): boolean {
  if (value === "*" || value === "latest") return true;
  if (PACKAGE_VERSION_PATTERN.test(value)) return true;
  if (PACKAGE_VERSION_RANGE_PATTERN.test(value)) return true;
  if (PACKAGE_VERSION_COMPARATOR_PATTERN.test(value)) return true;
  return PACKAGE_VERSION_COMPARATOR_LIST_PATTERN.test(value);
}

export function isPackageFileSource(fileSource: string): boolean {
  return (
    fileSource.endsWith(".tgz") ||
    fileSource.startsWith(".") ||
    path.isAbsolute(fileSource) ||
    path.win32.isAbsolute(fileSource) ||
    fileSource.includes("/") ||
    fileSource.includes("\\")
  );
}

export function isValidPackageDependencySource(source: string): boolean {
  if (source.trim().length === 0) return false;

  const fileSource = source.startsWith("file:") ? source.slice(5) : source;
  if (source.startsWith("file:")) {
    return isPackageFileSource(fileSource);
  }

  return (
    isPackageFileSource(fileSource) ||
    isVersionSelectorSpec(fileSource) ||
    isValidPackageName(fileSource)
  );
}
