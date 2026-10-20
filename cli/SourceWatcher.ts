import * as fs from "node:fs";
import * as path from "node:path";
import {
  collectSourceWatchTargets,
  isIgnoredWatchDirectory,
} from "./SourceWatchTargets";

export interface SourceWatcher {
  refresh(): number;
  close(): void;
}

/** Watch directories so inode-replacing saves and newly-created sources remain visible. */
export function createSourceWatcher(
  entryFile: string,
  onChange: (file: string) => void,
  onError: (directory: string, error: unknown) => void,
): SourceWatcher {
  const watchers = new Map<
    string,
    { handle: fs.FSWatcher; identity: string }
  >();
  const directoryIdentity = (directory: string): string => {
    const stat = fs.statSync(directory, { bigint: true });
    if (!stat.isDirectory())
      throw new Error(`Watch path is not a directory: ${directory}`);
    return `${stat.dev}:${stat.ino}`;
  };
  let sources = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  let recoveryDelay = 1000;
  const reportedFailures = new Set<string>();
  const reportFailure = (directory: string, error: unknown) => {
    if (reportedFailures.has(directory)) return;
    reportedFailures.add(directory);
    onError(directory, error);
  };
  const noteHealthyDirectory = (directory: string) => {
    reportedFailures.delete(directory);
    if (reportedFailures.size === 0) recoveryDelay = 1000;
  };
  let closed = false;
  let snapshot = new Map<string, string>();
  let forcePending = false;
  let pendingFile = entryFile;
  const scheduleRecovery = () => {
    if (closed || recoveryTimer) return;
    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      if (closed) return;
      try {
        const before = snapshot;
        session.refresh();
        const changed = [...snapshot.keys(), ...before.keys()].find(
          (file) => snapshot.get(file) !== before.get(file),
        );
        if (changed) onChange(changed);
      } catch (error) {
        reportFailure(path.dirname(entryFile), error);
        scheduleRecovery();
      }
    }, recoveryDelay);
    recoveryDelay = Math.min(recoveryDelay * 2, 30000);
  };
  const session: SourceWatcher = {
    refresh() {
      if (closed) return 0;
      const targets = collectSourceWatchTargets(entryFile);
      let needsRecovery = false;
      for (const directory of reportedFailures)
        if (!targets.directories.has(directory))
          reportedFailures.delete(directory);
      sources = targets.sources;
      for (const [directory, watched] of watchers) {
        let identity: string | undefined;
        try {
          identity = directoryIdentity(directory);
        } catch {
          /* A deleted directory must release its old watcher. */
        }
        if (
          !targets.directories.has(directory) ||
          identity !== watched.identity
        ) {
          watched.handle.close();
          watchers.delete(directory);
        }
      }
      for (const directory of targets.directories) {
        if (watchers.has(directory)) continue;
        try {
          const identity = directoryIdentity(directory);
          const registeredAt = performance.now();
          const watcher = fs.watch(directory, (event, name) => {
            if (closed || watchers.get(directory)?.handle !== watcher) return;
            noteHealthyDirectory(directory);
            const file = name ? path.join(directory, String(name)) : directory;
            const basename = path.basename(file);
            let directoryChange = watchers.has(file);
            try {
              directoryChange ||=
                !isIgnoredWatchDirectory(basename) &&
                fs.statSync(file).isDirectory();
            } catch {
              /* A deleted file or directory is still a change. */
            }
            const relevant =
              sources.has(file) ||
              basename === "bpl.json" ||
              basename === "bpl.lock";
            // Some backends coalesce an atomic save into the temporary filename's
            // rename event. Rescan on any rename, then compare source identities.
            if (
              !name ||
              event === "rename" ||
              directoryChange ||
              relevant ||
              /\.(bpl|x)$/.test(basename)
            ) {
              if (relevant) {
                forcePending = true;
                pendingFile = file;
              }
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => {
                timer = undefined;
                if (closed) return;
                const before = snapshot;
                const forced = forcePending;
                forcePending = false;
                session.refresh();
                const changed = [...snapshot.keys(), ...before.keys()].find(
                  (observedFile) =>
                    snapshot.get(observedFile) !== before.get(observedFile),
                );
                if (forced || changed) onChange(changed ?? pendingFile);
              }, 100);
            }
          });
          watcher.on("error", (error) => {
            if (closed) return;
            watcher.close();
            if (watchers.get(directory)?.handle !== watcher) return;
            watchers.delete(directory);
            // A newly returned handle can fail on the next event-loop turn.
            // Activity or a stable lifetime starts a fresh failure episode.
            if (performance.now() - registeredAt >= 30000)
              noteHealthyDirectory(directory);
            reportFailure(directory, error);
            scheduleRecovery();
          });
          watchers.set(directory, { handle: watcher, identity });
        } catch (error) {
          needsRecovery = true;
          reportFailure(directory, error);
        }
      }
      if (needsRecovery) scheduleRecovery();
      else if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = undefined;
      }
      snapshot = new Map();
      const observed = new Set(sources);
      for (const directory of targets.directories)
        for (const manifest of ["bpl.json", "bpl.lock"])
          observed.add(path.join(directory, manifest));
      for (const file of observed) {
        try {
          const stat = fs.statSync(file, { bigint: true });
          snapshot.set(
            file,
            `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,
          );
        } catch {
          snapshot.set(file, "missing");
        }
      }
      return sources.size;
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      for (const watched of watchers.values()) watched.handle.close();
      watchers.clear();
    },
  };
  return session;
}
