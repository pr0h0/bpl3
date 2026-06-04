import { readFileSync, statSync } from "fs";

export interface StaticTextFileMetadata {
  mtimeMs: number;
  size: number;
}

export interface StaticTextFileCacheOptions {
  statTextFile?: (filePath: string) => StaticTextFileMetadata;
  readTextFile?: (filePath: string) => string;
}

interface StaticTextFileCacheEntry extends StaticTextFileMetadata {
  text: string;
}

export class StaticTextFileCache {
  private readonly entries = new Map<string, StaticTextFileCacheEntry>();
  private readonly statTextFile: (filePath: string) => StaticTextFileMetadata;
  private readonly readTextFile: (filePath: string) => string;

  constructor(options: StaticTextFileCacheOptions = {}) {
    this.statTextFile =
      options.statTextFile ??
      ((filePath) => {
        const stat = statSync(filePath);
        return {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        };
      });
    this.readTextFile =
      options.readTextFile ??
      ((filePath) => readFileSync(filePath, "utf-8"));
  }

  read(filePath: string): string {
    const metadata = this.statTextFile(filePath);
    const cached = this.entries.get(filePath);
    if (
      cached !== undefined &&
      cached.mtimeMs === metadata.mtimeMs &&
      cached.size === metadata.size
    ) {
      return cached.text;
    }

    const text = this.readTextFile(filePath);
    this.entries.set(filePath, {
      ...metadata,
      text,
    });
    return text;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
