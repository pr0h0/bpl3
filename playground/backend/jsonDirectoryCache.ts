import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";

export interface JsonFileMetadata {
  mtimeMs: number;
  size: number;
}

export interface JsonDirectoryCacheReadOptions {
  onFileError?: (filePath: string, error: unknown) => void;
}

export interface JsonDirectoryCacheOptions
  extends JsonDirectoryCacheReadOptions {
  existsDirectory?: (directoryPath: string) => boolean;
  readDirectory?: (directoryPath: string) => string[];
  statJsonFile?: (filePath: string) => JsonFileMetadata;
  readJsonFile?: (filePath: string) => string;
}

interface JsonDirectoryCacheEntry {
  signature: string;
  items: unknown[];
}

interface JsonFileEntry {
  fileName: string;
  filePath: string;
  metadata: JsonFileMetadata;
}

function orderOf(value: unknown): number {
  if (
    value !== null &&
    typeof value === "object" &&
    "order" in value &&
    typeof value.order === "number"
  ) {
    return value.order;
  }
  return 0;
}

export class JsonDirectoryCache {
  private readonly entries = new Map<string, JsonDirectoryCacheEntry>();
  private readonly existsDirectory: (directoryPath: string) => boolean;
  private readonly readDirectory: (directoryPath: string) => string[];
  private readonly statJsonFile: (filePath: string) => JsonFileMetadata;
  private readonly readJsonFile: (filePath: string) => string;
  private readonly onFileError?: (filePath: string, error: unknown) => void;

  constructor(options: JsonDirectoryCacheOptions = {}) {
    this.existsDirectory = options.existsDirectory ?? existsSync;
    this.readDirectory = options.readDirectory ?? readdirSync;
    this.statJsonFile =
      options.statJsonFile ??
      ((filePath) => {
        const stat = statSync(filePath);
        return {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        };
      });
    this.readJsonFile =
      options.readJsonFile ??
      ((filePath) => readFileSync(filePath, "utf-8"));
    this.onFileError = options.onFileError;
  }

  read<T = unknown>(
    directoryPath: string,
    options: JsonDirectoryCacheReadOptions = {},
  ): T[] {
    if (!this.existsDirectory(directoryPath)) {
      this.entries.set(directoryPath, {
        signature: "missing",
        items: [],
      });
      return [];
    }

    const fileEntries: JsonFileEntry[] = [];
    let hadMetadataError = false;
    for (const fileName of this.readDirectory(directoryPath)
      .filter((candidate) => candidate.endsWith(".json"))
      .sort()) {
      const filePath = path.join(directoryPath, fileName);
      try {
        fileEntries.push({
          fileName,
          filePath,
          metadata: this.statJsonFile(filePath),
        });
      } catch (error) {
        hadMetadataError = true;
        this.reportFileError(filePath, error, options);
      }
    }

    const signature = fileEntries
      .map(
        ({ fileName, metadata }) =>
          `${fileName}:${metadata.mtimeMs}:${metadata.size}`,
      )
      .join("\n");
    const cached = this.entries.get(directoryPath);
    if (
      cached !== undefined &&
      cached.signature === signature &&
      !hadMetadataError
    ) {
      return [...cached.items] as T[];
    }

    const items: unknown[] = [];
    for (const { filePath } of fileEntries) {
      try {
        items.push(JSON.parse(this.readJsonFile(filePath)));
      } catch (error) {
        this.reportFileError(filePath, error, options);
      }
    }

    items.sort((left, right) => orderOf(left) - orderOf(right));
    this.entries.set(directoryPath, {
      signature,
      items,
    });
    return [...items] as T[];
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }

  private reportFileError(
    filePath: string,
    error: unknown,
    options: JsonDirectoryCacheReadOptions,
  ): void {
    (options.onFileError ?? this.onFileError)?.(filePath, error);
  }
}
