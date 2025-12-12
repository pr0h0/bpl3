/**
 * Target platform configuration for cross-compilation support.
 * Handles platform-specific settings like target triples, register clobber lists,
 * and va_list structures.
 */


export type TargetArch = "x86_64" | "arm64";
export type TargetOS = "linux" | "darwin" | "windows";

export interface TargetConfig {
  arch: TargetArch;
  os: TargetOS;
  triple: string;
  /** Register clobber list for inline assembly */
  asmClobbers: string;
  /** Whether to use Intel syntax for inline assembly */
  useIntelSyntax: boolean;
  /** va_list structure layout - indices for reg_save_area and overflow_arg_area */
  vaList: {
    structName: string;
    fields: Array<{ type: string }>;
    regSaveAreaIndex: number;
    overflowArgAreaIndex: number;
    /** Number of bytes per GP register slot */
    gpRegSize: number;
    /** Max offset before spilling to stack (6 GP regs * 8 bytes = 48 on x86_64) */
    maxRegOffset: number;
  };
  /** Additional clang flags for this target */
  clangFlags: string[];
}

const x86_64LinuxTarget: TargetConfig = {
  arch: "x86_64",
  os: "linux",
  triple: "x86_64-unknown-linux-gnu",
  asmClobbers:
    "~{dirflag},~{fpsr},~{flags},~{memory},~{rax},~{rbx},~{rcx},~{rdx},~{rsi},~{rdi},~{r8},~{r9},~{r10},~{r11}",
  useIntelSyntax: true,
  vaList: {
    structName: "struct.__va_list_tag",
    fields: [
      { type: "i32" }, // gp_offset
      { type: "i32" }, // fp_offset
      { type: "ptr" }, // overflow_arg_area
      { type: "ptr" }, // reg_save_area
    ],
    regSaveAreaIndex: 3,
    overflowArgAreaIndex: 2,
    gpRegSize: 8,
    maxRegOffset: 48, // 6 GP regs * 8 bytes
  },
  clangFlags: [],
};

const x86_64DarwinTarget: TargetConfig = {
  arch: "x86_64",
  os: "darwin",
  triple: "x86_64-apple-darwin",
  asmClobbers:
    "~{dirflag},~{fpsr},~{flags},~{memory},~{rax},~{rbx},~{rcx},~{rdx},~{rsi},~{rdi},~{r8},~{r9},~{r10},~{r11}",
  useIntelSyntax: true,
  vaList: {
    // macOS x86_64 uses a simple pointer for va_list (char*)
    structName: "struct.__va_list_tag",
    fields: [
      { type: "i32" }, // gp_offset
      { type: "i32" }, // fp_offset
      { type: "ptr" }, // overflow_arg_area
      { type: "ptr" }, // reg_save_area
    ],
    regSaveAreaIndex: 3,
    overflowArgAreaIndex: 2,
    gpRegSize: 8,
    maxRegOffset: 48,
  },
  clangFlags: [],
};

const arm64DarwinTarget: TargetConfig = {
  arch: "arm64",
  os: "darwin",
  triple: "arm64-apple-darwin",
  // ARM64 clobber list - different registers than x86_64
  asmClobbers:
    "~{memory},~{cc},~{x0},~{x1},~{x2},~{x3},~{x4},~{x5},~{x6},~{x7},~{x8},~{x9},~{x10},~{x11},~{x12},~{x13},~{x14},~{x15},~{x16},~{x17}",
  // ARM64 uses its own assembly syntax, not Intel
  useIntelSyntax: false,
  vaList: {
    // ARM64 Darwin uses a simple pointer for va_list (void*)
    // The va_list is just a pointer that gets incremented
    structName: "struct.__va_list",
    fields: [
      { type: "ptr" }, // __stack (pointer to stack args)
      { type: "ptr" }, // __gr_top (end of GP reg save area)
      { type: "ptr" }, // __vr_top (end of FP/SIMD reg save area)
      { type: "i32" }, // __gr_offs (offset from __gr_top)
      { type: "i32" }, // __vr_offs (offset from __vr_top)
    ],
    regSaveAreaIndex: 1, // __gr_top
    overflowArgAreaIndex: 0, // __stack
    gpRegSize: 8,
    maxRegOffset: 64, // 8 GP regs * 8 bytes (x0-x7)
  },
  clangFlags: [],
};

const arm64LinuxTarget: TargetConfig = {
  arch: "arm64",
  os: "linux",
  triple: "aarch64-unknown-linux-gnu",
  asmClobbers:
    "~{memory},~{cc},~{x0},~{x1},~{x2},~{x3},~{x4},~{x5},~{x6},~{x7},~{x8},~{x9},~{x10},~{x11},~{x12},~{x13},~{x14},~{x15},~{x16},~{x17}",
  useIntelSyntax: false,
  vaList: {
    structName: "struct.__va_list",
    fields: [
      { type: "ptr" }, // __stack
      { type: "ptr" }, // __gr_top
      { type: "ptr" }, // __vr_top
      { type: "i32" }, // __gr_offs
      { type: "i32" }, // __vr_offs
    ],
    regSaveAreaIndex: 1,
    overflowArgAreaIndex: 0,
    gpRegSize: 8,
    maxRegOffset: 64,
  },
  clangFlags: [],
};

const targets: Record<string, TargetConfig> = {
  "x86_64-linux": x86_64LinuxTarget,
  "x86_64-darwin": x86_64DarwinTarget,
  "arm64-darwin": arm64DarwinTarget,
  "arm64-linux": arm64LinuxTarget,
  "aarch64-linux": arm64LinuxTarget,
  "aarch64-darwin": arm64DarwinTarget,
};

let currentTarget: TargetConfig | null = null;

/**
 * Detect the host platform and return its configuration
 */
export function detectHostTarget(): TargetConfig {
  const platform = process.platform;
  const arch = process.arch;

  let os: TargetOS;
  if (platform === "darwin") {
    os = "darwin";
  } else if (platform === "linux") {
    os = "linux";
  } else if (platform === "win32") {
    os = "windows";
  } else {
    // Default to Linux
    os = "linux";
  }

  let targetArch: TargetArch;
  if (arch === "arm64") {
    targetArch = "arm64";
  } else {
    targetArch = "x86_64";
  }

  const key = `${targetArch}-${os}`;
  const target = targets[key];

  if (!target) {
    console.warn(
      `Warning: Unknown target ${key}, falling back to x86_64-linux`,
    );
    return x86_64LinuxTarget;
  }

  return target;
}

/**
 * Parse a target triple string and return the configuration
 */
export function parseTargetTriple(triple: string): TargetConfig {
  const lowerTriple = triple.toLowerCase();

  // Try to match known targets
  for (const [key, config] of Object.entries(targets)) {
    if (
      lowerTriple.includes(key.replace("-", "-")) ||
      lowerTriple === config.triple
    ) {
      return config;
    }
  }

  // Parse the triple manually
  let arch: TargetArch = "x86_64";
  let os: TargetOS = "linux";

  if (
    lowerTriple.includes("arm64") ||
    lowerTriple.includes("aarch64")
  ) {
    arch = "arm64";
  } else if (
    lowerTriple.includes("x86_64") ||
    lowerTriple.includes("x86-64") ||
    lowerTriple.includes("amd64")
  ) {
    arch = "x86_64";
  }

  if (lowerTriple.includes("darwin") || lowerTriple.includes("macos")) {
    os = "darwin";
  } else if (lowerTriple.includes("linux")) {
    os = "linux";
  } else if (lowerTriple.includes("windows") || lowerTriple.includes("win32")) {
    os = "windows";
  }

  const key = `${arch}-${os}`;
  return targets[key] || x86_64LinuxTarget;
}

/**
 * Set the current compilation target
 */
export function setTarget(target: TargetConfig | string): void {
  if (typeof target === "string") {
    currentTarget = parseTargetTriple(target);
  } else {
    currentTarget = target;
  }
}

/**
 * Get the current compilation target (auto-detects if not set)
 */
export function getTarget(): TargetConfig {
  if (!currentTarget) {
    currentTarget = detectHostTarget();
  }
  return currentTarget;
}

/**
 * Get clang compilation flags for the current target
 */
export function getClangCompileFlags(optimizationLevel: number): string[] {
  const target = getTarget();
  const flags = [
    "-Wno-override-module",
    `-O${optimizationLevel}`,
    "-c",
    `--target=${target.triple}`,
  ];
  return [...flags, ...target.clangFlags];
}

/**
 * Get clang linking flags for the current target
 */
export function getClangLinkFlags(
  optimizationLevel: number,
  isStatic: boolean,
): string[] {
  const target = getTarget();
  const flags = [
    "-Wno-override-module",
    `-O${optimizationLevel}`,
    `--target=${target.triple}`,
  ];

  // Static linking is not well supported on macOS
  if (isStatic && target.os !== "darwin") {
    flags.push("-static");
  }

  flags.push("-lm");

  return [...flags, ...target.clangFlags];
}

/**
 * Check if inline assembly is supported for the current target
 */
export function isInlineAsmSupported(): boolean {
  const target = getTarget();
  // Inline assembly with Intel syntax is only supported on x86_64
  // ARM64 assembly is quite different and would need separate handling
  return target.arch === "x86_64";
}

/**
 * Get the assembly clobber list for the current target
 */
export function getAsmClobbers(): string {
  return getTarget().asmClobbers;
}

/**
 * Check if the target uses Intel syntax for inline assembly
 */
export function usesIntelSyntax(): boolean {
  return getTarget().useIntelSyntax;
}
